// 복사해 온 서비스 72개 + 내장 Excel 레이아웃 서비스 1개 + 레이아웃 정의·저장 서비스 2개 + 렌더·미리보기 서비스 3개 + 설치 Chrome PDF 및 대시보드 내보내기 서비스 2개 - 폐기 Access 진단 서비스 1개(총 79개)가 빌드 결과에서 실제로 불러와지는지 확인한다.
//
//   npm run smoke
//
// dist/server/main/services 의 .js 를 전부 불러와 본다.
// 실패 조건은 두 가지 — (가) 파일 개수가 79개가 아니다 (나) 하나라도 불러오지 못한다.
// node:sqlite 가 내는 실험 기능 경고(ExperimentalWarning)는 오류가 아니므로 그대로 둔다.
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 내장 Excel/PDF 및 레이아웃 서비스들을 포함한 총 서비스 수 (Access 진단 서비스 폐기 반영: 79). */
const EXPECTED_COUNT = 79;

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const servicesDir = path.join(root, "dist", "server", "main", "services");
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
