import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base = process.env.SCREENSHOT_URL ?? 'http://127.0.0.1:3103';
if (!process.env.APP_USERNAME || !process.env.APP_PASSWORD) throw new Error('Provide screenshot login credentials for a disposable sample database');
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
try {
  await mkdir('docs/screenshots', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  await page.goto(`${base}/login`);
  await page.screenshot({ path: 'docs/screenshots/login.png', fullPage: true });
  const response = await page.request.post(`${base}/api/auth`, { data: { username: process.env.APP_USERNAME, password: process.env.APP_PASSWORD } });
  if (!response.ok()) throw new Error('Screenshot authentication failed');
  for (const [route, name, selector] of [
    ['/', 'dashboard', "Today's revenue"], ['/inventory', 'inventory', 'Dolo 650mg'], ['/shelves', 'shelves', 'Rack A1'], ['/ask', 'voice-assistant', 'What would make your day easier?'], ['/import', 'import', 'A new delivery deserves a fresh start.'],
  ]) {
    await page.goto(`${base}${route}`);
    await page.getByText(selector, { exact: true }).first().waitFor();
    await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/`);
  await page.getByText("Today's revenue", { exact: true }).waitFor();
  await page.screenshot({ path: 'docs/screenshots/mobile.png', fullPage: true });
  console.log('Saved seven actual-product screenshots');
} finally { await browser.close(); }
