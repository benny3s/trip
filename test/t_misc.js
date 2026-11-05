/* 작은 것들 — 금액 상한 · 지운 사람의 몫 · 여행 지우기 읽기 실패 · 새 여행 준비물 실패 */
const { load, setup, sync, tick, test, main, eq, ok, allText, TID } = require("./env");

const tm = (id, name) => ({ id, name, people: [name], bank: "" });
const trip = teams => ({ name: "여행", start: "", end: "", place: "", addr: "", phone: "", teams, cats: [] });
const moneyWrites = E => E.F.hooks.writes.filter(w => w.path.includes("/money/"));
const errs = E => E.statuses.filter(s => s[1] === "err").map(s => s[0]);

test("1억 원 넘는 금액은 창을 닫지 않고 알려 줌", async () => {
  const E = load(); setup(E, trip([tm("tA", "A"), tm("tB", "B")]), [], { me: "tA" });
  E.run("openExp(null)");
  E.$("#e_amt").value = "1,000,000,000"; E.$("#e_title").value = "숙소";
  E.run("saveExp()"); await tick();
  eq(E.$("#expModal").hidden, false, "창이 열려 있음");
  eq(moneyWrites(E).length, 0, "저장 안 함");
  ok(errs(E).length, "알림");
});

test("1억 원 딱은 저장됨", async () => {
  const E = load(); setup(E, trip([tm("tA", "A"), tm("tB", "B")]), [], { me: "tA" });
  E.run("openExp(null)");
  E.$("#e_amt").value = "100,000,000";
  E.run("saveExp()"); await tick();
  eq(moneyWrites(E).length, 1);
});

const goneExp = split => ({ id: "m0", kind: "exp", title: "장보기", amt: 30000, payer: "tA", split, memo: "", done: false, at: 1 });

test("지운 사람의 몫이 고치기 창에 보임", async () => {
  const E = load(); setup(E, trip([tm("tA", "A"), tm("tB", "B")]), [goneExp({ tA: 1, tB: 1, tX: 1 })]);
  E.run("openExp(MONEY[0])");
  const t = allText(E.$("#e_split"));
  ok(t.includes("(지운 사람)"), "화면: " + t);
  ok(t.includes("10,000원"), "몫 금액: " + t);
});

test("지운 사람 몫을 빼고 저장할 수 있음, 옛 몫은 손대지 않으면 그대로", async () => {
  const E = load(); setup(E, trip([tm("tA", "A"), tm("tB", "B")]), [goneExp({ tA: 1, tB: 1, tX: 1 })]);
  E.run("openExp(MONEY[0]); saveExp()"); await tick();
  eq(E.F.store.get("trips/" + TID + "/money/m0").split, { tA: 1, tB: 1, tX: 1 }, "그대로 저장");
  E.run("openExp(MONEY[0]); exSplit.tX = 0; saveExp()"); await tick();
  eq(E.F.store.get("trips/" + TID + "/money/m0").split, { tA: 1, tB: 1 }, "뺀 뒤");
});

test("나눌 사람이 12명을 넘으면 창을 닫지 않고 알려 줌", async () => {
  const T12 = Array.from({ length: 12 }, (_, i) => tm("t" + i, "n" + i));
  const sp = { tX: 1 }; T12.forEach(t => sp[t.id] = 1);
  const E = load(); setup(E, trip(T12), [goneExp(sp)]);
  E.run("openExp(MONEY[0]); saveExp()"); await tick();
  eq(E.$("#expModal").hidden, false, "창이 열려 있음");
  eq(moneyWrites(E).length, 0, "저장 안 함");
  ok(errs(E).length, "알림");
});

test("여행 지우기: 읽기가 실패해도 알림 + MOVING 풀림", async () => {
  const E = load(); setup(E, trip([tm("tA", "A")]), []);
  E.F.hooks.failGet = Object.assign(new Error("네트워크"), { code: "unavailable" });
  let threw = false;
  try { await E.$("#s_delete").onclick(); } catch(e){ threw = true; }
  await tick();
  ok(!threw, "처리 안 된 예외");
  eq(E.run("MOVING"), false, "MOVING");
  ok(errs(E).length, "알림");
  ok(E.F.store.has("trips/" + TID), "여행은 그대로");
});

test("여행 지우기: 잘 되면 하위 문서까지 지움", async () => {
  const E = load(); setup(E, trip([tm("tA", "A")]), [goneExp({ tA: 1 })], { items: [{ id: "i1", cat: "c", name: "n", who: [], memo: "", ord: 1, st: {} }] });
  await E.$("#s_delete").onclick(); await tick();
  eq([...E.F.store.keys()].filter(k => k.startsWith("trips/" + TID)).length, 0);
  eq(E.run("MOVING"), false);
});

test("새 여행: 준비물 저장이 실패해도 링크는 이 기기에 남고 여행이 열림", async () => {
  const E = load();
  E.run("openModal('newModal'); nTpl = 'camp'");
  E.$("#n_name").value = "새 여행";
  E.F.hooks.failCommit = ops => ops.some(o => o[1].includes("/items/"));
  await E.$("#n_make").onclick(); await tick(20);
  const mine = E.run("mine()");
  eq(mine.map(x => x.name), ["새 여행"], "이 기기 목록");
  eq(E.run("PID"), mine[0].id, "연 여행");
  ok(errs(E).length, "준비물 실패 알림");
});

test("새 여행: 잘 되면 전과 같음", async () => {
  const E = load();
  E.run("openModal('newModal'); nTpl = 'camp'");
  E.$("#n_name").value = "새 여행";
  await E.$("#n_make").onclick(); await tick(20);
  eq(E.run("mine()").length, 1);
  eq(errs(E), [], "실패 없음");
  ok([...E.F.store.keys()].some(k => k.includes("/items/")), "준비물 들어감");
});

main();
