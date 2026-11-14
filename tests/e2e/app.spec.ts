import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const result = await page.request.post("/api/auth", { data: { username: process.env.APP_USERNAME ?? "test", password: process.env.APP_PASSWORD ?? "test-password" } });
  expect(result.ok()).toBe(true);
});

test("dashboard loads with metrics and chart", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Today's revenue")).toBeVisible();
  await expect(page.getByText(/₹/).first()).toBeVisible();
  await expect(page.getByText("30-day revenue")).toBeVisible({ timeout: 15000 });
});

test("agent answers expiry question with tool-backed data", async ({ page }) => {
  await page.goto("/ask");
  await page.getByPlaceholder("Ask anything about your store…").fill("What expires in the next 90 days?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByText(/expire within 90 days|No stock expires/).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/via get_expiring_stock/)).toBeVisible();
});

test("shelf map shows racks and finds a medicine", async ({ page }) => {
  await page.goto("/shelves");
  await expect(page.getByText("Rack A1").first()).toBeVisible({ timeout: 15000 });
  await page.getByPlaceholder("Find a medicine…").fill("Dolo");
  await expect(page.getByText(/Dolo/).first()).toBeVisible();
});

test("inventory grid lists medicines and opens new-stock dialog", async ({ page }) => {
  await page.goto("/inventory");
  await expect(page.getByText("Dolo 650mg").first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "New stock" }).click();
  await expect(page.getByText("New stock").nth(1)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("CSV bill import parses, confirms and adds stock", async ({ page }) => {
  test.skip(process.env.DEMO_MODE === "true", "Preview intentionally prevents writes");
  await page.goto("/import");
  const csv = "name,pack,batch,expiry,qty,mrp\nE2E Test Drug 500,strip of 10,E2E1,2027-06-30,40,99\n";
  await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles({
    name: "bill.csv", mimeType: "text/csv", buffer: Buffer.from(csv),
  });
  await expect(page.getByText("E2E Test Drug 500")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Confirm & add to stock" }).click();
  await expect(page.getByText(/Bill saved/)).toBeVisible({ timeout: 15000 });
});

test("bills page lists customer orders", async ({ page }) => {
  await page.goto("/bills");
  await expect(page.getByRole("heading", { name: "Every sale, all in one place." })).toBeVisible();
  await expect(page.getByText(/#\d/).first()).toBeVisible({ timeout: 15000 });
});

test("voice controls offer language, microphone and spoken replies", async ({ page }) => {
  await page.addInitScript(() => {
    class Recognition {
      lang = "en-IN"; interimResults = false;
      onresult?: (event: unknown) => void; onend?: () => void;
      start() { this.onresult?.({ results: [[{ transcript: "What is low on stock?" }]] }); this.onend?.(); }
      stop() { this.onend?.(); } abort() {}
    }
    Object.defineProperty(window, "SpeechRecognition", { value: Recognition });
  });
  await page.goto("/ask");
  await expect(page.getByLabel("Speak answers")).toBeVisible();
  await page.getByRole("button", { name: "Speak your question" }).click();
  await expect(page.getByPlaceholder("Ask anything about your store…")).toHaveValue("What is low on stock?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("via get_low_stock")).toBeVisible();
});

test("mobile navigation opens and dashboard does not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Inventory" }).click();
  await expect(page.getByRole("heading", { name: "A place for every medicine." })).toBeVisible();
});

test("demo is labeled and refuses writes", async ({ page }) => {
  test.skip(process.env.DEMO_MODE !== "true", "Only applies to the sample-data preview");
  await page.goto("/");
  await expect(page.getByText(/DEMO \/ Fictional sample data/)).toBeVisible();
  const result = await page.request.post("/api/stock", { data: { action: "delete", args: { medicineId: 1 } } });
  expect(result.status()).toBe(409);
  expect((await result.json()).error.code).toBe("demo_readonly");
});

test("sign-in form opens the workspace and sign-out clears the session", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/login");
  await page.getByLabel(/Username/).fill(process.env.APP_USERNAME ?? "test");
  await page.getByLabel(/Password/).fill(process.env.APP_PASSWORD ?? "test-password");
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("AI prepares stock changes and confirms them only after review", async ({ page }) => {
  await page.goto("/ask");
  const name = process.env.DEMO_MODE === "true" ? "Dolo 650mg" : `AI Browser ${Date.now()}`;
  await page.getByPlaceholder("Ask anything about your store…").fill(`Add 3 ${name} at MRP 25`);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText(/Stock addition prepared/)).toBeVisible();
  const confirm = page.getByRole("button", { name: "Confirm change" });
  if (process.env.DEMO_MODE === "true") await expect(confirm).toBeDisabled();
  else {
    const before = await page.request.get("/api/stock");
    expect((await before.json()).some((row: { name: string }) => row.name === name)).toBe(false);
    await confirm.click();
    await expect(page.getByText(/Confirmed and saved/)).toBeVisible();
    const after = await page.request.get("/api/stock");
    expect((await after.json()).find((row: { name: string }) => row.name === name).stock).toBe(3);
  }
});
