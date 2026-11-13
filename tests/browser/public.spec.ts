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
