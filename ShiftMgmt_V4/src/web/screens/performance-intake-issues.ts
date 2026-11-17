export interface IntakeIssuesSummary { missing: Array<{ label: string; message: string }>; other: string[] }

/** Group only the known notice and retain every distinct original issue. */
export function summarizeIntakeIssues(issues: readonly string[]): IntakeIssuesSummary {
  const missing: IntakeIssuesSummary["missing"] = [], other: string[] = [];
  for (const message of new Set(issues.filter(issue => typeof issue === "string" && issue.trim()))) {
    const matched = /^승인완료본의 원본 파일을 찾을 수 없습니다:\s*(.*?)\. 해당 실적의 원본 엑셀을 다시 넣어 주세요\.$/.exec(message);
    if (matched) missing.push({ label: matched[1] || "근무지·근무월 확인 필요", message });
    else other.push(message);
  }
  return { missing, other };
}
