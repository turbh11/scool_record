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

test.describe('End-to-End Complete Multi-Role Lifecycle', () => {
  const timestamp = Date.now();
  const testSchoolName = `בית ספר למצוינות E2E ${timestamp}`;
  // 6 digits semel mosad
  const testSemel = `99${Math.floor(1000 + Math.random() * 9000)}`;
  const testAdminEmail = `admin_e2e_${timestamp}@schooltest.org.il`;
  const testAdminName = `ד"ר אילן מנהל ${timestamp}`;
  const testTeacherName = `מורה דמו ${timestamp}`;
  const testTeacherEmail = `teacher_${timestamp}@schooltest.org.il`;

  let generatedAdminPassword = '';

  test('Complete E2E Lifecycle: Super Admin -> School Admin -> Teacher -> Cross-Role Sync', async ({
    page,
    browser,
  }) => {
    // 3 minutes timeout for complete multi-role lifecycle execution
    test.setTimeout(180000);

    // Grant clipboard permissions for smooth link copying
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    // Automatically accept all window.confirm dialogs (for freeze/unfreeze/delete)
    page.on('dialog', (dialog) => dialog.accept());

    // ==========================================
    // STAGE 1: Super Admin Security & Login
    // ==========================================
    // 1. Verify unauthenticated visit to /super-admin is blocked
    await page.goto('/super-admin');
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10000 });

    // 2. Log in with Super Admin credentials
    const superEmail = process.env.TEST_ADMIN_EMAIL || 'barakbenacon@gmail.com';
    const superPassword = process.env.TEST_ADMIN_PASSWORD || '0508445663';

    await page.locator('#admin-login-email').fill(superEmail);
    await page.locator('#admin-login-password').fill(superPassword);
    await page.getByRole('button', { name: /התחברות עם סיסמה/i }).click();

    // 3. Navigate to /admin and verify Super Admin link is visible
    await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 15000 });
    const superAdminLink = page.getByRole('link', {
      name: /ניהול מערכת \(Super Admin\)/i,
    });
    await expect(superAdminLink).toBeVisible({ timeout: 10000 });

    // 4. Click to navigate to /super-admin
    await superAdminLink.click();
    await expect(page).toHaveURL(/\/super-admin/, { timeout: 10000 });

    // ==========================================
    // STAGE 2: Super Admin Provisions New School
    // ==========================================
    // 1. Form Validation Check: submitting empty form shows error
    const createSchoolBtn = page.getByRole('button', {
      name: /הקם סביבת בית ספר/i,
    });
    await expect(createSchoolBtn).toBeVisible({ timeout: 10000 });
    await createSchoolBtn.click();
    await expect(
      page.getByText(/נא למלא את כל השדות בטופס/i)
    ).toBeVisible({ timeout: 5000 });

    // 2. Fill in all school and admin details
    await page.locator('#super-admin-name').fill(testAdminName);
    await page.locator('#super-admin-id-number').fill('033445566');
    await page.locator('#super-school-name').fill(testSchoolName);
    await page.locator('#super-institution-code').fill(testSemel);
    await page.locator('#super-admin-email').fill(testAdminEmail);

    // 3. Submit form to create school environment
    await createSchoolBtn.click();

    // 4. Assert Success & Created Summary Card
    await expect(
      page.getByText(/סביבת המוסד.*הוקמה בהצלחה!/i)
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(testSchoolName).first()).toBeVisible();
    await expect(page.getByText(testAdminEmail).first()).toBeVisible();

    // 5. Extract the generated password from the summary block
    const passElement = page.locator('span.font-mono.text-indigo-700').first();
    if (await passElement.isVisible()) {
      generatedAdminPassword = (await passElement.innerText()).trim();
    }
    // Also test "העתק פרטי גישה לשליחה למנהל"
    const copyCredentialsBtn = page.getByRole('button', {
      name: /העתק פרטי גישה לשליחה למנהל/i,
    });
    if (await copyCredentialsBtn.isVisible()) {
      await copyCredentialsBtn.click();
      await expect(page.getByText(/הועתק ללוח/i)).toBeVisible({ timeout: 5000 });
    }

    // 6. Verify Active Institutions Table contains the new school
    await expect(page.getByText(testSemel).first()).toBeVisible({ timeout: 10000 });

    // 7. Test Quick Magic Link modal for this admin
    const schoolRow = page.locator('tr').filter({ hasText: testSemel }).first();
    const magicLinkBtn = schoolRow.getByRole('button', { name: /שלח קישור התחברות/i }).first();
    if (await magicLinkBtn.isVisible()) {
      await magicLinkBtn.click();
      await expect(page.getByText(/קישור התחברות למנהל\/ת/i)).toBeVisible({ timeout: 10000 });

      // Test "שלח שוב במייל" server action
      const resendBtn = page.getByRole('button', { name: /שלח שוב במייל/i });
      if (await resendBtn.isVisible()) {
        await resendBtn.click();
        await expect(page.getByText(/קישור נשלח בהצלחה/i)).toBeVisible({ timeout: 10000 });
      }

      // Close modal
      const closeLinkModalBtn = page.locator('button:has(svg.lucide-x)').first();
      await closeLinkModalBtn.click();
    }

    // ==========================================
    // STAGE 3: New School Admin Login & Setup
    // ==========================================
    // 1. Log out cleanly from Super Admin session
    await page.context().clearCookies();
    await page.goto('/admin/login');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 15000 });

    // 2. Log in as the new School Admin with generated credentials
    const loginPassword = generatedAdminPassword || 'Aa123456!';
    await page.locator('#admin-login-email').fill(testAdminEmail);
    await page.locator('#admin-login-password').fill(loginPassword);
    await page.getByRole('button', { name: /התחברות עם סיסמה/i }).click();

    // 3. Assert navigation to /admin and school header
    await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 15000 });
    // Institution code must match the new school and NEVER be "---"
    await expect(page.locator('text="סמל מוסד: ---"')).toHaveCount(0);
    await expect(page.getByText(testSemel).first()).toBeVisible({ timeout: 10000 });

    // 4. Regular School Admin must NOT see Super Admin link
    await expect(
      page.getByRole('link', { name: /ניהול מערכת \(Super Admin\)/i })
    ).toHaveCount(0);

    // ==========================================
    // STAGE 4: Bell Schedule Customization (לוח זמני שיעורים)
    // ==========================================
    // 1. Open Bell Schedule modal
    const bellBtn = page.getByRole('button', { name: /לוח זמני שיעורים/i });
    await expect(bellBtn).toBeVisible({ timeout: 10000 });
    await bellBtn.click();
    await expect(page.getByText(/לוח זמני שיעורים/i).first()).toBeVisible({ timeout: 5000 });

    // 2. Test Chronological Validation: end_time before start_time
    const periodStartInput = page.locator('#modal-period-start');
    const periodEndInput = page.locator('#modal-period-end');
    const addPeriodBtn = page.getByRole('button', { name: /הוסף שיעור ללוח/i });

    if (await periodStartInput.isVisible() && await addPeriodBtn.isVisible()) {
      await periodStartInput.fill('10:00');
      await periodEndInput.fill('09:30');
      await addPeriodBtn.click();
      await expect(
        page.getByText(/שעת סיום חייבת להיות מאוחרת משעת התחלה/i)
      ).toBeVisible({ timeout: 5000 });

      // 3. Add a valid custom period
      await periodStartInput.fill('08:00');
      await periodEndInput.fill('08:45');
      await addPeriodBtn.click();
      await expect(page.getByText(/שעת לימוד נוספה בהצלחה/i)).toBeVisible({ timeout: 10000 });

      // 4. Test inline edit of a period
      const editBtn = page.locator('button[title="ערוך שיעור זה"]').first();
      if (await editBtn.isVisible()) {
        await editBtn.click();
        const saveEditBtn = page.locator('button[title="שמור שינויים"]');
        await expect(saveEditBtn).toBeVisible();
        await page.locator('button[title="בטל עריכה"]').click();
      }
    }

    // Close Bell Schedule modal
    const closeBellModal = page.locator('div[role="dialog"] button:has(svg.lucide-x)').first();
    if (await closeBellModal.isVisible()) {
      await closeBellModal.click();
    } else {
      await page.keyboard.press('Escape');
    }

    // ==========================================
    // STAGE 5: Teacher Management & Slot Assignment
    // ==========================================
    // 1. Open "ניהול מורים ומערכת שעות"
    const manageTeachersBtn = page.getByRole('button', {
      name: /ניהול מורים ומערכת שעות/i,
    });
    await expect(manageTeachersBtn).toBeVisible({ timeout: 10000 });
    await manageTeachersBtn.click();

    // 2. Create a new Teacher
    const teacherNameInput = page.getByPlaceholder('לדוגמה: שירה כהן');
    await expect(teacherNameInput).toBeVisible({ timeout: 5000 });
    await teacherNameInput.fill(testTeacherName);

    const teacherSubjInput = page.getByPlaceholder('לדוגמה: מתמטיקה');
    if (await teacherSubjInput.isVisible()) {
      await teacherSubjInput.fill('הוראה מתקנת');
    }
    const teacherPhoneInput = page.getByPlaceholder('050-1234567');
    if (await teacherPhoneInput.isVisible()) {
      await teacherPhoneInput.fill('0501234567');
    }
    const teacherEmailInput = page.getByPlaceholder('shira@school.org.il');
    if (await teacherEmailInput.isVisible()) {
      await teacherEmailInput.fill(testTeacherEmail);
    }

    const addTeacherBtn = page.getByRole('button', {
      name: /הוסף מורה למערכת/i,
    });
    await addTeacherBtn.click();
    await expect(page.getByText(new RegExp(`המורה ${testTeacherName} נוסף/ה בהצלחה!`))).toBeVisible({ timeout: 10000 });

    // 3. Click the teacher to manage schedule
    const teacherItem = page.locator('.glass-modal').getByText(testTeacherName, { exact: true }).first();
    await expect(teacherItem).toBeVisible({ timeout: 10000 });
    await teacherItem.click();

    // 4. Test Teacher Edit
    const editTeacherBtn = page.locator('button[title="ערוך פרטי מורה ודרכי התקשרות"]').first();
    if (await editTeacherBtn.isVisible()) {
      await editTeacherBtn.click();
      const saveEditTeacherBtn = page.getByRole('button', { name: /שמור שינויים/i });
      await expect(saveEditTeacherBtn).toBeVisible();
      // Click cancel
      await page.getByRole('button', { name: /ביטול/i }).click();
    }

    // 5. Test Copy Magic Link for teacher
    const copyTeacherLinkBtn = page.locator('button[title*="העתק קישור אישי"]').first();
    await expect(copyTeacherLinkBtn).toBeVisible();
    await copyTeacherLinkBtn.click();
    await expect(page.getByText(/הועתק ללוח/i)).toBeVisible({ timeout: 5000 });

    // 6. Test Send Automated Email to teacher
    const sendEmailBtn = page.locator('button[title*="שלח דוא\\"ל אוטומטי"]').first();
    if (await sendEmailBtn.isVisible()) {
      await sendEmailBtn.click();
      await expect(
        page.getByText(/קישור נשלח בהצלחה|נשלח בהצלחה/i)
      ).toBeVisible({ timeout: 10000 });
    }

    // 7. Add a schedule slot for this teacher
    const slotSubjectInput = page.getByPlaceholder(/לדוגמה: תגבור אלגברה/i);
    await expect(slotSubjectInput).toBeVisible({ timeout: 5000 });
    await slotSubjectInput.fill('שעת תגבור עברית');

    const slotClassInput = page.getByPlaceholder(/לדוגמה: יא' 3/i);
    if (await slotClassInput.isVisible()) {
      await slotClassInput.fill('ח\'2');
    }

    const saveSlotBtn = page.getByRole('button', {
      name: /הוסף למערכת השעות|עדכן משבצת שעה/i,
    });
    await expect(saveSlotBtn).toBeEnabled();
    await saveSlotBtn.click();
    await expect(page.getByText(/משבצת שעה פרטנית נוספה למערכת!/i)).toBeVisible({
      timeout: 10000,
    });

    // 8. Close Modal and reload page to verify database persistence
    await page.getByRole('button', { name: /סיום וסגירה/i }).click();
    await page.reload();
    await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 15000 });
    await expect(page.locator('text="סמל מוסד: ---"')).toHaveCount(0);

    // ==========================================
    // STAGE 6: Teacher Personal Portal Flow
    // ==========================================
    // Fetch teacher token via DB
    let teacherMagicToken = '';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: tRow } = await supabase
        .from('teachers')
        .select('magic_token')
        .eq('name', testTeacherName)
        .maybeSingle();
      if (tRow?.magic_token) {
        teacherMagicToken = tRow.magic_token;
      }
    }

    const teacherContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();

    // 1. Test unauthenticated /teacher gate (without token)
    await teacherPage.goto('/teacher');
    await expect(
      teacherPage.getByRole('heading', { name: /כניסה לאזור דיווח אישי למורה/i })
    ).toBeVisible({ timeout: 10000 });

    if (teacherMagicToken) {
      // 2. Test Magic Token input submission on /teacher gate
      await teacherPage.locator('input[placeholder*="הזן קוד אישי"]').fill(teacherMagicToken);
      await teacherPage.getByRole('button', { name: /כניסה למערכת הדיווח/i }).click();

      // 3. Assert Teacher Dashboard is loaded with greeting
      await expect(teacherPage.getByText(new RegExp(`שלום, ${testTeacherName}`))).toBeVisible({ timeout: 15000 });
      await expect(teacherPage.getByText(/דיווח שבועי אישי/i)).toBeVisible();

      // 4. Test Teacher Self-Service Fixed Schedule Accordion
      const accordionBtn = teacherPage.getByText(/עריכת מערכת שעות קבועה/i);
      await expect(accordionBtn).toBeVisible({ timeout: 10000 });
      await accordionBtn.click();
      await expect(
        teacherPage.getByText(/הוספה והסרה עצמאית של שעות פרטניות קבועות/i)
      ).toBeVisible({ timeout: 5000 });

      // 5. Test Week Navigation inside teacher view
      const prevWeekBtn = teacherPage.locator('button[title="השבוע הקודם"]');
      await expect(prevWeekBtn).toBeVisible();
      await prevWeekBtn.click();
      const currentWeekBtn = teacherPage.getByRole('button', { name: /השבוע הנוכחי/i });
      if (await currentWeekBtn.isVisible()) {
        await currentWeekBtn.click();
      }
    }

    await teacherContext.close();

    // ==========================================
    // STAGE 7: Admin Controls (Settings, Password, Navigation)
    // ==========================================
    // 1. Institution Settings Modal
    const settingsBtn = page.getByRole('button', { name: /הגדרות מוסד/i });
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();
    await expect(page.getByText(/הגדרות מוסד חינוכי/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /ביטול/i }).click();

    // 2. Change Password Modal
    const changePassBtn = page.getByRole('button', { name: /החלפת סיסמה/i });
    await expect(changePassBtn).toBeVisible();
    await changePassBtn.click();
    await expect(page.locator('.glass-modal').getByRole('heading', { name: /החלפת סיסמה/i })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /ביטול/i }).click();

    // 3. Week Navigation Controls
    const adminPrevWeek = page.locator('button[title="השבוע הקודם"]');
    await expect(adminPrevWeek).toBeVisible();
    await adminPrevWeek.click();
    const returnWeekBtn = page.getByRole('button', { name: /השבוע$/i });
    await expect(returnWeekBtn).toBeVisible();
    await returnWeekBtn.click();

    // 4. Logout
    const finalLogoutBtn = page.getByRole('button', { name: /התנתק/i }).first();
    if (await finalLogoutBtn.isVisible()) {
      await finalLogoutBtn.click();
      await expect(page).toHaveURL(/\/admin\/login/, { timeout: 15000 });
    }
  });
});

