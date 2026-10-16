# 11차 — E8 신규 인력 등록 모달 필드 순서를 소스(WorkforceManagementScreen.tsx 2130-2266)와 같게:
# 이름 칸(<div>...for="e8-name"...)을 직급 칸 뒤로 이동. 바이트 수·줄 수 불변, 텍스트 변경 없음.
import io, sys
P = "시안/2026-09-02-2차HTML/06-employees-3.html"
with io.open(P, "r", encoding="utf-8", newline="") as f: lines = f.read().split("\n")
idx = {k: [i for i, l in enumerate(lines) if f'for="e8-{k}"' in l] for k in ("code", "name", "type", "rank", "contact")}
for k, v in idx.items():
    assert len(v) == 1, f"{k}: {len(v)}회 — 저장 안 함"
c, n, t, r, ct = (idx[k][0] for k in ("code", "name", "type", "rank", "contact"))
assert (c, n, t, r, ct) == (c, c+1, c+2, c+3, c+4), f"현재 순서가 예상과 다름: {(c,n,t,r,ct)}"
assert lines[n].startswith("          <div><label") and lines[n].endswith("</div>"), "이름 칸이 한 줄 블록이 아님"
name_line = lines.pop(n)          # 이름 제거 → type, rank가 한 칸 앞으로
lines.insert(r, name_line)        # 직급(원래 r, 이제 r-1) 바로 뒤 = 인덱스 r
order = [k for i in range(c, c+5) for k in ("code","name","type","rank","contact") if f'for="e8-{k}"' in lines[i]]
assert order == ["code", "type", "rank", "name", "contact"], order
with io.open(P, "w", encoding="utf-8", newline="") as f: f.write("\n".join(lines))
print("OK 순서:", "/".join(order))
