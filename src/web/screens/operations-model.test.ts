import { describe, it, expect } from "vitest";
import {
  isValidDateFormat,
  isValidTimeFormat,
  validateAppSettings,
  buildCompleteSettingsInput,
  validateHolidayItem,
  sortHolidays,
  validateRateMatrix,
  matrixToRateItems,
  validateOperationUser,
  validateSiteNameOption,
  validateLayoutOutputFilename,
  layoutKeyToString,
  stringToLayoutKey
} from "./operations-model";
import { allowanceRateDefaultMatrix } from "../../shared/domain/allowance-rate-matrix";
import type { AppSettingsSnapshot } from "../../shared/bridge/contracts";

describe("operations-model", () => {
  describe("날짜 및 시간 유효성 검사", () => {
    it("올바른 YYYY-MM-DD 형식을 인식한다", () => {
      expect(isValidDateFormat("2026-10-27")).toBe(true);
      expect(isValidDateFormat("2024-02-29")).toBe(true); // 윤년
      expect(isValidDateFormat("2023-02-29")).toBe(false); // 평년 2월 29일 불가
      expect(isValidDateFormat("2026-13-01")).toBe(false);
      expect(isValidDateFormat("2026-04-31")).toBe(false); // 4월 31일 불가
      expect(isValidDateFormat("not-a-date")).toBe(false);
    });

    it("올바른 HH:mm 시각 형식을 인식한다", () => {
      expect(isValidTimeFormat("00:00")).toBe(true);
      expect(isValidTimeFormat("23:59")).toBe(true);
      expect(isValidTimeFormat("12:30")).toBe(true);
      expect(isValidTimeFormat("24:00")).toBe(false);
      expect(isValidTimeFormat("12:60")).toBe(false);
      expect(isValidTimeFormat("9:30")).toBe(false);
    });
  });

  describe("설정 검증 (R03, N03)", () => {
    it("필수 폴더 경로가 누락되면 실패한다", () => {
      const res = validateAppSettings({
        pendingDir: "",
        approvedDir: "  "
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.pendingDir).toBeDefined();
      expect(res.errors.approvedDir).toBeDefined();
    });

    it("잘못된 백업 시각 및 음수 규칙값을 거절한다 (N03)", () => {
      const res = validateAppSettings({
        pendingDir: "C:/pending",
        approvedDir: "C:/approved",
        scheduleExportDir: "C:/export",
        allowanceProposalExportDir: "C:/prop",
        allowanceAttachment1ExportDir: "C:/att1",
        allowanceAttachment2ExportDir: "C:/att2",
        databaseBackupDir: "C:/backup",
        databaseBackupTime: "99:99",
        scheduleConsecutiveNightLimit: -1,
        scheduleMinimumRestMinutes: -60,
        scheduleWeeklyMaxMinutes: -100
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.databaseBackupTime).toBeDefined();
      expect(res.errors.scheduleConsecutiveNightLimit).toBeDefined();
      expect(res.errors.scheduleMinimumRestMinutes).toBeDefined();
      expect(res.errors.scheduleWeeklyMaxMinutes).toBeDefined();
    });

    it("유효한 설정값은 성공한다", () => {
      const res = validateAppSettings({
        pendingDir: "C:/pending",
        approvedDir: "C:/approved",
        scheduleExportDir: "C:/export",
        allowanceProposalExportDir: "C:/prop",
        allowanceAttachment1ExportDir: "C:/att1",
        allowanceAttachment2ExportDir: "C:/att2",
        databaseBackupDir: "C:/backup",
        databaseBackupTime: "02:00",
        scheduleConsecutiveNightLimit: 3,
        scheduleMinimumRestMinutes: 660,
        scheduleWeeklyMaxMinutes: 3120,
        substituteAllowancePolicyEffectiveFrom: "2026-01-01",
        changedSlotPriorityEffectiveFrom: ""
      });
      expect(res.isValid).toBe(true);
      expect(Object.keys(res.errors).length).toBe(0);
    });

    it("buildCompleteSettingsInput은 기존 필드를 빠뜨리지 않고 보존한다 (R03)", () => {
      const current: AppSettingsSnapshot = {
        appName: "교대근무관리",
        holidayApiBaseUrl: "https://api.example.com",
        dataDir: "C:/data",
        databasePath: "C:/data/db.sqlite",
        pendingDir: "C:/pending",
        approvedDir: "C:/approved",
        scheduleExportDir: "C:/schedule",
        allowanceProposalExportDir: "C:/prop",
        allowanceAttachment1ExportDir: "C:/att1",
        allowanceAttachment2ExportDir: "C:/att2",
        databaseBackupDir: "C:/backup",
        databaseBackupSchedule: "daily",
        databaseBackupTime: "03:00",
        migrationFilePath: "C:/mig.json",
        scheduleConsecutiveNightLimit: 3,
        scheduleMinimumRestMinutes: 660,
        scheduleRequireWeeklyHoliday: true,
        scheduleWeeklyMaxMinutes: 3120,
        substituteAllowancePolicyEffectiveFrom: "2026-01-01",
        changedSlotPriorityEffectiveFrom: "2026-06-01"
      };

      const updated = buildCompleteSettingsInput(current, {
        databaseBackupTime: "04:30"
      });

      expect(updated.databaseBackupTime).toBe("04:30");
      expect(updated.pendingDir).toBe(current.pendingDir);
      expect(updated.scheduleConsecutiveNightLimit).toBe(3);
      expect(updated.substituteAllowancePolicyEffectiveFrom).toBe("2026-01-01");
      expect(updated.migrationFilePath).toBe("C:/mig.json");
    });
  });

  describe("공휴일 모델 검증 (R05, N03)", () => {
    const existing = [
      { id: "h1", holidayDate: "2026-01-01", name: "신정" },
      { id: "h2", holidayDate: "2026-03-01", name: "삼일절" }
    ];

    it("선택 연도와 불일치하거나 잘못된 날짜 형식을 거절한다 (N03)", () => {
      const resYear = validateHolidayItem("2025-12-25", "크리스마스", 2026, existing);
      expect(resYear.isValid).toBe(false);
      expect(resYear.error).toContain("선택한 연도(2026년)와 일치하지 않습니다.");

      const resFormat = validateHolidayItem("invalid", "휴일", 2026, existing);
      expect(resFormat.isValid).toBe(false);
    });

    it("중복된 공휴일 날짜를 거절한다 (N03)", () => {
      const resDup = validateHolidayItem("2026-01-01", "새해 첫날", 2026, existing);
      expect(resDup.isValid).toBe(false);
      expect(resDup.error).toContain("이미 등록된 공휴일 날짜입니다");
    });

    it("기존 항목 수정 시 자기 자신의 날짜는 중복으로 처리하지 않는다", () => {
      const resSelf = validateHolidayItem("2026-01-01", "신정(새해)", 2026, existing, "h1");
      expect(resSelf.isValid).toBe(true);
    });

    it("공휴일 목록을 날짜순으로 올바르게 정렬한다", () => {
      const list = [
        { id: "h2", holidayDate: "2026-05-05", name: "어린이날" },
        { id: "h1", holidayDate: "2026-01-01", name: "신정" },
        { id: "h3", holidayDate: "2026-03-01", name: "삼일절" }
      ];
      const sorted = sortHolidays(list);
      expect(sorted.map((h) => h.holidayDate)).toEqual([
        "2026-01-01",
        "2026-03-01",
        "2026-05-05"
      ]);
    });
  });

  describe("요율 5x3 매트릭스 모델 검증 (R06, N04)", () => {
    it("기본 매트릭스는 모든 15셀이 유효하다", () => {
      const res = validateRateMatrix(allowanceRateDefaultMatrix);
      expect(res.isValid).toBe(true);
      expect(Object.keys(res.errors).length).toBe(0);
      // 0 배율 경고 확인
      expect(Object.keys(res.warnings).length).toBeGreaterThan(0);
      expect(res.warnings["weekday-overtime:base"]).toBeDefined();
    });

    it("음수 배율이 있으면 실패한다 (N04)", () => {
      const customMatrix = JSON.parse(JSON.stringify(allowanceRateDefaultMatrix));
      customMatrix["legal-holiday"].base = -1.5;
      const res = validateRateMatrix(customMatrix);
      expect(res.isValid).toBe(false);
      expect(res.errors["legal-holiday:base"]).toBeDefined();
    });

    it("matrixToRateItems는 15개 전체 항목을 누락 없이 변환한다", () => {
      const items = matrixToRateItems(allowanceRateDefaultMatrix);
      expect(items.length).toBe(15);
      const codes = new Set(items.map((it) => it.allowanceCode));
      expect(codes.size).toBe(15);
      expect(codes.has("legal-holiday:base")).toBe(true);
      expect(codes.has("holiday-overtime:night")).toBe(true);
    });
  });

  describe("사용자 검증 (R07, N06)", () => {
    it.each(["active", "inactive", "pending"])("서버에서 사용하는 %s 상태를 허용한다", status => {
      expect(validateOperationUser({ loginId: "operator1", displayName: "운영자", role: "operator", status, isNew: false }).isValid).toBe(true);
    });

    it.each(["suspended", "retired", ""])("서버에서 사용할 수 없는 %s 상태를 거절한다", status => {
      expect(validateOperationUser({ loginId: "operator1", displayName: "운영자", role: "operator", status, isNew: false }).errors.status).toBeDefined();
    });

    it("신규 사용자 등록 시 비밀번호가 8자 미만이면 거절한다 (N06)", () => {
      const res = validateOperationUser({
        loginId: "operator1",
        displayName: "운영자1",
        role: "operator",
        status: "active",
        password: "short",
        isNew: true
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.password).toBeDefined();
    });

    it("기존 사용자 수정 시 비밀번호를 입력하지 않아도 유효하다", () => {
      const res = validateOperationUser({
        loginId: "operator1",
        displayName: "운영자1(수정)",
        role: "operator",
        status: "active",
        password: "",
        isNew: false
      });
      expect(res.isValid).toBe(true);
    });

    it("유효하지 않은 계정 ID 형식을 거절한다", () => {
      const res = validateOperationUser({
        loginId: "ab", // 너무 짧음
        displayName: "운영자",
        role: "operator",
        status: "active",
        isNew: false
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.loginId).toBeDefined();
    });
  });

  describe("근무지 이름 검증 (R08)", () => {
    const existing = [
      { id: "s1", name: "본사", usageCount: 1, createdAt: "", createdBy: "" },
      { id: "s2", name: "판교지점", usageCount: 0, createdAt: "", createdBy: "" }
    ];

    it("빈 이름을 거절한다", () => {
      expect(validateSiteNameOption("", existing).isValid).toBe(false);
      expect(validateSiteNameOption("   ", existing).isValid).toBe(false);
    });

    it("중복된 근무지 이름을 거절한다", () => {
      const res = validateSiteNameOption("본사", existing);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("이미 존재하는 근무지 이름입니다");
    });

    it("수정 시 자기 자신은 중복으로 처리하지 않는다", () => {
      const res = validateSiteNameOption("본사", existing, "s1");
      expect(res.isValid).toBe(true);
    });
  });

  describe("레이아웃 파일명 토큰 및 키 헬퍼 (R10, R13, N07)", () => {
    it("허용된 토큰과 올바른 확장자를 승인한다", () => {
      const res1 = validateLayoutOutputFilename(
        "{year}년_{month2}월_근무표_{siteName}.xlsx",
        "schedule-xlsx"
      );
      expect(res1.isValid).toBe(true);

      const res2 = validateLayoutOutputFilename(
        "{year}년_{month2}월_품의서.pdf",
        "proposal-pdf"
      );
      expect(res2.isValid).toBe(true);
    });

    it("허용되지 않은 토큰이 포함되면 거절한다 (N07)", () => {
      const res = validateLayoutOutputFilename(
        "{year}_{unknownToken}_근무표.xlsx",
        "schedule-xlsx"
      );
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("허용되지 않은 토큰");
    });

    it("역슬래시, 절대경로, 상위폴더(..)를 차단한다 (N07)", () => {
      expect(
        validateLayoutOutputFilename("sub\\name.xlsx", "schedule-xlsx").isValid
      ).toBe(false);
      expect(
        validateLayoutOutputFilename("/root/name.xlsx", "schedule-xlsx").isValid
      ).toBe(false);
      expect(
        validateLayoutOutputFilename("../parent/name.xlsx", "schedule-xlsx").isValid
      ).toBe(false);
    });

    it("잘못된 확장자를 거절한다", () => {
      expect(
        validateLayoutOutputFilename("schedule.pdf", "schedule-xlsx").isValid
      ).toBe(false);
      expect(
        validateLayoutOutputFilename("proposal.xlsx", "proposal-pdf").isValid
      ).toBe(false);
    });

    it("layoutKeyToString과 stringToLayoutKey가 올바르게 양방향 변환된다", () => {
      const k1 = { documentKind: "schedule-xlsx" as const, variant: "template1" as const };
      const s1 = layoutKeyToString(k1);
      expect(s1).toBe("schedule-xlsx/template1");
      expect(stringToLayoutKey(s1)).toEqual(k1);

      const k2 = { documentKind: "proposal-pdf" as const };
      const s2 = layoutKeyToString(k2);
      expect(s2).toBe("proposal-pdf");
      expect(stringToLayoutKey(s2)).toEqual(k2);
    });
  });
});
