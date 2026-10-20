import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard Flow', () => {
  test('Test 1: Login & Create Teacher', async ({ page }) => {
    // 1. Navigate to /admin/login
    await page.goto('/admin/login');
    await expect(page).toHaveURL(/\/admin\/login/);

    // 2. Fill in email and password from environment or test fallback
    const testEmail = process.env.TEST_ADMIN_EMAIL || 'barakbenacon@gmail.com';
    const testPassword = process.env.TEST_ADMIN_PASSWORD || '0508445663';

    const emailInput = page.locator('#admin-login-email');
    const passwordInput = page.locator('#admin-login-password');

    await expect(emailInput).toBeVisible({ timeout: 5000 });
    await emailInput.fill(testEmail);
    await passwordInput.fill(testPassword);

    // 3. Click the login button
    const loginButton = page.getByRole('button', {
      name: /התחברות עם סיסמה/i,
    });
    await expect(loginButton).toBeEnabled();
    await loginButton.click();

    // 4. Assert navigation to /admin
    await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 15000 });

    // 5. Click the "ניהול מורים ומערכת שעות" button
    const manageTeachersBtn = page.getByRole('button', {
      name: /ניהול מורים ומערכת שעות/i,
    });
    await expect(manageTeachersBtn).toBeVisible({ timeout: 10000 });
    await manageTeachersBtn.click();

    // 6. Fill out the "שם המורה" input with a unique timestamped name
    const timestamp = Date.now();
    const uniqueTeacherName = `מורה בדיקה ${timestamp}`;
    const nameInput = page.getByPlaceholder('לדוגמה: שירה כהן');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill(uniqueTeacherName);

    // Fill subject input
    const subjectInput = page.getByPlaceholder('לדוגמה: מתמטיקה');
    if (await subjectInput.isVisible()) {
      await subjectInput.fill('הוראה פרטנית');
    }

    // 7. Submit the form
    const submitBtn = page.getByRole('button', {
      name: /הוסף מורה למערכת/i,
    });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 8. Assert that a success toast with the new teacher's name appears
    const toastPattern = new RegExp(`המורה ${uniqueTeacherName} נוסף/ה בהצלחה!`);
    await expect(page.getByText(toastPattern)).toBeVisible({ timeout: 10000 });

    // 9. Assert that the teacher is visible in the list
    await expect(page.getByText(uniqueTeacherName, { exact: true })).toBeVisible({
      timeout: 10000,
    });

    // 10. Click on the teacher to manage schedule
    await page.getByText(uniqueTeacherName, { exact: true }).click();

    // 11. Add a schedule slot
    const slotSubjectInput = page.getByPlaceholder(/לדוגמה: תגבור אלגברה/i);
    await expect(slotSubjectInput).toBeVisible({ timeout: 5000 });
    await slotSubjectInput.fill('שיעור תגבור');

    const saveSlotBtn = page.getByRole('button', {
      name: /הוסף למערכת השעות|עדכן משבצת שעה/i,
    });
    await expect(saveSlotBtn).toBeEnabled();
    await saveSlotBtn.click();

    // 12. Confirm save completed and button is no longer stuck on "שומר..."
    await expect(page.getByText(/משבצת שעה פרטנית נוספה למערכת!/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(saveSlotBtn).toBeEnabled();

    // 13. Close the modal
    const closeBtn = page.getByRole('button', { name: /סיום וסגירה/i });
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.getByLabel('סגור חלון').click();
    }

    // 14. Reload page to verify persistence on refresh (DB write verified)
    await page.reload();
    await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 15000 });

    // 15. Verify institution code is never "---" after reload
    const rawHyphensBadge = page.locator('text="סמל מוסד: ---"');
    await expect(rawHyphensBadge).toHaveCount(0);

    // 16. Reopen teachers modal and verify the teacher & slot persisted
    const reopenManageTeachersBtn = page.getByRole('button', {
      name: /ניהול מורים ומערכת שעות/i,
    });
    await expect(reopenManageTeachersBtn).toBeVisible({ timeout: 15000 });
    await reopenManageTeachersBtn.click();

    const teacherInModal = page.locator('.glass-modal').getByText(uniqueTeacherName, { exact: true }).first();
    await expect(teacherInModal).toBeVisible({ timeout: 10000 });
    await teacherInModal.click();
    await expect(page.locator('.glass-modal').getByText('שיעור תגבור').first()).toBeVisible({ timeout: 10000 });

    // Close modal
    await page.getByRole('button', { name: /סיום וסגירה/i }).click();
  });

  test('Test 2: Super Admin Security - blocks direct access and redirects to login', async ({
    page,
  }) => {
    // Attempt to navigate directly to /super-admin
    await page.goto('/super-admin');

    // Assert that the system blocks access and redirects back to login page
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10000 });
    await expect(
      page.getByRole('button', { name: /התחברות עם סיסמה/i })
    ).toBeVisible();
  });

  test('Test 3: Institution code is never "---"', async ({ page }) => {
    await page.goto('/admin');
    // Even before login or during loading, "סמל מוסד: ---" should never be rendered
    const rawHyphensBadge = page.locator('text="סמל מוסד: ---"');
    await expect(rawHyphensBadge).toHaveCount(0);
  });

  test('Test 4: Admin Modals & Controls (Bell Schedule, Settings, Password, Week navigation)', async ({
    page,
  }) => {
    await page.goto('/admin');
    const emailInput = page.locator('#admin-login-email');
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const testEmail = process.env.TEST_ADMIN_EMAIL || 'barakbenacon@gmail.com';
      const testPassword = process.env.TEST_ADMIN_PASSWORD || '0508445663';
      await emailInput.fill(testEmail);
      await page.locator('#admin-login-password').fill(testPassword);
      await page.getByRole('button', { name: /התחברות עם סיסמה/i }).click();
      await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 15000 });
    }

    // 1. Test Bell Schedule modal & flexible multi-school customization
    const bellBtn = page.getByRole('button', { name: /לוח זמני שיעורים/i });
    await expect(bellBtn).toBeVisible({ timeout: 10000 });
    await bellBtn.click();
    await expect(page.getByText(/לוח זמני שיעורים/i).first()).toBeVisible({ timeout: 5000 });

    // Verify periods are listed and not stuck in a spinner loop
    await expect(page.getByText('שיעור 1').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('div[role="dialog"] table')).toBeVisible();

    // Verify inline edit toggle works
    const firstEditBtn = page.locator('button[title="ערוך שיעור זה"]').first();
    if (await firstEditBtn.isVisible()) {
      await firstEditBtn.click();
      await expect(page.locator('button[title="שמור שינויים"]')).toBeVisible();
      const cancelEditBtn = page.locator('button[title="בטל עריכה"]');
      await cancelEditBtn.click();
    }

    // Close Bell Schedule modal
    const closeBellBtn = page.locator('div[role="dialog"] button:has(svg.lucide-x)').first();
    if (await closeBellBtn.isVisible()) {
      await closeBellBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }

    // 2. Test Institution Settings modal
    const settingsBtn = page.getByRole('button', { name: /הגדרות מוסד/i });
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();
    await expect(page.getByText(/הגדרות מוסד חינוכי/i)).toBeVisible({ timeout: 5000 });
    const cancelSettingsBtn = page.getByRole('button', { name: /ביטול/i });
    await cancelSettingsBtn.click();

    // 3. Test Change Password modal
    const changePassBtn = page.getByRole('button', { name: /החלפת סיסמה/i });
    await expect(changePassBtn).toBeVisible();
    await changePassBtn.click();
    await expect(page.locator('.glass-modal').getByRole('heading', { name: /החלפת סיסמה/i })).toBeVisible({ timeout: 5000 });
    const cancelPassBtn = page.getByRole('button', { name: /ביטול/i });
    await cancelPassBtn.click();

    // 4. Test Schedule Grid Axis Toggle (Period Numbers default vs. Clock Hours)
    const periodsToggleBtn = page.getByTestId('axis-toggle-periods');
    const hoursToggleBtn = page.getByTestId('axis-toggle-hours');
    await expect(periodsToggleBtn).toBeVisible();
    await expect(hoursToggleBtn).toBeVisible();

    // Default mode must be 'periods'
    await expect(periodsToggleBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(hoursToggleBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('שיעור 1').first()).toBeVisible();
    await expect(page.getByText('שיעור 2').first()).toBeVisible();

    // Switch to Clock Hours ('hours') mode
    await hoursToggleBtn.click();
    await expect(hoursToggleBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(periodsToggleBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('td').getByText('08:00').first()).toBeVisible();

    // Switch back to Period Numbers ('periods') mode
    await periodsToggleBtn.click();
    await expect(periodsToggleBtn).toHaveAttribute('aria-pressed', 'true');

    // 5. Test Week Navigation controls
    const prevWeekBtn = page.locator('button[title="השבוע הקודם"]');
    await expect(prevWeekBtn).toBeVisible();
    await prevWeekBtn.click();
    // Verify "השבוע" (Return to current week) button appears
    const currentWeekBtn = page.getByRole('button', { name: /השבוע$/i });
    await expect(currentWeekBtn).toBeVisible();
    await currentWeekBtn.click();
  });
});
