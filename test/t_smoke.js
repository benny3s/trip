/* 가짜 환경에 본 스크립트가 올라가는지 */
const { load, setup, test, main, eq } = require("./env");
test("스크립트가 가짜 환경에 올라감", () => {
  const E = load();
  setup(E, { name: "x", teams: [{ id: "tA", name: "A" }], cats: [] }, []);
  eq(E.run("TEAMS().length"), 1);
  E.run("renderAll()");
});
main();
