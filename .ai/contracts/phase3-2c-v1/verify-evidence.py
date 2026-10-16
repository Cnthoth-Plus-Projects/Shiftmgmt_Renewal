# -*- coding: utf-8 -*-
"""Sol-owned read-only foundation evidence/scope checker. Not product code.

Only contract-core can receive foundation acceptance here. A successful check
does not accept the ten UI cases, Phase3-2, a commit, or a release.
"""
import argparse
import copy
import ctypes
import hashlib
import json
import math
import os
from pathlib import Path
import re
import socket
import struct
import subprocess
import sys
import tempfile
import zlib

HERE = Path(__file__).resolve().parent
REPO = Path(r"C:\Projects\Active\ShiftMgmt_V4")


def require(value, message):
    if not value:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest().upper()


def load_json(path):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "Duplicate JSON key: " + key)
            result[key] = value
        return result
    return json.loads(Path(path).read_text(encoding="utf-8-sig"),
                      object_pairs_hook=pairs,
                      parse_constant=lambda token: (_ for _ in ()).throw(ValueError("Nonfinite: " + token)))


def finite_tree(value):
    if isinstance(value, float):
        require(math.isfinite(value), "Nonfinite number")
    elif isinstance(value, list):
        for item in value:
            finite_tree(item)
    elif isinstance(value, dict):
        for item in value.values():
            finite_tree(item)


def exact(actual, expected):
    # Python considers True == 1; the evidence contract does not.
    if type(actual) is not type(expected):
        return False
    if isinstance(expected, dict):
        return set(actual) == set(expected) and all(exact(actual[k], v) for k, v in expected.items())
    if isinstance(expected, list):
        return len(actual) == len(expected) and all(exact(a, b) for a, b in zip(actual, expected))
    return actual == expected


def pointer(value, location):
    require(location.startswith("/"), "JSON pointer must start with /")
    for part in location[1:].split("/"):
        part = part.replace("~1", "/").replace("~0", "~")
        value = value[int(part)] if isinstance(value, list) else value[part]
    return value


def compare_numeric(actual, expected, tolerance):
    require(type(tolerance) in (int, float) and math.isfinite(tolerance) and 0 <= tolerance <= 1,
            "Tolerance must be finite and <=1px")
    require(type(actual) in (int, float) and math.isfinite(actual), "Actual must be finite numeric")
    require(type(expected) in (int, float) and math.isfinite(expected), "Expected must be finite numeric")
    require(abs(actual - expected) <= tolerance, "Numeric comparison failed")


def coverage(checks, required):
    require(isinstance(checks, list), "Checks must be an array")
    ids = [item.get("id") for item in checks]
    require(all(isinstance(item, str) for item in ids), "Invalid check ID")
    require(len(ids) == len(set(ids)), "Duplicate check ID")
    require(set(ids) == set(required), "Missing/unknown/extra check ID")


def check_rules(contract, checks, observations):
    rules = contract["foundation"]["rules"]
    coverage(checks, [rule["id"] for rule in rules])
    finite_tree(observations)
    finite_tree(checks)
    by_id = {item["id"]: item for item in checks}
    for rule in rules:
        check = by_id[rule["id"]]
        require(set(check) == {"id", "sourceArtifact", "pointer", "actual"}, "Unexpected check fields")
        require(check["sourceArtifact"] == "core-observations" and check["pointer"] == rule["pointer"],
                "Incorrect observation source")
        actual = pointer(observations, rule["pointer"])
        require(exact(check["actual"], actual), "Actual differs from raw observation")
        if rule["op"] == "eq":
            require(exact(actual, rule["expected"]), rule["id"] + " comparison failed")
        elif rule["op"] == "installed-chrome":
            require(set(actual) == {"path", "version", "browserVersion"}, "Chrome fields invalid")
            require(Path(actual["path"]).is_absolute() and Path(actual["path"]).is_file(), "Chrome executable absent")
            require(isinstance(actual["version"], str) and actual["version"] != "", "Chrome version absent")
            require(isinstance(actual["browserVersion"], str) and re.fullmatch(r"\d+\.\d+\.\d+\.\d+", actual["browserVersion"]), "Actual browser version absent")
        elif rule["op"] == "resources":
            validate_resources(actual)
        else:
            raise ValueError("Unknown fixed rule operation")


def validate_resources(resources):
    require(isinstance(resources, list) and len(resources) == 2, "Exactly context/browser resources required")
    require({item["kind"] for item in resources} == {"context", "browser"}, "Wrong resource kinds")
    for item in resources:
        require(isinstance(item["id"], str) and item["id"], "Resource ID absent")
        events = item["events"]
        require([event["state"] for event in events] == ["created", "close-start", "closed"],
                "Resource close missing/failed")
        times = [event["timeMs"] for event in events]
        require(all(type(t) in (int, float) and math.isfinite(t) and t > 0 for t in times), "Invalid resource times")
        require(times == sorted(times), "Resource timeline out of order")


def within(target, root):
    try:
        target.relative_to(root)
        return True
    except ValueError:
        return False


def png_dimensions(data):
    require(data[:8] == b"\x89PNG\r\n\x1a\n", "Capture is not PNG")
    offset, dimensions, ended = 8, None, False
    while offset < len(data):
        require(offset + 12 <= len(data), "Truncated PNG")
        size = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + size]
        require(len(payload) == size and offset + size + 12 <= len(data), "Truncated PNG chunk")
        crc = struct.unpack(">I", data[offset + size + 8:offset + size + 12])[0]
        require(zlib.crc32(kind + payload) & 0xffffffff == crc, "PNG CRC mismatch")
        if kind == b"IHDR":
            require(dimensions is None and offset == 8 and size == 13, "Bad PNG IHDR")
            dimensions = list(struct.unpack(">II", payload[:8]))
        offset += size + 12
        if kind == b"IEND":
            require(size == 0 and offset == len(data), "PNG trailing bytes")
            ended = True
            break
    require(ended and dimensions is not None, "PNG incomplete")
    return dimensions


def pid_alive(pid):
    require(type(pid) is int and pid > 0, "Invalid PID")
    if os.name == "nt":
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
        kernel.OpenProcess.restype = ctypes.c_void_p
        kernel.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            require(ctypes.get_last_error() == 87, "PID query denied or failed")
            return False
        try:
            code = ctypes.c_ulong()
            require(kernel.GetExitCodeProcess(handle, ctypes.byref(code)) != 0, "PID query failed")
            return code.value == 259
        finally:
            kernel.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def check_scope(baseline):
    require(Path(baseline["repository"]).resolve() == REPO.resolve(), "Unexpected repository")
    def git(*argv):
        return subprocess.check_output(["git", *argv], cwd=str(REPO)).decode("utf-8").strip()
    require(git("rev-parse", "HEAD") == baseline["head"], "HEAD changed")
    require(git("branch", "--show-current") == baseline["branch"], "Branch changed")
    # Tracked deletions remain in ls-files; require is_file before hashing.
    names = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=str(REPO)).decode("utf-8").rstrip("\0").split("\0")
    require(set(names) == set(baseline["files"]), "Source file set changed")
    allowed = set(baseline["allowed"])
    changed = []
    for name, expected in baseline["files"].items():
        source = REPO / name
        require(source.is_file(), "Source absent: " + name)
        data = source.read_bytes()
        same = len(data) == expected["bytes"] and digest(data) == expected["sha256"]
        if name in allowed:
            require(len(data) <= 30000, "Verifier exceeds 30,000 bytes: " + name)
            if not same:
                changed.append(name)
        else:
            require(same, "Protected source changed: " + name)
    status = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=all"], cwd=str(REPO)).decode("utf-8").splitlines()
    require(status == baseline["status"], "Initial/final dirty-path state changed")
    for name, expected in baseline["control"].items():
        data = Path(name).read_bytes()
        require(len(data) == expected["bytes"] and digest(data) == expected["sha256"], "Locked control changed: " + name)
    return {"files": len(names), "protected": len(names) - len(allowed), "dirtyPaths": len(status), "changedAllowed": changed}


def validate_core(manifest_path, contract, contract_sha):
    path = Path(manifest_path).resolve(strict=True)
    manifest = load_json(path)
    finite_tree(manifest)
    require(manifest["schema"] == contract["evidenceSchema"], "Wrong evidence schema")
    require(manifest["stage"] == "foundation" and manifest["case"] == "contract-core", "Only foundation core supported")
    require(manifest["contractSha256"] == contract_sha, "Contract digest mismatch")
    require(manifest["status"] == "PASS" and type(manifest["exitCode"]) is int and manifest["exitCode"] == 0, "Core did not pass")
    context = manifest["owner"]["context"]
    run_dir = Path(context["runDir"]).resolve(strict=True)
    artifact_root = (REPO / "artifacts/captures/phase3/access-history-contract-core").resolve()
    require(within(run_dir, artifact_root) and run_dir != artifact_root, "Run outside owned artifact root")
    require(path == run_dir / "owner-final.json", "Unexpected final manifest path")
    require(manifest["runId"] == run_dir.name and run_dir.name.startswith("run-"), "Run identity mismatch")
    require(context["url"] == contract["url"], "Wrong owned URL")
    temp_dir = Path(context["tempDir"]).resolve()
    require(within(temp_dir, Path(tempfile.gettempdir()).resolve()) and temp_dir.name.startswith(contract["tempPrefix"]),
            "Unexpected owned temporary path")
    require(Path(context["bootstrapFile"]).resolve() == temp_dir / "data/bootstrap-credentials.json", "Wrong bootstrap path")
    require(not temp_dir.exists() and manifest["cleanup"]["tempRemoved"] is True, "Temporary path still exists")
    owner, worker, server = manifest["owner"], manifest["worker"], manifest["server"]
    require(len({owner["pid"], worker["pid"], server["pid"]}) == 3, "PIDs are not distinct")
    require(worker["parentPid"] == owner["pid"] and worker["contextAck"] is True, "Worker owner binding failed")
    require(isinstance(owner["nonceSha256"], str) and len(owner["nonceSha256"]) == 64 and
            all(c in "0123456789ABCDEF" for c in owner["nonceSha256"]) and worker["nonceSha256"] == owner["nonceSha256"],
            "Nonce receipt mismatch")
    for label, process in [("worker", worker), ("server", server)]:
        require(process["exitSeen"] is True and process["closeSeen"] is True and process["aliveAfterClose"] is False,
                label + " close not confirmed")
        require(process["createdAtMs"] <= process["exitAtMs"] <= process["closeAtMs"], label + " lifecycle order invalid")
        require(not pid_alive(process["pid"]), label + " PID still alive")
    require(type(worker["exitCode"]) is int and worker["exitCode"] == 0, "Worker exit unsuccessful")
    require(server["stdoutListenVerified"] is True and server["portListeningAfterClose"] is False, "Server ownership/port failed")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", contract["port"]))
    require(exact(manifest["errors"], {"primary": None, "cleanup": [], "evidence": [], "unexpected": []}), "Errors remain")
    artifacts = manifest["artifacts"]
    coverage(artifacts, contract["foundation"]["artifacts"])
    loaded = {}
    for item in artifacts:
        source = Path(item["path"]).resolve(strict=True)
        require(within(source, run_dir), "Core artifact outside own run")
        data = source.read_bytes()
        require(type(item["bytes"]) is int and len(data) == item["bytes"] and digest(data) == item["sha256"], "Artifact hash/size mismatch")
        loaded[item["id"]] = load_json(source) if item["id"] in ("core-observations", "worker-final") else data
    raw = loaded["core-observations"]
    wf = loaded["worker-final"]
    for key in ("case", "runId", "contractSha256", "checks"):
        require(exact(wf[key], manifest[key]), "Worker/final receipt differs: " + key)
    require(wf["pid"] == worker["pid"] and wf["parentPid"] == owner["pid"], "Worker receipt PIDs differ")
    require(wf["nonceSha256"] == worker["nonceSha256"], "Worker receipt nonce differs")
    check_rules(contract, manifest["checks"], raw)
    canonical = raw["canonicalLabels"]
    canonical_path = REPO / "dist/server/shared/domain/access-log.js"
    require(Path(canonical["path"]).resolve() == canonical_path.resolve(), "Wrong compiled canonical path")
    canonical_bytes = canonical_path.read_bytes()
    require(canonical["sha256"] == digest(canonical_bytes) and canonical["bytes"] == len(canonical_bytes), "Compiled canonical hash differs")
    node_source = "import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);process.stdout.write(JSON.stringify(m.accessLogActionLabels??m.default?.accessLogActionLabels));"
    canonical_map = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", node_source, str(canonical_path)], cwd=str(REPO), timeout=10).decode("utf-8"))
    require(exact(canonical["labels"], canonical_map), "Raw compiled labels differ from actual module")
    require(all(canonical_map[item["actionType"]] == item["label"] for item in raw["fixtureLabels"]), "Fixture labels differ from compiled canonical")
    require(png_dimensions(loaded["core-capture"]) == [1440, 900], "Capture dimensions differ")
    require(raw["captureId"] == "core-capture", "Capture reference differs")
    return {"case": "contract-core", "checks": len(manifest["checks"]), "artifacts": len(artifacts), "acceptance": "FOUNDATION_ONLY"}


def self_test(contract):
    rules = contract["foundation"]["rules"]
    # Synthetic parser probes only; never runtime/Chrome acceptance.
    observations = {}
    for rule in rules:
        if rule["op"] == "eq":
            observations[rule["pointer"].lstrip("/")] = copy.deepcopy(rule["expected"])
    observations["chrome"] = {"path": str(Path(sys.executable).resolve()), "version": "synthetic", "browserVersion": "1.2.3.4"}
    observations["resources"] = [{"kind": k, "id": k, "events": [{"state": state, "timeMs": i + 1} for i, state in enumerate(("created", "close-start", "closed"))]} for k in ("browser", "context")]
    checks = [{"id": rule["id"], "sourceArtifact": "core-observations", "pointer": rule["pointer"], "actual": copy.deepcopy(pointer(observations, rule["pointer"]))} for rule in rules]
    check_rules(contract, checks, observations)
    tested = []
    def rejects(label, call):
        try:
            call()
        except (ValueError, KeyError, TypeError, IndexError):
            tested.append(label)
        else:
            raise ValueError("Self-test unexpectedly accepted: " + label)
    rejects("missing-id", lambda: coverage(checks[:-1], [r["id"] for r in rules]))
    rejects("duplicate-id", lambda: coverage(checks + checks[:1], [r["id"] for r in rules]))
    rejects("unknown-id", lambda: coverage(checks + [{"id": "UNKNOWN"}], [r["id"] for r in rules]))
    for key, value in [("viewport", [133.5, 900]), ("loginInputs", {"id": {"count": True, "visible": True}, "password": {"count": 1, "visible": True}}),
                       ("fixtureRequestCount", 1), ("rawErrors", {"console": ["unrelated_401"], "pageerror": [], "requestfailed": [], "badResponses": []})]:
        raw, items = copy.deepcopy(observations), copy.deepcopy(checks)
        raw[key] = value
        for item in items:
            if item["pointer"] == "/" + key:
                item["actual"] = value
        rejects(key, lambda raw=raw, items=items: check_rules(contract, items, raw))
    bad = copy.deepcopy(checks); bad[0]["actual"] = True
    rejects("constant-actual", lambda: check_rules(contract, bad, observations))
    bad = copy.deepcopy(checks); bad[0]["tolerance"] = 4
    rejects("caller-tolerance", lambda: check_rules(contract, bad, observations))
    bad = copy.deepcopy(checks); bad[0]["expected"] = True
    rejects("caller-expected", lambda: check_rules(contract, bad, observations))
    raw, items = copy.deepcopy(observations), copy.deepcopy(checks)
    raw["fixtureLabels"][3]["label"] = "근무편성공개"
    for item in items:
        if item["pointer"] == "/fixtureLabels": item["actual"] = raw["fixtureLabels"]
    rejects("canonical-label-drift", lambda: check_rules(contract, items, raw))
    for bad_value in (float("nan"), float("inf")):
        rejects("nonfinite-" + str(bad_value), lambda bad_value=bad_value: finite_tree({"x": [bad_value]}))
    for tolerance in (2, 4, float("nan")):
        rejects("numeric-tolerance-" + str(tolerance), lambda tolerance=tolerance: compare_numeric(132, 132, tolerance))
    rejects("date-133.5", lambda: compare_numeric(133.5, 132, 1))
    compare_numeric(133, 132, 1)
    bad_resources = copy.deepcopy(observations["resources"]); bad_resources[0]["events"][-1]["state"] = "close-error"
    rejects("close-error", lambda: validate_resources(bad_resources))
    rejects("truncated-png", lambda: png_dimensions(b"\x89PNG\r\n\x1a\n"))
    return {"positiveComparisons": 2, "rejectedMutations": len(tested), "mutations": tested,
            "proof": "PARSER_ONLY_NO_RUNTIME_ACCEPTANCE"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract-sha", required=True)
    parser.add_argument("--baseline-sha")
    parser.add_argument("--scope", action="store_true")
    parser.add_argument("--core")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    require(sum((args.scope, args.core is not None, args.self_test)) == 1, "Exactly one mode required")
    contract_path = HERE / "contract.json"
    contract_sha = digest(contract_path.read_bytes())
    require(contract_sha == args.contract_sha, "Locked contract hash differs")
    contract = load_json(contract_path)
    if args.self_test:
        result = self_test(contract)
    else:
        baseline_path = HERE / "baseline.json"
        require(args.baseline_sha and digest(baseline_path.read_bytes()) == args.baseline_sha, "Locked baseline hash differs")
        result = check_scope(load_json(baseline_path))
        if args.core:
            result["core"] = validate_core(args.core, contract, contract_sha)
    print(json.dumps({"status": "PASS", "result": result}, ensure_ascii=False))


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    try:
        main()
    except Exception as error:
        print(json.dumps({"status": "FAIL", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
