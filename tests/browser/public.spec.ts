import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});

test('mobile visitors can open a Local listing from the directory', async ({ page }) => {
  await page.goto('/local');
  const listing = page.getByRole('list', { name: 'Every place in the book' }).getByRole('link', { name: /Alberta Theatre Projects/ });
  await expect(listing).toBeVisible();
  const href = await listing.getAttribute("href");
  await listing.click();
  await expect(page).toHaveURL(new URL(href!, "http://127.0.0.1:4173").href);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test('a listing claim opens the organizer application', async ({ page }) => {
  await page.goto('/claim/biz-alberta-theatre-projects');
  const form = page.getByRole('form', { name: 'Organization claim application' });
  await expect(form).toBeVisible();
  await expect(form.getByRole('radiogroup', { name: 'Your role' })).toBeVisible();
});

test('the guest homepage loads without downloading the full discovery catalogue', async ({ page }) => {
  const scripts = new Set<string>();
  page.on('request', request => {
    if (request.resourceType() === 'script') scripts.add(new URL(request.url()).pathname);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect([...scripts].filter(path => /\/(discovery-inventory|SeoManager|AccountCompanion)-/.test(path))).toEqual([]);
});

test('search supports keyboard suggestions and a compact results view on mobile', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/search');
  await expect(page.getByRole('heading', { name: 'Find it in Calgary.' })).toBeVisible();
  const search = page.getByRole('combobox', { name: 'Search CalgaryWatch' });
  await search.fill('Beltl');
  await expect(page.getByRole('option', { name: /Beltline/ }).first()).toBeVisible();
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: /Results for.*beltline/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /See Beltline on the live map/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
});

test('mobile search uses its own artwork and quick answers advance one card', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/search');
  const artwork = page.locator('.sx-city img');
  await expect(artwork).toBeVisible();
  await expect.poll(() => artwork.evaluate(img => (img as HTMLImageElement).currentSrc)).toContain('search-calgary-pocket.webp');
  const rail = page.locator('.sx-starters');
  const previous = page.getByRole('button', { name: 'Previous quick answer' });
  await expect(previous).toBeDisabled();
  await page.getByRole('button', { name: 'Next quick answer' }).click();
  await expect(previous).toBeEnabled();
  expect(await rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(100);
  await previous.click();
  await expect(previous).toBeDisabled();
});

test('illustrated search shortcuts link to the content they describe', async ({ page }) => {
  await page.goto('/search');
  const explore = page.getByRole('region', { name: 'Where to?' });
  for (const [label, href] of [
    ['Check your area', '/check-your-community'],
    ['Make weekend plans', '/events/this-weekend'],
    ['Open the live map', '/map'],
  ]) {
    await expect(explore.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('href', href);
  }
  await explore.getByRole('link', { name: /Make weekend plans/ }).click();
  await expect(page).toHaveURL(/\/events\/this-weekend$/);
});

test('the Bow explorer switches neighbourhood stories and starts a real search', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/search');
  const atlas = page.getByRole('region', { name: 'Follow the Bow' });
  const pin = atlas.getByRole('button', { name: 'Inglewood' });
  await pin.focus();
  await pin.press('Enter');
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await expect(atlas.getByRole('heading', { name: 'Inglewood' })).toBeVisible();
  await expect(atlas.locator('img')).toHaveAttribute('src', /search-atlas-inglewood/);
  await atlas.getByRole('link', { name: 'Search Inglewood' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Results for.*inglewood/i })).toBeVisible();
});
