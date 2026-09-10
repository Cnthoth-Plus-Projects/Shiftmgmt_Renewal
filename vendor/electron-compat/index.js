"use strict";

/**
 * electron 자리 패키지 (CommonJS).
 *
 * src/main/services/allowance-document-pdf-service.ts 는 「복사만」 대상이라 한 글자도
 * 고칠 수 없다. 그 파일이 부르는 electron 이름만 여기서 풀어 준다.
 *
 * Phase 1 은 PDF 지원 안 함 · 2.5-5. PDF 흡수 에서 대체(R-15).
 */

/** BrowserWindow 를 만들려고 할 때 사용자에게 보여 줄 문구. */
const PDF_NOT_SUPPORTED_MESSAGE = "PDF 만들기는 이 프로그램에서 아직 지원하지 않습니다.";

/**
 * 언제나 비어 있는 이미지.
 *
 * pdf-service 457행이 isEmpty() 로 먼저 묻고, 참이면 그 자리에서 null 을 돌려준다.
 * 그래서 로고 없이 조용히 넘어가고, 뒤의 픽셀 계산(461~523행)에는 닿지 않는다.
 */
const createEmptyNativeImage = () => ({
  isEmpty: () => true,
  getSize: () => ({ width: 0, height: 0 }),
  toBitmap: () => Buffer.alloc(0),
  toPNG: () => Buffer.alloc(0)
});

const nativeImage = {
  createFromPath: () => createEmptyNativeImage(),
  createFromBitmap: () => createEmptyNativeImage()
};

/** 만들려고 하면 한국어 오류를 던진다. Phase 1 에는 PDF 를 만드는 수단이 없다. */
class BrowserWindow {
  constructor() {
    throw new Error(PDF_NOT_SUPPORTED_MESSAGE);
  }
}

module.exports = {
  BrowserWindow,
  nativeImage
};
