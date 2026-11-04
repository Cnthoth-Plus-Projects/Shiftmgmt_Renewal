import { describe, expect, it } from "vitest";
import {
  calculateEffectiveWageRates,
  calculatePendingPerformanceImpact,
  canDeleteEmployee,
  formatCurrency,
  getSeoulMaxHireDateString,
  getSeoulTodayDateString,
  isBulkPreviewStale,
  isValidDateString,
  validateEmployeeFormInput,
  validateHireDate,
  validateWageRateFormInput,
  filterEmployees,
  sortEmployeesByWorksite,
  paginateEmployeesForHeight,
  arePendingFileSetsEqual,
  escapeHtmlAttribute
  ,employeeStatusLabel
} from "./workforce-model";
import type { EmployeeRecord, WageRateRecord } from "../../shared/domain/model";
import type { PerformanceEntryRecord } from "../../shared/domain/performance-file";

it("W10 a cancelled booking before a future retirement stays discoverable in today's active filter",()=>{
  const employee={id:"future-retirement",employeeCode:"FUTURE",name:"복귀 예약 취소",status:"retired",employmentPhase:"employed",employmentPeriods:[{id:"old",startDate:"2024-01-01",endDate:"2026-11-05"}],hireDate:"2024-01-01",retireDate:"2026-11-05"} as EmployeeRecord;
  expect(filterEmployees([employee],{status:"active"})).toEqual([employee]);expect(filterEmployees([employee],{status:"retired"})).toEqual([]);expect(employeeStatusLabel(employee)).toBe("재직");
});

describe("W-04: changed hire dates on existing employee forms", () => {
  const base = { employeeCode: "W04-TEST", name: "입사일 정정", employmentType: "정규", rank: "사원", status: "active" as const };
  it.each(["", "1989-12-31", "2026-02-30", "2027-11-01"])("rejects invalid changed hire date %s", hireDate => {
    expect(validateEmployeeFormInput({ ...base, hireDate }, "2026-10-31", true).errors.hireDate).toBeTruthy();
  });
  it("allows omitted legacy date and accepts a valid changed date", () => {
    expect(validateEmployeeFormInput(base, "2026-10-31", true).valid).toBe(true);
    expect(validateEmployeeFormInput({ ...base, hireDate: "2020-01-01" }, "2026-10-31", true).valid).toBe(true);
  });
  it("rejects a changed hire date after retirement", () => {
    expect(validateEmployeeFormInput({ ...base, status: "retired", hireDate: "2026-04-01", retireDate: "2026-03-31" }, "2026-10-31", true).errors.hireDate).toBeTruthy();
  });
});

describe("사용자 요청 필터와 건수 조회의 불완전 자료", () => {
  it("고용형태를 정규화하고 조 조건을 함께 적용한다", () => {
    const employees = [
      { id: "a", name: "가", employeeCode: "A", employmentType: "정규직", currentShiftGroup: "A조", status: "active" },
      { id: "b", name: "나", employeeCode: "B", employmentType: "계약", currentShiftGroup: "A조", status: "active" },
      { id: "c", name: "다", employeeCode: "C", employmentType: "정규", currentShiftGroup: "B조", status: "active" }
    ] as EmployeeRecord[];
    expect(filterEmployees(employees, { employmentType: "정규", shiftGroup: "A조" }).map(e => e.id)).toEqual(["a"]);
  });
  it("빈 목록 뒤 파일 추가와 중복 파일 식별값을 같은 자료로 취급하지 않는다", () => {
    expect(arePendingFileSetsEqual([], ["new"])).toBe(false);
    expect(arePendingFileSetsEqual(["a", "b"], ["a", "a"])).toBe(false);
  });
  it("같은 실적 식별값에 다른 사번이나 금액이 있으면 부분 건수를 반환하지 않는다", () => {
    const entry = { logicalKey: "same", employeeCode: "A", employeeName: "가", workDate: "2026-10-27", status: "pending", section: "overtime", hourlyRate: 10000 } as PerformanceEntryRecord;
    expect(calculatePendingPerformanceImpact([entry, { ...entry, employeeCode: "B" }], "A", "2026-10-27").ok).toBe(false);
    expect(calculatePendingPerformanceImpact([entry, { ...entry, hourlyRate: 12000 }], "A", "2026-10-27").ok).toBe(false);
  });
});

describe("workforce-model", () => {
  describe("날짜 유효성 및 상·하한 (R04, N01)", () => {
    it("서울 기준 오늘 날짜 문자열(YYYY-MM-DD)을 정확히 반환한다", () => {
      const fixedDate = new Date("2026-10-27T01:00:00Z"); // UTC 01:00 -> KST 10:00
      expect(getSeoulTodayDateString(fixedDate)).toBe("2026-10-27");
    });

    it("오늘+1년 날짜를 올바르게 계산하며 윤년 2월 29일을 처리한다", () => {
      expect(getSeoulMaxHireDateString("2024-02-29")).toBe("2025-02-28");
      expect(getSeoulMaxHireDateString("2026-10-27")).toBe("2027-10-27");
    });

    it("유효한 달력 날짜만 통과시키고 가짜 날짜를 거절한다", () => {
      expect(isValidDateString("2024-02-29")).toBe(true);
      expect(isValidDateString("2023-02-29")).toBe(false); // 평년 2월 29일 없음
      expect(isValidDateString("2026-13-01")).toBe(false); // 13월 없음
      expect(isValidDateString("2026-04-31")).toBe(false); // 4월 31일 없음
      expect(isValidDateString("invalid")).toBe(false);
      expect(isValidDateString(null)).toBe(false);
    });

    it("입사일 상·하한(1990-01-01 ~ 오늘+1년)을 엄격히 검증한다 (W15a)", () => {
      const today = "2026-10-27";
      expect(validateHireDate("1989-12-31", today).valid).toBe(false); // 하한 미달
      expect(validateHireDate("1990-01-01", today).valid).toBe(true);
      expect(validateHireDate("2027-10-27", today).valid).toBe(true);
      expect(validateHireDate("2027-10-28", today).valid).toBe(false); // 상한 초과
    });
  });

  describe("시급 이력 계산 (R06, S06)", () => {
    const mockRates: WageRateRecord[] = [
      {
        id: "w-old",
        employeeId: "emp-1",
        hourlyRate: 10000,
        effectiveFrom: "2024-01-01",
        effectiveTo: "2024-12-31",
        createdAt: "2024-01-01"
      },
      {
        id: "w-current",
        employeeId: "emp-1",
        hourlyRate: 11000,
        effectiveFrom: "2025-01-01",
        effectiveTo: "2026-12-31",
        createdAt: "2025-01-01"
      },
      {
        id: "w-scheduled",
        employeeId: "emp-1",
        hourlyRate: 12000,
        effectiveFrom: "2027-01-01",
        createdAt: "2026-10-01"
      }
    ];

    it("오늘 기준 유효한 시급과 적용 예정 시급을 올바르게 분리한다", () => {
      const summary = calculateEffectiveWageRates(mockRates, "2026-10-27");
      expect(summary.currentRate?.hourlyRate).toBe(11000);
      expect(summary.currentRate?.id).toBe("w-current");
      expect(summary.scheduledRate?.hourlyRate).toBe(12000);
      expect(summary.scheduledRate?.id).toBe("w-scheduled");
    });

    it("과거 이력만 있는 경우 적용 예정은 null이고 오늘 유효도 null이다", () => {
      const pastOnly = [mockRates[0]];
      const summary = calculateEffectiveWageRates(pastOnly, "2026-10-27");
      expect(summary.currentRate).toBeNull();
      expect(summary.scheduledRate).toBeNull();
    });

    it.each(["2025-01-01", "2026-12-31", "2027-01-01"])("W-03: 시작일과 종료일을 포함해 현재 시급을 고른다 (%s)", today => {
      const result = calculateEffectiveWageRates(mockRates, today);
      expect(result.currentRate?.hourlyRate).toBe(today === "2027-01-01" ? 12000 : 11000);
    });

    it.each([
      ["2026-10-31T14:59:59.999Z", "2026-10-31"],
      ["2026-10-31T15:00:00.000Z", "2026-11-01"]
    ])("W-03: 서울 날짜 경계를 공유한다 (%s)", (instant, expected) => {
      expect(getSeoulTodayDateString(new Date(instant))).toBe(expected);
    });

    it("금액 포맷팅이 정확하다", () => {
      expect(formatCurrency(12000)).toBe("12,000원");
      expect(formatCurrency(0)).toBe("0원");
      expect(formatCurrency(null)).toBe("-");
    });
  });

  describe("인력 목록 필터링 및 검색 (R02, S02)", () => {
    const employees: EmployeeRecord[] = [
      {
        id: "emp-1",
        employeeCode: "50001",
        name: "홍길동",
        employmentType: "정규",
        status: "active",
        currentSiteId: "site-1",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      },
      {
        id: "emp-2",
        employeeCode: "50002",
        name: "김철수",
        employmentType: "계약",
        status: "leave",
        currentSiteId: "site-2",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      },
      {
        id: "emp-orphan",
        employeeCode: "50003",
        name: "이영희",
        employmentType: "정규",
        status: "active",
        currentSiteId: "site-deleted",
        currentSiteDeletedAt: "2026-01-01",
        createdAt: "2024-01-01",
        updatedAt: "2024-01-01"
      }
    ];

    it("근무지, 상태, 검색어(사번/이름) 필터가 정확히 동작한다", () => {
      expect(filterEmployees(employees, { siteId: "site-1" })).toHaveLength(1);
      expect(filterEmployees(employees, { status: "leave" })).toHaveLength(1);
      expect(filterEmployees(employees, { keyword: "철수" })).toHaveLength(1);
      expect(filterEmployees(employees, { keyword: "50001" })).toHaveLength(1);
      expect(filterEmployees(employees, { keyword: "없는사람" })).toHaveLength(0);
    });

    it("고아 배정 인력(currentSiteDeletedAt 존재)을 정확히 분리한다", () => {
      const orphans = filterEmployees(employees, { orphanOnly: true });
      expect(orphans).toHaveLength(1);
      expect(orphans[0].id).toBe("emp-orphan");
    });
  });

  describe("R08: 시급 변경에 따른 대기 실적 영향 건수 계산", () => {
    const entries: PerformanceEntryRecord[] = [
      // 1. 유효: pending, payable, 동일사번, 구간 내
      {
        id: "e-1",
        rowId: "r-1",
        fileId: "f-1",
        logicalKey: "key-1",
        employeeCode: "50001",
        employeeName: "홍길동",
        workDate: "2026-10-01",
        status: "pending",
        isPoolWorker: false,
        section: "overtime",
        siteName: "보라매"
      } as PerformanceEntryRecord,
      // 2. 유효 (같은 날짜 다른 logicalKey)
      {
        id: "e-2",
        rowId: "r-2",
        fileId: "f-1",
        logicalKey: "key-2",
        employeeCode: "50001",
        employeeName: "홍길동",
        workDate: "2026-10-02",
        status: "pending",
        isPoolWorker: false,
        section: "overtime",
        siteName: "보라매"
      } as PerformanceEntryRecord,
      // 3. 중복 logicalKey (key-1) -> 중복 제거되어야 함
      {
        id: "e-3",
        rowId: "r-3",
        fileId: "f-2",
        logicalKey: "key-1",
        employeeCode: "50001",
        employeeName: "홍길동",
        workDate: "2026-10-01",
        status: "pending",
        isPoolWorker: false,
        section: "overtime",
        siteName: "보라매"
      } as PerformanceEntryRecord,
      // 4. 제외 대상: status가 approved임
      {
        id: "e-4",
        rowId: "r-4",
        fileId: "f-1",
        logicalKey: "key-4",
        employeeCode: "50001",
        employeeName: "홍길동",
        workDate: "2026-10-03",
        status: "approved",
        isPoolWorker: false,
        section: "overtime",
        siteName: "보라매"
      } as PerformanceEntryRecord,
      // 5. 제외 대상: 사번 다름
      {
        id: "e-5",
        rowId: "r-5",
        fileId: "f-1",
        logicalKey: "key-5",
        employeeCode: "50002",
        employeeName: "김철수",
        workDate: "2026-10-01",
        status: "pending",
        isPoolWorker: false,
        section: "overtime",
        siteName: "보라매"
      } as PerformanceEntryRecord,
      // 6. 제외 대상: 구간 이전 날짜
      {
        id: "e-6",
        rowId: "r-6",
        fileId: "f-1",
        logicalKey: "key-6",
        employeeCode: "50001",
        employeeName: "홍길동",
        workDate: "2026-09-30",
        status: "pending",
        isPoolWorker: false,
        section: "overtime",
        siteName: "보라매"
      } as PerformanceEntryRecord,
      // 7. 제외 대상: substituteAllowanceEligible: false (non-payable)
      {
        id: "e-7",
        rowId: "r-7",
        fileId: "f-1",
        logicalKey: "key-7",
        employeeCode: "50001",
        employeeName: "홍길동",
        workDate: "2026-10-05",
        status: "pending",
        isPoolWorker: false,
        section: "substitute",
        substituteAllowanceEligible: false,
        substituteAllowanceReasonCode: "SCHEDULE_ABSENT",
        siteName: "보라매"
      } as PerformanceEntryRecord
    ];

    it("조건을 만족하는 대기 실적을 logicalKey로 중복 제거하여 정확히 계산한다", () => {
      const res = calculatePendingPerformanceImpact(entries, "50001", "2026-10-01", "2026-10-31");
      // e-1, e-2만 유효 (e-3은 key-1 중복) -> 총 2건
      expect(res.ok).toBe(true);
      expect(res.count).toBe(2);
    });

    it("logicalKey 누락이나 잘못된 날짜, 모순된 데이터는 실패(불완전)로 판정한다 (UI01-D04)", () => {
      // 1. logicalKey 누락
      const missingKey = [
        {
          id: "e-bad",
          rowId: "r-bad",
          fileId: "f-1",
          employeeCode: "50001",
          workDate: "2026-10-01",
          status: "pending",
          isPoolWorker: false,
          section: "overtime"
        } as PerformanceEntryRecord
      ];
      expect(calculatePendingPerformanceImpact(missingKey, "50001", "2026-10-01").ok).toBe(false);

      // 2. 잘못된 날짜
      const badDate = [
        {
          id: "e-bad",
          rowId: "r-bad",
          fileId: "f-1",
          logicalKey: "k-1",
          employeeCode: "50001",
          workDate: "invalid-date",
          status: "pending",
          isPoolWorker: false,
          section: "overtime"
        } as PerformanceEntryRecord
      ];
      expect(calculatePendingPerformanceImpact(badDate, "50001", "2026-10-01").ok).toBe(false);

      // 3. 동일 logicalKey 모순 데이터 (사번이나 날짜 불일치)
      const conflict = [
        {
          id: "e-1",
          rowId: "r-1",
          fileId: "f-1",
          logicalKey: "k-same",
          employeeCode: "50001",
          workDate: "2026-10-01",
          status: "pending",
          isPoolWorker: false,
          section: "overtime"
        } as PerformanceEntryRecord,
        {
          id: "e-2",
          rowId: "r-2",
          fileId: "f-2",
          logicalKey: "k-same",
          employeeCode: "50001",
          workDate: "2026-10-02", // 같은 key인데 날짜 다름 -> 모순!
          status: "pending",
          isPoolWorker: false,
          section: "overtime"
        } as PerformanceEntryRecord
      ];
      expect(calculatePendingPerformanceImpact(conflict, "50001", "2026-10-01").ok).toBe(false);
    });

    it("파일 목록 집합 비교는 순서에 무관하게 동일 여부를 판정한다 (UI01-D04)", () => {
      expect(arePendingFileSetsEqual(["f-1", "f-2"], ["f-2", "f-1"])).toBe(true);
      expect(arePendingFileSetsEqual(["f-1"], ["f-1", "f-2"])).toBe(false);
      expect(arePendingFileSetsEqual([], [])).toBe(true);
    });

    it("HTML 속성 이스케이프는 따옴표와 꺾쇠를 안전하게 변환한다 (UI01-D02)", () => {
      expect(escapeHtmlAttribute('"><script>alert(1)</script>')).toBe('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(escapeHtmlAttribute("홍길동")).toBe("홍길동");
    });
  });

  describe("R10: 시급 일괄 미리보기 stale 판정", () => {
    const baseInput = {
      filePath: "C:/test.xlsx",
      effectiveFrom: "2026-10-01",
      mapping: {
        siteNameColumn: "A",
        employeeNameColumn: "B",
        hourlyRateColumn: "C"
      }
    };

    it("미리보기 실행 전이면 항상 stale이다", () => {
      expect(isBulkPreviewStale(baseInput, null)).toBe(true);
    });

    it("동일 조건이면 stale이 아니다", () => {
      expect(isBulkPreviewStale(baseInput, { ...baseInput })).toBe(false);
    });

    it("사번 열 추가·변경·해제는 이전 미리보기를 무효화한다", () => {
      const withCode = { ...baseInput, mapping: { ...baseInput.mapping, employeeCodeColumn: "D" } };
      expect(isBulkPreviewStale(withCode, baseInput)).toBe(true);
      expect(isBulkPreviewStale(baseInput, withCode)).toBe(true);
      expect(isBulkPreviewStale({ ...withCode, mapping: { ...withCode.mapping, employeeCodeColumn: "E" } }, withCode)).toBe(true);
      expect(isBulkPreviewStale(withCode, structuredClone(withCode))).toBe(false);
    });

    it("경로, 날짜, 열 매핑 중 하나라도 바뀌면 stale로 판정한다 (N07)", () => {
      expect(isBulkPreviewStale({ ...baseInput, filePath: "C:/other.xlsx" }, baseInput)).toBe(true);
      expect(isBulkPreviewStale({ ...baseInput, effectiveFrom: "2026-11-01" }, baseInput)).toBe(true);
      expect(
        isBulkPreviewStale(
          { ...baseInput, mapping: { ...baseInput.mapping, hourlyRateColumn: "D" } },
          baseInput
        )
      ).toBe(true);
    });
  });

  describe("R11: 인력 삭제 가능 여부 (퇴사 + 과거 퇴사일만 가능, N09)", () => {
    const today = "2026-10-27";

    it("재직 또는 휴직 인력은 삭제할 수 없다", () => {
      const activeEmp = { id: "1", status: "active" } as EmployeeRecord;
      expect(canDeleteEmployee(activeEmp, today).canDelete).toBe(false);
      const leaveEmp = { id: "2", status: "leave" } as EmployeeRecord;
      expect(canDeleteEmployee(leaveEmp, today).canDelete).toBe(false);
    });

    it("퇴사일이 없거나 오늘/미래인 퇴사자는 삭제할 수 없다", () => {
      const noDate = { id: "3", status: "retired" } as EmployeeRecord;
      expect(canDeleteEmployee(noDate, today).canDelete).toBe(false);

      const todayRetire = { id: "4", status: "retired", retireDate: "2026-10-27" } as EmployeeRecord;
      expect(canDeleteEmployee(todayRetire, today).canDelete).toBe(false);

      const futureRetire = { id: "5", status: "retired", retireDate: "2026-10-28" } as EmployeeRecord;
      expect(canDeleteEmployee(futureRetire, today).canDelete).toBe(false);
    });

    it("과거에 퇴사한 인력은 삭제 가능하다", () => {
      const pastRetire = { id: "6", status: "retired", retireDate: "2026-10-26" } as EmployeeRecord;
      expect(canDeleteEmployee(pastRetire, today).canDelete).toBe(true);
    });
  });

  describe("입력 유효성 검증 (N01, N02, N03)", () => {
    const today = "2026-10-27";

    it("BP 인력은 사번 생략이 가능하지만 시급을 등록할 수 없다 (N02)", () => {
      const resWithoutCode = validateEmployeeFormInput(
        {
          employeeCode: "",
          name: "김외부",
          employmentType: "BP",
          status: "active",
          hireDate: "2026-10-27"
        },
        today
      );
      expect(resWithoutCode.valid).toBe(true);

      const resWithWage = validateEmployeeFormInput(
        {
          employeeCode: "",
          name: "김외부",
          employmentType: "BP",
          status: "active",
          hireDate: "2026-10-27",
          hourlyRate: 15000
        },
        today
      );
      expect(resWithWage.valid).toBe(false);
      expect(resWithWage.errors.hourlyRate).toBeDefined();
    });

    it("정규직 인력은 사번이 필수이고 잘못된 직급을 거절한다 (N01)", () => {
      const resNoCode = validateEmployeeFormInput(
        {
          employeeCode: "",
          name: "홍길동",
          employmentType: "정규",
          status: "active",
          hireDate: "2026-10-27"
        },
        today
      );
      expect(resNoCode.valid).toBe(false);
      expect(resNoCode.errors.employeeCode).toBeDefined();

      const resBadRank = validateEmployeeFormInput(
        {
          employeeCode: "50001",
          name: "홍길동",
          rank: "임원", // 5개 직급 외
          employmentType: "정규",
          status: "active",
          hireDate: "2026-10-27"
        },
        today
      );
      expect(resBadRank.valid).toBe(false);
      expect(resBadRank.errors.rank).toBeDefined();
    });

    it("시급 등록 폼 유효성 및 소급/동일일 경고 플래그 (R07, N04)", () => {
      const todayStr = "2026-10-27";
      const existing: WageRateRecord[] = [
        {
          id: "w1",
          employeeId: "emp1",
          hourlyRate: 10000,
          effectiveFrom: "2026-10-27",
          createdAt: "2026-10-27"
        }
      ];

      // 0원 이하 시급 거절
      expect(validateWageRateFormInput({ hourlyRate: 0, effectiveFrom: "2026-10-28" }, todayStr).valid).toBe(false);

      // 소급 경고
      const retroRes = validateWageRateFormInput(
        { hourlyRate: 12000, effectiveFrom: "2026-10-20" },
        todayStr
      );
      expect(retroRes.valid).toBe(true);
      expect(retroRes.isRetroactive).toBe(true);
      expect(retroRes.isSameDayOverwrite).toBe(false);

      // 동일일 덮어쓰기 경고
      const overwriteRes = validateWageRateFormInput(
        { hourlyRate: 12000, effectiveFrom: "2026-10-27" },
        todayStr,
        existing
      );
      expect(overwriteRes.valid).toBe(true);
      expect(overwriteRes.isSameDayOverwrite).toBe(true);
    });
  });
});


describe("unassigned site filter", () => {
  it("includes no assignment and deleted sites, while keeping live sites separate", () => {
    const base: EmployeeRecord = { id: "base", employeeCode: "TEST-1", name: "시험", status: "active", employmentType: "정규", createdAt: "2026-01-01" };
    const employees = [{ ...base, id: "none" }, { ...base, id: "deleted", currentSiteId: "gone", currentSiteDeletedAt: "2026-01-01" }, { ...base, id: "live", currentSiteId: "live-site" }];
    expect(filterEmployees(employees, { siteId: "unassigned" }).map(e => e.id)).toEqual(["none", "deleted"]);
    expect(filterEmployees(employees, { siteId: "live-site" }).map(e => e.id)).toEqual(["live"]);
  });
});


describe("worksite order before pagination", () => {
  it("keeps entire worksites contiguous, team order and unassigned last without mutating input", () => {
    const base: EmployeeRecord = { id: "base", employeeCode: "EMP-1", name: "시험", status: "active", employmentType: "정규", createdAt: "2026-01-01" };
    const records = Array.from({ length: 55 }, (_, i) => ({ ...base, id: String(i), employeeCode: `EMP-${i}`, currentSiteId: i % 3 === 0 ? undefined : i % 3 === 1 ? "b" : "a", currentSiteName: i % 3 === 1 ? "보라매DC" : i % 3 === 2 ? "동탄센터" : undefined, currentShiftGroup: "A조", currentAssignmentOrder: 55-i }));
    const sorted = sortEmployeesByWorksite(records);
    expect(records.map(e => e.id)).toEqual(Array.from({ length: 55 }, (_, i) => String(i)));
    expect(sorted.map(e => e.currentSiteId)).toEqual([...Array(18).fill("a"), ...Array(18).fill("b"), ...Array(19).fill(undefined)]);
    expect(sorted.slice(0, 18).map(e => e.currentAssignmentOrder)).toEqual([...records.filter(e => e.currentSiteId === "a").map(e => e.currentAssignmentOrder)].sort((a,b) => a-b));
    expect(sorted.slice(0,10).every(e=>e.currentSiteId==="a")).toBe(true);
    expect(sorted.slice(10,18).every(e=>e.currentSiteId==="a")).toBe(true);
  });
});


describe("viewport-based workforce pages", () => {
  const records = Array.from({ length: 55 }, (_, i): EmployeeRecord => ({ id: String(i), employeeCode: `EMP-${i}`, name: "확인", status: "active", employmentType: "정규", createdAt: "2026-01-01", currentSiteId: i < 18 ? "a" : i < 36 ? "b" : undefined }));
  it("fits employee rows and repeated group headers before dividing the entire ordered collection", () => {
    const pages = paginateEmployeesForHeight(records, 490, 27, 28);
    expect(pages).toEqual([{ start: 0, end: 17 }, { start: 17, end: 33 }, { start: 33, end: 49 }, { start: 49, end: 55 }]);
    expect(pages.flatMap(p => records.slice(p.start, p.end).map(e => e.id))).toEqual(records.map(e=>e.id));
  });
  it("does not round fractional measured rows into overflow", () => {
    const pages = paginateEmployeesForHeight(records.slice(0, 18), 486.8, 27, 27.823);
    expect(pages[0]).toEqual({ start: 0, end: 16 });
    expect(paginateEmployeesForHeight(records.slice(0, 18), 486.824, 27, 27.823)[0]).toEqual({ start: 0, end: 17 });
  });
  it("keeps empty and extremely short screens finite without dropping employees", () => {
    expect(paginateEmployeesForHeight([], 0, 0, 0)).toEqual([{ start: 0, end: 0 }]);
    expect(paginateEmployeesForHeight(records, 5, 27, 28)).toHaveLength(55);
  });
});


it("W-08 current summary treats a later void as a gap and excludes voided future rates", () => {
  const base={id:"old",employeeId:"employee",hourlyRate:12000,effectiveFrom:"2026-01-01",createdAt:"2026-01-01"};
  const invalidation={id:"event",actionType:"invalidated",hourlyRate:14000,effectiveFrom:"2026-04-01",changeReason:"증빙 확인",actorDisplayName:"담당자",actorLoginId:"admin",actorRole:"admin",occurredAt:"2026-04-01"};
  const rates=[base,{...base,id:"void",hourlyRate:14000,effectiveFrom:"2026-04-01",effectiveTo:"2026-06-30",invalidation},{...base,id:"future-void",effectiveFrom:"2027-01-01",invalidation}];
  expect(calculateEffectiveWageRates(rates,"2026-04-01").currentRate).toBeNull();
  expect(calculateEffectiveWageRates(rates,"2026-04-01").scheduledRate).toBeNull();
  expect(calculateEffectiveWageRates(rates,"2026-03-31").currentRate?.id).toBe("old");
});


it("W-09 retirement date comparison uses retained hire metadata without revalidating an unchanged legacy hire date",()=>{
  const base={employeeCode:"W09",name:"퇴사검증",employmentType:"정규직",status:"retired" as const,retirementHireDate:"2026-03-01",retireDate:"2026-02-28"};
  expect(validateEmployeeFormInput(base,"2026-11-01",true).errors.retireDate).toContain("입사일");
  expect(validateEmployeeFormInput({...base,retirementHireDate:"1980-01-01",retireDate:"2026-03-01"},"2026-11-01",true).errors.hireDate).toBeUndefined();
});
