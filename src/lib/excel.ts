import * as XLSX from 'xlsx';
import {
  EnrichedSessionItem,
  HEBREW_DAYS,
  STATUS_CONFIG,
} from '@/types/database';

export interface ParsedExcelTeacher {
  name: string;
  subject: string;
  id_number?: string;
  phone?: string;
  email?: string;
  day_of_week?: number;
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  template_subject?: string;
  class_name?: string;
}

/**
 * Normalizes time strings or Excel timestamps to a standard 5-character "HH:mm" format.
 * Slices off seconds (e.g. "09:00:00" -> "09:00") and pads single digit hours ("9:00" -> "09:00").
 */
export function normalizeTimeToHHMM(val: any): string | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') {
    const totalMinutes = Math.round(val * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  const str = String(val).trim();
  if (!str) return undefined;
  const parts = str.split(':');
  if (parts.length >= 2) {
    const h = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    return `${h}:${m}`.slice(0, 5);
  }
  return str.slice(0, 5);
}

/**
 * Exports the current sessions (weekly or monthly summary) to an RTL Hebrew .xlsx file
 * formatted for Ministry of Education (משרד החינוך) reporting, including the "כיתה" (Class) column.
 */
export function exportReportsToExcel(
  sessions: EnrichedSessionItem[],
  schoolName: string,
  periodLabel: string
) {
  const rows = sessions.map((session) => ({
    'שם המורה': session.teacher_name,
    'תאריך': session.report_date,
    'יום בשבוע': HEBREW_DAYS[session.day_of_week] || `יום ${session.day_of_week}`,
    'שעת התחלה': session.start_time,
    'משך בדקות': session.duration_minutes,
    'תחום דעת': session.subject,
    'כיתה': session.class_name || '',
    'סטטוס ביצוע': STATUS_CONFIG[session.status]?.label || session.status,
    'הערות': session.notes || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  if (!worksheet['!views']) {
    worksheet['!views'] = [];
  }
  worksheet['!views'].push({ rightToLeft: true });

  worksheet['!cols'] = [
    { wch: 20 }, // שם המורה
    { wch: 14 }, // תאריך
    { wch: 14 }, // יום בשבוע
    { wch: 12 }, // שעת התחלה
    { wch: 12 }, // משך בדקות
    { wch: 24 }, // תחום דעת
    { wch: 14 }, // כיתה
    { wch: 18 }, // סטטוס ביצוע
    { wch: 32 }, // הערות
  ];

  const workbook = XLSX.utils.book_new();
  if (!workbook.Workbook) {
    workbook.Workbook = { Views: [{ RTL: true }] };
  } else {
    workbook.Workbook.Views = [{ RTL: true }];
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, 'דוח שעות פרטניות');

  const safePeriod = periodLabel.replace(/[\/\\:*?"<>|]/g, '-');
  const fileName = `דוח_שעות_פרטניות_${schoolName}_${safePeriod}.xlsx`;

  XLSX.writeFile(workbook, fileName);
}

/**
 * Downloads a sample Excel template (.xlsx) for bulk importing teachers (including phone, email, class_name, and optional schedule slots).
 */
export function downloadTeacherImportTemplate() {
  const sampleRows = [
    {
      'שם המורה': 'רונית שחר',
      'תחום דעת': 'מתמטיקה',
      'טלפון': '052-3344556',
      'מייל': 'ronit.s@school.edu.il',
      'יום בשבוע (1-6, אופציונלי)': 1,
      'שעת התחלה (אופציונלי)': '09:00',
      'משך בדקות (אופציונלי)': 45,
      'נושא פרטני (אופציונלי)': 'תגבור אלגברה',
      'כיתה': 'ח׳ 3',
    },
    {
      'שם המורה': 'אביגדור לוי',
      'תחום דעת': 'היסטוריה ואזרחות',
      'טלפון': '054-9988776',
      'מייל': 'avigdor.l@school.edu.il',
      'יום בשבוע (1-6, אופציונלי)': 3,
      'שעת התחלה (אופציונלי)': '10:00',
      'משך בדקות (אופציונלי)': 45,
      'נושא פרטני (אופציונלי)': 'הכנה לבגרות היסטוריה',
      'כיתה': 'י״א 2',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  worksheet['!views'] = [{ rightToLeft: true }];
  worksheet['!cols'] = [
    { wch: 20 },
    { wch: 20 },
    { wch: 16 },
    { wch: 24 },
    { wch: 26 },
    { wch: 22 },
    { wch: 22 },
    { wch: 26 },
    { wch: 14 },
  ];

  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ייבוא מורים');

  XLSX.writeFile(workbook, 'תבנית_ייבוא_מורים_שעות_פרטניות.xlsx');
}

/**
 * Parses an uploaded Excel (.xlsx / .xls / .csv) file into structured teacher rows.
 * Maps "שם המורה", "תחום דעת", "טלפון", "מייל" / "דואל", and "כיתה" (as well as optional schedule fields).
 */
export async function parseTeachersExcelFile(
  file: File
): Promise<ParsedExcelTeacher[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
    defval: '',
  });

  const parsed: ParsedExcelTeacher[] = [];

  for (const row of rawRows) {
    const normalizedRow: Record<string, any> = {};
    Object.keys(row).forEach((k) => {
      normalizedRow[k.trim()] = row[k];
    });

    const rawName =
      normalizedRow['שם המורה'] ||
      normalizedRow['שם מורה'] ||
      normalizedRow['שם'] ||
      normalizedRow['Name'] ||
      normalizedRow['name'] ||
      '';

    const rawSubject =
      normalizedRow['תחום דעת'] ||
      normalizedRow['מקצוע'] ||
      normalizedRow['נושא'] ||
      normalizedRow['Subject'] ||
      normalizedRow['subject'] ||
      'כללי';

    const rawPhone =
      normalizedRow['טלפון'] ||
      normalizedRow['טלפון נייד'] ||
      normalizedRow['נייד'] ||
      normalizedRow['פלאפון'] ||
      normalizedRow['Phone'] ||
      normalizedRow['phone'] ||
      '';

    const rawIdNumber =
      normalizedRow['תעודת זהות'] ||
      normalizedRow['תעודת זהות / ת"ז'] ||
      normalizedRow['ת"ז'] ||
      normalizedRow['ת.ז'] ||
      normalizedRow['ת.ז.'] ||
      normalizedRow['מספר זהות'] ||
      normalizedRow['ID'] ||
      normalizedRow['id_number'] ||
      '';

    const rawEmail =
      normalizedRow['מייל'] ||
      normalizedRow['דואל'] ||
      normalizedRow['דוא"ל'] ||
      normalizedRow['דואר אלקטרוני'] ||
      normalizedRow['אימייל'] ||
      normalizedRow['Email'] ||
      normalizedRow['email'] ||
      '';

    const rawClassName =
      normalizedRow['כיתה'] ||
      normalizedRow['כיתת לימוד'] ||
      normalizedRow['שכבה וכיתה'] ||
      normalizedRow['Class'] ||
      normalizedRow['class_name'] ||
      normalizedRow['class'] ||
      '';

    const name = String(rawName).trim();
    const subject = String(rawSubject).trim() || 'כללי';
    const idNumber = String(rawIdNumber).trim() || undefined;
    const phone = String(rawPhone).trim() || undefined;
    const email = String(rawEmail).trim() || undefined;
    const className = String(rawClassName).trim() || undefined;

    if (!name) continue;

    const rawDay =
      normalizedRow['יום בשבוע (1-6, אופציונלי)'] ||
      normalizedRow['יום בשבוע'] ||
      normalizedRow['יום'] ||
      normalizedRow['day_of_week'] ||
      '';

    const rawStartTime =
      normalizedRow['שעת התחלה (אופציונלי)'] ||
      normalizedRow['שעת התחלה'] ||
      normalizedRow['שעה'] ||
      normalizedRow['start_time'] ||
      '';

    const rawEndTime =
      normalizedRow['שעת סיום (אופציונלי)'] ||
      normalizedRow['שעת סיום'] ||
      normalizedRow['סיום'] ||
      normalizedRow['end_time'] ||
      '';

    const startTime = normalizeTimeToHHMM(rawStartTime);
    const endTime = normalizeTimeToHHMM(rawEndTime);

    const rawDuration =
      normalizedRow['משך בדקות (אופציונלי)'] ||
      normalizedRow['משך בדקות'] ||
      normalizedRow['duration_minutes'] ||
      45;

    let duration = Number(rawDuration) || 45;
    if (
      !normalizedRow['משך בדקות (אופציונלי)'] &&
      !normalizedRow['משך בדקות'] &&
      startTime &&
      endTime
    ) {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const diff = eh * 60 + em - (sh * 60 + sm);
      if (diff > 0) duration = diff;
    }

    const rawTplSubject =
      normalizedRow['נושא פרטני (אופציונלי)'] ||
      normalizedRow['נושא פרטני'] ||
      subject;

    let dayNum: number | undefined = undefined;
    if (rawDay !== '') {
      const n = Number(rawDay);
      if (n >= 1 && n <= 6) {
        dayNum = n;
      } else {
        const dayStr = String(rawDay).trim();
        if (dayStr.includes('ראשון') || dayStr === 'א' || dayStr === 'א׳') dayNum = 1;
        else if (dayStr.includes('שני') || dayStr === 'ב' || dayStr === 'ב׳') dayNum = 2;
        else if (dayStr.includes('שלישי') || dayStr === 'ג' || dayStr === 'ג׳') dayNum = 3;
        else if (dayStr.includes('רביעי') || dayStr === 'ד' || dayStr === 'ד׳') dayNum = 4;
        else if (dayStr.includes('חמישי') || dayStr === 'ה' || dayStr === 'ה׳') dayNum = 5;
        else if (dayStr.includes('שישי') || dayStr === 'ו' || dayStr === 'ו׳') dayNum = 6;
      }
    }

    parsed.push({
      name,
      subject,
      id_number: idNumber,
      phone,
      email,
      day_of_week: dayNum,
      start_time: startTime,
      end_time: endTime,
      duration_minutes: duration,
      template_subject: String(rawTplSubject).trim() || subject,
      class_name: className,
    });
  }

  return parsed;
}
