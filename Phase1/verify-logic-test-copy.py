#!/usr/bin/env python3
"""Verify the closed Phase 1-4 logic-test migration without changing either repo."""

from __future__ import annotations

import argparse
import hashlib
import subprocess
import sys
from pathlib import Path


TEST_ROOTS = (
    "src/shared/domain",
    "src/shared/lib",
    "src/main/services",
    "src/main/ipc/ipc-handler-helpers.test.ts",
)
EXCLUDED_TESTS = {
    "src/main/services/app-update-service.test.ts",
    "src/main/services/dashboard-chart-export-service.test.ts",
}
SUPPORT_MAP = {
    "scripts/issue-account-recovery-key.mjs": "scripts/issue-account-recovery-key.mjs",
    "build/installer-update-data.ps1": "build/installer-update-data.ps1",
    "scripts/lib/release-publish-helpers.cjs": "scripts/lib/release-publish-helpers.cjs",
    "src/renderer/assets/brand-logo-clean.png": "src/renderer/assets/brand-logo-clean.png",
    "artifacts/releases/v0.4.5/RELEASE_MANIFEST.json": (
        "test-fixtures/legacy-resources/release-history/v0.4.5/RELEASE_MANIFEST.json"
    ),
    "artifacts/releases/v0.4.6/RELEASE_MANIFEST.json": (
        "test-fixtures/legacy-resources/release-history/v0.4.6/RELEASE_MANIFEST.json"
    ),
}
MODIFIED_PATHS = {
    ".gitignore",
    "docs/codebase-map.md",
    "vitest.config.ts",
}
SETUP_PATH = "vitest.setup.ts"

EXPECTED_SETUP = """import path from \"node:path\";

Object.defineProperty(process, \"resourcesPath\", {
  configurable: true,
  value: path.resolve(process.cwd(), \"test-fixtures\", \"legacy-resources\")
});
"""


class VerificationError(RuntimeError):
    pass


def run_git(repo: Path, args: list[str], *, text: bool = False) -> bytes | str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=text,
    )
    if result.returncode != 0:
        stderr = result.stderr if text else result.stderr.decode("utf-8", "replace")
        raise VerificationError(
            f"git failed in {repo}: git {' '.join(args)}: {stderr.strip()}"
        )
    return result.stdout


def resolve_commit(repo: Path, ref: str) -> str:
    value = run_git(repo, ["rev-parse", "--verify", f"{ref}^{{commit}}"], text=True)
    assert isinstance(value, str)
    return value.strip()


def decode_nul_paths(data: bytes) -> list[str]:
    return [item.decode("utf-8", "surrogateescape") for item in data.split(b"\0") if item]


def list_origin_tests(origin: Path, origin_ref: str) -> list[str]:
    data = run_git(
        origin,
        ["ls-tree", "-r", "--name-only", "-z", origin_ref, "--", *TEST_ROOTS],
    )
    assert isinstance(data, bytes)
    paths = sorted(
        path
        for path in decode_nul_paths(data)
        if path.endswith(".test.ts") and path not in EXCLUDED_TESTS
    )
    return paths


def parse_tree(data: bytes) -> dict[str, tuple[str, str]]:
    entries: dict[str, tuple[str, str]] = {}
    for record in data.split(b"\0"):
        if not record:
            continue
        metadata, raw_path = record.split(b"\t", 1)
        mode, object_type, object_id = metadata.decode("ascii").split(" ")
        if object_type != "blob":
            continue
        path = raw_path.decode("utf-8", "surrogateescape")
        entries[path] = (mode, object_id)
    return entries


def read_tree(repo: Path, ref: str) -> dict[str, tuple[str, str]]:
    data = run_git(repo, ["ls-tree", "-r", "-z", ref])
    assert isinstance(data, bytes)
    return parse_tree(data)


def read_blob(repo: Path, ref: str, path: str) -> bytes:
    data = run_git(repo, ["show", f"{ref}:{path}"])
    assert isinstance(data, bytes)
    return data


def parse_name_status(data: bytes) -> dict[str, str]:
    parts = [part for part in data.split(b"\0") if part]
    if len(parts) % 2 != 0:
        raise VerificationError("unexpected git --name-status -z output")
    result: dict[str, str] = {}
    for index in range(0, len(parts), 2):
        status = parts[index].decode("ascii")
        path = parts[index + 1].decode("utf-8", "surrogateescape")
        if status not in {"A", "M"}:
            raise VerificationError(f"forbidden change status {status}: {path}")
        result[path] = status
    return result


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_newlines(data: bytes) -> str:
    return data.decode("utf-8").replace("\r\n", "\n")


def expected_single_insertion(
    baseline_text: str, *, needle: str, replacement: str, label: str
) -> str:
    count = baseline_text.count(needle)
    if count != 1:
        raise VerificationError(f"{label}: baseline insertion anchor count is {count}, expected 1")
    return baseline_text.replace(needle, replacement, 1)


def verify(args: argparse.Namespace) -> None:
    target = Path(args.target).resolve()
    origin = Path(args.origin).resolve()
    if not target.is_dir() or not (target / ".git").exists():
        raise VerificationError(f"target is not a git repository: {target}")
    if not origin.is_dir() or not (origin / ".git").exists():
        raise VerificationError(f"origin is not a git repository: {origin}")

    baseline = resolve_commit(target, args.baseline)
    target_head = resolve_commit(target, "HEAD")
    origin_ref = resolve_commit(origin, args.origin_ref)
    origin_head = resolve_commit(origin, "HEAD")
    if origin_head != origin_ref:
        raise VerificationError(
            f"origin HEAD mismatch: expected {origin_ref}, observed {origin_head}"
        )
    if target_head == baseline:
        raise VerificationError("target HEAD still equals baseline; no implementation commit found")

    parent = resolve_commit(target, "HEAD^")
    if parent != baseline:
        raise VerificationError(
            f"implementation must be one commit on baseline: parent={parent}, baseline={baseline}"
        )

    target_status = run_git(target, ["status", "--porcelain=v1", "-z"])
    assert isinstance(target_status, bytes)
    if target_status:
        raise VerificationError("target worktree is not clean")

    origin_tests = list_origin_tests(origin, origin_ref)
    groups = {
        "domain": sum(path.startswith("src/shared/domain/") for path in origin_tests),
        "lib": sum(path.startswith("src/shared/lib/") for path in origin_tests),
        "services": sum(path.startswith("src/main/services/") for path in origin_tests),
        "ipc": sum(path == "src/main/ipc/ipc-handler-helpers.test.ts" for path in origin_tests),
    }
    expected_groups = {"domain": 26, "lib": 2, "services": 81, "ipc": 1}
    if len(origin_tests) != 110 or groups != expected_groups:
        raise VerificationError(
            f"origin test inventory mismatch: total={len(origin_tests)}, groups={groups}"
        )

    added_paths = set(origin_tests) | set(SUPPORT_MAP.values()) | {SETUP_PATH}
    expected_changes = {path: "A" for path in added_paths}
    expected_changes.update({path: "M" for path in MODIFIED_PATHS})
    diff_data = run_git(
        target,
        ["diff", "--no-renames", "--name-status", "-z", baseline, target_head],
    )
    assert isinstance(diff_data, bytes)
    observed_changes = parse_name_status(diff_data)
    if observed_changes != expected_changes:
        missing = sorted(set(expected_changes) - set(observed_changes))
        unexpected = sorted(set(observed_changes) - set(expected_changes))
        bad_status = sorted(
            path
            for path in set(expected_changes) & set(observed_changes)
            if expected_changes[path] != observed_changes[path]
        )
        raise VerificationError(
            "changed-path set mismatch: "
            f"missing={missing}, unexpected={unexpected}, bad_status={bad_status}"
        )

    target_tests_data = run_git(
        target,
        ["ls-tree", "-r", "--name-only", "-z", target_head, "--", *TEST_ROOTS],
    )
    assert isinstance(target_tests_data, bytes)
    target_tests = sorted(
        path for path in decode_nul_paths(target_tests_data) if path.endswith(".test.ts")
    )
    if target_tests != origin_tests:
        raise VerificationError("target logic-test path set differs from the 110-file origin set")
    for excluded in sorted(EXCLUDED_TESTS):
        if (target / excluded).exists():
            raise VerificationError(f"excluded test exists: {excluded}")

    origin_tree = read_tree(origin, origin_ref)
    target_tree = read_tree(target, target_head)
    copy_pairs = [(path, path) for path in origin_tests] + list(SUPPORT_MAP.items())
    worktree_mismatches: list[str] = []
    blob_mismatches: list[str] = []
    for source_path, target_path in copy_pairs:
        source_file = origin / source_path
        target_file = target / target_path
        if not source_file.is_file() or not target_file.is_file():
            worktree_mismatches.append(f"{source_path} -> {target_path}: missing")
        elif sha256(source_file) != sha256(target_file):
            worktree_mismatches.append(f"{source_path} -> {target_path}: SHA256")
        if origin_tree.get(source_path) != target_tree.get(target_path):
            blob_mismatches.append(f"{source_path} -> {target_path}")
    if worktree_mismatches:
        raise VerificationError(f"worktree byte mismatches: {worktree_mismatches}")
    if blob_mismatches:
        raise VerificationError(f"git blob/mode mismatches: {blob_mismatches}")

    setup_text = normalize_newlines(read_blob(target, target_head, SETUP_PATH))
    if setup_text != EXPECTED_SETUP:
        raise VerificationError("vitest.setup.ts differs from the approved exact content")

    baseline_vitest = normalize_newlines(read_blob(target, baseline, "vitest.config.ts"))
    target_vitest = normalize_newlines(read_blob(target, target_head, "vitest.config.ts"))
    expected_vitest = expected_single_insertion(
        baseline_vitest,
        needle='    globals: true,\n    include: ["src/**/*.test.ts"],',
        replacement=(
            '    globals: true,\n'
            '    setupFiles: "./vitest.setup.ts",\n'
            '    include: ["src/**/*.test.ts"],'
        ),
        label="vitest.config.ts",
    )
    if target_vitest != expected_vitest:
        raise VerificationError("vitest.config.ts has changes beyond the approved setupFiles line")

    baseline_ignore = normalize_newlines(read_blob(target, baseline, ".gitignore"))
    target_ignore = normalize_newlines(read_blob(target, target_head, ".gitignore"))
    expected_ignore = expected_single_insertion(
        baseline_ignore,
        needle="artifacts/captures/\n.DS_Store",
        replacement="artifacts/captures/\nartifacts/tests/\n.DS_Store",
        label=".gitignore",
    )
    if target_ignore != expected_ignore:
        raise VerificationError(".gitignore has changes beyond artifacts/tests/")

    map_text = normalize_newlines(read_blob(target, target_head, "docs/codebase-map.md"))
    required_map_tokens = (
        "vitest.setup.ts",
        "scripts/issue-account-recovery-key.mjs",
        "scripts/lib/release-publish-helpers.cjs",
        "build/installer-update-data.ps1",
        "src/renderer/assets/brand-logo-clean.png",
        "test-fixtures/legacy-resources/release-history",
        "81파일·447개",
        "26파일·177개",
        "2파일·7개",
        "1파일·15개",
    )
    missing_map_tokens = [token for token in required_map_tokens if token not in map_text]
    if missing_map_tokens:
        raise VerificationError(f"codebase map tokens missing: {missing_map_tokens}")

    print("LOGIC_TEST_VERIFY_OK")
    print(f"origin_ref={origin_ref}")
    print(f"baseline={baseline}")
    print(f"target_head={target_head}")
    print("tests=110 domain=26 lib=2 services=81 ipc=1")
    print("copied_worktree_bytes=116/116")
    print("copied_git_blob_mode=116/116")
    print("changed_paths=120 added=117 modified=3")
    print("excluded_tests=2 absent=2")
    print("target_worktree=clean")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("target", help="target ShiftMgmt_V4 repository")
    parser.add_argument("--baseline", required=True, help="expected target parent commit")
    parser.add_argument("--origin", required=True, help="read-only ShiftMgmt_V3.4 repository")
    parser.add_argument("--origin-ref", required=True, help="expected origin commit")
    args = parser.parse_args()
    try:
        verify(args)
    except VerificationError as error:
        print(f"LOGIC_TEST_VERIFY_FAIL: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
