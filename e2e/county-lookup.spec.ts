import { expect, test } from '@playwright/test';

/**
 * 03 §17: "County lookup: pick AZ → Apache → first road → `<20%` → tiles appear,
 * caption present, both money rows present."
 *
 * The assertions are on the two things the mockup got wrong and the architecture
 * corrected: the second tile is a median rather than a mean, and both money
 * figures are shown rather than one labelled "average cost".
 */
test('county statistics for Apache County, class A1', async ({ page }) => {
  await page.goto('/');

  // The spinner clears once every blocking request has settled.
  await expect(page.getByText('Loading map layers…')).toBeHidden({ timeout: 30_000 });

  await page.locator('#county-state').selectOption('04');
  await page.locator('#county-county').selectOption('04001');
  await page.locator('#county-road').selectOption('0');
  await page.getByRole('button', { name: '< 20%' }).click();

  // Depth tiles: min and median, from county_stats.json.
  const results = page.locator('.query-body');
  await expect(results.getByText('Min depth')).toBeVisible();
  await expect(results.getByText('Median depth')).toBeVisible();
  await expect(results.getByText('Avg depth')).toHaveCount(0);

  // Known values for Apache A1.
  await expect(results.getByText('328,290 ac')).toBeVisible();
  await expect(results.getByText('2,644,831 t')).toBeVisible();

  // Both money figures, in USD per tonne CO2e — never "$/dry ton".
  await expect(results.getByText('Forestry treatment')).toBeVisible();
  await expect(results.getByText('$17.17 / tCO₂e')).toBeVisible();
  await expect(results.getByText('Burial pathway net income')).toBeVisible();
  await expect(results.getByText('$26.93 / tCO₂e')).toBeVisible();
  await expect(results.getByText('/ dry ton')).toHaveCount(0);

  // The scope caption is rendered from meta.depth_scope and is not optional.
  await expect(
    results.getByText('Depth figures are for the whole county, not the selected accessibility class.'),
  ).toBeVisible();

  await expect(results.getByText('A1 · 0–500 ft from road, <20% slope')).toBeVisible();
});

test('a county outside the residue model is offered but not selectable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Loading map layers…')).toBeHidden({ timeout: 30_000 });

  await page.locator('#county-state').selectOption('04');

  // La Paz is in the list, disabled, with the reason as its label suffix.
  const laPaz = page.locator('#county-county option[value="04012"]');
  await expect(laPaz).toHaveCount(1);
  await expect(laPaz).toBeDisabled();
  await expect(laPaz).toHaveAttribute('title', 'Not in the residue model');
});

test('the shareable URL carries the county query', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Loading map layers…')).toBeHidden({ timeout: 30_000 });

  await page.locator('#county-state').selectOption('16');
  await page.locator('#county-road').selectOption('2');
  await page.getByRole('button', { name: '20–40%' }).click();

  await expect.poll(() => new URL(page.url()).searchParams.get('st')).toBe('16');
  const params = new URL(page.url()).searchParams;
  expect(params.get('rd')).toBe('2');
  expect(params.get('sl')).toBe('1');
  expect(params.get('mode')).toBe('county');
  // The camera IS serialised now, as clat/clng/cz (04_BUILD_PLAN §5.8), which
  // reversed '03 §7'. These are the older param names that reversal did not
  // introduce: none of them should ever appear, whatever the camera policy is.
  for (const stale of ['zoom', 'z', 'lat0', 'center', 'bearing', 'pitch']) {
    expect(params.has(stale)).toBe(false);
  }
});
