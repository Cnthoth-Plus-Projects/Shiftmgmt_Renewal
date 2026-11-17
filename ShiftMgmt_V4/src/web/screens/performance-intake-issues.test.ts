import { describe, it, expect } from "vitest";
import { summarizeIntakeIssues } from "./performance-intake-issues";
const missing = (label: string) => `승인완료본의 원본 파일을 찾을 수 없습니다: ${label}. 해당 실적의 원본 엑셀을 다시 넣어 주세요.`;
describe("intake notice summary", () => {
  it("retains every source label and separates unexpected issues", () => {
    const messages = Array.from({ length: 120 }, (_, i) => missing(`센터${i} 2026-01`));
    const result = summarizeIntakeIssues([...messages, messages[0], "폴더에 접근할 수 없습니다.", ""]);
    expect(result.missing).toHaveLength(120);
    expect(result.missing[119]).toEqual({ label: "센터119 2026-01", message: messages[119] });
    expect(result.other).toEqual(["폴더에 접근할 수 없습니다."]);
  });
  it("keeps special characters as data and does not classify unrelated failures", () => {
    expect(summarizeIntakeIssues([missing('<img src=x>'), "원본을 확인해 주세요."]).missing[0].label).toBe('<img src=x>');
    expect(summarizeIntakeIssues(["원본을 확인해 주세요."]).other).toEqual(["원본을 확인해 주세요."]);
    expect(summarizeIntakeIssues([])).toEqual({ missing: [], other: [] });
  });
});
