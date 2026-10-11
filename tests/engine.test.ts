import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  Game,
  COLS,
  ROWS,
  WIDTH,
  HEIGHT,
  PADDLE_Y,
  STEP,
  MAX_BALLS,
  type Level,
} from "../src/engine";
const empty = (): Level => ({ number: 1, cells: Array(COLS * ROWS).fill(0) });
function gameWith(entries: [number, number][] = [[0, 1]]) {
  const game = new Game(() => 0.9),
    level = empty();
  for (const [i, hp] of entries) level.cells[i] = hp;
  game.load(level, true);
  return game;
}
function advance(game: Game, seconds: number) {
  for (let n = 0; n < seconds / STEP; n++) game.update(STEP);
}

test("loads every original level losslessly and validates the grid", () => {
  let total = 0;
  for (let pack = 0; pack < 3; pack++) {
    const levels: Level[] = JSON.parse(
      readFileSync(`public/assets/pack${pack}/levels.json`, "utf8"),
    );
    assert.equal(levels.length, pack === 2 ? 50 : 30);
    for (const level of levels) {
      const game = new Game();
      game.load(level);
      assert.deepEqual(game.cells, level.cells);
      assert.ok(game.remaining > 0);
      total++;
    }
  }
  assert.equal(total, 110);
  assert.throws(() => new Game().load({ number: 1, cells: [1] }));
});
test("bat and attached ball stay inside bounds", () => {
  const g = gameWith();
  g.movePaddle(-100);
  assert.equal(g.paddleX, 53.5);
  assert.equal(g.balls[0].x, 53.5);
  g.movePaddle(WIDTH + 100);
  assert.equal(g.paddleX, WIDTH - 53.5);
  g.launch();
  assert.equal(g.phase, "playing");
  assert.ok(g.balls[0].vy < 0);
});
test("paused time never advances the ball or effect timers", () => {
  const g = gameWith();
  g.launch();
  g.applyBonus(7);
  g.pause();
  const b = { ...g.balls[0] };
  advance(g, 2);
  assert.deepEqual(g.balls[0], b);
  assert.equal(g.laserTime, 30);
  g.pause();
  advance(g, 0.1);
  assert.notEqual(g.balls[0].y, b.y);
});
test("fixed step movement is independent of frame frequency", () => {
  const a = gameWith(),
    b = gameWith();
  a.launch();
  b.launch();
  for (let n = 0; n < 60; n++) a.update(1 / 60);
  for (let n = 0; n < 120; n++) b.update(1 / 120);
  assert.ok(Math.abs(a.balls[0].y - b.balls[0].y) < 0.000001);
});
test("high speed ball hits a thin brick without tunneling", () => {
  const g = gameWith([
    [15 * COLS + 15, 1],
    [0, 1],
  ]);
  g.launch();
  Object.assign(g.balls[0], { x: 15 * 33 + 16.5, y: 340, vx: 0, vy: -850 });
  advance(g, 0.07);
  assert.equal(g.cells[15 * COLS + 15], 0);
  assert.ok(g.balls[0].vy > 0);
  assert.equal(g.score, 10);
});
test("paddle angle changes with impact position", () => {
  for (const side of [-1, 1]) {
    const g = gameWith();
    g.launch();
    Object.assign(g.balls[0], {
      x: g.paddleX + side * 35,
      y: PADDLE_Y - 10,
      vx: 0,
      vy: 600,
    });
    advance(g, 0.02);
    assert.ok(g.balls[0].vy < 0);
    assert.equal(Math.sign(g.balls[0].vx), side);
  }
});
test("multiball loss costs a life only when the final ball is gone", () => {
  const g = gameWith();
  g.launch();
  g.applyBonus(0);
  g.balls[0].y = HEIGHT + 100;
  advance(g, STEP);
  assert.equal(g.lives, 3);
  assert.equal(g.balls.length, 1);
  g.balls[0].y = HEIGHT + 100;
  advance(g, STEP);
  assert.equal(g.lives, 2);
  assert.equal(g.phase, "ready");
});
test("last life ends the session and restart resets it", () => {
  const g = gameWith();
  g.lives = 1;
  g.launch();
  g.balls[0].y = HEIGHT + 100;
  advance(g, STEP);
  assert.equal(g.phase, "gameover");
  assert.equal(g.lives, 0);
  g.load({ number: 1, cells: g.original }, true);
  assert.equal(g.lives, 3);
  assert.equal(g.score, 0);
});
test("tough and hidden bricks consume the recovered hit counts", () => {
  const g = gameWith([
    [0, 3],
    [1, -1],
  ]);
  g.hit(0);
  g.hit(0);
  assert.equal(g.cells[0], 1);
  assert.equal(g.score, 0);
  g.hit(0);
  assert.equal(g.score, 10);
  g.hit(1);
  assert.equal(g.cells[1], 1);
  g.hit(1);
  assert.equal(g.cells[1], 0);
});
test("explosive cells propagate diagonally but do not wrap across rows", () => {
  const g = gameWith([
    [0, -2],
    [COLS + 1, -2],
    [COLS + 2, -2],
    [COLS - 1, -2],
  ]);
  g.hit(0);
  assert.equal(g.cells[COLS + 1], 0);
  assert.equal(g.cells[COLS + 2], 0);
  assert.equal(g.cells[COLS - 1], -2);
});
test("clearing the final brick ends the level", () => {
  const g = gameWith();
  g.launch();
  g.hit(0);
  advance(g, STEP);
  assert.equal(g.phase, "cleared");
});
test("hidden-only walls reveal automatically", () => {
  const g = gameWith([
    [0, -1],
    [1, 1],
  ]);
  g.launch();
  g.hit(1);
  advance(g, STEP);
  assert.equal(g.cells[0], 1);
});
test("multiball never exceeds 100 balls", () => {
  const g = gameWith();
  g.launch();
  for (let n = 0; n < 20; n++) g.applyBonus(1);
  assert.equal(g.balls.length, MAX_BALLS);
});
test("power balls remove armor and piercing balls keep moving through it", () => {
  const g = gameWith([
    [15 * COLS + 15, 3],
    [0, 1],
  ]);
  g.launch();
  g.applyBonus(3);
  Object.assign(g.balls[0], { x: 15 * 33 + 16.5, y: 340, vx: 0, vy: -700 });
  advance(g, 0.07);
  assert.equal(g.cells[15 * COLS + 15], 0);
  assert.ok(g.balls[0].vy < 0);
});
test("sticky balls release on launch and on effect expiration", () => {
  const g = gameWith();
  g.launch();
  g.applyBonus(9);
  Object.assign(g.balls[0], { x: g.paddleX, y: PADDLE_Y - 10, vx: 0, vy: 500 });
  advance(g, 0.02);
  assert.equal(g.balls[0].stuck, true);
  g.movePaddle(250);
  assert.equal(g.balls[0].x, 250);
  g.launch();
  assert.equal(g.balls[0].stuck, false);
  g.balls[0].stuck = true;
  g.stickyTime = 0.001;
  advance(g, STEP);
  assert.equal(g.balls[0].stuck, false);
});
test("laser shots destroy bricks and expire outside the field", () => {
  const g = gameWith([
    [31 * COLS + 15, 1],
    [0, 1],
  ]);
  g.launch();
  g.shots.push({ x: 511.5, y: 655 });
  advance(g, 0.1);
  assert.equal(g.cells[31 * COLS + 15], 0);
  assert.equal(g.shots.length, 0);
});
test("bonus pickup applies its effect and removes the falling sprite", () => {
  const g = gameWith();
  g.launch();
  g.drops.push({ type: 16, x: g.paddleX - 16, y: PADDLE_Y - 33 });
  advance(g, STEP);
  assert.equal(g.lives, 4);
  assert.equal(g.drops.length, 0);
  assert.equal(g.score, 20);
});
test("all 22 bonuses produce valid state", () => {
  for (let type = 0; type < 22; type++) {
    const g = gameWith([
      [0, 1],
      [1, -2],
      [2, -1],
    ]);
    g.launch();
    g.applyBonus(type);
    advance(g, 0.1);
    assert.ok(Number.isFinite(g.score));
    assert.ok(g.balls.every((b) => Number.isFinite(b.x + b.y + b.vx + b.vy)));
  }
});
test("bonus score effects match executable constants", () => {
  const g = gameWith();
  g.applyBonus(20);
  assert.equal(g.score, 5000);
  g.applyBonus(21);
  g.applyBonus(21);
  assert.equal(g.score, 0);
  g.applyBonus(19);
  assert.equal(g.score, 1000);
  assert.equal(g.phase, "cleared");
});
test("long multiball sessions stay finite and within resource limits", () => {
  const g = new Game(() => 0.4);
  const levels: Level[] = JSON.parse(
    readFileSync("public/assets/pack2/levels.json", "utf8"),
  );
  g.load(levels[0], true);
  g.launch();
  for (let n = 0; n < 11; n++) g.applyBonus(1);
  for (let n = 0; n < 120 * 20; n++) {
    const target = [...g.balls].sort((a, b) => b.y - a.y)[0];
    if (target) g.movePaddle(target.x);
    g.update(STEP);
  }
  assert.ok(g.balls.length <= 100);
  assert.ok(g.drops.length <= g.settings.maxBonuses);
  assert.ok(g.balls.every((b) => Number.isFinite(b.x + b.y + b.vx + b.vy)));
});
test("clearing the last brick takes priority over a simultaneous lost ball", () => {
  const g = gameWith();
  g.launch();
  g.hit(0);
  g.balls[0].y = HEIGHT + 100;
  advance(g, STEP);
  assert.equal(g.phase, "cleared");
  assert.equal(g.lives, 3);
});
