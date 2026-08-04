import { expect, test, type Page } from '@playwright/test';
import { dismissNicknameWelcome, signIn } from './helpers';

// This is a Hebrew RTL app; nav labels and copy carry nikud, so selectors
// below use the exact on-screen strings (see src/ui/*) rather than guessing.

// Milestone / unlock / hatch celebration overlays are goo- and click-gated far
// above what these smoke tests reach, but if one ever slips through (e.g. a
// carried-over dev build with lower thresholds), clear it via its own dismiss
// button rather than let it block the rest of the test.
async function dismissAnyCelebration(page: Page): Promise<void> {
  const dialog = page.locator('[role="dialog"]').first();
  if (!(await dialog.isVisible().catch(() => false))) return;
  for (const label of ['יֵשׁ!', 'סְגוֹר', 'הֵבַנְתִּי']) {
    const btn = dialog.getByRole('button', { name: label });
    if (await btn.first().isVisible().catch(() => false)) {
      await btn.first().click();
      return;
    }
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page); // sign-in is mandatory — see e2e/helpers.ts
  await page.goto('/');
  await dismissNicknameWelcome(page);
  await dismissAnyCelebration(page);
});

test('app loads and the goo counter is visible', async ({ page }) => {
  const counter = page.getByRole('status', { name: 'מוֹנֶה גּוּ' });
  await expect(counter).toBeVisible();
});

test('the goo counter is not a tap target — it sits right above the blob', async ({ page }) => {
  // It used to be a ~200x96 button opening the number legend, so a tap that
  // landed a little high opened a modal instead of scoring. The legend now
  // lives inside the info panel ("מידע על ההכנסות"), nowhere near the blob at
  // all — guard the fix: the counter must not be clickable.
  const counter = page.getByRole('status', { name: 'מוֹנֶה גּוּ' });
  await expect(counter).toBeVisible();
  await expect(counter).not.toHaveAttribute('type', 'button');

  const blobBox = (await page.getByRole('button', { name: 'לחיצה על הבלוב' }).boundingBox())!;
  const counterBox = (await counter.boundingBox())!;
  const overlaps = counterBox.y < blobBox.y + blobBox.height && counterBox.y + counterBox.height > blobBox.y;
  expect(overlaps, 'the counter overlaps the blob tap area').toBe(false);
});

test('the number legend opens from the info panel, not the top bar', async ({ page }) => {
  // Guards its new home (§ top-bar restructure): the info panel's "what do
  // these numbers mean" row opens the same legend overlay that used to be a
  // standalone top-bar button.
  await expect(page.getByRole('button', { name: 'מקרא מספרים' })).toHaveCount(0);

  await page.getByRole('button', { name: 'מידע על ההכנסות' }).click();
  await page.getByRole('button', { name: 'מַה זֶּה K, M, B…?' }).click();
  await expect(page.getByText('מַקְרָא מִסְפָּרִים')).toBeVisible();
});

test('tapping the main blob increases the goo value', async ({ page }) => {
  const counter = page.getByRole('status', { name: 'מוֹנֶה גּוּ' });
  const blob = page.getByRole('button', { name: 'לחיצה על הבלוב' });
  await expect(blob).toBeVisible();

  const before = await counter.innerText();
  for (let i = 0; i < 6; i++) {
    await blob.click({ force: true });
  }
  await expect(counter).not.toHaveText(before);
});

test('all five bottom-nav tabs open without error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  const screens: Array<{ tab: string; heading: string }> = [
    { tab: 'בְּקִיעָה', heading: 'בְּקִיעָה' },
    { tab: 'בְּלוֹבִּים', heading: 'הַבְּלוֹבִּים שֶׁלִּי' },
    { tab: 'שְׁדְרוּג', heading: 'שְׁדְרוּגִים' },
    { tab: 'חֲנוּת', heading: 'חֲנוּת' },
    { tab: 'לְחִיצָה', heading: null }, // back to the click screen, no <h1> there
  ];

  for (const { tab, heading } of screens) {
    await page.getByRole('button', { name: tab }).click();
    if (heading) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'לחיצה על הבלוב' })).toBeVisible();
    }
  }

  expect(errors).toEqual([]);
});

test('the info button opens the info panel', async ({ page }) => {
  await page.getByRole('button', { name: 'מידע על ההכנסות' }).click();
  await expect(page.getByText('הַמִּידָע שֶׁלִּי')).toBeVisible();
});

test('/how-to-play.html and /privacy.html load with real content', async ({ page }) => {
  for (const path of ['/how-to-play.html', '/privacy.html']) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} status`).toBe(200);
    const html = await page.content();
    expect(html.length).toBeGreaterThan(200);
  }
});

test('the hatch screen fits above the nav on small phones', async ({ page }) => {
  // The buy buttons and the "still needed" line used to render UNDER the bottom
  // bar on short screens — on a 320x568 the screen was unplayable. The egg was
  // pinned at 210px and the flex column had no min-h-0, so nothing could
  // shrink and the content simply spilled.
  for (const size of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(size);
    await page.getByRole('button', { name: 'בְּקִיעָה' }).click();
    await expect(page.getByRole('heading', { name: 'בְּקִיעָה' })).toBeVisible();

    const navBox = (await page.locator('nav').boundingBox())!;
    const buy = page.getByRole('button', { name: 'קְנֵה בֵּיצָה' });
    const buyBox = (await buy.boundingBox())!;

    expect(
      buyBox.y + buyBox.height,
      `buy button runs under the nav at ${size.width}x${size.height}`,
    ).toBeLessThanOrEqual(navBox.y + 1);
  }
});

test('the bottom nav keeps a large touch target while staying compact', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const navBox = (await page.locator('nav').boundingBox())!;
  // Compact enough not to crowd a short screen...
  expect(navBox.height).toBeLessThan(70);
  // ...but every tab still comfortably above the 44px minimum touch target.
  const tabs = page.locator('nav button');
  for (let i = 0; i < (await tabs.count()); i++) {
    const b = (await tabs.nth(i).boundingBox())!;
    expect(b.height, `nav tab ${i} is too small to tap`).toBeGreaterThanOrEqual(44);
    expect(b.width, `nav tab ${i} is too narrow to tap`).toBeGreaterThanOrEqual(44);
  }
});

test('the number legend is visible the moment it is opened', async ({ page }) => {
  // It opens from inside the info panel, and both overlays sit at z-40 — so it
  // used to render behind the panel that launched it, invisible until the
  // player closed the thing they were already looking at.
  await page.getByRole('button', { name: 'מידע על ההכנסות' }).click();
  await page.getByRole('button', { name: /K, M, B/ }).click();

  await expect(page.getByText('מַקְרָא מִסְפָּרִים')).toBeVisible();
  // Exactly one sheet on screen: two stacked modals would give a child two
  // close buttons and no idea which one goes back.
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
});

test('the daily gift is waiting on a fresh day, and claiming it pays out', async ({ page }) => {
  // The come-back-tomorrow loop (v14): a fresh save has never claimed, so the
  // top-bar gift button must carry a waiting badge, the panel must open, and
  // one tap must grant the day-1 gift and flip the button to the
  // come-back-tomorrow state, which now previews tomorrow's reward ("מָחָר: …").
  // The waiting badge makes the button breathe, and an animating element is
  // never "stable" enough to click — the same trap the tripwires doc records.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const daily = page.getByRole('button', { name: 'מתנה יומית ומשימות' });
  await expect(daily).toContainText('1'); // something is waiting
  await daily.click();

  await expect(page.getByText('מַתָּנָה יוֹמִית')).toBeVisible();
  await page.getByRole('button', { name: /לָקַחַת אֶת הַמַּתָּנָה/ }).click();

  // Claimed: the CTA flips to the tomorrow-preview state and the quests list shows.
  await expect(page.getByRole('button', { name: /מָחָר:/ })).toBeVisible();
  await expect(page.getByText('הַמְּשִׂימוֹת שֶׁל הַיּוֹם')).toBeVisible();
});
