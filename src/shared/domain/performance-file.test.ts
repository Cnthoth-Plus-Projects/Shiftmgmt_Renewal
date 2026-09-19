import { describe, expect, it } from "vitest";

import {
  isNonPayablePerformanceEntry,
  isNonPayablePoolSubstitutePerformanceEntry,
  isPayablePerformanceEntry,
  isPoolWorkerDisplayName,
  getNonPayablePerformanceReasonText,
  parsePoolWorkerDisplayName
} from "./performance-file";

describe("performance-file pool worker helpers", () => {
  it("should normalize worker names with the Pool display suffix", () => {
    expect(parsePoolWorkerDisplayName("홍길동(P)")).toEqual({
      employeeName: "홍길동",
      isPoolDisplayName: true
    });
    expect(parsePoolWorkerDisplayName("홍길동 ( p )")).toEqual({
      employeeName: "홍길동",
      isPoolDisplayName: true
    });
    expect(isPoolWorkerDisplayName("홍길동")).toBe(false);
  });

  it("should mark only Pool substitute rows as non-payable", () => {
    expect(
      isNonPayablePoolSubstitutePerformanceEntry({
        section: "substitute",
        employeeName: "홍길동(P)"
      })
    ).toBe(true);
    expect(
      isNonPayablePoolSubstitutePerformanceEntry({
        section: "substitute",
        employeeName: "홍길동",
        isPoolWorker: true
      })
    ).toBe(true);
    expect(
      isNonPayablePoolSubstitutePerformanceEntry({
        section: "overtime",
        employeeName: "홍길동(P)"
      })
    ).toBe(false);
  });

  describe("isNonPayablePerformanceEntry & isPayablePerformanceEntry", () => {
    it("should mark Pool workers as non-payable regardless of work section", () => {
      // isPoolWorker 플래그
      expect(
        isNonPayablePerformanceEntry({
          employeeCode: "EMP001",
          employeeName: "홍길동",
          isPoolWorker: true,
          section: "legal-holiday"
        })
      ).toBe(true);
      expect(
        isPayablePerformanceEntry({
          employeeCode: "EMP001",
          employeeName: "홍길동",
          isPoolWorker: true,
          section: "overtime"
        })
      ).toBe(false);

      // (P) 표식
      expect(
        isNonPayablePerformanceEntry({
          employeeCode: "EMP001",
          employeeName: "홍길동(P)",
          section: "overtime"
        })
      ).toBe(true);
      expect(
        getNonPayablePerformanceReasonText({
          employeeCode: "EMP001",
          employeeName: "홍길동(P)"
        })
      ).toBe("Pool 인력은 승인 및 수당 처리 대상이 아닙니다.");
    });

    it("should mark BP workers as non-payable", () => {
      expect(
        isNonPayablePerformanceEntry({
          employeeCode: "BP001",
          employeeName: "BP(홍길동)",
          section: "legal-holiday"
        })
      ).toBe(true);
      expect(
        isPayablePerformanceEntry({
          employeeCode: "BP001",
          employeeName: "BP",
          section: "overtime"
        })
      ).toBe(false);
      expect(
        getNonPayablePerformanceReasonText({
          employeeCode: "BP001",
          employeeName: "BP(홍길동)"
        })
      ).toBe("BP 인력은 승인 및 수당 처리 대상이 아닙니다.");
    });

    it("should mark non-BP workers without employee code as non-payable", () => {
      expect(
        isNonPayablePerformanceEntry({
          employeeCode: "",
          employeeName: "홍길동",
          section: "legal-holiday"
        })
      ).toBe(true);
      expect(
        isNonPayablePerformanceEntry({
          employeeCode: "   ",
          employeeName: "홍길동",
          section: "overtime"
        })
      ).toBe(true);
      expect(
        isPayablePerformanceEntry({
          employeeCode: "",
          employeeName: "홍길동"
        })
      ).toBe(false);
      expect(
        getNonPayablePerformanceReasonText({
          employeeCode: "",
          employeeName: "홍길동"
        })
      ).toBe("사번이 없는 실적은 승인 및 수당 처리 대상이 아닙니다.");
    });

    it("should allow normal employee with valid code to be payable", () => {
      expect(
        isNonPayablePerformanceEntry({
          employeeCode: "EMP123",
          employeeName: "홍길동",
          section: "overtime"
        })
      ).toBe(false);
      expect(
        isPayablePerformanceEntry({
          employeeCode: "EMP123",
          employeeName: "홍길동",
          section: "overtime"
        })
      ).toBe(true);
      expect(
        getNonPayablePerformanceReasonText({
          employeeCode: "EMP123",
          employeeName: "홍길동"
        })
      ).toBeUndefined();
    });

    it("should mark substitute with substituteAllowanceEligible=false as non-payable", () => {
      expect(
        isNonPayablePerformanceEntry({
          employeeCode: "EMP123",
          employeeName: "홍길동",
          section: "substitute",
          substituteAllowanceEligible: false,
          substituteAllowanceReasonCode: "FIXED_DAY_SUBSTITUTE_EXCLUDED"
        })
      ).toBe(true);
      expect(
        getNonPayablePerformanceReasonText({
          employeeCode: "EMP123",
          employeeName: "홍길동",
          section: "substitute",
          substituteAllowanceEligible: false,
          substituteAllowanceReasonCode: "FIXED_DAY_SUBSTITUTE_EXCLUDED"
        })
      ).toContain("주간고정조는 교대조 대체근무수당 지급 대상이 아닙니다");
    });
  });
});
