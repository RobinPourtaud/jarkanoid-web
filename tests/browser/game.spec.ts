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
    .toBeCloseTo(1024 * 0.75, 0);
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
  await expect(page.locator("#overlay")).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean((window as any).__jarkanoid.transition)),
    )
    .toBe(true);
  await expect(page.locator("#level-title")).toHaveText("LEVEL 02");
  await expect(page.getByRole("button", { name: "Launch ball" })).toBeVisible();
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

test("all nine original cinematics render, seek, pause, and return to the game", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).click();
  await page.getByRole("button", { name: "Original 3D scenes" }).click();
  await expect(page.locator("#cinema-toggle")).toBeEnabled();
  const gameBefore = await page.evaluate(() =>
    JSON.stringify((window as any).__jarkanoid.game.balls),
  );
  for (let pack = 0; pack < 3; pack++) {
    await page.locator("#cinema-pack").selectOption(String(pack));
    for (const scene of ["intro", "outro", "youwon"]) {
      await page.locator("#cinema-scene").selectOption(scene);
      await expect(page.locator("#cinema-status")).toContainText(
        "original models",
      );
      await page
        .getByRole("button", { name: "Pause scene", exact: true })
        .click();
      const frame = await page.locator("#cinema-seek").inputValue();
      await page.waitForTimeout(120);
      await expect(page.locator("#cinema-seek")).toHaveValue(frame);
      const pixels = await page.evaluate(() => {
        const player = (window as any).__jarkanoid.cinema;
        const gl = player.canvas.getContext("webgl");
        let lit = 0;
        const data = new Uint8Array(1024 * 768 * 4);
        for (const fraction of [0.1, 0.25, 0.5, 0.75]) {
          player.frame = player.scene.frames * fraction;
          player.render();
          gl.readPixels(0, 0, 1024, 768, gl.RGBA, gl.UNSIGNED_BYTE, data);
          for (let i = 0; i < data.length; i += 64)
            if (data[i] + data[i + 1] + data[i + 2] > 20) lit++;
        }
        return { lit, error: gl.getError() };
      });
      expect(pixels.error).toBe(0);
      expect(pixels.lit, `${pack}/${scene} renders geometry`).toBeGreaterThan(
        50,
      );
      await page.locator("#cinema-seek").fill("60");
      await expect(page.locator("#cinema-time")).toContainText("1.0 /");
    }
  }
  expect(
    await page.evaluate(() =>
      JSON.stringify((window as any).__jarkanoid.game.balls),
    ),
  ).toBe(gameBefore);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator("#overlay")).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => (window as any).__jarkanoid.game.phase))
    .toBe("playing");
  expect(errors).toEqual([]);
});

test("game over restarts at level one of the same pack with a fresh score and lives", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).waitFor();
  await page.evaluate(async () => {
    const app = (window as any).__jarkanoid;
    await app.load(2, 17);
    app.game.score = 5432;
    app.game.lives = 1;
    app.game.loseLife();
  });
  await expect(
    page.getByRole("heading", { name: "Game over.", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start from level 1" }).click();
  await expect(page.locator("#pack-label")).toHaveText("Pack 3");
  await expect(page.locator("#level-title")).toHaveText("LEVEL 01");
  await expect(page.locator("#score")).toHaveText("000000");
  await expect(page.locator("#lives")).toHaveText("03");
  await expect(page.locator("#best")).toHaveText("005432");
  await page.reload();
  await expect(page.locator("#level-title")).toHaveText("LEVEL 01");
});

test("old default bonus settings migrate to native defaults and zero frequency persists", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("jarkanoid3-v1"))
      localStorage.setItem(
        "jarkanoid3-v1",
        JSON.stringify({ settings: { bonusRate: 0.16, maxBonuses: 6 } }),
      );
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).waitFor();
  await page.getByRole("button", { name: "Game settings" }).click();
  await expect(page.locator("#setting-bonusFrequency")).toHaveValue("5");
  await expect(page.locator("#setting-maxBonuses")).toHaveValue("3");
  await page.locator("#setting-bonusFrequency").fill("0");
  await page.reload();
  await page.getByRole("button", { name: "Launch ball" }).waitFor();
  await page.getByRole("button", { name: "Game settings" }).click();
  await expect(page.locator("#setting-bonusFrequency")).toHaveValue("0");
});

test("descended bricks retain their original pixels and recovered combat sprites render", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).waitFor();
  const result = await page.evaluate(() => {
    const { game: g, renderer: r } = (window as any).__jarkanoid;
    const cells = Array(1054).fill(0);
    cells[0] = 1;
    cells[2] = 1;
    g.load({ number: 1, cells });
    g.applyBonus(4);
    g.pause();
    r.render(g);
    const source = document.createElement("canvas");
    source.width = 33;
    source.height = 20;
    const c = source.getContext("2d")!;
    c.drawImage(r.art.bricks, 0, 0, 33, 20, 0, 0, 33, 20);
    const original = Array.from(c.getImageData(0, 0, 33, 20).data);
    const moved = Array.from(
      r.canvas.getContext("2d").getImageData(0, 20, 33, 20).data,
    );
    g.lightning = { index: 31, age: 0.3 };
    g.shots = [{ x: 500, y: 500 }];
    r.render(g);
    return {
      original,
      moved,
      lightningSprite: r.art.atlas["ORAGE/1"],
      bulletSprite: r.art.atlas["BULLET/31"],
    };
  });
  expect(result.moved).toEqual(result.original);
  expect(result.lightningSprite.slice(2)).toEqual([17, 335]);
  expect(result.bulletSprite.slice(2)).toEqual([1, 10]);
});

test("native physics migration and linked speed controls survive reload", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("physics-fixture")) return;
    sessionStorage.setItem("physics-fixture", "1");
    localStorage.setItem(
      "jarkanoid3-v1",
      JSON.stringify({
        rulesVersion: 2,
        best: 9000,
        settings: { speed: 390, acceleration: 4, bonusSpeed: 105 },
      }),
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).waitFor();
  await page.getByRole("button", { name: "Game settings" }).click();
  await expect(page.locator("#setting-speed")).toHaveValue("180");
  await expect(page.locator("#setting-maxSpeed")).toHaveValue("780");
  await expect(page.locator("#setting-bonusGravity")).toHaveValue("360");
  await page.locator("#setting-speed").fill("900");
  await expect(page.locator("#setting-maxSpeed")).toHaveValue("900");
  await page.locator("#setting-maxSpeed").fill("600");
  await expect(page.locator("#setting-speed")).toHaveValue("600");
  await page.reload();
  await page.getByRole("button", { name: "Launch ball" }).waitFor();
  const saved = await page.evaluate(() => ({
    settings: (window as any).__jarkanoid.game.settings,
    best: JSON.parse(localStorage.getItem("jarkanoid3-v1")!).best,
  }));
  expect(saved.settings.speed).toBe(600);
  expect(saved.settings.maxSpeed).toBe(600);
  expect(saved.best).toBe(9000);
});

test("restoring settings resumes a playing game after closing the dialog", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).click();
  await page.getByRole("button", { name: "Game settings" }).click();
  await page.getByRole("button", { name: "Restore default settings" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  expect(
    await page.evaluate(() => (window as any).__jarkanoid.game.phase),
  ).toBe("playing");
});

test("level transition renders the native mirrored squeeze and the incoming field", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).waitFor();
  const pixels = await page.evaluate(async () => {
    const modulePath = "/src/transition.ts";
    const { LevelTransition } = await import(modulePath);
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 768;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "red";
    c.fillRect(0, 0, 512, 768);
    c.fillStyle = "blue";
    c.fillRect(512, 0, 512, 768);
    const effect = new LevelTransition(canvas);
    c.fillStyle = "lime";
    c.fillRect(0, 0, 1024, 768);
    effect.setNext();
    const read = (x: number, y: number) => [...c.getImageData(x, y, 1, 1).data];
    const result: number[][] = [];
    for (let frame = 0; frame <= 223; frame++) {
      effect.render();
      if (frame === 0) result.push(read(300, 400));
      if (frame === 40)
        result.push(read(10, 400), read(300, 400), read(500, 5));
      if (frame === 118) result.push(read(300, 400), read(700, 400));
      if (frame === 200) result.push(read(300, 400));
      if (frame === 223) result.push(read(10, 400));
      effect.update(1 / 60);
    }
    await effect.finished;
    return result;
  });
  expect(pixels).toEqual([
    [255, 0, 0, 255],
    [0, 0, 0, 255],
    [255, 0, 0, 255],
    [0, 0, 0, 255],
    [0, 0, 255, 255],
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 255, 0, 255],
  ]);
});

test("skip-level bonus transitions once, ignores launch input, and preserves the session", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).waitFor();
  await page.evaluate(async () => {
    const app = (window as any).__jarkanoid;
    await app.load(2, 12, true);
    app.game.score = 200;
    app.game.lives = 4;
    app.game.applyBonus(19);
  });
  await expect
    .poll(() =>
      page.evaluate(() => Boolean((window as any).__jarkanoid.transition)),
    )
    .toBe(true);
  await page.keyboard.press("Space");
  await page.locator("#game").click();
  await expect(page.locator("#level-title")).toHaveText("LEVEL 13");
  await expect(page.getByRole("button", { name: "Launch ball" })).toBeVisible();
  const result = await page.evaluate(() => {
    const app = (window as any).__jarkanoid;
    return {
      level: app.level,
      phase: app.game.phase,
      score: app.game.score,
      lives: app.game.lives,
      stuck: app.game.balls[0].stuck,
      firing: app.game.firing,
    };
  });
  expect(result).toEqual({
    level: 13,
    phase: "ready",
    score: 1200,
    lives: 4,
    stuck: true,
    firing: false,
  });
});

test("a superseding level load cancels the transition and pack completion stays bounded", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).waitFor();
  await page.evaluate(() => (window as any).__jarkanoid.game.clear());
  await expect
    .poll(() =>
      page.evaluate(() => Boolean((window as any).__jarkanoid.transition)),
    )
    .toBe(true);
  await page.evaluate(async () => {
    const app = (window as any).__jarkanoid;
    await app.load(0, 30, true);
    app.game.clear();
  });
  await expect(
    page.getByRole("heading", { name: "Pack complete!" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => Boolean((window as any).__jarkanoid.transition)),
  ).toBe(false);
  await expect(page.locator("#level-title")).toHaveText("LEVEL 30");
  await page.getByRole("button", { name: "Play next pack" }).click();
  await expect(page.locator("#level-title")).toHaveText("LEVEL 01");
  await expect(page.locator("#pack-label")).toHaveText("Pack 2");
});
