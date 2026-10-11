import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Game,
  COLS,
  ROWS,
  WIDTH,
  PADDLE_Y,
  STEP,
  RAIN_DURATION,
} from "../src/engine";
import { readSave } from "../src/storage";
import { soundId } from "../src/sound-map";

function board(entries: [number, number][] = [[0, 3]]) {
  const cells = Array(COLS * ROWS).fill(0);
  for (const [index, value] of entries) cells[index] = value;
  const g = new Game(() => 0.5);
  g.load({ number: 1, cells });
  g.settings.bonusFrequency = 0;
  g.launch();
  return g;
}
function frames(g: Game, count: number) {
  for (let n = 0; n < count; n++) g.update(STEP);
}

test("native screen dimensions, serve speed, and launch cone", () => {
  assert.equal(WIDTH, 1024);
  assert.equal(PADDLE_Y, 723);
  for (const random of [0, 0.25, 0.5, 0.75, 1 - Number.EPSILON]) {
    const g = new Game(() => random);
    g.load({ number: 1, cells: Array(1054).fill(0) });
    g.launch();
    const b = g.balls[0];
    assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - 180) < 1e-9);
    assert.ok(b.vy <= -90 + 1e-9);
    assert.ok(Math.abs(b.vx) <= 155.885 + 0.001);
  }
});

test("speed stays constant in free flight and increases once per wall collision", () => {
  const g = board();
  Object.assign(g.balls[0], { x: 500, y: 500, vx: 180, vy: 0 });
  frames(g, 120);
  assert.equal(g.balls[0].x, 680);
  assert.equal(g.balls[0].vx, 180);
  Object.assign(g.balls[0], { x: WIDTH - 5.1, vx: 180 });
  frames(g, 1);
  assert.ok(Math.abs(g.balls[0].vx + 186) < 1e-9);
  Object.assign(g.balls[0], { x: WIDTH - 5.1, vx: 778 });
  frames(g, 1);
  assert.equal(g.balls[0].vx, -778);
});

test("native paddle steering reaches 72 degrees at its ends and permits vertical rebounds", () => {
  for (const [offset, vx, vy] of [
    [-40, -171.190173, -55.623059],
    [0, 0, -180],
    [40, 171.190173, -55.623059],
  ]) {
    const g = board();
    g.paddleWidth = 80;
    g.settings.acceleration = 0;
    Object.assign(g.balls[0], {
      x: g.paddleX + offset,
      y: PADDLE_Y - 5.1,
      vx: 0,
      vy: 180,
    });
    frames(g, 1);
    assert.ok(Math.abs(g.balls[0].vx - vx) < 0.00001);
    assert.ok(Math.abs(g.balls[0].vy - vy) < 0.00001);
  }
});

test("sticky release preserves speed and direction, times out, and excludes paddle tips", () => {
  const g = board();
  g.applyBonus(9);
  Object.assign(g.balls[0], {
    x: g.paddleX,
    y: PADDLE_Y - 5.1,
    vx: 0,
    vy: 500,
  });
  frames(g, 1);
  assert.equal(g.balls[0].stuck, true);
  const { vx, vy } = g.balls[0];
  g.launch();
  assert.equal(g.balls[0].vx, vx);
  assert.equal(g.balls[0].vy, vy);
  g.balls[0].stuck = true;
  frames(g, 479);
  assert.equal(g.balls[0].stuck, true);
  frames(g, 1);
  assert.equal(g.balls[0].stuck, false);
  Object.assign(g.balls[0], {
    x: g.paddleX - g.paddleWidth / 2 + 3,
    y: PADDLE_Y - 5.1,
    vx: 0,
    vy: 200,
  });
  frames(g, 1);
  assert.equal(g.balls[0].stuck, false);
  assert.ok(g.balls[0].vy < 0);
});

test("lasers remove one hit of armor and reveal hidden bricks without bypassing ball powers", () => {
  for (const [value, result] of [
    [3, 2],
    [-1, 1],
  ]) {
    const index = 31 * COLS + 15;
    const g = board([
      [index, value],
      [0, 3],
    ]);
    g.applyBonus(6);
    g.shots.push({ x: 511.5, y: 643 });
    frames(g, 1);
    assert.equal(g.cells[index], result);
    assert.equal(g.shots.length, 0);
    assert.equal(g.score, 20);
  }
});

test("laser banks never exceed four projectiles each and use five pixels per native update", () => {
  const g = board();
  g.applyBonus(7);
  g.firing = true;
  frames(g, 18);
  assert.equal(g.shots.length, 2);
  assert.equal(g.shots[0].y, PADDLE_Y - 5);
  frames(g, 100);
  assert.equal(g.shots.length, 8);
  for (const side of [-1, 1])
    assert.equal(g.shots.filter((s) => s.side === side).length, 4);
});

test("lightning selects a brick, arrives from above, and destroys only that target", () => {
  const target = 16 * COLS + 15;
  const g = board([
    [target, 3],
    [target - COLS, 1],
    [target + COLS, 1],
  ]);
  g.random = () => target / 1053;
  g.applyBonus(8);
  assert.equal(g.lightning?.index, target);
  assert.equal(g.cells[target], 3);
  frames(g, 39);
  assert.equal(g.cells[target], 3);
  frames(g, 1);
  assert.equal(g.cells[target], 0);
  assert.equal(g.cells[target - COLS], 1);
  assert.equal(g.cells[target + COLS], 1);
  assert.equal(g.score, 30);
  assert.equal(g.lightning, null);
});

test("lightning falls back to the first occupied cell after 1054 unsuccessful draws", () => {
  const g = board([[20, 1]]);
  let draws = 0;
  g.random = () => {
    draws++;
    return 0;
  };
  g.applyBonus(8);
  assert.equal(draws, 1054);
  assert.equal(g.lightning?.index, 20);
});

test("rain restores surviving hidden cells and never resurrects destroyed ones", () => {
  const g = board([
    [0, -1],
    [1, -1],
    [2, 3],
  ]);
  g.applyBonus(18);
  g.hit(0);
  assert.equal(g.cells[0], 0);
  g.rainTime = STEP;
  frames(g, 1);
  assert.equal(g.cells[0], 0);
  assert.equal(g.cells[1], -1);
  assert.equal(g.cells[2], 3);
  assert.equal(RAIN_DURATION, 800 / 120);
});

test("wall descent moves each brick at most one row, respects stacks and preserves source artwork", () => {
  const bottom = (ROWS - 1) * COLS;
  const g = board([
    [0, 3],
    [COLS, 2],
    [bottom, 1],
    [bottom - COLS, -1],
    [bottom - 2 * COLS, 2],
  ]);
  g.applyBonus(4);
  assert.equal(g.cells[0], 0);
  assert.equal(g.cells[COLS], 3);
  assert.equal(g.cells[2 * COLS], 2);
  assert.equal(g.artwork[COLS], 0);
  assert.equal(g.artwork[2 * COLS], COLS);
  assert.equal(g.cells[bottom - COLS], -1);
  assert.equal(g.cells[bottom - 2 * COLS], 2);
  assert.equal(g.remaining, 5);
  assert.equal(g.wallOffset, 0);
});

test("rain follows descended bricks and life loss restores their hidden state", () => {
  const g = board([
    [0, -1],
    [10, 3],
  ]);
  g.applyBonus(18);
  g.applyBonus(4);
  assert.equal(g.cells[COLS], 1);
  g.loseLife();
  assert.equal(g.cells[COLS], -1);
  assert.equal(g.artwork[COLS], 0);
});

test("drops inherit half the impact velocity, accelerate downward, and bounce at borders", () => {
  const g = board([
    [15 * COLS + 15, 1],
    [0, 3],
  ]);
  g.settings.bonusFrequency = 5;
  g.bonusCooldown = 0;
  g.random = () => 136 / 1200;
  g.hit(15 * COLS + 15, false, { vx: 240, vy: -180 });
  const d = g.drops[0];
  assert.equal(d.x, 501);
  assert.equal(d.y, 300);
  assert.equal(d.vx, 120);
  assert.equal(d.vy, -90);
  frames(g, 1);
  assert.equal(d.x, 502);
  assert.equal(d.y, 299.25);
  assert.equal(d.vy, -87);
  Object.assign(d, { x: WIDTH - 33, vx: 120, y: 0, vy: -90 });
  frames(g, 1);
  assert.equal(d.x, WIDTH - 33);
  assert.equal(d.vx, -120);
  assert.equal(d.y, 0);
  assert.ok(d.vy! > 0);
});

test("lose-life pickup ends the current life and discards old balls, drops and powers", () => {
  const g = board([
    [0, 3],
    [1, -1],
  ]);
  g.applyBonus(1);
  g.applyBonus(7);
  g.applyBonus(18);
  g.drops.push(
    { type: 15, x: g.paddleX - 16.5, y: PADDLE_Y - 33 },
    { type: 16, x: g.paddleX - 16.5, y: PADDLE_Y - 33 },
  );
  frames(g, 1);
  assert.equal(g.lives, 2);
  assert.equal(g.phase, "ready");
  assert.equal(g.balls.length, 1);
  assert.equal(g.drops.length, 0);
  assert.equal(g.laserTime, 0);
  assert.equal(g.cells[1], -1);
  g.launch();
  const y = g.balls[0].y;
  frames(g, 1);
  assert.notEqual(g.balls[0].y, y);
});

test("explosive chains advance every four rendered frames and award five points on propagation", () => {
  const g = board([
    [0, -2],
    [COLS + 1, -2],
    [2 * COLS + 2, -2],
    [30, 3],
  ]);
  g.hit(0);
  frames(g, 7);
  assert.equal(g.cells[COLS + 1], -2);
  assert.equal(g.score, 10);
  frames(g, 1);
  assert.equal(g.cells[COLS + 1], -2);
  assert.equal(g.score, 15);
  frames(g, 8);
  assert.equal(g.cells[COLS + 1], 0);
  assert.equal(g.cells[2 * COLS + 2], -2);
  assert.equal(g.score, 30);
  frames(g, 8);
  assert.equal(g.cells[2 * COLS + 2], 0);
  assert.equal(g.score, 40);
});

test("fast and slow bonuses use configured bounds, and native fast-drop gating resets on slow draw", () => {
  const g = board([
    [0, 1],
    [1, 1],
    [2, 1],
  ]);
  g.settings.speed = 240;
  g.settings.maxSpeed = 600;
  g.applyBonus(13);
  assert.ok(Math.abs(Math.hypot(g.balls[0].vx, g.balls[0].vy) - 600) < 1e-9);
  g.applyBonus(14);
  assert.ok(Math.abs(Math.hypot(g.balls[0].vx, g.balls[0].vy) - 240) < 1e-9);
  g.settings.bonusFrequency = 5;
  g.bonusCooldown = 0;
  g.random = () => 107 / 1200;
  g.hit(0);
  g.drops = [];
  assert.equal(g.bonusEligible(13), false);
  g.bonusCooldown = 0;
  g.random = () => 114 / 1200;
  g.hit(1);
  assert.equal(g.bonusEligible(13), true);
});

test("old default physics settings migrate while custom pace and score survive", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let settings: Record<string, number> = {
    speed: 390,
    acceleration: 4,
    bonusSpeed: 105,
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => JSON.stringify({ rulesVersion: 2, best: 12345, settings }),
    },
  });
  try {
    const saved = readSave();
    assert.equal(saved.rulesVersion, 3);
    assert.equal(saved.best, 12345);
    assert.equal(saved.settings.speed, 180);
    assert.equal(saved.settings.maxSpeed, 780);
    assert.equal(saved.settings.acceleration, 6);
    assert.equal(saved.settings.bonusGravity, 360);
    settings = { speed: 540, acceleration: 9 };
    const custom = readSave();
    assert.equal(custom.settings.speed, 540);
    assert.equal(custom.settings.acceleration, 9);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("wall, brick, and paddle contacts route to their distinct native samples", () => {
  assert.equal(soundId("wallBounce"), 16);
  assert.equal(soundId("brickHit"), 15);
  assert.equal(soundId("brick"), 15);
  assert.equal(soundId("bounce"), 13);
  assert.equal(soundId("stickyBounce"), 14);
});
