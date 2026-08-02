import { expect, test } from '@playwright/test';
import { dismissNicknameWelcome, signIn, signedOut } from './helpers';

// Sign-in is mandatory (AUTH_REQUIRED, src/config.ts). These two tests are the
// pair that matters: a signed-out visitor must NOT reach the game, and a
// signed-in one must reach it with nothing in the way. Neither uses a bypass
// flag — both drive the real gate in src/App.tsx through /auth/me.

test('signed out: the gate replaces the game, and Google is the only way in', async ({ page }) => {
  await signedOut(page);
  await page.goto('/');

  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
  // Google is the ONLY sign-in route offered (see src/ui/AuthGate.tsx: there is
  // no password-reset flow, so we don't hand out passwords we can't recover).
  await expect(page.getByRole('link', { name: /Google/ })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  // The game itself must be unreachable behind the gate.
  await expect(page.getByRole('button', { name: 'לחיצה על הבלוב' })).toHaveCount(0);
});

test('signed in: no gate, the game loads and is playable', async ({ page }) => {
  await signIn(page);
  await page.goto('/');
  await dismissNicknameWelcome(page);

  const blob = page.getByRole('button', { name: 'לחיצה על הבלוב' });
  await expect(blob).toBeVisible();
  await expect(page.getByRole('link', { name: /Google/ })).toHaveCount(0);

  const counter = page.getByRole('button', { name: 'מקרא מספרים' });
  const before = await counter.innerText();
  for (let i = 0; i < 6; i++) await blob.click({ force: true });
  await expect(counter).not.toHaveText(before);
});
