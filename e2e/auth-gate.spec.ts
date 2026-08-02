import { expect, test, type Page } from '@playwright/test';

// PR 3b: proves the mandatory-login gate stays OFF by default (the game must
// keep working — AUTH_REQUIRED defaults to false, see src/config.ts) and, via
// a test-only escape hatch (see src/App.tsx's __FORCE_AUTH_GATE__), that the
// gate itself actually renders when the flag would be on.

async function dismissNicknameWelcome(page: Page): Promise<void> {
  const later = page.getByRole('button', { name: 'אַחַר כָּךְ' });
  try {
    await later.waitFor({ state: 'visible', timeout: 5000 });
    await later.click();
  } catch {
    // Modal never appeared (e.g. leaderboard disabled) — nothing to dismiss.
  }
}

test('AUTH_REQUIRED is false by default: no gate ever appears, the game loads and is playable', async ({ page }) => {
  await page.goto('/');
  await dismissNicknameWelcome(page);

  const blob = page.getByRole('button', { name: 'לחיצה על הבלוב' });
  await expect(blob).toBeVisible();
  await expect(page.getByRole('button', { name: 'הַרְשָׁמָה' })).toHaveCount(0);

  const counter = page.getByRole('button', { name: 'מקרא מספרים' });
  const before = await counter.innerText();
  for (let i = 0; i < 6; i++) await blob.click({ force: true });
  await expect(counter).not.toHaveText(before);
});

test('forcing the gate on renders the sign-in screen instead of the game', async ({ page }) => {
  // Short-circuit the background /auth/me revalidation so authChecked flips
  // deterministically and fast, regardless of real network conditions.
  await page.route('**/auth/me', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthenticated' }) }),
  );
  await page.addInitScript(() => {
    (window as unknown as { __FORCE_AUTH_GATE__?: boolean }).__FORCE_AUTH_GATE__ = true;
  });

  await page.goto('/');

  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'הַרְשָׁמָה' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'הִתְחַבְּרוּת' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Google/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'לחיצה על הבלוב' })).toHaveCount(0);
});
