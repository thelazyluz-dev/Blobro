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
  // landed a little high opened a modal instead of scoring. Guard the fix:
  // the counter must not be clickable, and the legend must live elsewhere.
  const counter = page.getByRole('status', { name: 'מוֹנֶה גּוּ' });
  await expect(counter).toBeVisible();
  await expect(counter).not.toHaveAttribute('type', 'button');

  const legend = page.getByRole('button', { name: 'מקרא מספרים' });
  await expect(legend).toBeVisible();

  // And the legend must be BELOW the blob, not stacked on top of it.
  const blobBox = (await page.getByRole('button', { name: 'לחיצה על הבלוב' }).boundingBox())!;
  const legendBox = (await legend.boundingBox())!;
  expect(legendBox.y, 'the legend button overlaps the blob tap area').toBeGreaterThan(blobBox.y + blobBox.height);
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
