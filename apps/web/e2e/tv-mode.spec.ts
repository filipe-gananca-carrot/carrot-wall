import { expect, test } from '@playwright/test';

import { WALL_URL } from './base-url';

test.describe('/tv', () => {
  test('submitting a post makes it appear on /tv within one poll and page-turn cycle', async ({
    page,
  }) => {
    test.setTimeout(30_000);
    // Deliberately not "E2E post ..." (submit-post.spec.ts's prefix): Playwright's `hasText`
    // filter is a case-insensitive substring match, and two tests calling Date.now() in the
    // same parallel run can land on the same millisecond — "E2E post 123" is a substring of
    // "TV e2e post 123", so a colliding timestamp made that other test match this post's card
    // too. A distinct wording keeps the two messages from ever overlapping.
    const message = `Mensagem da projeção ${Date.now()}`;

    await page.goto('/post');
    await page.getByLabel('Mensagem').fill(message);
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page).toHaveURL(WALL_URL);

    await page.goto('/tv');
    await expect(page.locator('body')).toContainText(message, { timeout: 20_000 });
  });

  test('post message text renders at 32px or larger', async ({ page }) => {
    await page.goto('/tv');
    const message = page.locator('.post-card__message').first();
    await expect(message).toBeVisible({ timeout: 10_000 });
    const fontSize = await message.evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(fontSize)).toBeGreaterThanOrEqual(32);
  });

  test('the QR code is at least 180px in both dimensions', async ({ page }) => {
    await page.goto('/tv');
    const qr = page.locator('.tv-qr');
    await expect(qr).toBeVisible();
    const box = await qr.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(180);
    expect(box!.height).toBeGreaterThanOrEqual(180);
  });
});
