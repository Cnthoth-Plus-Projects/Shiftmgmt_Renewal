# -*- coding: utf-8 -*-
"""1-2 복사 대상 목록을 원본에서 실측해 만든다. 원본은 읽기만 한다.

이 스크립트가 **직접 import 추이 폐포를 계산한다**(v0.1 은 폴더 열거만 하면서
문서에서 폐포라고 주장해 Codex 1차 ② 에서 반려됐다).

  씨앗(seed)  = 정본 이관 표가 말한 대상
                src/shared/domain/**       (테스트 제외)
                src/shared/lib/**          (테스트 제외)
                src/shared/bridge/contracts.ts
                src/main/services/**       (테스트 제외 · 정본이 말한 electron 3개를 뺀 것)
                src/main/ipc/ipc-handler-helpers.ts
  폐포(closure) = 씨앗에서 상대경로·@shared/* import 를 끝까지 따라간 결과
  결과 목록      = 폐포(코드) + 양식샘플 xlsx (`.accdb` 는 TODO 1-2d 로 제외)

사용법:
    python Phase1/gen-copylist.py                      # 정본 위치에 쓴다
    python Phase1/gen-copylist.py --output <파일경로>   # 임시 경로에 쓴다(검증자용)
    python Phase1/gen-copylist.py --stdout             # 표를 찍기만 한다
"""
import argparse
import hashlib
import io
import os
import re
import sys

ORIGIN = r"C:\Projects\Active\ShiftMgmt_V3.4"
SRC = os.path.join(ORIGIN, "src")
DEFAULT_OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "04-1-2-복사대상-목록-v0.2.md")

# 씨앗에서 빼는 서비스 = **정본 이관 표가 말한 「electron 붙은 3개 제외」 그대로**.
# 폐포 계산이 이 중 무엇을 도로 끌어오는지가 이 스크립트의 핵심 산출이다.
# (실제로 allowance-document-pdf-service.ts 는 도로 끌려온다 → 복사 대상이 된다.)
SEED_EXCLUDED_SERVICES = {
    "app-update-service.ts",              # electron-updater · D-7 방식 A 로 이식 안 함
    "dashboard-chart-export-service.ts",  # echarts + printToPDF · Phase 1 제외(사용자 결정 2026-09-09)
    "allowance-document-pdf-service.ts",  # nativeImage + printToPDF
}

# 양식샘플에서 제외 — TODO.md 1-2d 「xlsx 9개 · .accdb 1개는 원본 패키징에서도 제외」
SAMPLE_EXCLUDED_EXT = {".accdb"}

IMPORT_RE = re.compile(
    r"""(?:^|\n)\s*(?:import|export)\b[^;\n]*?from\s*["']([^"']+)["']"""
    r"""|(?:^|\n)\s*import\s*["']([^"']+)["']"""
    r"""|\bimport\s*\(\s*["']([^"']+)["']\s*\)"""
    r"""|\brequire\s*\(\s*["']([^"']+)["']\s*\)""",
    re.S,
)

RESOLVE_ORDER = ("", ".ts", ".tsx", ".d.ts", "/index.ts", "/index.tsx", ".json")


def rel(path):
    return os.path.relpath(path, ORIGIN).replace("\\", "/")


def is_impl_ts(name):
    return name.endswith(".ts") and ".test." not in name and ".spec." not in name


def read_imports(path):
    text = io.open(path, "r", encoding="utf-8", errors="replace").read()
    out = []
    for m in IMPORT_RE.finditer(text):
        spec = m.group(1) or m.group(2) or m.group(3) or m.group(4)
        if spec:
            out.append(spec)
    return out


def resolve(spec, from_file):
    """내부 모듈이면 파일 경로, 외부(npm·node:)면 None, 못 찾으면 ('MISSING', 후보)."""
    if spec.startswith("@shared/"):
        base = os.path.join(SRC, "shared", spec[len("@shared/"):])
    elif spec.startswith("@renderer/"):
        base = os.path.join(SRC, "renderer", spec[len("@renderer/"):])
    elif spec.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(from_file), spec))
    else:
        return None

    for ext in RESOLVE_ORDER:
        cand = base + ext
        if os.path.isfile(cand):
            return cand
    return ("MISSING", base)


def collect_seeds():
    seeds = []

    for sub in ("shared/domain", "shared/lib"):
        d = os.path.join(SRC, *sub.split("/"))
        for name in sorted(os.listdir(d)):
            if is_impl_ts(name):
                seeds.append(os.path.join(d, name))

    seeds.append(os.path.join(SRC, "shared", "bridge", "contracts.ts"))

    d = os.path.join(SRC, "main", "services")
    for name in sorted(os.listdir(d)):
        if is_impl_ts(name) and name not in SEED_EXCLUDED_SERVICES:
            seeds.append(os.path.join(d, name))

    seeds.append(os.path.join(SRC, "main", "ipc", "ipc-handler-helpers.ts"))
    return seeds


def compute_closure(seeds):
    closure = set(seeds)
    external = {}
    unresolved = []
    stack = list(seeds)

    while stack:
        cur = stack.pop()
        for spec in read_imports(cur):
            res = resolve(spec, cur)
            if res is None:
                external.setdefault(spec, set()).add(rel(cur))
            elif isinstance(res, tuple):
                unresolved.append((rel(cur), spec))
            elif res not in closure:
                closure.add(res)
                stack.append(res)

    return closure, external, unresolved


def sha_and_size(path):
    data = io.open(path, "rb").read()
    return hashlib.sha256(data).hexdigest(), len(data)


GROUP_ORDER = [
    ("A", u"계산·판정 규칙 `src/shared/domain/`", "src/shared/domain/"),
    ("B", u"공용 도구 `src/shared/lib/`", "src/shared/lib/"),
    ("C", u"설정값 `src/shared/config/`", "src/shared/config/"),
    ("D", u"계약 111개 `src/shared/bridge/`", "src/shared/bridge/"),
    ("E", u"서비스 `src/main/services/`", "src/main/services/"),
    ("F", u"IPC 헬퍼 `src/main/ipc/`", "src/main/ipc/"),
]


def build_document(closure, external, unresolved, seeds):
    code = sorted(rel(p) for p in closure)
    grouped = []
    used = set()
    for key, title, prefix in GROUP_ORDER:
        items = [r for r in code if r.startswith(prefix)]
        used.update(items)
        grouped.append((key, title, items))

    leftover = [r for r in code if r not in used]

    samples_dir = os.path.join(ORIGIN, u"양식샘플")
    samples = []
    skipped_samples = []
    for name in sorted(os.listdir(samples_dir)):
        path = os.path.join(samples_dir, name)
        if not os.path.isfile(path):
            continue
        if os.path.splitext(name)[1].lower() in SAMPLE_EXCLUDED_EXT:
            skipped_samples.append(name)
        else:
            samples.append(u"양식샘플/" + name)
    grouped.append(("G", u"양식 샘플 `양식샘플/`", samples))

    total = sum(len(items) for _, _, items in grouped)

    L = []
    L.append(u"# Phase 1-2 복사 대상 목록 — v0.2 (2026-09-09, 원본 0.5.4에서 스크립트 실측)")
    L.append(u"")
    L.append(u"- 원본(읽기만): `C:\\Projects\\Active\\ShiftMgmt_V3.4` · branch `feature/site-wizard-redesign` · commit `112a4a9`")
    L.append(u"- 생성 스크립트: `Phase1/gen-copylist.py` — **이 스크립트가 import 추이 폐포를 직접 계산한다.** 같은 스크립트를 다시 돌리면 같은 표가 나온다.")
    L.append(u"- v0.1 → v0.2: **`.accdb` 1개 제외**(`TODO.md` 1-2d 「xlsx 9개 · `.accdb` 1개는 원본 패키징에서도 제외」) · **생성기가 실제로 폐포를 계산하도록 교체**(v0.1 은 폴더 열거만 하면서 문서에서 폐포라고 주장했다 — Codex ③ 1차 ② 반려).")
    L.append(u"- 복사 뒤 **원본과 SHA-256 이 같아야 한다**(완료 기준 1). 아래 표가 그 기준값이다.")
    L.append(u"")
    L.append(u"## 폐포 계산 결과 (이 스크립트가 낸 값)")
    L.append(u"")
    L.append(u"| 항목 | 값 |")
    L.append(u"|---|---:|")
    L.append(u"| 씨앗(SEEDS) | %d |" % len(seeds))
    L.append(u"| 폐포(CLOSURE) | %d |" % len(closure))
    L.append(u"| 씨앗에 없는데 폐포에 들어온 것 | %d |" % (len(closure) - len(seeds)))
    L.append(u"| 해결 실패(UNRESOLVED) | %d |" % len(unresolved))
    L.append(u"| 폐포가 쓰는 외부 모듈 | %d |" % len(external))
    L.append(u"")
    extra = sorted(rel(p) for p in (closure - set(seeds)))
    if extra:
        L.append(u"씨앗에 없었는데 폐포가 끌어온 파일 %d개 — **정본 이관 표의 빈틈**이다:" % len(extra))
        L.append(u"")
        for r in extra:
            L.append(u"- `%s`" % r)
        L.append(u"")
    if unresolved:
        L.append(u"⚠️ 해결하지 못한 import:")
        for who, spec in unresolved:
            L.append(u"- `%s` → `%s`" % (who, spec))
        L.append(u"")
    L.append(u"폐포가 쓰는 외부 모듈(=V4 가 갖춰야 할 것):")
    L.append(u"")
    for name in sorted(external):
        L.append(u"- `%s` ← 예: `%s`" % (name, sorted(external[name])[0]))
    L.append(u"")
    if skipped_samples:
        L.append(u"양식샘플에서 제외한 파일: %s (TODO 1-2d)" % u" · ".join(u"`%s`" % s for s in skipped_samples))
        L.append(u"")
    if leftover:
        L.append(u"⚠️ 묶음에 넣지 못한 파일: %s" % u" · ".join(u"`%s`" % s for s in leftover))
        L.append(u"")

    L.append(u"## 묶음별 개수")
    L.append(u"")
    L.append(u"| 묶음 | 개수 |")
    L.append(u"|---|---:|")
    for key, title, items in grouped:
        L.append(u"| %s. %s | %d |" % (key, title, len(items)))
    L.append(u"| **합계** | **%d** |" % total)
    L.append(u"")

    for key, title, items in grouped:
        L.append(u"## %s. %s — %d개" % (key, title, len(items)))
        L.append(u"")
        L.append(u"| # | 원본 경로 | SHA-256 | 바이트 |")
        L.append(u"|---:|---|---|---:|")
        for i, r in enumerate(items, 1):
            s, n = sha_and_size(os.path.join(ORIGIN, *r.split("/")))
            L.append(u"| %d | `%s` | `%s` | %s |" % (i, r, s, format(n, ",")))
        L.append(u"")

    return u"\n".join(L) + u"\n", total, grouped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default=DEFAULT_OUT, help="목록을 쓸 파일 경로")
    ap.add_argument("--stdout", action="store_true", help="파일에 쓰지 않고 표준출력으로만 낸다")
    args = ap.parse_args()

    seeds = collect_seeds()
    closure, external, unresolved = compute_closure(seeds)
    doc, total, grouped = build_document(closure, external, unresolved, seeds)

    if args.stdout:
        sys.stdout.write(doc)
        return 0

    out = args.output
    d = os.path.dirname(os.path.abspath(out))
    if d and not os.path.isdir(d):
        os.makedirs(d)
    io.open(out, "w", encoding="utf-8", newline="\n").write(doc)

    data = io.open(out, "rb").read()
    sys.stdout.write("SEEDS=%d CLOSURE=%d UNRESOLVED=%d EXTERNAL=%d\n" % (len(seeds), len(closure), len(unresolved), len(external)))
    for key, title, items in grouped:
        sys.stdout.write("  %s: %d\n" % (key, len(items)))
    sys.stdout.write("TOTAL=%d\n" % total)
    sys.stdout.write("OUT=%s\n" % out)
    sys.stdout.write("BYTES=%d\n" % len(data))
    sys.stdout.write("SHA256=%s\n" % hashlib.sha256(data).hexdigest())
    return 0


if __name__ == "__main__":
    sys.exit(main())
