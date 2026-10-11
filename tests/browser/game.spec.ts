import { test, expect } from "@playwright/test";

test("launch, move, pause, resume, and run original audio without browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      errors.push(message.text());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).click();
  await expect(page.locator("#overlay")).toBeHidden();
  const canvas = await page.locator("canvas#game").boundingBox();
  await page.mouse.move(
    canvas!.x + canvas!.width * 0.75,
    canvas!.y + canvas!.height * 0.85,
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__jarkanoid.game.paddleX))
    .toBeCloseTo(1023 * 0.75, 0);
  await page.keyboard.press("p");
  await expect(
    page.getByRole("heading", { name: "On a break." }),
  ).toBeVisible();
  const ball = await page.evaluate(() =>
    JSON.stringify((window as any).__jarkanoid.game.balls),
  );
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(() =>
      JSON.stringify((window as any).__jarkanoid.game.balls),
    ),
  ).toBe(ball);
  await page.locator("#primary").click();
  await expect(page.locator("#overlay")).toBeHidden();
  await expect
    .poll(
      () =>
        page.evaluate(() => Boolean((window as any).__jarkanoid.sound.music)),
      { timeout: 15000 },
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test("all packs, level selection, and saved settings work", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).waitFor();
  await page.getByRole("button", { name: "Choose a level" }).click();
  await page.getByRole("button", { name: "Pack 3" }).click();
  await expect(page.locator("[data-level]")).toHaveCount(50);
  await page.locator('[data-level="50"]').click();
  await expect(page.locator("#level-title")).toHaveText("LEVEL 50");
  await expect(page.locator("#pack-label")).toHaveText("Pack 3");
  await page.getByRole("button", { name: "Game settings" }).click();
  await page.locator("#setting-speed").fill("500");
  await page.locator("#music-setting").uncheck();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Launch ball" }).waitFor();
  await expect(page.locator("#level-title")).toHaveText("LEVEL 50");
  await page.getByRole("button", { name: "Game settings" }).click();
  await expect(page.locator("#setting-speed")).toHaveValue("500");
  await expect(page.locator("#music-setting")).not.toBeChecked();
});

test("next level keeps score and lives; restart resets the session", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).click();
  await page.evaluate(() => {
    const g = (window as any).__jarkanoid.game;
    g.score = 1234;
    g.lives = 5;
    g.clear();
  });
  await page.getByRole("button", { name: "Next level" }).click();
  await expect(page.locator("#level-title")).toHaveText("LEVEL 02");
  await expect(page.locator("#score")).toHaveText("001234");
  await expect(page.locator("#lives")).toHaveText("05");
  await page.getByRole("button", { name: "Restart session" }).click();
  await page.getByRole("button", { name: "Restart this level" }).click();
  await expect(page.locator("#score")).toHaveText("000000");
  await expect(page.locator("#lives")).toHaveText("03");
  await expect(page.locator("#best")).toHaveText("001234");
});

test("every level image and sprite atlas decodes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).waitFor();
  const result = await page.evaluate(async () => {
    const paths: string[] = [];
    for (let pack = 0; pack < 3; pack++) {
      paths.push(`/assets/pack${pack}/sprites.png`);
      for (let level = 1; level <= (pack === 2 ? 50 : 30); level++)
        paths.push(
          `/assets/pack${pack}/level-${level}.jpg`,
          `/assets/pack${pack}/tile-${level}.png`,
        );
    }
    for (const path of paths) {
      const img = new Image();
      img.src = path;
      await img.decode();
    }
    return paths.length;
  });
  expect(result).toBe(223);
});

test("phone sized viewport has no overflow and accepts touch pointer movement", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).tap();
  const rect = await page.locator("#game").boundingBox();
  await page.touchscreen.tap(
    rect!.x + rect!.width * 0.3,
    rect!.y + rect!.height * 0.9,
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__jarkanoid.game.paddleX))
    .toBeCloseTo(307, -1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "22 bonuses. Learn the symbols" })
    .tap();
  await expect(page.locator(".bonus-item")).toHaveCount(22);
  await context.close();
});
