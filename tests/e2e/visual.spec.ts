import { expect, test } from '@playwright/test';

async function prepare(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const consent = {
      decided: true,
      analytics: false,
      advertising: false,
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    document.cookie =
      'wyr_consent=' + encodeURIComponent(JSON.stringify(consent)) + '; Path=/; SameSite=Lax';
  });
}

async function waitForLocalFonts(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('800 64px "Bricolage Grotesque"'),
      document.fonts.load('400 14px "DM Mono"'),
    ]);
    await document.fonts.ready;
  });
}

test('home page visual', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await page.locator('main').waitFor();
  await waitForLocalFonts(page);
  await expect(page).toHaveScreenshot('home.png', { fullPage: true });
});

test('category page visual', async ({ page }) => {
  await prepare(page);
  await page.goto('/would-you-rather-questions-for-kids/');
  await page.locator('main h1').waitFor();
  await waitForLocalFonts(page);
  await expect(page).toHaveScreenshot('category-kids.png', { fullPage: true });
});

test('game result visual', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await waitForLocalFonts(page);
  await page.locator('#choice-a').click();
  await expect(page.locator('#game-stage')).toHaveClass(/answered/);
  await expect(page.locator('#game-shell')).toHaveScreenshot('game-result.png');
});
