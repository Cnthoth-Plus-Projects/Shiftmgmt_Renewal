// 화면 파일(HTML·CSS)과 글꼴을 빌드 폴더로 옮긴다.
//
//   node scripts/copy-web-assets.mjs
//
// 글꼴 규칙(지시서 S13): Pretendard 는 woff2 만 싣고(woff 9.7 MB 는 크롬에 필요 없다),
// 원본 CSS 의 `./woff2/…` 폴더 구조를 그대로 유지한다. 그러지 않으면 화면에서 글꼴이 404가 난다.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const webOut = path.join(root, "dist", "browser", "web");
const assetsOut = path.join(webOut, "assets");

const WOFF_ENTRY = /,\s*url\(\.\/woff\/[^)]+\.woff\)\s*format\('woff'\)/g;

const problems = [];

function fail(message) {
  problems.push(message);
}

function requireFile(filePath, why) {
  if (!existsSync(filePath)) {
    fail(`${why}: ${filePath} 가 없습니다.`);

    return false;
  }

  return true;
}

function copyInto(sourcePath, targetDirectory, why) {
  if (!requireFile(sourcePath, why)) {
    return;
  }

  mkdirSync(targetDirectory, { recursive: true });
  copyFileSync(sourcePath, path.join(targetDirectory, path.basename(sourcePath)));
}

// 1) 화면 파일
copyInto(path.join(root, "src", "web", "index.html"), webOut, "화면 HTML");
copyInto(path.join(root, "src", "web", "styles.css"), webOut, "화면 CSS");
copyInto(path.join(root, "src", "web", "login.css"), webOut, "로그인 CSS");
copyInto(path.join(root, "src", "web", "shell.css"), webOut, "셸 CSS");
copyInto(path.join(root, "src", "web", "home.css"), webOut, "홈 CSS");
copyInto(path.join(root, "src", "web", "access-history.css"), webOut, "활동 이력 CSS");
copyInto(path.join(root, "src", "web", "workforce.css"), webOut, "인력 화면 CSS");
copyInto(path.join(root, "src", "web", "data-table.css"), webOut, "공통 테이블 CSS");
copyInto(path.join(root, "src", "web", "operations.css"), webOut, "운영 화면 CSS");
copyInto(path.join(root, "src", "web", "sites.css"), webOut, "근무지 화면 CSS");
copyInto(path.join(root, "src", "web", "schedule.css"), webOut, "근무표 화면 CSS");
copyInto(path.join(root, "src", "web", "performance.css"), webOut, "실적 화면 CSS");
copyInto(path.join(root, "src", "web", "allowance.css"), webOut, "수당 화면 CSS");
copyInto(path.join(root, "src", "web", "dashboard.css"), webOut, "대시보드 CSS");
copyInto(path.join(root, "src", "web", "common-controls.css"), webOut, "공통 입력 CSS");
copyInto(path.join(root, "src", "web", "policy-history.css"), webOut, "정책 이력 CSS");
copyInto(path.join(root, "src", "web", "theme.css"), webOut, "테마 CSS");
copyInto(path.join(root, "src", "web", "workspace.css"), webOut, "공통 화면 배치 CSS");
copyInto(path.join(root, "src", "web", "theme-init.js"), webOut, "테마 초기화 스크립트");

// 2) Pretendard — woff 항목을 뺀 생성본 + woff2 9개
const pretendardDir = path.join(root, "node_modules", "pretendard", "dist", "web", "static");
const pretendardCssPath = path.join(pretendardDir, "pretendard.css");

if (requireFile(pretendardCssPath, "Pretendard CSS")) {
  const source = readFileSync(pretendardCssPath, "utf8");
  const generated = source.replace(WOFF_ENTRY, "");

  mkdirSync(path.join(assetsOut, "woff2"), { recursive: true });
  writeFileSync(path.join(assetsOut, "pretendard.css"), generated, "utf8");

  const urlCount = (generated.match(/url\(/g) ?? []).length;
  const woff2Refs = [...generated.matchAll(/url\((\.\/woff2\/[^)]+\.woff2)\)/g)].map((match) => match[1]);
  const leftoverWoff = (generated.match(/\.\/woff\//g) ?? []).length;

  if (urlCount !== 9) {
    fail(`Pretendard 생성본의 url( 개수가 9가 아닙니다(${urlCount}개). 원본 CSS 형식이 바뀌었습니다: ${pretendardCssPath}`);
  }

  if (woff2Refs.length !== urlCount) {
    fail(`Pretendard 생성본에 ./woff2/ 가 아닌 참조가 있습니다(woff2 ${woff2Refs.length} / 전체 ${urlCount}).`);
  }

  if (leftoverWoff !== 0) {
    fail(`Pretendard 생성본에 ./woff/ 참조가 ${leftoverWoff}개 남았습니다.`);
  }

  for (const reference of woff2Refs) {
    const fileName = path.basename(reference);
    const sourceFile = path.join(pretendardDir, "woff2", fileName);

    if (!requireFile(sourceFile, "Pretendard 글꼴 파일")) {
      continue;
    }

    copyFileSync(sourceFile, path.join(assetsOut, "woff2", fileName));
  }

  for (const reference of woff2Refs) {
    const copied = path.join(assetsOut, "woff2", path.basename(reference));

    if (!existsSync(copied)) {
      fail(`생성본이 가리키는 글꼴이 복사되지 않았습니다: ${copied}`);
    }
  }
}

// 3) Material Symbols — CSS 가 같은 폴더의 woff2 를 가리키므로 둘을 함께 둔다
const materialDir = path.join(root, "node_modules", "material-symbols");

copyInto(path.join(materialDir, "outlined.css"), assetsOut, "아이콘 글꼴 CSS");
copyInto(path.join(materialDir, "material-symbols-outlined.woff2"), assetsOut, "아이콘 글꼴 파일");

if (problems.length > 0) {
  process.stderr.write(`화면 자산 복사에 실패했습니다 (${problems.length}건):\n`);

  for (const problem of problems) {
    process.stderr.write(`- ${problem}\n`);
  }

  process.exit(1);
}

process.stdout.write(`WEB_ASSETS_OK — ${path.relative(root, webOut)} 에 화면 파일·글꼴을 복사했습니다.\n`);
