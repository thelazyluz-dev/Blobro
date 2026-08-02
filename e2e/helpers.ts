import type { Page } from '@playwright/test';

// Sign-in is mandatory (AUTH_REQUIRED in src/config.ts), so any test that wants
// to reach the game has to get past the gate first.
//
// We do that by stubbing the one request the app actually makes — /auth/me —
// rather than by adding a bypass flag to the app. The gate logic in App.tsx
// then runs completely unmodified and simply sees a signed-in player, which is
// the behaviour we want to be testing.
export async function signIn(
  page: Page,
  user = { id: 'e2e-user', email: 'e2e@example.com', displayName: 'טֶסְט' },
): Promise<void> {
  await page.route('**/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) }),
  );
}

// The inverse: the server definitively says "no session". A 401 (rather than a
// network failure) is what makes the client drop a cached user — see
// fetchMe in src/net/auth.ts — so this is what puts the gate on screen.
export async function signedOut(page: Page): Promise<void> {
  await page.route('**/auth/me', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'unauthenticated' }),
    }),
  );
}

// First launch (no localStorage yet) shows a "pick a nickname" welcome modal
// that would otherwise sit on top of the blob and eat every tap.
export async function dismissNicknameWelcome(page: Page): Promise<void> {
  const later = page.getByRole('button', { name: 'אַחַר כָּךְ' });
  try {
    await later.waitFor({ state: 'visible', timeout: 5000 });
    await later.click();
  } catch {
    // Modal never appeared (e.g. leaderboard disabled) — nothing to dismiss.
  }
}
