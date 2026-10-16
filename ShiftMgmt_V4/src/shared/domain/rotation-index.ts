const DATE_FORMAT_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const parseDateParts = (dateString: string): { year: number; month: number; day: number } => {
  if (!DATE_FORMAT_REGEX.test(dateString)) {
    throw new Error(`Invalid date value: ${dateString}`);
  }

  const [yearText, monthText, dayText] = dateString.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new Error(`Invalid date value: ${dateString}`);
  }

  return { year, month, day };
};

/**
 * Calculates the difference in whole calendar days between two date strings (targetDate - baseDate).
 * Accepts date strings formatted as "YYYY-MM-DD".
 */
export const getDateDifferenceInDays = (baseDate: string, targetDate: string): number => {
  const left = parseDateParts(baseDate);
  const right = parseDateParts(targetDate);
  const leftUtc = Date.UTC(left.year, left.month - 1, left.day);
  const rightUtc = Date.UTC(right.year, right.month - 1, right.day);

  return Math.round((rightUtc - leftUtc) / (24 * 60 * 60 * 1000));
};

/**
 * Calculates the cycle rotation index for a given date offset, team starting index, and cycle length.
 * Safely handles negative offsets and zero/negative cycle lengths.
 */
export const calculateRotationIndexFromOffset = (
  dateOffset: number,
  teamIndex: number,
  cycleLength: number
): number => {
  if (cycleLength <= 0) {
    return 0;
  }

  return ((dateOffset + teamIndex) % cycleLength + cycleLength) % cycleLength;
};

/**
 * Calculates the cycle rotation index for a target date relative to a base date, team starting index, and cycle length.
 */
export const calculateRotationIndex = (
  baseDate: string,
  targetDate: string,
  teamIndex: number,
  cycleLength: number
): number => {
  if (cycleLength <= 0) {
    return 0;
  }

  const dateOffset = getDateDifferenceInDays(baseDate, targetDate);
  return calculateRotationIndexFromOffset(dateOffset, teamIndex, cycleLength);
};
