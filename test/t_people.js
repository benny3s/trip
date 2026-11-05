/* 👤 사람 목록(teams) — 동시에 들어오기 · 설정 저장 · 이름 고치기 */
const { load, setup, sync, tick, test, main, eq, ok, TID } = require("./env");

const tm = (id, name) => ({ id, name, people: [name], bank: "" });
const trip = teams => ({ name: "여행", start: "", end: "", place: "", addr: "", phone: "", teams, cats: ["기본"] });
const teamsInStore = E => E.F.store.get("trips/" + TID).teams.map(t => t.name);

async function addMe(E, name){ E.$("#me_new").value = name; await E.run("addMe()"); }

test("두 사람이 거의 같이 '내 이름' 넣기 → 둘 다 남음", async () => {
  const E1 = load(); setup(E1, trip([tm("tA", "A")]), []);
  const E2 = load(E1.F); setup(E2, trip([tm("tA", "A")]), []);
  await Promise.all([addMe(E1, "B"), addMe(E2, "C")]);
  await tick(20);
  eq(teamsInStore(E1).sort(), ["A", "B", "C"]);
  sync(E1); sync(E2);
  ok(E1.run("!!teamOf(ME)") && E2.run("!!teamOf(ME)"), "둘 다 자기 이름이 남음");
});

test("같은 이름을 같이 넣으면 한 사람으로", async () => {
  const E1 = load(); setup(E1, trip([tm("tA", "A")]), []);
  const E2 = load(E1.F); setup(E2, trip([tm("tA", "A")]), []);
  await Promise.all([addMe(E1, "B"), addMe(E2, "B")]);
  await tick(20);
  eq(teamsInStore(E1), ["A", "B"]);
  eq(E1.run("ME"), E2.run("ME"), "같은 id");
});

test("저장이 실패하면 ME 는 그대로", async () => {
  const E = load(); setup(E, trip([tm("tA", "A")]), []);
  E.F.hooks.failWrite = () => true;
  await addMe(E, "B");
  eq(E.run("ME"), "", "ME");
  eq(E.ls["tr_me:" + "p".repeat(20)], undefined, "기기에 저장 안 함");
});

test("12명이면 더 못 넣음 (저장소의 최신 목록 기준)", async () => {
  const many = Array.from({ length: 11 }, (_, i) => tm("t" + i, "n" + i));
  const E1 = load(); setup(E1, trip(many), []);
  const E2 = load(E1.F); setup(E2, trip(many), []);
  await Promise.all([addMe(E1, "B"), addMe(E2, "C")]);
  await tick(20);
  eq(teamsInStore(E1).length, 12);
});

test("설정 창을 열어 둔 사이 들어온 사람은 저장해도 안 지워짐", async () => {
  const E1 = load(); setup(E1, trip([tm("tA", "A"), tm("tB", "B")]), []);
  E1.run("openModal('setModal')");
  const E2 = load(E1.F); setup(E2, trip([tm("tA", "A"), tm("tB", "B")]), []);
  await addMe(E2, "C"); await tick();
  sync(E1);                                   // 구독으로 새 목록이 들어와도 창의 stMem 은 열 때 것
  await E1.$("#s_save").onclick(); await tick(20);
  eq(teamsInStore(E1), ["A", "B", "C"]);
});

test("설정에서 뺀 사람은 빠지고, 그사이 들어온 사람은 남음", async () => {
  const E1 = load(); setup(E1, trip([tm("tA", "A"), tm("tB", "B")]), []);
  E1.run("openModal('setModal'); stMem = stMem.filter(t => t.id !== 'tB')");
  const E2 = load(E1.F); setup(E2, trip([tm("tA", "A"), tm("tB", "B")]), []);
  await addMe(E2, "C"); await tick();
  await E1.$("#s_save").onclick(); await tick(20);
  eq(teamsInStore(E1), ["A", "C"]);
});

test("이름을 고치면 준비물·일정의 담당도 같이 바뀜", async () => {
  const E = load();
  setup(E, trip([tm("tA", "철수"), tm("tB", "영희")]), [], {
    me: "tA",
    items: [{ id: "i1", cat: "기본", name: "텐트", who: ["철수"], memo: "", ord: 1, st: { tA: 2 } },
            { id: "i2", cat: "기본", name: "의자", who: ["영희", "마트"], memo: "", ord: 2, st: {} },
            { id: "i3", cat: "기본", name: "컵", who: ["각자"], memo: "", ord: 3, st: {} }],
    plan: [{ id: "p1", date: "", time: "", text: "장보기", who: ["철수", "영희"], memo: "", place: "" }]
  });
  E.run("openModal('setModal'); stMem[0].name = '철수네'; stMem[0].people = ['철수네']");
  await E.$("#s_save").onclick(); await tick(20);
  const st = E.F.store;
  eq(st.get("trips/" + TID + "/items/i1").who, ["철수네"], "준비물 담당");
  eq(st.get("trips/" + TID + "/items/i2").who, ["영희", "마트"], "다른 사람 것은 그대로");
  eq(st.get("trips/" + TID + "/items/i3").who, ["각자"], "모두는 그대로");
  eq(st.get("trips/" + TID + "/plan/p1").who, ["철수네", "영희"], "일정 담당");
  sync(E);
  eq(E.run("keysOf(ITEMS.find(x => x.id === 'i1'))"), ["tA"], "체크 열쇠");
  eq(E.run("isMine(ITEMS.find(x => x.id === 'i1'))"), true, "내 준비물");
});

test("두 사람 이름을 서로 바꿔도 담당이 맞게 바뀜", async () => {
  const E = load();
  setup(E, trip([tm("tA", "가"), tm("tB", "나")]), [], {
    items: [{ id: "i1", cat: "기본", name: "텐트", who: ["가"], memo: "", ord: 1, st: {} }]
  });
  E.run("openModal('setModal'); stMem[0].name = '나'; stMem[1].name = '가'");
  await E.$("#s_save").onclick(); await tick(20);
  eq(E.F.store.get("trips/" + TID + "/items/i1").who, ["나"]);
});

main();
