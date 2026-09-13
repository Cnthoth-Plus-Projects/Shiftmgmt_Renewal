import "./bridge/app-bridge";

// 준비 화면이 하는 일은 하나뿐이다 — 서버가 살아 있는지 확인해서 상태 줄을 바꾼다.
// 화면다운 화면은 Phase 3에서 만든다(디자인 시스템·창구 껍데기 포함).

interface HealthInfo {
  version: string;
  node: string;
  dataDir: string;
}

type BridgeResult<T> = { ok: true; data: T } | { ok: false; errorCode: string; message: string };

/** 2초 간격 최대 10회 재시도 */
const RETRY_LIMIT = 10;
const RETRY_DELAY_MS = 2_000;

const CONNECTING_TEXT = "서버 연결 확인 중…";
const FAILURE_TEXT = "서버에 연결할 수 없습니다. 프로그램이 켜져 있는지 확인하세요.";

function describeHealth(info: HealthInfo): string {
  return `서버 연결됨 · 판 ${info.version} · Node ${info.node} · 데이터 폴더: ${info.dataDir}`;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function requestHealth(): Promise<HealthInfo | null> {
  try {
    const response = await fetch("/api/health", { headers: { Accept: "application/json" } });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as BridgeResult<HealthInfo>;

    return payload.ok ? payload.data : null;
  } catch {
    return null;
  }
}

async function connect(): Promise<void> {
  const target = document.getElementById("health");

  if (target === null) {
    return;
  }

  target.textContent = CONNECTING_TEXT;

  for (let attempt = 1; attempt <= RETRY_LIMIT; attempt += 1) {
    const info = await requestHealth();

    if (info !== null) {
      target.textContent = describeHealth(info);
      return;
    }

    if (attempt < RETRY_LIMIT) {
      await wait(RETRY_DELAY_MS);
    }
  }

  target.textContent = FAILURE_TEXT;
}

void connect();
