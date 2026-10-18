export interface WeekDayInfo {
  dayOfWeek: number; // 1 (Sunday) to 6 (Friday)
  dateIso: string;   // "YYYY-MM-DD"
  displayDate: string; // "DD/MM"
}

/**
 * Formats a Date object to local YYYY-MM-DD without UTC timezone shift issues.
 */
export function formatDateIsoLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Given a base Date (calculated inside useEffect or event handlers to avoid hydration mismatch)
 * and a week offset (0 = current week, -1 = previous week, +1 = next week),
 * returns Sunday-to-Friday metadata for the Israeli school week.
 */
export function getIsraeliSchoolWeek(
  referenceDate: Date,
  weekOffset: number = 0
): {
  sundayIso: string;
  fridayIso: string;
  weekLabel: string;
  days: WeekDayInfo[];
} {
  const base = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  // JS getDay(): 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const currentDayOfWeek = base.getDay();
  const sunday = new Date(base);
  sunday.setDate(base.getDate() - currentDayOfWeek + weekOffset * 7);

  const days: WeekDayInfo[] = [];

  for (let i = 0; i < 6; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const dayNum = String(d.getDate()).padStart(2, '0');
    const monthNum = String(d.getMonth() + 1).padStart(2, '0');

    days.push({
      dayOfWeek: i + 1, // 1 = Sunday ... 6 = Friday
      dateIso: formatDateIsoLocal(d),
      displayDate: `${dayNum}/${monthNum}`,
    });
  }

  const firstDay = days[0];
  const lastDay = days[5];
  const year = sunday.getFullYear();

  return {
    sundayIso: firstDay.dateIso,
    fridayIso: lastDay.dateIso,
    weekLabel: `${firstDay.displayDate} - ${lastDay.displayDate} (${year})`,
    days,
  };
}

/**
 * Normalizes time string "09:00:00" -> "09:00"
 */
export function normalizeTime(timeStr: string): string {
  if (!timeStr) return '08:00';
  return timeStr.slice(0, 5);
}

