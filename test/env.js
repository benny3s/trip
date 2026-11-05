/* 시험용 환경 — index.html 의 본 스크립트를 node vm 에 올리고 화면·저장소는 가짜(stub)로 바꾼다.
   core.js 는 읽지 않고 쓰는 함수만 흉내 낸다. 실서버·브라우저에 닿지 않는다. */
const fs = require("fs"), path = require("path"), vm = require("vm");

function mainScript(){
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const i = html.indexOf("<script>/* 여행 가자");
  const j = html.indexOf("</script>", i);
  return html.slice(i + "<script>".length, j);
}

/* ── 가짜 화면 요소 ── */
function fakeEl(tag){
  const e = {
    tag, value: "", hidden: true, textContent: "", disabled: false, open: false, className: "", title: "", type: "",
    children: [], style: {}, attrs: {}, onclick: null,
    classList: { toggle(){}, add(){}, remove(){} },
    set innerHTML(v){ this.children = []; }, get innerHTML(){ return ""; },
    appendChild(c){ this.children.push(c); return c; },
    append(...cs){ cs.forEach(c => this.children.push(c)); },
    setAttribute(k, v){ this.attrs[k] = v; },
    addEventListener(){}, focus(){}, closest(){ return null; },
    get firstChild(){ return this.children[0] || fakeEl("x"); }
  };
  return e;
}
/** 요소 트리에서 글자가 맞는 버튼들 */
function findButtons(root, text){
  const out = [];
  (function walk(n){ if (!n || typeof n !== "object") return; if (n.tag === "button" && String(n.textContent).includes(text)) out.push(n); (n.children || []).forEach(walk); })(root);
  return out;
}
/** 요소 트리의 글자 전부 */
function allText(root){
  const out = [];
  (function walk(n){ if (n == null) return; if (typeof n !== "object"){ out.push(String(n)); return; } if (n.textContent) out.push(String(n.textContent)); (n.children || []).forEach(walk); })(root);
  return out.join(" | ");
}

/* ── 가짜 Firestore — 문서 경로 → 값. 트랜잭션은 읽은 문서가 그사이 바뀌면 다시 돈다 ── */
const SV = { __sv: "serverTimestamp" };
function makeDb(){
  const store = new Map(), ver = new Map();
  let seq = 0;
  const hooks = { failCommit: null, failGet: null, failWrite: null, writes: [] };
  const bump = p => ver.set(p, (ver.get(p) || 0) + 1);
  function applyUpdate(cur, data){
    const o = JSON.parse(JSON.stringify(cur));
    for (const k in data){
      const v = data[k];
      if (v && v.__union){ const a = Array.isArray(o[k]) ? o[k] : []; v.__union.forEach(x => { if (!a.some(y => JSON.stringify(y) === JSON.stringify(x))) a.push(x); }); o[k] = a; continue; }
      if (k.includes(".")){ const [a, b] = k.split("."); o[a] = Object.assign({}, o[a] || {}); o[a][b] = v; continue; }
      o[k] = v;
    }
    return o;
  }
  const write = (op, p, data) => {
    if (hooks.failWrite && hooks.failWrite(op, p, data)) throw Object.assign(new Error("거절"), { code: "permission-denied" });
    hooks.writes.push({ op, path: p, data });
    if (op === "delete"){ store.delete(p); bump(p); return; }
    if (op === "set"){ store.set(p, JSON.parse(JSON.stringify(data))); bump(p); return; }
    if (!store.has(p)){ const e = new Error("no doc " + p); e.code = "not-found"; throw e; }
    store.set(p, applyUpdate(store.get(p), data)); bump(p);
  };
  function snap(p){ const d = store.get(p); return { id: p.split("/").pop(), exists: d !== undefined, data: () => d && JSON.parse(JSON.stringify(d)), ref: ref(p) }; }
  function ref(p){
    return {
      path: p, id: p.split("/").pop(),
      collection: n => col(p + "/" + n),
      onSnapshot: () => () => {},
      get: async () => { await null; if (hooks.failGet) throw hooks.failGet; return snap(p); },
      set: async d => { await null; write("set", p, d); },
      update: async d => { await null; write("update", p, d); },
      delete: async () => { await null; write("delete", p); }
    };
  }
  function col(p){
    return {
      path: p,
      onSnapshot: () => () => {},
      doc: id => ref(p + "/" + (id || ("auto" + (++seq)))),
      add: async d => { await null; const r = ref(p + "/auto" + (++seq)); write("set", r.path, d); return r; },
      get: async () => { await null; if (hooks.failGet) throw hooks.failGet;
        const docs = [...store.keys()].filter(k => k.startsWith(p + "/") && !k.slice(p.length + 1).includes("/")).map(snap);
        return { docs }; }
    };
  }
  const db = {
    collection: n => col(n),
    batch(){
      const ops = [];
      return {
        set: (r, d) => ops.push(["set", r.path, d]),
        update: (r, d) => ops.push(["update", r.path, d]),
        delete: r => ops.push(["delete", r.path]),
        commit: async () => { await null; if (hooks.failCommit && hooks.failCommit(ops)) throw Object.assign(new Error("net"), { code: "unavailable" }); ops.forEach(o => write(o[0], o[1], o[2])); }
      };
    },
    async runTransaction(fn){
      for (let n = 0; n < 5; n++){
        const reads = new Map(), ops = [];
        const tx = {
          get: async r => { await null; reads.set(r.path, ver.get(r.path) || 0); return snap(r.path); },
          set: (r, d) => { ops.push(["set", r.path, d]); return tx; },
          update: (r, d) => { ops.push(["update", r.path, d]); return tx; },
          delete: r => { ops.push(["delete", r.path]); return tx; }
        };
        const res = await fn(tx);
        await null; await null;
        if ([...reads].some(([p, v]) => (ver.get(p) || 0) !== v)) continue;     // 누가 먼저 썼다 — 다시
        ops.forEach(o => write(o[0], o[1], o[2]));
        return res;
      }
      throw Object.assign(new Error("aborted"), { code: "aborted" });
    }
  };
  return { db, store, hooks };
}

/** 본 스크립트를 올린 새 환경 */
function load(shared){
  const els = {};
  const $ = s => els[s] || (els[s] = fakeEl("div"));
  const F = shared || makeDb();      // 같은 저장소를 쓰는 두 번째 기기 = load(E1.F)
  const asks = [], statuses = [];
  const ls = {};
  const ctx = {
    console, setTimeout, clearTimeout, Promise, JSON, Math, Date, Object, Array, Set, Map, String, Number, Error, URLSearchParams, TextEncoder, Uint8Array,
    crypto: require("crypto").webcrypto,
    localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } },
    location: { origin: "https://x.test", pathname: "/trip/", search: "", reload(){} },
    history: { replaceState(){}, state: null },
    navigator: {}, matchMedia: () => ({ matches: false }),
    document: { createElement: tag => fakeEl(tag), title: "" },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => SV, arrayUnion: (...a) => ({ __union: a }) } } },
    db: F.db, FB_OK: false,
    $, $$: () => [],
    MODAL_OPEN: {}, MODAL_AFTER: {}, MODAL_CLOSE: {},
    ASK: true, ASKTEXT: null,
    ask: async o => { asks.push(o); return ctx.ASK; },
    askText: async o => { asks.push(o); return ctx.ASKTEXT; },
    openModal: id => { if (ctx.MODAL_OPEN[id]) ctx.MODAL_OPEN[id](); $("#" + id).hidden = false; },
    closeModal: id => { $("#" + id).hidden = true; if (ctx.MODAL_AFTER[id]) ctx.MODAL_AFTER[id](); },
    afterBack: fn => fn(),
    setStatus: (m, c) => statuses.push([m, c || ""]),
    errText: e => (e && e.message) || "오류", fail: m => new Error(m),
    shareLine(){}, fmtFull: d => d, fmtEdit: d => String(d), stampOf: t => t, todayIso: () => "2026-11-05",
    dObj: s => new Date(s + "T00:00:00"), iso: d => d.toISOString().slice(0, 10), pad2: n => String(n).padStart(2, "0"),
    splitList: s => String(s || "").split(/[,\n]/).map(x => x.trim()).filter(Boolean), DOW: ["일","월","화","수","목","금","토"]
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(mainScript(), ctx, { filename: "index.html" });
  const run = code => vm.runInContext(code, ctx);
  return { ctx, run, $, els, F, asks, statuses, ls };
}

const TID = "k".repeat(20);
/** 여행 하나를 저장소와 화면 상태에 같이 넣는다 */
function setup(E, trip, money, extra){
  extra = extra || {};
  E.F.store.set("trips/" + TID, JSON.parse(JSON.stringify(trip)));
  (money || []).forEach((m, i) => E.F.store.set("trips/" + TID + "/money/" + (m.id || "m" + i), Object.assign({}, m)));
  (extra.items || []).forEach(x => E.F.store.set("trips/" + TID + "/items/" + x.id, Object.assign({}, x)));
  (extra.plan || []).forEach(x => E.F.store.set("trips/" + TID + "/plan/" + x.id, Object.assign({}, x)));
  E.ctx.__ME = extra.me || "";
  E.run("PID = 'p'.repeat(20); TID = 'k'.repeat(20); ME = __ME;");
  sync(E);
  return TID;
}
/** 저장소 → 화면 상태 (구독이 들어온 것처럼) */
function sync(E){
  const sub = c => [...E.F.store.keys()].filter(k => k.startsWith("trips/" + TID + "/" + c + "/")).map(k => Object.assign({ id: k.split("/").pop() }, JSON.parse(JSON.stringify(E.F.store.get(k)))));
  E.ctx.__T = E.F.store.get("trips/" + TID); E.ctx.__M = sub("money"); E.ctx.__I = sub("items"); E.ctx.__P = sub("plan");
  E.run("TRIP = __T ? JSON.parse(JSON.stringify(__T)) : null; MONEY = __M; ITEMS = __I; PLAN = __P;");
}
const tick = n => new Promise(r => setTimeout(r, n || 5));

/* ── 아주 작은 시험 틀 ── */
const results = [];
function test(name, fn){ results.push({ name, fn }); }
async function main(){
  let pass = 0, fail = 0;
  for (const t of results){
    try { await t.fn(); pass++; console.log("  ok   " + t.name); }
    catch(e){ fail++; console.log("  FAIL " + t.name + " — " + String(e && e.message || e).split("\n")[0]); }
  }
  console.log("RESULT " + pass + " " + fail);
  process.exitCode = fail ? 1 : 0;
}
function eq(a, b, msg){ const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error((msg || "다름") + ": " + A + " ≠ " + B); }
function ok(v, msg){ if (!v) throw new Error(msg || "거짓"); }

module.exports = { load, setup, sync, tick, test, main, eq, ok, findButtons, allText, TID };
