// 이 PC에 설치된 크롬을 찾는다(개발 실행·화면 캡처·나중의 PDF 출력이 같은 크롬을 쓴다).
// 브라우저를 인터넷에서 내려받지 않는다 — 찾지 못하면 어디를 찾아봤는지 알려 주고 멈춘다.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const VERSION_FOLDER = /^\d+\.\d+\.\d+\.\d+$/;

const REGISTRY_KEY = "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe";

/** 찾아보는 자리(순서대로) — 회신·오류 메시지에 그대로 쓴다. */
export function chromeSearchLocations() {
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA ?? path.join(process.env.USERPROFILE ?? "C:\\", "AppData", "Local");

  return [
    {
      label: "환경변수 SHIFTMGMT_CHROME_PATH",
      path: process.env.SHIFTMGMT_CHROME_PATH ?? "(설정되어 있지 않음)"
    },
    {
      label: "Program Files",
      path: path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe")
    },
    {
      label: "Program Files (x86)",
      path: path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe")
    },
    {
      label: "사용자 폴더(LOCALAPPDATA)",
      path: path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe")
    },
    {
      label: "레지스트리 App Paths",
      path: REGISTRY_KEY
    }
  ];
}

function fromRegistry() {
  try {
    const output = execFileSync("reg", ["query", REGISTRY_KEY, "/ve"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const matched = output.match(/REG_SZ\s+(.+?\.exe)\s*$/im);

    return matched === null ? undefined : matched[1].trim();
  } catch {
    return undefined;
  }
}

/** 실행 파일 옆의 판 번호 폴더(예: 152.0.7977.83)를 읽는다. */
function readVersionBesideExe(exePath) {
  try {
    const directory = path.dirname(exePath);
    const versions = readdirSync(directory)
      .filter((entry) => VERSION_FOLDER.test(entry))
      .filter((entry) => statSync(path.join(directory, entry)).isDirectory())
      .sort((left, right) => {
        const leftParts = left.split(".").map(Number);
        const rightParts = right.split(".").map(Number);

        for (let index = 0; index < 4; index += 1) {
          if (leftParts[index] !== rightParts[index]) {
            return leftParts[index] - rightParts[index];
          }
        }

        return 0;
      });

    return versions.length > 0 ? versions[versions.length - 1] : "판 번호 확인 불가";
  } catch {
    return "판 번호 확인 불가";
  }
}

/**
 * 설치된 크롬을 찾는다.
 * @returns {{ path: string, version: string }}
 * @throws {Error} 못 찾으면 찾아본 자리 5곳을 담은 오류
 */
export function findChrome() {
  const fromEnvironment = process.env.SHIFTMGMT_CHROME_PATH;
  const candidates = [];

  if (typeof fromEnvironment === "string" && fromEnvironment.trim().length > 0) {
    candidates.push(fromEnvironment.trim());
  }

  const locations = chromeSearchLocations();

  candidates.push(locations[1].path, locations[2].path, locations[3].path);

  const registryPath = fromRegistry();

  if (registryPath !== undefined) {
    candidates.push(registryPath);
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return { path: candidate, version: readVersionBesideExe(candidate) };
    }
  }

  const searched = locations.map((location) => `  - ${location.label}: ${location.path}`).join("\n");

  throw new Error(
    `크롬을 찾지 못했습니다. 아래 자리를 찾아봤습니다.\n${searched}\n` +
      "크롬을 설치해 주세요(https://www.google.com/chrome). " +
      "다른 곳에 설치했다면 환경변수 SHIFTMGMT_CHROME_PATH 에 chrome.exe 경로를 넣어 주세요."
  );
}
