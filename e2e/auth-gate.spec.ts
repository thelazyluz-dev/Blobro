import { expect, test } from '@playwright/test';
import { parentQuestions } from '../src/ui/parentGate';
import { dismissNicknameWelcome, signIn, signedOut } from './helpers';

// Sign-in is mandatory (AUTH_REQUIRED, src/config.ts). These two tests are the
// pair that matters: a signed-out visitor must NOT reach the game, and a
// signed-in one must reach it with nothing in the way. Neither uses a bypass
// flag — both drive the real gate in src/App.tsx through /auth/me.

test('signed out: the parental gate guards the only way in', async ({ page }) => {
  await signedOut(page);
  await page.goto('/');

  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15000 });
  // Step 0: no sign-in route is reachable before the parent step — and there
  // is still no password form anywhere (Google is the only route, see
  // src/ui/AuthGate.tsx).
  await expect(page.getByRole('link', { name: /Google/ })).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByRole('button', { name: /אֲנִי הַהוֹרֶה/ }).click();

  // Step 1: a wrong answer does not open the gate.
  const input = page.getByRole('textbox', { name: 'תשובה לשאלת ההורים' });
  await input.fill('1');
  await page.getByRole('button', { name: 'בְּדִיקָה' }).click();
  await expect(page.getByRole('link', { name: /Google/ })).toHaveCount(0);

  // Step 2: read the (worded, digit-free) question off the screen and answer
  // it like a parent would. The answers live in code, never in the DOM.
  const text = await page.getByRole('dialog').innerText();
  const q = parentQuestions.find((c) => text.includes(c.textHe));
  expect(q).toBeTruthy();
  await input.fill(String(q!.answer));
  await page.getByRole('button', { name: 'בְּדִיקָה' }).click();
  await expect(page.getByRole('link', { name: /Google/ })).toBeVisible();

  // The game itself must be unreachable behind the gate throughout.
  await expect(page.getByRole('button', { name: 'לחיצה על הבלוב' })).toHaveCount(0);
});

test('signed in: no gate, the game loads and is playable', async ({ page }) => {
  await signIn(page);
  await page.goto('/');
  await dismissNicknameWelcome(page);

  const blob = page.getByRole('button', { name: 'לחיצה על הבלוב' });
  await expect(blob).toBeVisible();
  await expect(page.getByRole('link', { name: /Google/ })).toHaveCount(0);

  const counter = page.getByRole('status', { name: 'מוֹנֶה גּוּ' });
  const before = await counter.innerText();
  for (let i = 0; i < 6; i++) await blob.click({ force: true });
  await expect(counter).not.toHaveText(before);
});
