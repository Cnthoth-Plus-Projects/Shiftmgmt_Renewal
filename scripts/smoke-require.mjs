// 정식 1.0.0 서비스 89개가 소스/빌드에서 일치하며 실제로 불러와지는지 확인한다.
//
//   npm run smoke
//
// dist/server/main/services 의 .js 를 전부 불러와 본다.
// 파일 수·소스와 빌드 이름이 다르거나 하나라도 불러오지 못하면 실패한다.
// node:sqlite 가 내는 실험 기능 경고(ExperimentalWarning)는 오류가 아니므로 그대로 둔다.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 기존79개와 이후 승인된 정책·복구·이력·출력 서비스10개. */
const EXPECTED_COUNT = 89;

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const servicesDir = path.join(root, "dist", "server", "main", "services");
const sourceNames = readdirSync(path.join(root, "src/main/services"))
  .filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map(name => name.replace(/\.ts$/, ".js")).sort();
const servicesLabel = path.relative(root, servicesDir).split(path.sep).join("/");

/** 한국어 안내를 내보내고 실패로 끝낸다. */
function fail(lines) {
  process.stderr.write(`${lines.join("\n")}\n`);
  process.exit(1);
}

if (!existsSync(servicesDir)) {
  fail([
    "SMOKE_REQUIRE_FAILED — 빌드 결과가 아직 없습니다.",
    `찾는 곳: ${servicesLabel}`,
    "이 검사는 빌드된 파일을 실제로 불러와 보는 것이라, 빌드가 먼저여야 합니다.",
    "할 일: npm run build 를 먼저 실행한 뒤 이 검사를 다시 돌려 주세요."
  ]);
}

const fileNames = readdirSync(servicesDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
  .map((entry) => entry.name)
  .sort();

if (fileNames.length === 0) {
  fail([
    "SMOKE_REQUIRE_FAILED — 빌드 결과 폴더는 있지만 불러올 파일이 하나도 없습니다.",
    `찾는 곳: ${servicesLabel}`,
    "할 일: npm run build 를 먼저 실행한 뒤 이 검사를 다시 돌려 주세요."
  ]);
}

const require = createRequire(import.meta.url);
const failures = [];

for (const name of fileNames) {
  try {
    require(path.join(servicesDir, name));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    failures.push({ name, reason: reason.split("\n")[0].trim() });
  }
}

const countWrong = fileNames.length !== EXPECTED_COUNT;
const problems = [];

if (sourceNames.length !== EXPECTED_COUNT || JSON.stringify(sourceNames) !== JSON.stringify(fileNames)) {
  problems.push("소스 서비스 목록과 빌드 파일 목록이 일치하지 않습니다");
}

if (countWrong) {
  problems.push(`파일 개수가 ${EXPECTED_COUNT}개가 아닙니다(실제 ${fileNames.length}개)`);
}

if (failures.length > 0) {
  problems.push(`불러오지 못한 파일이 ${failures.length}개 있습니다`);
}

if (problems.length > 0) {
  const lines = [`SMOKE_REQUIRE_FAILED — ${problems.join(" · ")}.`, `대상 폴더: ${servicesLabel}`];

  if (countWrong) {
    lines.push("", `찾은 파일 ${fileNames.length}개:`);

    for (const name of fileNames) {
      lines.push(`- ${name}`);
    }

    lines.push("", "개수가 다르면 복사가 덜 됐거나 빌드 결과가 낡은 것입니다. npm run build 를 다시 실행해 보세요.");
  }

  if (failures.length > 0) {
    lines.push("", `불러오지 못한 파일 ${failures.length}개 (파일 이름 · 원인):`);

    for (const item of failures) {
      lines.push(`- ${item.name} · ${item.reason}`);
    }

    lines.push("", "원인 줄은 고치는 데 필요한 정보입니다. 그 줄까지 그대로 전달해 주세요.");
  }

  fail(lines);
}

process.stdout.write(`SMOKE_REQUIRE_OK — 서비스 ${EXPECTED_COUNT}개를 모두 불러왔습니다.\n`);
process.exit(0);
