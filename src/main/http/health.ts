// GET /api/health — 화면이 「서버 연결됨」을 확인하는 유일한 GET 창구.
import type { BridgeResult } from "./json";

export interface HealthInfo {
  /** 루트 VERSION 파일에 적힌 판 번호 */
  version: string;
  /** 서버를 돌리는 Node 판 번호 */
  node: string;
  /** 데이터 폴더(설정·DB가 쌓이는 곳) */
  dataDir: string;
}

export interface HealthContext {
  version: string;
  dataDir: string;
}

export function buildHealthPayload(context: HealthContext): BridgeResult<HealthInfo> {
  return {
    ok: true,
    data: {
      version: context.version,
      node: process.version,
      dataDir: context.dataDir
    }
  };
}
