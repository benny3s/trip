/* 💰 정산 — 보낼 돈 표 · 송금 되돌리기 · 같이 누른 '보냈어요' */
const { load, setup, sync, tick, test, main, eq, ok, findButtons, allText, TID } = require("./env");

const TEAMS3 = [{ id: "tA", name: "A", people: ["A"], bank: "" }, { id: "tB", name: "B", people: ["B"], bank: "" }, { id: "tC", name: "C", people: ["C"], bank: "" }];
const trip = () => ({ name: "여행", start: "", end: "", place: "", addr: "", phone: "", teams: TEAMS3, cats: [] });
const ALL = { tA: 1, tB: 1, tC: 1 };
/* 옛 문서 모양 그대로 — 무작위 id, kind exp|pay, pay 는 split {받는 사람: 1} */
const exp = (payer, amt, split) => ({ kind: "exp", title: "지출", amt, payer, split: split || ALL, memo: "", done: false, at: 1 });
const pay = (from, to, amt) => ({ kind: "pay", title: "송금", amt, payer: from, split: { [to]: 1 }, memo: "", at: 2 });

const rowsOf = E => JSON.parse(E.run("JSON.stringify(settleRows())"));
const open = rows => rows.filter(r => r.amt > 0).map(r => [r.from, r.to, r.amt]);
const done = rows => rows.filter(r => r.amt <= 0).map(r => [r.from, r.to, r.paid]);
const payDocs = E => [...E.F.store.entries()].filter(([k, v]) => k.startsWith("trips/" + TID + "/money/") && v.kind === "pay");

test("예시: C 3만 → A→C 1만 송금 → B 9만이면 A→B 3만 · C→B 2만", () => {
  const E = load();
  setup(E, trip(), [exp("tC", 30000), pay("tA", "tC", 10000), exp("tB", 90000)]);
  const r = rowsOf(E);
  eq(open(r), [["tA", "tB", 30000], ["tC", "tB", 20000]], "보낼 돈");
  eq(done(r), [["tA", "tC", 10000]], "끝난 줄");
  /* 잔액 표와 같아야 한다 */
  const b = JSON.parse(E.run("JSON.stringify(balances())"));
  eq([b.tA.bal, b.tB.bal, b.tC.bal], [-30000, 50000, -20000], "잔액");
});

test("옛 문서: 송금 없음 — 계획 그대로", () => {
  const E = load();
  setup(E, trip(), [exp("tC", 30000)]);
  const r = rowsOf(E);
  eq(open(r), [["tA", "tC", 10000], ["tB", "tC", 10000]]);
  eq(done(r), []);
});

test("옛 문서: 다 보낸 줄은 그 자리에 회색, 남은 줄은 그대로", () => {
  const E = load();
  setup(E, trip(), [exp("tC", 30000), pay("tA", "tC", 10000)]);
  const r = rowsOf(E);
  eq(r.map(x => [x.from, x.to, x.amt, x.paid]), [["tA", "tC", 0, 10000], ["tB", "tC", 10000, 0]], "순서·금액");
});

test("옛 문서: 일부만 보냄 — 남은 돈 · 이미 보낸 돈 · 처음 금액", () => {
  const E = load();
  setup(E, trip(), [exp("tC", 30000), pay("tA", "tC", 4000)]);
  const r = rowsOf(E);
  eq(r[0], { from: "tA", to: "tC", amt: 6000, paid: 4000, total: 10000 });
});

test("옛 문서: 정산 끝(done) 지출·송금은 빼고 계산", () => {
  const E = load();
  setup(E, trip(), [Object.assign(exp("tC", 30000), { done: true }), Object.assign(pay("tA", "tC", 10000), { done: true }), exp("tB", 30000)]);
  const r = rowsOf(E);
  eq(open(r), [["tA", "tB", 10000], ["tC", "tB", 10000]]);
  eq(done(r), []);
});

test("4명: 정산이 끝난 사람에겐 보낼 돈이 남지 않음", () => {
  const E = load();
  const T4 = TEAMS3.concat([{ id: "tD", name: "D", people: ["D"], bank: "" }]);
  const all4 = { tA: 1, tB: 1, tC: 1, tD: 1 };
  setup(E, Object.assign(trip(), { teams: T4 }), [exp("tC", 40000, all4), pay("tA", "tC", 10000), exp("tB", 80000, all4)]);
  const r = rowsOf(E), b = JSON.parse(E.run("JSON.stringify(balances())"));
  ["tA", "tB", "tC", "tD"].forEach(k => {
    const owe = open(r).filter(x => x[0] === k).reduce((s, x) => s + x[2], 0) - open(r).filter(x => x[1] === k).reduce((s, x) => s + x[2], 0);
    eq(owe, -b[k].bal, k + " 보낼 돈 = 잔액");
  });
});

test("공금 모드는 전과 같음", () => {
  const E = load();
  setup(E, Object.assign(trip(), { pot: true }), [exp("tA", 20000), { kind: "pay", title: "공금에서 빼감", amt: 5000, payer: "pot", split: { tA: 1 }, memo: "", at: 3 }]);
  eq(rowsOf(E), [{ from: "pot", to: "tA", amt: 15000, paid: 5000, total: 20000 }]);
});

/** 화면의 '되돌리기' 버튼을 모두 눌러 본다 → 지워진 송금 기록 수 */
async function undoAll(E){
  E.run("TAB = 'money'; renderAll()");
  const bs = findButtons(E.$("#mXfer"), "되돌리기").concat(findButtons(E.$("#mList"), "송금"));
  for (const b of bs){ await b.onclick({ target: { closest: () => null } }); await tick(); }
}

test("되돌리기: 계획 조합이 바뀐 뒤의 송금(A→C)도 화면에서 지울 수 있음", async () => {
  const E = load();
  setup(E, trip(), [exp("tC", 30000), pay("tA", "tC", 10000), exp("tB", 90000)]);
  eq(payDocs(E).length, 1);
  await undoAll(E);
  eq(payDocs(E).length, 0, "남은 송금 기록");
});

test("되돌리기: 일부만 보낸 줄의 송금도 지울 수 있음", async () => {
  const E = load();
  setup(E, trip(), [exp("tC", 30000), pay("tA", "tC", 4000)]);
  await undoAll(E);
  eq(payDocs(E).length, 0, "남은 송금 기록");
});

test("'보냈어요' 확인 문구가 실제 취소 방법을 말함", async () => {
  const E = load();
  setup(E, trip(), [exp("tC", 30000)]);
  E.ctx.ASK = false;
  await E.run("markSent({ from: 'tA', to: 'tC', amt: 10000 })");
  const t = E.asks[0].text;
  ok(!t.includes("지출 목록"), "문구: " + t);
  ok(t.includes("되돌리기"), "문구: " + t);
});

test("보낸 사람·받는 사람이 같이 '보냈어요' → 기록은 하나", async () => {
  const E1 = load();
  setup(E1, trip(), [exp("tC", 30000)], { me: "tA" });
  const E2 = load(E1.F);
  setup(E2, trip(), [exp("tC", 30000)], { me: "tC" });
  const x = "({ from: 'tA', to: 'tC', amt: 10000, paid: 0, total: 10000 })";
  await Promise.all([E1.run("markSent" + x), E2.run("markSent" + x)]);
  await tick(20);
  eq(payDocs(E1).length, 1, "송금 기록 수");
  const d = payDocs(E1)[0][1];
  eq([d.kind, d.amt, d.payer, d.split, d.title, d.memo], ["pay", 10000, "tA", { tC: 1 }, "송금", ""], "문서 모양");
  ok(Object.keys(d).every(k => ["kind", "title", "amt", "payer", "by", "split", "memo", "done", "at"].includes(k)), "규칙의 칸만");
});

test("송금 → 되돌리기 → 다시 송금도 됨", async () => {
  const E = load();
  setup(E, trip(), [exp("tC", 30000)], { me: "tA" });
  const x = "({ from: 'tA', to: 'tC', amt: 10000, paid: 0, total: 10000 })";
  await E.run("markSent" + x); await tick(); sync(E);
  eq(payDocs(E).length, 1);
  await undoAll(E); sync(E);
  eq(payDocs(E).length, 0);
  await E.run("markSent" + x); await tick(); sync(E);
  eq(payDocs(E).length, 1, "다시 기록");
});

test("전에 보낸 기록이 있어도 남은 돈은 새로 기록됨", async () => {
  const E = load();
  setup(E, trip(), [exp("tC", 30000), pay("tA", "tC", 4000)], { me: "tA" });
  await E.run("markSent({ from: 'tA', to: 'tC', amt: 6000, paid: 4000, total: 10000 })"); await tick(); sync(E);
  eq(payDocs(E).length, 2);
  eq(done(rowsOf(E)), [["tA", "tC", 10000]]);
});

main();
