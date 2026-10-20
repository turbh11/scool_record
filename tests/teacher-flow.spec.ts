import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Read .env.local for test helper if not already populated
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
}

test.describe('Teacher Personal Reporting Flow', () => {
  let teacherMagicToken = '';
  let teacherName = '';

  test.beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const supabase = createClient(url, key);
      let { data: existing } = await supabase
        .from('teachers')
        .select('id, name, magic_token, institution_code')
        .not('magic_token', 'is', null)
        .limit(1)
        .maybeSingle();

      if (!existing) {
        let { data: school } = await supabase
          .from('schools')
          .select('id, semel_mosad')
          .limit(1)
          .maybeSingle();

        if (!school) {
          const { data: createdSch } = await supabase
            .from('schools')
            .insert({
              name: 'תיכון ממלכתי רבין - תל אביב',
              semel_mosad: '440129',
            })
            .select('id, semel_mosad')
            .single();
          school = createdSch;
        }

        const { data: createdTeacher } = await supabase
          .from('teachers')
          .insert({
            school_id: school?.id || '440129-default-school',
            name: 'מורה בדיקה פליירייט',
            subject: 'מתמטיקה',
            institution_code: school?.semel_mosad || '440129',
            magic_token: `token-teacher-${Date.now()}`,
          })
          .select('id, name, magic_token, institution_code')
          .single();
        existing = createdTeacher;
      }

      if (existing) {
        teacherName = existing.name;
        teacherMagicToken = existing.magic_token;

        // Ensure the teacher has at least one schedule template on Sunday (day_of_week = 1)
        const { data: existingTpl } = await supabase
          .from('schedule_templates')
          .select('id')
          .eq('teacher_id', existing.id)
          .limit(1)
          .maybeSingle();

        if (!existingTpl) {
          await supabase.from('schedule_templates').insert({
            teacher_id: existing.id,
            day_of_week: 1,
            start_time: '08:00',
            duration_minutes: 45,
            subject: 'תגבור מתמטיקה',
            class_name: 'ט׳ 1',
            period_number: 1,
            institution_code: existing.institution_code || '440129',
          });
        }
      }
    }
  });

  test('Teacher Login Gate - without token shows Magic Token card', async ({ page }) => {
    await page.goto('/teacher');

    // Should prompt for magic token
    await expect(
      page.getByRole('heading', { name: /כניסה לאזור דיווח אישי למורה/i })
    ).toBeVisible({ timeout: 10000 });

    const tokenInput = page.getByPlaceholder(/הזן קוד אישי/i);
    await expect(tokenInput).toBeVisible();

    const submitBtn = page.getByRole('button', {
      name: /כניסה למערכת הדיווח/i,
    });
    await expect(submitBtn).toBeVisible();
  });

  test('Teacher Dashboard, Weekly Grid, Status Reporting & Undo/Reset', async ({ page }) => {
    if (!teacherMagicToken) {
      test.skip();
      return;
    }

    await page.goto(`/teacher?token=${encodeURIComponent(teacherMagicToken)}`);

    // Verify Teacher Dashboard loaded
    await expect(page.getByText(/שלום,/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/דיווח שבועי אישי/i)).toBeVisible();

    // 1. Verify Session Card & Status Reporting ("בוצע" -> Undo back to "ממתין לדיווח")
    const firstCard = page.getByTestId('teacher-session-card').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });

    const statusBadge = firstCard.getByTestId('session-status-badge');
    const doneBtn = firstCard.getByTestId('status-btn-done');

    // If already reported from a prior run, reset it first
    const existingResetBtn = firstCard.getByTestId('reset-session-status');
    if (await existingResetBtn.isVisible().catch(() => false)) {
      await existingResetBtn.click();
      await expect(statusBadge).toContainText('ממתין לדיווח');
    }

    // Mark session as "בוצע"
    await doneBtn.click();
    await expect(statusBadge).toContainText('בוצע', { timeout: 5000 });

    // Undo / Reset back to "ממתין לדיווח"
    const resetBtn = firstCard.getByTestId('reset-session-status');
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();
    await expect(statusBadge).toContainText('ממתין לדיווח', { timeout: 5000 });
    await expect(
      page.getByText(/הדיווח בוטל והוחזר למצב ממתין/i)
    ).toBeVisible({ timeout: 5000 });

    // 2. Verify Week Navigation
    const prevWeekBtn = page.locator('button[title="השבוע הקודם"]');
    await expect(prevWeekBtn).toBeVisible();
    await prevWeekBtn.click();

    const nextWeekBtn = page.locator('button[title="השבוע הבא"]');
    await expect(nextWeekBtn).toBeVisible();
    await nextWeekBtn.click();

    // 3. Verify Schedule customization accordion is toggleable
    const scheduleAccordion = page.getByText(/עריכת מערכת שעות קבועה/i);
    await expect(scheduleAccordion).toBeVisible({ timeout: 10000 });
    await scheduleAccordion.click();
    await expect(
      page.getByText(/הוספה והסרה עצמאית של שעות פרטניות קבועות במערכת השבועית/i)
    ).toBeVisible({ timeout: 5000 });
  });
});
