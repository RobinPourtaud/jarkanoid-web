import { test, expect, chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("complete download reopens offline, loads every file, plays other packs and scenes, and removes only downloads", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).waitFor();
  await page.getByRole("button", { name: "Game settings" }).click();
  await page.locator("#setting-speed").fill("500");
  await page.locator("#offline-download").click();
  await expect(page.locator("#offline-status")).toContainText("Ready offline", {
    timeout: 90000,
  });
  await context.setOffline(true);
  const offline = await context.newPage();
  await page.close();
  const errors: string[] = [];
  offline.on("pageerror", (error) => errors.push(error.message));
  await offline.goto("/?offline-reopen=1");
  await offline.getByRole("button", { name: "Launch ball" }).click();
  await expect(offline.locator("#overlay")).toBeHidden();
  const failures = await offline.evaluate(async () => {
    const manifest = await (await fetch("/offline-manifest.json")).json();
    const failed: string[] = [];
    for (const entry of manifest.entries) {
      const response = await fetch(entry.url);
      if (
        !response.ok ||
        (await response.arrayBuffer()).byteLength !== entry.bytes
      )
        failed.push(entry.url);
    }
    return failed;
  });
  expect(failures).toEqual([]);
  await offline.getByRole("button", { name: "Choose a level" }).click();
  await offline.getByRole("button", { name: "Pack 3" }).click();
  await offline.locator('[data-level="50"]').click();
  await expect(offline.locator("#level-title")).toHaveText("LEVEL 50");
  await offline.getByRole("button", { name: "Launch ball" }).click();
  await expect(offline.locator("#overlay")).toBeHidden();
  await offline.getByRole("button", { name: "Original 3D scenes" }).click();
  await expect(offline.locator("#cinema-status")).toContainText(
    "original models",
  );
  await offline.getByRole("button", { name: "Close dialog" }).click();
  await offline.getByRole("button", { name: "Game settings" }).click();
  await expect(offline.locator("#setting-speed")).toHaveValue("500");
  await expect(offline.locator("#offline-status")).toContainText(
    "Ready offline",
  );
  await offline.locator("#offline-download").click();
  await expect(offline.locator("#offline-status")).toContainText(
    "Your previous download is still ready.",
  );
  const save = await offline.evaluate(() =>
    localStorage.getItem("jarkanoid3-v1"),
  );
  await offline.locator("#offline-remove").click();
  await expect(offline.locator("#offline-status")).toContainText(
    "Download once while connected",
  );
  expect(
    await offline.evaluate(() => localStorage.getItem("jarkanoid3-v1")),
  ).toBe(save);
  expect(
    await offline.evaluate(async () =>
      (await caches.keys()).filter(
        (key) =>
          key.startsWith("jarkanoid-offline-") && !key.endsWith("-state"),
      ),
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
});

test("failed downloads never claim readiness and can resume; incomplete caches are detected", async ({
  page,
  context,
}) => {
  await context.route("**/offline-manifest.json", async (route) => {
    const response = await route.fetch();
    const manifest = await response.json();
    manifest.entries[0].sha256 = "invalid";
    await route.fulfill({ response, json: manifest });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Launch ball" }).waitFor();
  await page.getByRole("button", { name: "Game settings" }).click();
  await page.locator("#offline-download").click();
  await expect(page.locator("#offline-status")).toContainText(
    "Please try again",
    { timeout: 30000 },
  );
  await expect(page.locator("#offline-status")).not.toContainText(
    "Ready offline",
  );
  await context.unroute("**/offline-manifest.json");
  await page.locator("#offline-download").click();
  await expect(page.locator("#offline-status")).toContainText("Ready offline", {
    timeout: 90000,
  });
  await page.evaluate(async () => {
    const name = (await caches.keys()).find(
      (name) =>
        name.startsWith("jarkanoid-offline-") && !name.endsWith("-state"),
    )!;
    await (await caches.open(name)).delete("/assets/pack2/level-50.jpg");
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Game settings" }).click();
  await expect(page.locator("#offline-status")).toContainText(
    "Download once while connected",
  );
  await page.locator("#offline-download").click();
  await expect(page.locator("#offline-status")).toContainText("Ready offline", {
    timeout: 90000,
  });
});

test("download survives closing the entire browser and restarting offline", async () => {
  const profile = await mkdtemp(join(tmpdir(), "jarkanoid-offline-test-"));
  const options = {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    baseURL: "http://127.0.0.1:5177",
  };
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    let page = await context.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "Game settings" }).click();
    await page.locator("#offline-download").click();
    await expect(page.locator("#offline-status")).toContainText(
      "Ready offline",
      { timeout: 90000 },
    );
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      ...options,
      offline: true,
    });
    page = await context.newPage();
    await page.goto("/");
    await page
      .getByRole("button", { name: "Launch ball" })
      .click({ timeout: 15000 });
    await expect(page.locator("#overlay")).toBeHidden();
    await page.getByRole("button", { name: "Game settings" }).click();
    await expect(page.locator("#offline-status")).toContainText(
      "Ready offline",
    );
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
