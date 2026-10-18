import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard Flow', () => {
  test('Test 1: Login & Create Teacher', async ({ page }) => {
    // 1. Navigate to /admin/login
    await page.goto('/admin/login');
    await expect(page).toHaveURL(/\/admin\/login/);

    // 2. Fill in email and password from environment or test fallback
    const testEmail = process.env.TEST_ADMIN_EMAIL || 'turbh11@gmail.com';
    const testPassword = process.env.TEST_ADMIN_PASSWORD || '!*E3$6sFmKuw';

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
    await expect(page.getByText(uniqueTeacherName,{ exact: true })).toBeVisible({
      timeout: 10000,
    });
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
});
