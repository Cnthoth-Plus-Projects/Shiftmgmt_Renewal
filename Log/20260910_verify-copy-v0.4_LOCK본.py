# -*- coding: utf-8 -*-
"""1-2 복사 결과를 별첨 SHA 표와 대조한다(완료 기준 1·8).

v0.3 -> v0.4 (Codex 3차 (2) 반려 반영 — rename 구멍):
  - `git diff` 에 **--no-renames 와 -z** 를 붙인다. v0.3 은 rename 을 한 줄로 받아
    `parts[-1]`(목적지)만 취해 **원본 경로를 버렸다.** 그래서
    `R085 README.md -> vendor/electron-compat/index.d.ts` 같은 커밋이
    「허용 신규 파일 1개」로만 보여 범위 밖 파일 삭제가 숨었다(RC 0).
    --no-renames 는 그것을 `D README.md` + `A vendor/.../index.d.ts` 로 펼친다.
    -z 는 NUL 구분이라 경로에 탭·따옴표·한글이 있어도 안전하다.
  - **경로마다 상태를 못박는다**: 별첨 122개와 신규 4개는 정확히 `A`,
    수정 3개는 정확히 `M`. 그 밖의 상태(R·C·T·U·D 등)는 전부 실패.
  - **작업 트리가 깨끗한지 검사한다**(`git status --porcelain=v1 -z -uall`).
    커밋되지 않은 변경이 있으면 커밋 diff 검사가 실제 파일 상태를 보증하지 못한다.

v0.2 -> v0.3 (Codex 2차 (3)(4) 반려 반영):
  - 관리 폴더를 **재귀로** 훑는다. v0.2 는 os.listdir 로 바로 아래만 봐서
    src/shared/domain/nested/x.ts 를 놓쳤다.
  - **src/main/ipc 를 관리 대상에 넣는다.** v0.2 는 MANAGED 에 없어
    src/main/ipc/x.ts 를 놓쳤다(LOOSE_DIRS 는 아무 효과도 없었다).
  - `--baseline <git ref>` 를 주면 저장소 전체 변경 경로 집합이
    **허용 129개와 정확히 같은지** 검사한다(완료 기준 8).
      129 = 별첨 122 + package.json + package-lock.json + docs/codebase-map.md
            + scripts/smoke-require.mjs + vendor/electron-compat 3개
    기존 파일 수정(M)은 앞의 3개만 허용한다 -> tsconfig/vitest/eslint 무변경이 자동으로 검사된다.

v0.1 -> v0.2:
  - 집합 동등성(목록 밖 파일도 실패) · 출력을 ASCII 로(PowerShell CP949).

사용법:
    python Phase1/verify-copy.py <V4 저장소 경로>
    python Phase1/verify-copy.py <V4 저장소 경로> --baseline 66e7425
    python Phase1/verify-copy.py <V4 저장소 경로> --list <목록 파일>
"""
import argparse
import hashlib
import io
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_LIST = os.path.join(HERE, "04-1-2-복사대상-목록-v0.2.md")

ROW = re.compile(r"^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|\s*`([0-9a-f]{64})`\s*\|\s*([\d,]+)\s*\|\s*$")

# 1-2 가 관리하는 폴더. 이 안(하위 폴더 포함)의 파일 집합이 목록과 정확히 같아야 한다.
# V4 가 1-1 부터 갖고 있던 src/main/http · src/main/server*.ts · src/web 은 대상이 아니다.
MANAGED_DIRS = [
    "src/shared/domain",
    "src/shared/lib",
    "src/shared/config",
    "src/shared/bridge",
    "src/main/services",
    "src/main/ipc",
    "양식샘플",
]

# 별첨 122개 말고 1-2 에서 새로 생기거나 고쳐도 되는 경로(완료 기준 8).
ALLOWED_MODIFIED = [
    "package.json",
    "package-lock.json",
    "docs/codebase-map.md",
]
ALLOWED_ADDED = [
    "scripts/smoke-require.mjs",
    "vendor/electron-compat/package.json",
    "vendor/electron-compat/index.js",
    "vendor/electron-compat/index.d.ts",
]


def read_rows(list_path):
    rows = []
    for line in io.open(list_path, "r", encoding="utf-8", newline="").read().split("\n"):
        m = ROW.match(line)
        if m:
            rows.append((m.group(1), m.group(2), int(m.group(3).replace(",", ""))))
    return rows


def walk_managed(target, rel_dir):
    """관리 폴더 아래의 모든 일반 파일을 재귀로 모은다."""
    root = os.path.join(target, *rel_dir.split("/"))
    if not os.path.isdir(root):
        return set()
    out = set()
    for base, dirs, files in os.walk(root):
        for name in files:
            full = os.path.join(base, name)
            r = os.path.relpath(full, target).replace("\\", "/")
            out.add(r)
    return out


def run_git(target, *args):
    cmd = ["git", "-C", target, "-c", "core.quotepath=false"] + list(args)
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if p.returncode != 0:
        return None, (p.stderr or "").strip()
    return p.stdout, None


def git_changed(target, baseline):
    """기준 커밋 -> HEAD 의 변경 경로를 (상태, 경로) 목록으로 돌려준다.

    --no-renames : rename/copy 를 D + A 두 줄로 펼친다(원본 경로가 사라지지 않게).
    -z           : NUL 구분 - 경로에 탭·따옴표·한글이 있어도 안전하다.
    """
    out, err = run_git(target, "diff", "--no-renames", "--name-status", "-z", baseline, "HEAD")
    if out is None:
        return None, err
    toks = [t for t in out.split("\0")]
    if toks and toks[-1] == "":
        toks.pop()
    rows = []
    i = 0
    while i < len(toks):
        status = toks[i]
        i += 1
        if not status:
            continue
        code = status[0]
        # --no-renames 를 줬으므로 R/C 는 안 나와야 하지만, 나오면 두 경로를 모두 기록한다.
        if code in ("R", "C") and i + 1 < len(toks):
            src, dst = toks[i], toks[i + 1]
            i += 2
            rows.append((code, src))
            rows.append((code, dst))
            continue
        if i >= len(toks):
            break
        rows.append((code, toks[i]))
        i += 1
    return rows, None


def git_dirty(target):
    """커밋되지 않은 변경(스테이지·작업본·추적 안 되는 파일)을 돌려준다."""
    out, err = run_git(target, "status", "--porcelain=v1", "-z", "--untracked-files=all")
    if out is None:
        return None, err
    entries = [t for t in out.split("\0") if t]
    return entries, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("target", help="V4 저장소 경로")
    ap.add_argument("--list", dest="list_path", default=DEFAULT_LIST)
    ap.add_argument("--baseline", default=None, help="기준 커밋(예: 66e7425) - 주면 완료 기준 8 도 검사한다")
    args = ap.parse_args()

    target = args.target
    rows = read_rows(args.list_path)
    if not rows:
        sys.stdout.write("FAIL: could not read the list table.\n")
        return 2

    expected = set(r for r, _, _ in rows)

    ok = 0
    missing = []
    mismatch = []
    for relpath, want_sha, want_size in rows:
        p = os.path.join(target, *relpath.split("/"))
        if not os.path.isfile(p):
            missing.append(relpath)
            continue
        b = io.open(p, "rb").read()
        got = hashlib.sha256(b).hexdigest()
        if got == want_sha and len(b) == want_size:
            ok += 1
        else:
            mismatch.append((relpath, want_sha, got, want_size, len(b)))

    # 관리 폴더 안에 있는데 목록에 없는 파일 (재귀)
    unexpected = []
    for rel_dir in MANAGED_DIRS:
        for f in sorted(walk_managed(target, rel_dir)):
            if f not in expected:
                unexpected.append(f)

    sys.stdout.write("target      : %s\n" % target)
    sys.stdout.write("list        : %s\n" % args.list_path)
    sys.stdout.write("listed      : %d\n" % len(rows))
    sys.stdout.write("matched     : %d\n" % ok)
    sys.stdout.write("missing     : %d\n" % len(missing))
    sys.stdout.write("mismatched  : %d\n" % len(mismatch))
    sys.stdout.write("unexpected  : %d\n" % len(unexpected))

    for r in missing:
        sys.stdout.write("  [MISSING]    %s\n" % r)
    for r, ws, gs, wn, gn in mismatch:
        sys.stdout.write("  [MISMATCH]   %s\n    want %s (%d B)\n    got  %s (%d B)\n" % (r, ws, wn, gs, gn))
    for r in unexpected:
        sys.stdout.write("  [UNEXPECTED] %s\n" % r)

    scope_bad = []
    if args.baseline:
        # 커밋 diff 를 검사하기 전에, 작업 트리가 그 커밋과 같은 상태인지 먼저 본다.
        dirty, err = git_dirty(target)
        if dirty is None:
            sys.stdout.write("worktree    : GIT ERROR - %s\n" % err)
            scope_bad.append(("GIT", err))
        else:
            sys.stdout.write("worktree    : %d uncommitted\n" % len(dirty))
            for e in sorted(dirty):
                scope_bad.append(("UNCOMMITTED", e))

        changed, err = git_changed(target, args.baseline)
        if changed is None:
            sys.stdout.write("scope       : GIT ERROR - %s\n" % err)
            scope_bad.append(("GIT", err))
        else:
            # 경로마다 허용 상태를 못박는다: 122 + 신규 4 는 A, 수정 3 은 M. 그 밖은 전부 실패.
            want_status = {}
            for p in expected:
                want_status[p] = "A"
            for p in ALLOWED_ADDED:
                want_status[p] = "A"
            for p in ALLOWED_MODIFIED:
                want_status[p] = "M"

            paths = set(p for _, p in changed)
            sys.stdout.write("scope base  : %s\n" % args.baseline)
            sys.stdout.write("scope changed : %d (allowed %d)\n" % (len(paths), len(want_status)))

            for status, p in sorted(changed, key=lambda x: (x[1], x[0])):
                if p not in want_status:
                    scope_bad.append(("OUT_OF_SCOPE", "%s %s" % (status, p)))
                elif status != want_status[p]:
                    scope_bad.append(("BAD_STATUS", "%s %s (want %s)" % (status, p, want_status[p])))

            for p in sorted(set(want_status) - paths):
                scope_bad.append(("NOT_CHANGED", p))

        for kind, what in scope_bad:
            sys.stdout.write("  [%s] %s\n" % (kind, what))

    if missing or mismatch or unexpected or scope_bad:
        sys.stdout.write("COPY_VERIFY_FAIL\n")
        return 1

    if args.baseline:
        sys.stdout.write("COPY_VERIFY_OK - %d files match the origin byte for byte, no extra files, and the changed-path set is exactly %d.\n"
                         % (ok, len(expected) + len(ALLOWED_MODIFIED) + len(ALLOWED_ADDED)))
    else:
        sys.stdout.write("COPY_VERIFY_OK - %d files match the origin byte for byte, and no extra files.\n" % ok)
    return 0


if __name__ == "__main__":
    sys.exit(main())
