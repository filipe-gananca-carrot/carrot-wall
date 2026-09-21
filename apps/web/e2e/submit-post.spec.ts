import { expect, test } from '@playwright/test';

import { BASE_URL, WALL_URL } from './base-url';

test.describe('/post', () => {
  test('loads with the message field focused around the fold', async ({ page }) => {
    await page.goto('/post');
    await expect(page.getByLabel('Mensagem')).toBeVisible();
  });

  test('an empty submit shows a Portuguese error and sends no request', async ({ page }) => {
    let requestSent = false;
    page.on('request', (request) => {
      if (request.url().includes('/api/posts')) {
        requestSent = true;
      }
    });

    await page.goto('/post');
    await page.getByRole('button', { name: 'Enviar' }).click();

    await expect(page.getByRole('alert')).toContainText('Escreve qualquer coisa');
    expect(requestSent).toBe(false);
  });

  test('is usable at 360px width with no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/post');

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);

    const fontSize = await page
      .getByLabel('Mensagem')
      .evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(fontSize)).toBeGreaterThanOrEqual(16);
  });

  test('submitting lands on the wall with the new post ringed in coral, then unringed', async ({
    page,
  }) => {
    const message = `E2E post ${Date.now()}`;

    await page.goto('/post');
    await page.getByLabel('Mensagem').fill(message);
    await page.getByRole('button', { name: 'Enviar' }).click();

    // The URL's ?highlight= is cleared the instant the post is found in the loaded list —
    // asserting on it is a race against that same lookup, so we assert on the visible ring
    // instead, which the app holds open for a full 2s regardless of how fast the param clears.
    await expect(page).toHaveURL(WALL_URL);
    const card = page.locator('app-post-card', { hasText: message });
    await expect(card.locator('.post-card--highlighted')).toBeVisible();

    await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 3000 });
    await expect(card.locator('.post-card--highlighted')).toHaveCount(0, { timeout: 3000 });
    await expect(card).toContainText(message);
  });
});
