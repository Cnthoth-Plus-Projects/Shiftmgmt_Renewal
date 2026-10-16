# -*- coding: utf-8 -*-
"""1-2 복사 결과를 별첨 SHA 표와 대조한다(완료 기준 1·8).

v0.5 -> v0.6 (v0.5 적대적 시험이 찾은 F1~F9 반영):
  - **F1(높음) 구멍을 막았다.** [EOL_ONLY] 로 면죄하는 근거는 "작업 트리가 깨끗하다" 인데
    v0.5 는 그 검사(git_dirty)를 --baseline 블록 안에서만 했다. 그래서 --origin 만 주고
    --baseline 을 빼면 **커밋 안 된 실제 내용 변경이 RC 0 으로 통과**했고, 그 파일이
    EOL_ONLY 9개 중 하나면 출력이 정상 상태와 한 글자도 다르지 않았다(v0.4 보다 약함).
    -> git_dirty 를 항상 돌리고, **그 경로가 더러우면 EOL_ONLY 면죄를 주지 않는다.**
  - F2: 위 수정으로 변조된 파일이 eol only 개수에 섞이지 않는다.
  - F3: [BLOB_MISMATCH] 사유 문구를 ASCII 로(CP949 콘솔에서 깨졌다).
  - F4: --origin 이 검사 대상 자신이면 거부한다(동어반복 통과 방지).
  - F5: --origin-ref 를 40자리로 해석해 출력에 박는다.
  - F6: blob 오류 상세 줄이 출력 루프 뒤에 추가돼 영원히 안 찍혔다 -> 순서 수정.
  - F9: 합격 문장을 "작업 트리 바이트 일치 N + 줄바꿈만 다름 M = 검증 122" 로 분명히.

v0.4 -> v0.5 (적대적 교차 감사 F1 반영 — 체크아웃 줄바꿈 변환):
  - 새로 clone 하면 복사분 9개가 별첨 SHA 와 어긋났다(matched 113 / mismatched 9 / RC 1).
    원인은 **core.autocrlf=true 가 체크아웃 때 LF 를 CRLF 로 바꿔 쓰기** 때문이다.
    그 9개의 원본 줄바꿈은 **순수 LF 6개 + CRLF/LF 혼재 3개**다(시험 F7 정정 —
    duty-type-catalog.ts CRLF1/LF341 · rotation-index.ts CRLF1/LF71 ·
    employee-storage-service.ts CRLF489/LF184). 복사는 바이트 완벽했고 D-8 도 지켰다.
  - ** 혼재 3개는 어떤 체크아웃 설정으로도 원본 바이트를 되살릴 수 없다**(시험 F8):
    blob 이 이미 LF 로 정규화해 혼재 패턴을 지웠으므로 autocrlf=true 면 전부 CRLF,
    false 면 전부 LF 가 된다. 즉 "작업 트리 SHA-256 == 별첨" 은 **복사 당시 작업 트리에서만**
    성립하고 재현할 수 없다. 그래서 blob 대조가 유일하게 재현 가능한 기준이다.
  - **--origin <원본경로> [--origin-ref <ref>]** 를 주면 **git 색인 blob 해시**를 원본 커밋과
    대조한다. 두 저장소 모두 add 때 LF 로 정규화하므로 blob 은 체크아웃 변환과 무관하다.
    (실증 2026-09-10: 122/122 blob 해시·모드 동일)
  - 작업 트리가 깨끗하면 작업 트리 파일은 blob 에서 필터로 만들어진 것이다. 그래서
    **blob 이 같은데 작업 트리 바이트가 다르면 그 차이는 줄바꿈뿐**이므로 실패가 아니라
    `[EOL_ONLY]` 로 알린다. blob 이 다르면 실제 내용이 바뀐 것이므로 `[BLOB_MISMATCH]` 로 실패.
  - --origin 을 안 주면 **blob 대조만 빠진다**(작업 트리 SHA 가 유일한 기준).
    ※ v0.6 부터 **작업 트리 청결 검사는 --baseline 없이도 항상 한다.** 그래서 v0.4 와
      완전히 같지는 않다 — `worktree :` 줄이 한 줄 늘고, 더러운 트리에서는 RC 도 갈린다
      (v0.4 는 --baseline 없으면 RC 0, v0.6 은 RC 1). 프로젝트가 쓰는 호출
      (--baseline 동반)에서는 v0.4 와 출력이 바이트 동일이다(v0.6 재시험 E 실측).

알려진 한계 (v0.6 재시험이 찾음 · 거짓 통과로 이어지는 것은 없다 · 다음 판에서 고친다):
  - G1: `git status` 의 ` M` 에는 **줄바꿈 형태 차이**가 섞인다. 그래서 새 clone 에서
    아홉 개를 원본 바이트로 되돌려 놓으면 `matched 122` 인데도 `worktree 9 uncommitted`
    로 실패한다(**거짓 경보** · 안전한 방향). 고칠 방법: `[UNCOMMITTED]` 마다 내용 기반
    판정(`git diff --name-only -- <경로>` 가 비었는지 / clean(작업본)==blob)을 덧붙여
    `[EOL_FORM]` 으로 따로 이름 붙인다. 그 보정이 C-3b·C-3c 를 다시 열지 않음은 실측 확인됨.
  - G3: `git_dirty()` 가 `status -z` 의 **rename 두 칸 형태**를 풀지 않아 원본 경로가
    잘려 들어간다(`'README.md'` -> `'DME.md'`). 무기화는 실패했다(시도 2건 모두 RC 1 —
    `??` 항목이나 `[MISSING]` 이 올바른 경로를 공급한다). 남는 위험은 거짓 경보·가독성.
  - `core.autocrlf=false`/`input`, `.gitattributes` 가 있는 저장소, 경로에 탭·따옴표·개행이
    든 경우는 **미실측**이다(공백·한글 경로는 실측 확인).

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
    python Phase1/verify-copy.py <V4 저장소 경로> --baseline 66e7425 \
        --origin "C:/Projects/Active/ShiftMgmt_V3.4" --origin-ref 112a4a9
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


def git_gitdir(repo):
    out, err = run_git(repo, "rev-parse", "--absolute-git-dir")
    if out is None:
        return None, err
    return out.strip().replace("\\", "/").rstrip("/").lower(), None


def git_resolve(repo, ref):
    out, err = run_git(repo, "rev-parse", "--verify", "%s^{commit}" % ref)
    if out is None:
        return None, err
    return out.strip(), None


def git_blobs(repo, ref):
    """ref 트리의 경로 -> (모드, blob 해시). 체크아웃 변환과 무관한 값이다."""
    out, err = run_git(repo, "ls-tree", "-r", "-z", ref)
    if out is None:
        return None, err
    table = {}
    for ent in out.split("\0"):
        if not ent.strip():
            continue
        if "\t" not in ent:
            continue
        meta, path = ent.split("\t", 1)
        parts = meta.split()
        if len(parts) < 3:
            continue
        table[path] = (parts[0], parts[2])
    return table, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("target", help="V4 저장소 경로")
    ap.add_argument("--list", dest="list_path", default=DEFAULT_LIST)
    ap.add_argument("--baseline", default=None, help="기준 커밋(예: 66e7425) - 주면 완료 기준 8 도 검사한다")
    ap.add_argument("--origin", default=None,
                    help="원본 저장소 경로 - 주면 git 색인 blob 해시를 대조한다(체크아웃 줄바꿈 변환과 무관)")
    ap.add_argument("--origin-ref", default="112a4a9", help="원본 커밋(기본 112a4a9)")
    args = ap.parse_args()

    target = args.target
    rows = read_rows(args.list_path)
    if not rows:
        sys.stdout.write("FAIL: could not read the list table.\n")
        return 2

    expected = set(r for r, _, _ in rows)

    # 작업 트리 청결 검사는 **항상** 먼저 돌린다(F1).
    # [EOL_ONLY] 면죄의 근거가 "작업 트리가 깨끗하다" 이므로, 그 전제를 먼저 확인해야 한다.
    dirty, dirty_err = git_dirty(target)
    dirty_paths = set()
    if dirty:
        for e in dirty:
            # porcelain -z 한 항목: "XY path"
            if len(e) > 3:
                dirty_paths.add(e[3:])

    # --origin 을 주면 git 색인 blob 해시를 원본 커밋과 대조한다(체크아웃 변환과 무관).
    blob_ok = 0
    blob_bad = []
    blob_err = None
    origin_blobs = None
    target_blobs = None
    origin_resolved = None
    if args.origin:
        # F4 - 대상 자신을 원본이라고 주면 동어반복이다. 거부한다.
        g_t, et = git_gitdir(target)
        g_o, eo = git_gitdir(args.origin)
        if g_t is None or g_o is None:
            blob_err = et or eo
        elif g_t == g_o:
            blob_err = ("--origin is the same repository as the target (%s);"
                        " a self-comparison proves nothing" % g_o)
    if args.origin and not blob_err:
        # F5 - ref 를 40자리로 박아 둔다.
        origin_resolved, er = git_resolve(args.origin, args.origin_ref)
        if origin_resolved is None:
            blob_err = er
    if args.origin and not blob_err:
        origin_blobs, e1 = git_blobs(args.origin, origin_resolved)
        target_blobs, e2 = git_blobs(target, "HEAD")
        if origin_blobs is None or target_blobs is None:
            blob_err = e1 or e2
        else:
            for relpath, _, _ in rows:
                a = target_blobs.get(relpath)
                b2 = origin_blobs.get(relpath)
                if a is None or b2 is None:
                    blob_bad.append((relpath, "NOT IN TREE", a, b2))
                elif a[0] != b2[0] or a[1] != b2[1]:
                    blob_bad.append((relpath, "DIFFERENT", a, b2))
                else:
                    blob_ok += 1

    def blob_same(relpath):
        """[EOL_ONLY] 면죄 조건.

        blob 이 원본과 같고 **그 경로가 커밋되지 않은 변경에 들어 있지 않아야** 한다(F1).
        작업 트리가 그 경로에서 깨끗할 때만 "작업 트리 파일 = blob 에 필터를 먹인 것"이
        성립하고, 그때에야 바이트 차이를 줄바꿈으로 단정할 수 있다.
        """
        if not args.origin or origin_blobs is None or target_blobs is None:
            return False
        if relpath in dirty_paths or dirty_err:
            return False
        a = target_blobs.get(relpath)
        b2 = origin_blobs.get(relpath)
        return a is not None and b2 is not None and a == b2

    ok = 0
    missing = []
    mismatch = []
    eol_only = []
    for relpath, want_sha, want_size in rows:
        p = os.path.join(target, *relpath.split("/"))
        if not os.path.isfile(p):
            missing.append(relpath)
            continue
        b = io.open(p, "rb").read()
        got = hashlib.sha256(b).hexdigest()
        if got == want_sha and len(b) == want_size:
            ok += 1
        elif blob_same(relpath):
            # blob 은 원본과 같다. 작업 트리가 깨끗한지는 아래에서 따로 검사하므로,
            # 이 차이는 체크아웃 줄바꿈 필터가 만든 것이다(내용 변경이 아니다).
            eol_only.append((relpath, want_size, len(b)))
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
    if args.origin:
        if blob_err:
            sys.stdout.write("blob        : GIT ERROR - %s\n" % blob_err)
        else:
            sys.stdout.write("blob match  : %d / %d  (origin %s @ %s)\n"
                             % (blob_ok, len(rows), args.origin, origin_resolved))
            sys.stdout.write("eol only    : %d  (blob is identical; checkout line endings differ)\n"
                             % len(eol_only))

    for r in missing:
        sys.stdout.write("  [MISSING]    %s\n" % r)
    for r, ws, gs, wn, gn in mismatch:
        sys.stdout.write("  [MISMATCH]   %s\n    want %s (%d B)\n    got  %s (%d B)\n" % (r, ws, wn, gs, gn))
    for r in unexpected:
        sys.stdout.write("  [UNEXPECTED] %s\n" % r)
    for r, w, g in eol_only:
        sys.stdout.write("  [EOL_ONLY]   %s  (%d B -> %d B, blob identical)\n" % (r, w, g))
    for r, kind, a, b2 in blob_bad:
        sys.stdout.write("  [BLOB_MISMATCH] %s  %s  target=%s origin=%s\n"
                         % (r, kind, a, b2))

    scope_bad = []
    # 작업 트리 상태는 --baseline 과 무관하게 항상 보고하고, 더러우면 실패다(F1).
    if dirty is None:
        sys.stdout.write("worktree    : GIT ERROR - %s\n" % dirty_err)
        scope_bad.append(("GIT", dirty_err))
    else:
        sys.stdout.write("worktree    : %d uncommitted\n" % len(dirty))
        for e in sorted(dirty):
            scope_bad.append(("UNCOMMITTED", e))

    if args.baseline:
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

    if blob_err:
        scope_bad.append(("GIT", blob_err))

    for kind, what in scope_bad:
        sys.stdout.write("  [%s] %s\n" % (kind, what))

    if missing or mismatch or unexpected or scope_bad or blob_bad:
        sys.stdout.write("COPY_VERIFY_FAIL\n")
        return 1

    if args.baseline:
        if args.origin:
            sys.stdout.write("COPY_VERIFY_OK - %d of %d listed files match the origin byte for byte and %d differ on checkout line endings only"
                             " (Git-index blobs match the origin for all %d), no extra files, and the changed-path set is exactly %d.\n"
                             % (ok, len(rows), len(eol_only), blob_ok,
                                len(expected) + len(ALLOWED_MODIFIED) + len(ALLOWED_ADDED)))
        else:
            sys.stdout.write("COPY_VERIFY_OK - %d files match the origin byte for byte, no extra files, and the changed-path set is exactly %d.\n"
                             % (ok, len(expected) + len(ALLOWED_MODIFIED) + len(ALLOWED_ADDED)))
    else:
        sys.stdout.write("COPY_VERIFY_OK - %d files match the origin byte for byte, and no extra files.\n" % ok)
    return 0


if __name__ == "__main__":
    sys.exit(main())
