import { test, expect } from '@playwright/test';

test.describe('Super Admin Flow', () => {
  test('Super Admin Dashboard, School Management & Switcher', async ({ page }) => {
    // 1. Login as Super Admin
    await page.goto('/admin/login');
    const testEmail = process.env.TEST_ADMIN_EMAIL || 'enterhere';
    const testPassword = process.env.TEST_ADMIN_PASSWORD || 'enterhere';

    const emailInput = page.locator('#admin-login-email');
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await emailInput.fill(testEmail);
    await page.locator('#admin-login-password').fill(testPassword);
    await page.getByRole('button', { name: /התחברות עם סיסמה/i }).click();

    // 2. Wait for /admin dashboard
    await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 15000 });

    // 3. Super Admin button must be visible in header
    const superAdminLink = page.getByRole('link', {
      name: /ניהול מערכת \(Super Admin\)/i,
    });
    await expect(superAdminLink).toBeVisible({ timeout: 10000 });

    // 4. Click Super Admin button to navigate to /super-admin
    await superAdminLink.click();
    await expect(page).toHaveURL(/\/super-admin/, { timeout: 10000 });

    // 5. Verify Super Admin page elements
    await expect(
      page.getByRole('heading', { name: /הקמת סביבת בית ספר ורישום מנהל חדש/i })
    ).toBeVisible({ timeout: 10000 });

    await expect(
      page.getByText(/ממשק על \(Super Admin\)/i)
    ).toBeVisible();

    // 6. Test School Onboarding Form Fields
    await expect(page.locator('#super-admin-name')).toBeVisible();
    await expect(page.locator('#super-admin-id-number')).toBeVisible();
    await expect(page.locator('#super-school-name')).toBeVisible();
    await expect(page.locator('#super-institution-code')).toBeVisible();
    await expect(page.locator('#super-admin-email')).toBeVisible();

    // 7. Verify Active Institutions Table section
    await expect(page.getByText(/ניהול מוסדות פעילים/i)).toBeVisible({
      timeout: 10000,
    });

    // 8. Test returning back to regular Admin dashboard
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/, { timeout: 10000 });
    await expect(page.locator('text="סמל מוסד: ---"')).toHaveCount(0);
  });
});
