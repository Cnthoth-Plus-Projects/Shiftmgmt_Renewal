// operations-holidays-model 단위 테스트 (H02, H03, H05, H07)
import { describe, it, expect } from "vitest";
import type { HolidayCalendar, HolidayItem } from "../../shared/domain/model";
import {
  filterHolidayItems,
  buildHolidayComparison,
  buildHolidaySyncComparison,
  holidayCalendarFingerprint,
  computeHolidaySummary,
  getKoreanDayOfWeek,
  formatHolidayDateWithDay
} from "./operations-holidays-model";

describe("operations-holidays-model", () => {
  it("synchronization retains manual-only dates but still validates fetched rows", () => {
    const current = [{ id: "manual", holidayDate: "2026-04-01", name: "수동", isSubstitute: false }];
    const fetched = [{ id: "api", holidayDate: "2026-03-01", name: "삼일절", isSubstitute: false }];
    const result = buildHolidaySyncComparison(current, fetched, 2026);
    expect(result).toMatchObject({ removedCount: 0, addedCount: 1, unchangedCount: 1, hasChanges: true });
    expect(result.rows.find(row => row.holidayDate === "2026-04-01")?.after).toEqual(current[0]);
    expect(current).toHaveLength(1);
    expect(buildHolidaySyncComparison(current, [], 2026).hasChanges).toBe(false);
  });
  const sampleItems: HolidayItem[] = [
    { id: "h1", holidayDate: "2026-01-01", name: "신정", isSubstitute: false },
    { id: "h2", holidayDate: "2026-03-01", name: "삼일절", isSubstitute: false },
    { id: "h3", holidayDate: "2026-03-02", name: "삼일절 대체공휴일", isSubstitute: true },
    { id: "h4", holidayDate: "2026-05-05", name: "어린이날", isSubstitute: false },
    { id: "h5", holidayDate: "2026-05-24", name: "부처님오신날", isSubstitute: false }
  ];

  describe("computeHolidaySummary", () => {
    it("전체/일반/대체 개수를 정확히 집계한다", () => {
      const summary = computeHolidaySummary(sampleItems);
      expect(summary.totalCount).toBe(5);
      expect(summary.regularCount).toBe(4);
      expect(summary.substituteCount).toBe(1);
      expect(summary.totalCount).toBe(summary.regularCount + summary.substituteCount);
    });

    it("빈 배열에 대해 0건을 반환한다", () => {
      const summary = computeHolidaySummary([]);
      expect(summary).toEqual({ totalCount: 0, regularCount: 0, substituteCount: 0 });
    });
  });

  describe("getKoreanDayOfWeek & formatHolidayDateWithDay", () => {
    it("정확한 한글 요일을 반환한다", () => {
      // 2026-01-01은 목요일
      expect(getKoreanDayOfWeek("2026-01-01")).toBe("목");
      // 2026-03-01은 일요일
      expect(getKoreanDayOfWeek("2026-03-01")).toBe("일");
      // 2026-03-02는 월요일
      expect(getKoreanDayOfWeek("2026-03-02")).toBe("월");
      // 2026-05-05는 화요일
      expect(getKoreanDayOfWeek("2026-05-05")).toBe("화");
      // 2026-05-24는 일요일
      expect(getKoreanDayOfWeek("2026-05-24")).toBe("일");
    });

    it("포맷팅된 문자열을 올바르게 생성한다", () => {
      expect(formatHolidayDateWithDay("2026-05-05")).toBe("2026-05-05 (화)");
      expect(formatHolidayDateWithDay("invalid")).toBe("invalid");
    });
  });

  describe("filterHolidayItems", () => {
    it("날짜 오름차순 및 내림차순 정렬을 수행한다", () => {
      const asc = filterHolidayItems(sampleItems, { sortField: "holidayDate", sortOrder: "asc" });
      expect(asc.map((i) => i.holidayDate)).toEqual([
        "2026-01-01",
        "2026-03-01",
        "2026-03-02",
        "2026-05-05",
        "2026-05-24"
      ]);

      const desc = filterHolidayItems(sampleItems, { sortField: "holidayDate", sortOrder: "desc" });
      expect(desc.map((i) => i.holidayDate)).toEqual([
        "2026-05-24",
        "2026-05-05",
        "2026-03-02",
        "2026-03-01",
        "2026-01-01"
      ]);
    });

    it("명칭 기준 정렬 및 2차 날짜 정렬을 수행한다", () => {
      const itemsWithSameName: HolidayItem[] = [
        { id: "1", holidayDate: "2026-09-26", name: "추석", isSubstitute: false },
        { id: "2", holidayDate: "2026-09-25", name: "추석", isSubstitute: false },
        { id: "3", holidayDate: "2026-01-01", name: "신정", isSubstitute: false }
      ];
      const res = filterHolidayItems(itemsWithSameName, { sortField: "name", sortOrder: "asc" });
      expect(res.map((i) => `${i.name}:${i.holidayDate}`)).toEqual([
        "신정:2026-01-01",
        "추석:2026-09-25",
        "추석:2026-09-26"
      ]);
    });

    it("일반/대체 공휴일 구분을 필터링한다", () => {
      const regular = filterHolidayItems(sampleItems, { typeFilter: "regular" });
      expect(regular.every((i) => !i.isSubstitute)).toBe(true);
      expect(regular.length).toBe(4);

      const substitute = filterHolidayItems(sampleItems, { typeFilter: "substitute" });
      expect(substitute.every((i) => i.isSubstitute)).toBe(true);
      expect(substitute.length).toBe(1);
      expect(substitute[0].name).toBe("삼일절 대체공휴일");

      const all = filterHolidayItems(sampleItems, { typeFilter: "all" });
      expect(all.length).toBe(5);
    });

    it("검색어로 명칭 및 날짜를 부분 검색한다", () => {
      const byName = filterHolidayItems(sampleItems, { query: "삼일" });
      expect(byName.length).toBe(2);

      const byDate = filterHolidayItems(sampleItems, { query: "05-" });
      expect(byDate.length).toBe(2);

      const noMatch = filterHolidayItems(sampleItems, { query: "존재하지않음" });
      expect(noMatch.length).toBe(0);
    });

    it("비정렬 입력 배열을 올바르게 정렬한다", () => {
      const unsorted = [sampleItems[3], sampleItems[0], sampleItems[4], sampleItems[1]];
      const res = filterHolidayItems(unsorted);
      expect(res[0].holidayDate).toBe("2026-01-01");
      expect(res[res.length - 1].holidayDate).toBe("2026-05-24");
    });

    it("입력 배열의 불변성을 유지한다", () => {
      const original = [...sampleItems];
      const frozen = Object.freeze([...sampleItems].map((i) => Object.freeze({ ...i })));
      const res = filterHolidayItems(frozen, { query: "삼일", sortField: "name" });
      expect(res.length).toBe(2);
      expect(frozen.length).toBe(original.length);
      expect(frozen[0].id).toBe(original[0].id);
    });
  });

  describe("buildHolidayComparison", () => {
    it("양쪽 ID만 다르고 내용이 동일한 경우 변경 없음(hasChanges=false)으로 판정한다", () => {
      const cur: HolidayItem[] = [
        { id: "cur-1", holidayDate: "2026-01-01", name: "신정", isSubstitute: false },
        { id: "cur-2", holidayDate: "2026-05-05", name: "어린이날", isSubstitute: false }
      ];
      const fetched: HolidayItem[] = [
        { id: "fetched-99", holidayDate: "2026-01-01", name: "신정", isSubstitute: false },
        { id: "fetched-100", holidayDate: "2026-05-05", name: "어린이날", isSubstitute: false }
      ];

      const comp = buildHolidayComparison(cur, fetched, 2026);
      expect(comp.hasChanges).toBe(false);
      expect(comp.addedCount).toBe(0);
      expect(comp.modifiedCount).toBe(0);
      expect(comp.removedCount).toBe(0);
      expect(comp.unchangedCount).toBe(2);
      expect(comp.validationErrors.length).toBe(0);
    });

    it("추가, 제외, 명칭 변경, 구분 변경, 동시 변경을 정확히 구분한다", () => {
      const cur: HolidayItem[] = [
        { id: "c1", holidayDate: "2026-01-01", name: "신정", isSubstitute: false }, // 유지 (동일)
        { id: "c2", holidayDate: "2026-03-01", name: "삼일절_기존명", isSubstitute: false }, // 명칭 변경
        { id: "c3", holidayDate: "2026-05-05", name: "어린이날", isSubstitute: false }, // 구분 변경
        { id: "c4", holidayDate: "2026-06-06", name: "현충일_기존", isSubstitute: false }, // 명칭+구분 변경
        { id: "c5", holidayDate: "2026-08-15", name: "광복절", isSubstitute: false } // 제외됨
      ];

      const fetched: HolidayItem[] = [
        { id: "f1", holidayDate: "2026-01-01", name: "신정", isSubstitute: false }, // 동일
        { id: "f2", holidayDate: "2026-03-01", name: "삼일절", isSubstitute: false }, // 명칭 변경
        { id: "f3", holidayDate: "2026-05-05", name: "어린이날", isSubstitute: true }, // 구분 변경
        { id: "f4", holidayDate: "2026-06-06", name: "현충일_신규", isSubstitute: true }, // 명칭+구분 변경
        { id: "f6", holidayDate: "2026-10-03", name: "개천절", isSubstitute: false } // 추가됨
      ];

      const comp = buildHolidayComparison(cur, fetched, 2026);
      expect(comp.hasChanges).toBe(true);
      expect(comp.currentCount).toBe(5);
      expect(comp.fetchedCount).toBe(5);
      expect(comp.addedCount).toBe(1); // 개천절
      expect(comp.removedCount).toBe(1); // 광복절
      expect(comp.modifiedCount).toBe(3); // 삼일절, 어린이날, 현충일
      expect(comp.unchangedCount).toBe(1); // 신정
      expect(comp.rows.length).toBe(6);

      // 날짜 순서 정렬 확인
      expect(comp.rows.map((r) => r.holidayDate)).toEqual([
        "2026-01-01",
        "2026-03-01",
        "2026-05-05",
        "2026-06-06",
        "2026-08-15",
        "2026-10-03"
      ]);

      const r1 = comp.rows.find((r) => r.holidayDate === "2026-01-01")!;
      expect(r1.changeType).toBe("unchanged");

      const r2 = comp.rows.find((r) => r.holidayDate === "2026-03-01")!;
      expect(r2.changeType).toBe("modified");
      expect(r2.isNameChanged).toBe(true);
      expect(r2.isSubstituteChanged).toBe(false);

      const r3 = comp.rows.find((r) => r.holidayDate === "2026-05-05")!;
      expect(r3.changeType).toBe("modified");
      expect(r3.isNameChanged).toBe(false);
      expect(r3.isSubstituteChanged).toBe(true);

      const r4 = comp.rows.find((r) => r.holidayDate === "2026-06-06")!;
      expect(r4.changeType).toBe("modified");
      expect(r4.isNameChanged).toBe(true);
      expect(r4.isSubstituteChanged).toBe(true);

      const r5 = comp.rows.find((r) => r.holidayDate === "2026-08-15")!;
      expect(r5.changeType).toBe("removed");

      const r6 = comp.rows.find((r) => r.holidayDate === "2026-10-03")!;
      expect(r6.changeType).toBe("added");
    });

    it("동명 다른 날짜를 독립된 항목으로 정상 비교한다", () => {
      const cur: HolidayItem[] = [
        { id: "c1", holidayDate: "2026-09-24", name: "추석 연휴", isSubstitute: false },
        { id: "c2", holidayDate: "2026-09-25", name: "추석 연휴", isSubstitute: false }
      ];
      const fetched: HolidayItem[] = [
        { id: "f1", holidayDate: "2026-09-24", name: "추석 연휴", isSubstitute: false },
        { id: "f2", holidayDate: "2026-09-25", name: "추석", isSubstitute: false }, // 명칭 변경
        { id: "f3", holidayDate: "2026-09-26", name: "추석 연휴", isSubstitute: false } // 추가
      ];

      const comp = buildHolidayComparison(cur, fetched, 2026);
      expect(comp.unchangedCount).toBe(1); // 09-24
      expect(comp.modifiedCount).toBe(1); // 09-25
      expect(comp.addedCount).toBe(1); // 09-26
      expect(comp.rows.length).toBe(3);
    });

    it("비정렬 입력에 대해서도 날짜 순으로 정렬된 행을 생성한다", () => {
      const cur = [sampleItems[3], sampleItems[0]];
      const fetched = [sampleItems[1], sampleItems[4]];
      const comp = buildHolidayComparison(cur, fetched, 2026);
      expect(comp.rows.map((r) => r.holidayDate)).toEqual([
        "2026-01-01",
        "2026-03-01",
        "2026-05-05",
        "2026-05-24"
      ]);
    });

    it("입력 배열의 불변성을 유지한다", () => {
      const curSnapshot = JSON.stringify(sampleItems);
      const slice = sampleItems.slice(0, 3);
      const fetchedSnapshot = JSON.stringify(slice);
      buildHolidayComparison(sampleItems, slice, 2026);
      expect(JSON.stringify(sampleItems)).toBe(curSnapshot);
      expect(JSON.stringify(slice)).toBe(fetchedSnapshot);
    });

    it("공백 명칭, 잘못된 날짜, 다른 연도, 중복 날짜, 빈 응답 검증 오류를 포착한다", () => {
      // 1. 빈 응답
      const emptyRes = buildHolidayComparison(sampleItems, [], 2026);
      expect(emptyRes.validationErrors).toContain("가져온 공휴일 목록이 비어 있습니다.");
      expect(emptyRes.hasChanges).toBe(false);

      // 2. 잘못된 날짜, 다른 연도, 공백 명칭, 중복 날짜
      const badItems: HolidayItem[] = [
        { id: "b1", holidayDate: "invalid-date", name: "이상한 날짜", isSubstitute: false },
        { id: "b2", holidayDate: "2027-01-01", name: "내년 신정", isSubstitute: false },
        { id: "b3", holidayDate: "2026-05-05", name: "   ", isSubstitute: false },
        { id: "b4", holidayDate: "2026-05-05", name: "어린이날 중복", isSubstitute: false }
      ];

      const badRes = buildHolidayComparison(sampleItems, badItems, 2026);
      expect(badRes.hasChanges).toBe(false);
      expect(badRes.validationErrors.some((e) => e.includes("유효하지 않은 날짜"))).toBe(true);
      expect(badRes.validationErrors.some((e) => e.includes("선택 연도(2026년)와 일치하지 않는"))).toBe(true);
      expect(badRes.validationErrors.some((e) => e.includes("공휴일 명칭이 비어 있습니다"))).toBe(true);
      expect(badRes.validationErrors.some((e) => e.includes("중복된 날짜가 있습니다"))).toBe(true);
    });

    it("1001건의 대규모 항목 비교 및 필터링을 빠르고 안전하게 수행한다", () => {
      const largeCur: HolidayItem[] = [];
      const largeFetched: HolidayItem[] = [];
      const baseMs = Date.UTC(2020, 0, 1);

      for (let i = 0; i < 1001; i++) {
        // 1001개의 고유한 유효 날짜 생성
        const d = new Date(baseMs + i * 86400000);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        const date = `${y}-${m}-${day}`;

        largeCur.push({
          id: `cur-${i}`,
          holidayDate: date,
          name: `테스트휴일_${i}`,
          isSubstitute: i % 2 === 0
        });
        largeFetched.push({
          id: `fetched-${i}`,
          holidayDate: date,
          name: i % 3 === 0 ? `수정휴일_${i}` : `테스트휴일_${i}`,
          isSubstitute: i % 2 === 0
        });
      }

      const t0 = performance.now();
      const comp = buildHolidayComparison(largeCur, largeFetched, 0);
      const elapsed = performance.now() - t0;

      expect(elapsed).toBeLessThan(200); // 200ms 이내 완료
      expect(comp.validationErrors.length).toBe(0);
      expect(comp.hasChanges).toBe(true);
      expect(comp.currentCount).toBe(1001);
      expect(comp.fetchedCount).toBe(1001);
      expect(comp.rows.length).toBe(1001);

      // 대량 필터링 검증
      const filtered = filterHolidayItems(largeCur, { query: "테스트휴일_10" });
      expect(filtered.length).toBeGreaterThan(0);
    });
  });

  describe("holidayCalendarFingerprint", () => {
    it("null 또는 undefined에 대해 'empty'를 반환한다", () => {
      expect(holidayCalendarFingerprint(null)).toBe("empty");
      expect(holidayCalendarFingerprint(undefined)).toBe("empty");
    });

    it("동일한 내용의 캘린더는 항목 순서가 달라도 동일한 지문을 생성한다", () => {
      const cal1: HolidayCalendar = {
        id: "cal-2026",
        year: 2026,
        sourceName: "테스트",
        createdAt: "2026-01-01",
        items: [sampleItems[0], sampleItems[1]]
      };
      const cal2: HolidayCalendar = {
        id: "cal-2026",
        year: 2026,
        sourceName: "테스트",
        createdAt: "2026-01-01",
        items: [sampleItems[1], sampleItems[0]]
      };

      expect(holidayCalendarFingerprint(cal1)).toBe(holidayCalendarFingerprint(cal2));
    });

    it("항목의 내용(명칭, 날짜, 대체여부, id)이 다르면 다른 지문을 생성한다", () => {
      const cal: HolidayCalendar = {
        id: "cal-2026",
        year: 2026,
        sourceName: "테스트",
        createdAt: "2026-01-01",
        items: [sampleItems[0]]
      };
      const calModified: HolidayCalendar = {
        id: "cal-2026",
        year: 2026,
        sourceName: "테스트",
        createdAt: "2026-01-01",
        items: [{ ...sampleItems[0], name: "다른 이름" }]
      };

      expect(holidayCalendarFingerprint(cal)).not.toBe(holidayCalendarFingerprint(calModified));
    });

    it("HOL-D03 반례: 구분자(|, ;, 줄바꿈)를 이름에 포함하여 조작해도 2개 항목과 1개 항목의 지문이 절대 충돌하지 않는다", () => {
      const bId = "item-b-id-999";
      // 원래 2개 항목이 있는 달력
      const calTwoItems: HolidayCalendar = {
        id: "cal-2028",
        year: 2028,
        sourceName: "수동 등록",
        createdAt: "2028-01-01",
        items: [
          { id: "item-a", holidayDate: "2028-01-01", name: "Name", isSubstitute: false },
          { id: bId, holidayDate: "2028-02-01", name: "Other", isSubstitute: false }
        ]
      };

      // a 항목의 이름에 구분자 및 b의 직렬화 형태를 위조 삽입하고 b를 삭제한 1개 항목 달력
      const forgedName = `Name|0;${bId}|2028-02-01|Other`;
      const calOneForgedItem: HolidayCalendar = {
        id: "cal-2028",
        year: 2028,
        sourceName: "수동 등록",
        createdAt: "2028-01-01",
        items: [
          { id: "item-a", holidayDate: "2028-01-01", name: forgedName, isSubstitute: false }
        ]
      };

      const fp2 = holidayCalendarFingerprint(calTwoItems);
      const fp1 = holidayCalendarFingerprint(calOneForgedItem);

      expect(fp1).not.toBe(fp2);
    });

    it("이름에 특수문자, 줄바꿈, 따옴표, 한글이 포함되어도 안정적으로 직렬화된다", () => {
      const calSpecial: HolidayCalendar = {
        id: "cal-special",
        year: 2026,
        sourceName: "특수문자 \"출처\"",
        createdAt: "2026-01-01",
        items: [
          {
            id: "s1",
            holidayDate: "2026-05-05",
            name: "어린이날 | 대체; \"특수\" \n 줄바꿈",
            isSubstitute: true
          }
        ]
      };
      const fp = holidayCalendarFingerprint(calSpecial);
      expect(typeof fp).toBe("string");
      expect(fp.length).toBeGreaterThan(10);
      expect(fp).toBe(holidayCalendarFingerprint(calSpecial));
    });
  });
});
