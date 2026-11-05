/* 📶 신호 약한 곳 — 사람 추가·설정 저장·'보냈어요' 가 끊겨도 입력이 남고, 확인 창이 뜬 사이 바뀐 줄은 두 번 기록되지 않는다 */
const { load, setup, sync, tick, test, main, eq, ok, rules, TID } = require("./env");

const tm = (id, name) => ({ id, name, people: [name], bank: "" });
const trip = teams => ({ name: "여행", start: "", end: "", place: "", addr: "", phone: "", teams, cats: ["기본"] });
const NO_SIGNAL = "신호가 없어요. 연결되면 다시 눌러 주세요";
const PIDX = "tripIdx/" + "p".repeat(20);
const hung = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r("HANG"), ms || 60))]);

const teamsIn = E => E.F.store.get("trips/" + TID).teams;
async function addMe(E, name){ E.$("#me_new").value = name; return E.run("addMe()"); }

/* ── 사람 추가 (arrayUnion) ── */
test("사람 추가는 규칙을 통과하고 사람 객체의 모양이 그대로", async () => {
  const E = load(); setup(E, trip([tm("tA", "A")]), []); rules(E);
  await addMe(E, "B"); await tick();
  eq(teamsIn(E).map(t => t.name), ["A", "B"]);
  const b = teamsIn(E)[1];
  eq(Object.keys(b).sort(), ["bank", "id", "name", "people"]);
  eq(b.people, ["B"]);
  eq(E.run("ME"), b.id, "ME 는 새 사람");
  eq(E.F.hooks.writes.filter(w => w.op === "update").length, 1, "쓰기 한 번");
});

test("신호가 없으면 사람 추가가 기다리지 않고 쌓이며, 나로 골라짐", async () => {
  const E = load(); setup(E, trip([tm("tA", "A")]), []); rules(E);
  E.F.hooks.offline = true; E.ctx.navigator.onLine = false;
  const r = await hung(addMe(E, "B"));
  ok(r !== "HANG", "끝없이 기다림");
  eq(teamsIn(E).map(t => t.name), ["A", "B"], "기기에 쌓임");
  eq(E.run("ME"), teamsIn(E)[1].id, "ME");
  eq(E.run("TEAMS().map(t => t.name)"), ["A", "B"], "바로 보임");
});

test("신호 없이 쌓은 사람이 나중에 거절되면 ME 를 되돌리고 알림", async () => {
  const E = load(); setup(E, trip([tm("tA", "A")]), []);
  E.F.hooks.offline = true; E.ctx.navigator.onLine = false; E.F.hooks.failWrite = () => true;
  await hung(addMe(E, "B")); await tick(20);
  eq(E.run("ME"), "", "ME");
  ok(!E.ls["tr_me:" + "p".repeat(20)], "기기 저장");
  ok(E.statuses.some(s => s[1] === "err"), "알림");
});

test("동시에 들어와도 안 빠짐 · 같은 이름은 한 사람 (규칙 통과)", async () => {
  const E1 = load(); setup(E1, trip([tm("tA", "A")]), []); rules(E1);
  const E2 = load(E1.F); setup(E2, trip([tm("tA", "A")]), []);
  await Promise.all([addMe(E1, "B"), addMe(E2, "C")]); await tick(20);
  eq(teamsIn(E1).map(t => t.name).sort(), ["A", "B", "C"]);
  const E3 = load(E1.F); setup(E3, trip(teamsIn(E1)), []);
  const E4 = load(E1.F); setup(E4, trip(teamsIn(E1)), []);
  await Promise.all([addMe(E3, "D"), addMe(E4, "D")]); await tick(20);
  eq(teamsIn(E1).map(t => t.name).sort(), ["A", "B", "C", "D"], "D 하나");
  eq(E3.run("ME"), E4.run("ME"), "같은 id");
});

test("이름을 바꾼 사람의 옛 이름을 다시 넣어도 id 가 겹치지 않음", async () => {
  const E = load(); setup(E, trip([tm("tA", "A")]), []); rules(E);
  await addMe(E, "B"); await tick(); sync(E);
  const idB = teamsIn(E)[1].id;
  E.F.store.get("trips/" + TID).teams[1].name = "B2"; sync(E);          // B 가 B2 로 이름을 고침 (id 는 그대로)
  await addMe(E, "B"); await tick();
  const ids = teamsIn(E).map(t => t.id);
  eq(new Set(ids).size, ids.length, "id 중복: " + ids);
  ok(ids.includes(idB));
});

/* ── 설정 저장 ── */
function openSet(E, name){
  E.F.store.set(PIDX, { name: "여행", locked: false, start: "" });
  E.run("IDX = { name: '여행', start: '' }");
  E.run("openModal('setModal')");
  E.$("#s_name").value = name;
}
const idxName = E => E.F.store.get(PIDX).name;

test("설정 저장이 신호 없어 실패하면 창·입력이 남고 이름은 안 바뀌며, 안내가 뜸", async () => {
  const E = load(); setup(E, trip([tm("tA", "A")]), []);
  openSet(E, "새 여행");
  E.F.hooks.offline = true; E.ctx.navigator.onLine = false;
  await E.$("#s_save").onclick(); await tick(20);
  eq(E.$("#setModal").hidden, false, "창이 닫힘");
  eq(E.$("#s_name").value, "새 여행", "입력");
  eq(E.F.store.get("trips/" + TID).name, "여행", "저장됨");
  eq(idxName(E), "여행", "tripIdx 이름만 바뀜");
  eq(E.run("IDX.name"), "여행", "화면 IDX");
  ok(E.statuses.some(s => s[1] === "err" && s[0] === NO_SIGNAL), "안내: " + JSON.stringify(E.statuses));
  eq(E.$("#s_save").disabled, false, "저장 버튼이 잠긴 채");
});

test("설정 저장이 실패한 뒤 신호가 돌아와 다시 누르면 저장되고 창이 닫힘", async () => {
  const E = load(); setup(E, trip([tm("tA", "A")]), []);
  openSet(E, "새 여행");
  E.F.hooks.offline = true; E.ctx.navigator.onLine = false;
  await E.$("#s_save").onclick(); await tick(20);
  E.F.hooks.offline = false; E.ctx.navigator.onLine = true;
  await E.$("#s_save").onclick(); await tick(20);
  eq(E.$("#setModal").hidden, true, "창");
  eq(E.F.store.get("trips/" + TID).name, "새 여행");
  eq(idxName(E), "새 여행");
  eq(E.run("IDX.name"), "새 여행");
});

test("이름을 고친 저장에서 담당 바꾸기가 실패하면 통째로 안 저장되고 창이 남음 → 다시 저장하면 담당까지 바뀜", async () => {
  const E = load();
  setup(E, trip([tm("tA", "철수"), tm("tB", "영희")]), [], {
    items: [{ id: "i1", cat: "기본", name: "텐트", who: ["철수"], memo: "", ord: 1, st: {} }],
    plan: [{ id: "p1", date: "", time: "", text: "장보기", who: ["철수"], memo: "", place: "" }]
  });
  const rename = "openModal('setModal'); stMem[0].name = '철수네'; stMem[0].people = ['철수네']";
  E.run(rename);
  E.F.hooks.failWrite = (op, p) => /\/items\//.test(p) && "unavailable";
  await E.$("#s_save").onclick(); await tick(20);
  eq(E.F.store.get("trips/" + TID).teams[0].name, "철수", "사람 이름만 바뀜");
  ok(E.statuses.some(s => s[1] === "err"), "실패 알림");
  if (E.$("#setModal").hidden) E.run(rename);          // 옛 동작: 창이 닫혔으니 다시 열어 고친다
  E.F.hooks.failWrite = null;
  await E.$("#s_save").onclick(); await tick(20);
  eq(E.F.store.get("trips/" + TID).teams[0].name, "철수네");
  eq(E.F.store.get("trips/" + TID + "/items/i1").who, ["철수네"], "준비물 담당");
  eq(E.F.store.get("trips/" + TID + "/plan/p1").who, ["철수네"], "일정 담당");
});

/* ── '보냈어요' ── */
const exp = (payer, amt) => ({ kind: "exp", title: "지출", amt, payer, split: { tA: 1, tB: 1, tC: 1 }, memo: "", done: false, at: 1 });
const T3 = [tm("tA", "A"), tm("tB", "B"), tm("tC", "C")];
const payDocs = E => [...E.F.store.entries()].filter(([k, v]) => k.startsWith("trips/" + TID + "/money/") && v.kind === "pay");
const ROW = "({ from: 'tA', to: 'tC', amt: 10000, paid: 0, total: 10000 })";

test("확인 창이 뜬 사이 상대가 같은 줄을 기록하면 두 번째는 저장하지 않고 알림", async () => {
  const E1 = load(); setup(E1, trip(T3), [exp("tC", 30000)], { me: "tA" });
  const E2 = load(E1.F); setup(E2, trip(T3), [exp("tC", 30000)], { me: "tC" });
  E1.ctx.ask = async () => { await E2.run("markSent" + ROW); await tick(); sync(E1); return true; };
  await E1.run("markSent" + ROW); await tick(20);
  eq(payDocs(E1).length, 1, "송금 기록 수");
  ok(E1.statuses.some(s => s[1] === "err" && /그사이/.test(s[0])), "알림: " + JSON.stringify(E1.statuses));
});

test("그사이 바뀐 게 없으면 그대로 기록됨 (순번은 기존 기록 다음)", async () => {
  const E = load(); setup(E, trip(T3), [exp("tC", 30000), { kind: "pay", title: "송금", amt: 4000, payer: "tA", split: { tC: 1 }, memo: "", at: 2, id: "pay_tA_tC_1" }], { me: "tA" });
  await E.run("markSent({ from: 'tA', to: 'tC', amt: 6000, paid: 4000, total: 10000 })"); await tick();
  eq(payDocs(E).map(([k]) => k.split("/").pop()).sort(), ["pay_tA_tC_1", "pay_tA_tC_2"]);
});

test("'보냈어요' 가 신호 없어 실패하면 같은 안내", async () => {
  const E = load(); setup(E, trip(T3), [exp("tC", 30000)], { me: "tA" });
  E.F.hooks.offline = true; E.ctx.navigator.onLine = false;
  await E.run("markSent" + ROW); await tick(20);
  eq(payDocs(E).length, 0);
  ok(E.statuses.some(s => s[1] === "err" && s[0] === NO_SIGNAL), "안내: " + JSON.stringify(E.statuses));
});

main();
