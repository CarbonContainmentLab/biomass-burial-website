import { expect, test } from '@playwright/test';

/**
 * 03 §17: "Site search: paste a known coordinate, radius 50, assert a result card
 * containing 'Straight-line' and not 'Network'."
 *
 * The absent word is the point. The mockup reported a "Network distance" computed
 * by multiplying the straight-line figure by 1.28; this test is what stops that
 * coming back.
 */
test('site search reports straight-line distance and never network distance', async ({ page }) => {
  await page.goto('/?mode=site');
  await expect(page.getByText('Loading map layers…')).toBeHidden({ timeout: 30_000 });

  await page.locator('#site-lat').fill('44.0500');
  await page.locator('#site-lng').fill('-116.1000');
  await page.locator('#site-radius').selectOption('50');

  const find = page.getByRole('button', { name: 'Find best burial site' });
  await expect(find).toBeEnabled();
  await find.click();

  const panel = page.locator('.query-body');
  await expect(panel.getByText('Best burial site', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText('Feasible', { exact: true })).toBeVisible();
  await expect(panel.getByText('Required cover')).toBeVisible();
  await expect(panel.getByText('Straight-line distance')).toBeVisible();

  // Nowhere in the rendered page, not merely nowhere in the card.
  await expect(page.locator('body')).not.toContainText('Network');
});

test('the origin marker is drawn from a valid coordinate before any search', async ({ page }) => {
  await page.goto('/?mode=site');
  await expect(page.getByText('Loading map layers…')).toBeHidden({ timeout: 30_000 });

  // Nothing entered: the empty state directs rather than apologises.
  await expect(
    page.getByText('Click the map or enter coordinates to find the nearest feasible burial site.'),
  ).toBeVisible();

  await page.locator('#site-lat').fill('44.0500');
  await page.locator('#site-lng').fill('-116.1000');

  // Committing the coordinate is what puts it in the shareable URL, and it
  // happens without pressing the button.
  await expect.poll(() => new URL(page.url()).searchParams.get('lat')).toBe('44.05');
  expect(new URL(page.url()).searchParams.get('lng')).toBe('-116.1');
  await expect(page.getByRole('button', { name: 'Find best burial site' })).toBeEnabled();
});

test('a coordinate outside the study area is refused with guidance', async ({ page }) => {
  await page.goto('/?mode=site');
  await expect(page.getByText('Loading map layers…')).toBeHidden({ timeout: 30_000 });

  await page.locator('#site-lat').fill('51.5');
  await page.locator('#site-lng').fill('-0.12');

  await expect(page.getByText(/Enter a latitude between 31 and 49/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find best burial site' })).toBeDisabled();
});

/**
 * At the 25% scenario the shipped file has 17 facilities across eleven states, so
 * "no facility in range" is the ordinary answer at a small radius. It is a result,
 * not an error, and it has to read as information.
 */
test('no BECCS facility in range is presented as a finding', async ({ page }) => {
  await page.goto('/?mode=site&beccs=1&r=10');
  await expect(page.getByText('Loading map layers…')).toBeHidden({ timeout: 30_000 });

  await page.locator('#site-lat').fill('44.0500');
  await page.locator('#site-lng').fill('-116.1000');
  await page.getByRole('button', { name: 'Find best burial site' }).click();

  const beccs = page.locator('.query-body');
  await expect(beccs.getByText('Nearest BECCS facility', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(beccs.getByText(/No modeled BECCS facility within 10 miles/)).toBeVisible();
  await expect(beccs.getByText('25% scenario')).toBeVisible();
});
