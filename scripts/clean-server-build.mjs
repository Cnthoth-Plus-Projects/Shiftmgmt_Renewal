// 서버 빌드 전 dist/server 생성물만 안전하게 청소한다.
// 삭제된 파일(예: database-powershell-diagnostic-service.js)이 잔존하여
// 런타임 또는 smoke-require 검사에 잘못 로드되는 것을 방지한다.
import { existsSync, lstatSync, readFileSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

// 1. 저장소 루트 검증 (package.json 확인)
const pkgPath = path.join(root, "package.json");
if (!existsSync(pkgPath)) {
  process.stderr.write("CLEAN_SERVER_BUILD_FAILED: 저장소 루트의 package.json을 찾을 수 없습니다.\n");
  process.exit(1);
}

try {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.name !== "shiftmgmt") {
    process.stderr.write(`CLEAN_SERVER_BUILD_FAILED: 잘못된 프로젝트 루트입니다. (name: ${pkg.name})\n`);
    process.exit(1);
  }
} catch (error) {
  process.stderr.write(`CLEAN_SERVER_BUILD_FAILED: package.json 파싱 실패: ${error?.message || error}\n`);
  process.exit(1);
}

// 2. 대상 경로 경계 검증 (정확히 <root>/dist/server)
const distDir = path.join(root, "dist");
const targetDir = path.join(distDir, "server");

const expectedNormalized = path.normalize(path.join(root, "dist", "server"));
if (path.normalize(targetDir) !== expectedNormalized) {
  process.stderr.write(`CLEAN_SERVER_BUILD_FAILED: 비정상 대상 경로 감지: ${targetDir}\n`);
  process.exit(1);
}

if (!targetDir || targetDir === root || targetDir === distDir || targetDir === path.parse(root).root) {
  process.stderr.write(`CLEAN_SERVER_BUILD_FAILED: 안전하지 않은 삭제 경로 감지: ${targetDir}\n`);
  process.exit(1);
}

// 3. 상위 경로 및 대상 디렉터리의 심볼릭 링크 / junction 및 실제 경로 일치 검증
if (existsSync(root)) {
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink()) {
    process.stderr.write(`CLEAN_SERVER_BUILD_FAILED: 저장소 루트가 심볼릭 링크입니다: ${root}\n`);
    process.exit(1);
  }
}

const realRoot = realpathSync(root);

if (existsSync(distDir)) {
  const distStat = lstatSync(distDir);
  if (distStat.isSymbolicLink()) {
    process.stderr.write(`CLEAN_SERVER_BUILD_FAILED: dist 디렉터리가 심볼릭 링크/junction입니다: ${distDir}\n`);
    process.exit(1);
  }

  const realDist = realpathSync(distDir);
  const expectedRealDist = path.join(realRoot, "dist");
  if (path.normalize(realDist).toLowerCase() !== path.normalize(expectedRealDist).toLowerCase()) {
    process.stderr.write(`CLEAN_SERVER_BUILD_FAILED: dist 실제 경로가 저장소 내부와 일치하지 않습니다: ${realDist} !== ${expectedRealDist}\n`);
    process.exit(1);
  }
}

if (existsSync(targetDir)) {
  const targetStat = lstatSync(targetDir);
  if (targetStat.isSymbolicLink()) {
    process.stderr.write(`CLEAN_SERVER_BUILD_FAILED: dist/server 가 심볼릭 링크/junction입니다: ${targetDir}\n`);
    process.exit(1);
  }

  const realTarget = realpathSync(targetDir);
  const expectedRealTarget = path.join(realRoot, "dist", "server");
  if (path.normalize(realTarget).toLowerCase() !== path.normalize(expectedRealTarget).toLowerCase()) {
    process.stderr.write(`CLEAN_SERVER_BUILD_FAILED: dist/server 실제 경로가 저장소 내부와 일치하지 않습니다: ${realTarget} !== ${expectedRealTarget}\n`);
    process.exit(1);
  }

  rmSync(targetDir, { recursive: true, force: true });
  process.stdout.write("CLEAN_SERVER_BUILD_OK: dist/server 청소 완료.\n");
} else {
  process.stdout.write("CLEAN_SERVER_BUILD_OK: dist/server 가 존재하지 않아 청소를 건너뜁니다.\n");
}
