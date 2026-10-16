import { afterEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";

import {
  addBrandLogoToWorksheetRange,
  applyWorkbookBrandLogo,
  resolveBrandLogoBuffer,
  resolveBrandLogoDataUrl,
  setBrandLogoResolverForTest
} from "./document-brand-logo-service";

describe("document-brand-logo-service", () => {
  afterEach(() => {
    setBrandLogoResolverForTest(null);
  });

  it("실제 환경 또는 정본 로고 에셋에서 Buffer와 Data URL을 정상 해석한다", () => {
    const buffer = resolveBrandLogoBuffer();
    const dataUrl = resolveBrandLogoDataUrl();

    if (buffer) {
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
      expect(dataUrl).toBe(`data:image/png;base64,${buffer.toString("base64")}`);
      expect(dataUrl?.startsWith("data:image/png;base64,")).toBe(true);
    } else {
      expect(dataUrl).toBeNull();
    }
  });

  it("테스트용 로고 resolver 주입 시 해당 Buffer와 Data URL이 반환된다", () => {
    const mockPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);
    setBrandLogoResolverForTest(() => mockPngBuffer);

    const buffer = resolveBrandLogoBuffer();
    expect(buffer).toBe(mockPngBuffer);

    const dataUrl = resolveBrandLogoDataUrl();
    expect(dataUrl).toBe(`data:image/png;base64,${mockPngBuffer.toString("base64")}`);
  });

  it("로고가 없을 때 Data URL은 null을 반환하고 addBrandLogoToWorksheetRange는 예외를 던진다", () => {
    setBrandLogoResolverForTest(() => null);

    expect(resolveBrandLogoBuffer()).toBeNull();
    expect(resolveBrandLogoDataUrl()).toBeNull();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Test");

    expect(() =>
      addBrandLogoToWorksheetRange(
        worksheet,
        { startColumn: 1, startRow: 1, endColumn: 3, endRow: 2 },
        "테스트 문서"
      )
    ).toThrow("[테스트 문서] 브랜드 로고 이미지를 찾을 수 없습니다.");

    expect(applyWorkbookBrandLogo(workbook)).toBe(false);
  });
});
