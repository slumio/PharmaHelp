import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  const response = await page.request.post("/api/auth", {
    data: {
      username: process.env.APP_USERNAME ?? "test",
      password: process.env.APP_PASSWORD ?? "test-password-long-enough",
    },
  });
  expect(response.ok()).toBe(true);
});
test("spoken answers wait for delayed device voices and play", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const events = new EventTarget();
    let ready = false;
    const spoken: string[] = [];
    Object.defineProperty(window, "__spoken", { value: spoken });
    class Utterance {
      text: string;
      onstart?: () => void;
      onend?: () => void;
      constructor(text: string) {
        this.text = text;
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: Utterance,
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () =>
          ready
            ? [
                {
                  voiceURI: "test-en",
                  name: "Test English",
                  lang: "en-IN",
                  default: true,
                },
              ]
            : [],
        addEventListener: events.addEventListener.bind(events),
        removeEventListener: events.removeEventListener.bind(events),
        cancel() {},
        resume() {},
        speak(value: Utterance) {
          spoken.push(value.text);
          value.onstart?.();
          setTimeout(() => value.onend?.(), 50);
        },
      },
    });
    Object.defineProperty(window, "__loadVoices", {
      value: () => {
        ready = true;
        events.dispatchEvent(new Event("voiceschanged"));
      },
    });
  });
  await page.goto("/ask");
  await page.getByRole("button", { name: /Check your stock/ }).click();
  const speaker = page.getByRole("button", { name: "Read answer aloud" });
  await expect(speaker).toBeVisible();
  await speaker.click();
  await page.evaluate(() =>
    (window as unknown as { __loadVoices: () => void }).__loadVoices(),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __spoken: string[] }).__spoken.join(""),
      ),
    )
    .toContain("minimum stock");
});

test("missing device voices display an actionable error", async ({ page }) => {
  await page.addInitScript(() => {
    const events = new EventTarget();
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [],
        addEventListener: events.addEventListener.bind(events),
        removeEventListener: events.removeEventListener.bind(events),
        cancel() {},
        resume() {},
        speak() {},
      },
    });
  });
  await page.goto("/ask");
  await page.getByRole("button", { name: /Check your stock/ }).click();
  await page.getByRole("button", { name: "Read answer aloud" }).click();
  await expect(page.getByText(/No device voice is available/)).toBeVisible();
});
