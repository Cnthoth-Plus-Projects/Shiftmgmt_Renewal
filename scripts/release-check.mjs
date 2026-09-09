// 새 판을 내보내기 전에 「지금 상태로 내보내도 되는가」를 한 번에 확인한다.
//
//   npm run release:check
//
// 검사: 판 번호 일치(VERSION == package.json) · 작업 트리 깨끗 · 같은 판 태그 없음 ·
//       타입검사/규칙검사/테스트 통과 · 빌드 산출물(브라우저 번들) 상태.
// 이 스크립트는 태그를 만들거나 무언가를 올리지 않는다 — 확인만 한다.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** npm 스크립트를 실행한다(cmd 셸을 거치지 않는다 — 인수가 그대로 전달되도록). */
function runNpmScript(script) {
  const npmCli = process.env.npm_execpath;
  const result =
    typeof npmCli === "string" && npmCli.endsWith(".js")
      ? spawnSync(process.execPath, [npmCli, "run", script], { cwd: root, encoding: "utf8" })
      : spawnSync("npm", ["run", script], { cwd: root, encoding: "utf8", shell: true });

  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

// 1) 판 번호
const versionFile = readFileSync(path.join(root, "VERSION"), "utf8").trim();
const packageVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;

record(
  "판 번호 일치",
  versionFile === packageVersion,
  `VERSION=${versionFile} · package.json=${packageVersion}`
);

// 2) 작업 트리
let status = "";
let statusOk = false;

try {
  status = git(["status", "--porcelain"]).trim();
  statusOk = status.length === 0;
} catch (error) {
  status = `git 실행 실패: ${error.message}`;
}

record("작업 트리 깨끗", statusOk, statusOk ? "변경 없음" : status.split("\n").slice(0, 5).join(" / "));

// 3) 같은 판 태그
let tagOk = false;
let tagDetail = "";

try {
  const tag = git(["tag", "--list", `v${versionFile}`]).trim();

  tagOk = tag.length === 0;
  tagDetail = tagOk ? `v${versionFile} 태그 없음` : `이미 있는 태그: ${tag}`;
} catch (error) {
  tagDetail = `git 실행 실패: ${error.message}`;
}

record("같은 판 태그 없음", tagOk, tagDetail);

// 4) 타입검사 · 규칙검사 · 테스트
for (const script of ["typecheck", "lint", "test"]) {
  const { ok, output } = runNpmScript(script);
  const lastLine = output.split("\n").filter((line) => line.trim().length > 0).slice(-1)[0] ?? "";

  record(`npm run ${script}`, ok, ok ? "통과" : lastLine.slice(0, 160));
}

// 5) 빌드 산출물
const bundlePath = path.join(root, "dist", "browser", "web", "app.js");
const bundleExists = existsSync(bundlePath);

record("브라우저 번들 존재", bundleExists, path.relative(root, bundlePath));

if (bundleExists) {
  const bundle = readFileSync(bundlePath, "utf8");
  const importCount = bundle
    .split(/\r?\n/)
    .filter((line) => /^\s*import\s/.test(line) || /\bfrom\s*["']\./.test(line)).length;

  record("번들 안 import문 0", importCount === 0, `${importCount}개`);
} else {
  record("번들 안 import문 0", false, "번들이 없어 확인하지 못했습니다");
}

const sharedOut = path.join(root, "dist", "browser", "shared");

record("dist/browser/shared 없음", !existsSync(sharedOut), path.relative(root, sharedOut));

// 결과 표
const width = Math.max(...results.map((item) => item.name.length));
const lines = results.map(
  (item) => `${item.ok ? "OK  " : "실패"} ${item.name.padEnd(width, " ")}  ${item.detail}`
);

process.stdout.write(`${lines.join("\n")}\n`);

const failed = results.filter((item) => !item.ok);

if (failed.length > 0) {
  process.stderr.write(`RELEASE_CHECK_FAILED — ${failed.length}건이 통과하지 못했습니다.\n`);
  process.exit(1);
}

process.stdout.write(`RELEASE_CHECK_OK — 판 ${versionFile} 을 내보낼 준비가 되었습니다.\n`);
