"""여행 가자 시험 실행기 — test/t_*.js 를 node 로 하나씩 돌린다 (python test/run.py [이름 일부])"""
import glob, os, subprocess, sys

sys.stdout.reconfigure(encoding="utf-8")
NODE = r"C:\Program Files\nodejs\node.exe"
here = os.path.dirname(os.path.abspath(__file__))
files = sorted(glob.glob(os.path.join(here, "t_*.js")))
if len(sys.argv) > 1:
    files = [f for f in files if any(a in os.path.basename(f) for a in sys.argv[1:])]
tp = tf = 0
for f in files:
    print("== " + os.path.basename(f))
    r = subprocess.run([NODE, f], capture_output=True, text=True, encoding="utf-8", timeout=120)
    out = r.stdout + r.stderr
    print(out.rstrip())
    got = False
    for line in out.splitlines():
        if line.startswith("RESULT "):
            p, q = line.split()[1:3]; tp += int(p); tf += int(q); got = True
    if not got:
        tf += 1
print(f"합계: 통과 {tp} · 실패 {tf}")
sys.exit(1 if tf else 0)
