import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchHolidayApiItems } from "./holiday-api-service";

describe("holiday-api-service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("should resolve Nager API urls and normalize holiday rows", async () => {
    const calendar = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260301\r\nDESCRIPTION:공휴일\r\nSUMMARY:삼일절\r\nEND:VEVENT\r\nEND:VCALENDAR";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => calendar,
        json: async () => [
          {
            date: "2026-03-01",
            localName: "삼일절"
          },
          {
            date: "2026-03-01",
            localName: "중복"
          },
          {
            date: "2026-05-05",
            name: "어린이날"
          }
        ]
      })
    );

    const items = await fetchHolidayApiItems({
      baseUrl: "https://date.nager.at/api/v3/PublicHolidays",
      year: 2026
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://date.nager.at/api/v3/PublicHolidays/2026/KR",
      expect.objectContaining({
        headers: {
          Accept: "application/json"
        }
      })
    );
    expect(items.map((item) => item.holidayDate)).toEqual(["2026-03-01", "2026-05-05"]);
    expect(items[0]?.name).toBe("삼일절");
  });

  it("combines original and substitute holidays, excluding observances without guessing dates", async () => {
    const event = (date: string, name: string, description = "공휴일") => `BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${date}\r\nSUMMARY:${name}\r\nDESCRIPTION:${description}\r\nEND:VEVENT\r\n`;
    const calendar = `BEGIN:VCALENDAR\r\n${event("20270207", "설날")}${event("20271225", "크리스마스")}${event("20271227", "쉬는 날 크리스마스")}${event("20270508", "어버이날", "기념일")}END:VCALENDAR`;
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [
      { date: "2027-02-06", localName: "설날 연휴" },
      { date: "2027-12-25", localName: "크리스마스" }
    ] }).mockResolvedValueOnce({ ok: true, text: async () => calendar });
    vi.stubGlobal("fetch", fetchMock);
    const items = await fetchHolidayApiItems({ baseUrl: "https://date.nager.at/api/v3/PublicHolidays", year: 2027 });
    expect(items.map(item => item.holidayDate)).toEqual(["2027-02-06", "2027-02-07", "2027-12-25", "2027-12-27"]);
    expect(items.at(-1)).toMatchObject({ name: "대체공휴일(크리스마스)", isSubstitute: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    { payload: [], message: "비어" },
    { payload: [{ date: "2026-02-30", name: "날짜 오류" }], message: "날짜" },
    { payload: [{ date: "2027-01-01", name: "연도 오류" }], message: "연도" },
    { payload: [{ date: "2026-01-01", name: " " }], message: "명칭" },
    { payload: {}, message: "형식" }
  ])("rejects invalid custom API input: $message", async ({ payload, message }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    await expect(fetchHolidayApiItems({ baseUrl: "https://example.test/{year}/{countryCode}", year: 2026 })).rejects.toThrow(message);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ok: false, status: 503, text: async () => "" },
    { ok: true, text: async () => "invalid" },
    { ok: true, text: async () => "BEGIN:VCALENDAR\r\nEND:VCALENDAR" }
  ])("fails without returning a partial default calendar when supplement is unavailable", async (supplement) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [{ date: "2026-01-01", name: "새해" }] }).mockResolvedValueOnce(supplement));
    await expect(fetchHolidayApiItems({ baseUrl: "https://date.nager.at/api/v3/PublicHolidays", year: 2026 })).rejects.toThrow("공휴일");
  });
});
