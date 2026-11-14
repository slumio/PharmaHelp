import { test, expect } from "@playwright/test";

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
  await expect(page.getByText("Customer bills")).toBeVisible();
  await expect(page.getByText(/#/).first()).toBeVisible({ timeout: 15000 });
});
