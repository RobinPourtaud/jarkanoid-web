import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { poseAt, type Scene } from "../src/cinematics";
import { Game, bonusFromRoll, BONUS_WEIGHTS, STEP } from "../src/engine";
import { bonusSounds, soundId } from "../src/sound-map";

test("all nine recovered scenes contain valid original meshes and transform tracks", () => {
  let models = 0;
  for (let pack = 0; pack < 3; pack++) {
    const root = `public/assets/pack${pack}/`;
    for (const name of ["intro", "outro", "youwon"]) {
      const scene: Scene = JSON.parse(
        readFileSync(`${root}scene-${name}.json`, "utf8"),
      );
      assert.equal(scene.initial.length, 20);
      assert.equal(
        scene.frames,
        scene.segments.reduce((n, s) => n + s.frames, 0),
      );
      assert.ok(scene.frames > 500);
      for (const mesh of scene.meshes) {
        const bytes = readFileSync(root + mesh.file);
        assert.equal(bytes.length, mesh.vertices * 32);
        assert.equal(mesh.vertices % 3, 0);
        if (mesh.texture) assert.ok(existsSync(root + mesh.texture));
        models++;
      }
      for (let frame = 0; frame <= scene.frames; frame += 57) {
        const pose = poseAt(scene, frame);
        assert.ok(pose.flat().every(Number.isFinite));
      }
      assert.deepEqual(poseAt(scene, 0), scene.initial);
      assert.deepEqual(
        poseAt(scene, scene.frames + 100),
        poseAt(scene, scene.frames),
      );
    }
  }
  assert.equal(models, 56);
});

test("native intro movement reaches the recovered first keyframe and can seek backwards", () => {
  const scene: Scene = JSON.parse(
    readFileSync("public/assets/pack0/scene-intro.json", "utf8"),
  );
  const first = poseAt(scene, 60)[0];
  assert.ok(Math.abs(first[0]) < 0.001);
  assert.ok(Math.abs(first[2] + 15.5) < 0.001);
  assert.deepEqual(first.slice(3), [1, 1, 1, 0, 0, 0]);
  poseAt(scene, 2000);
  assert.deepEqual(poseAt(scene, 0), scene.initial);
});

test("bonus ranges preserve the executable's 166 weighted slots", () => {
  const counts = Array(22).fill(0);
  for (let roll = 0; roll < 166; roll++) counts[bonusFromRoll(roll / 1200)!]++;
  assert.deepEqual(counts, [...BONUS_WEIGHTS]);
  assert.equal(counts[16], 1);
  assert.equal(counts[15], 15);
});

test("bonus eligibility prevents useless drops and enforces original size limits", () => {
  const g = new Game();
  g.load({ number: 1, cells: Array(1054).fill(1) });
  assert.equal(g.paddleWidth, 87);
  assert.equal(g.radius, 5);
  for (const type of [6, 17, 18]) assert.equal(g.bonusEligible(type), false);
  g.cells[0] = 3;
  g.cells[1] = -2;
  g.cells[2] = -1;
  for (const type of [6, 17, 18]) assert.equal(g.bonusEligible(type), true);
  g.applyBonus(7);
  assert.equal(g.bonusEligible(7), false);
  for (let n = 0; n < 20; n++) {
    g.applyBonus(2);
    g.applyBonus(11);
  }
  assert.equal(g.paddleWidth, 247);
  assert.equal(g.radius, 7.5);
  assert.equal(g.bonusEligible(2), false);
  assert.equal(g.bonusEligible(11), false);
  for (let n = 0; n < 20; n++) {
    g.applyBonus(10);
    g.applyBonus(12);
  }
  assert.equal(g.paddleWidth, 27);
  assert.equal(g.radius, 2.5);
  g.drops.push({ x: 0, y: 0, type: 1 });
  assert.equal(g.bonusEligible(0), false);
});

test("rain reveals hidden cells without inventing projectiles or damaging other bricks", () => {
  const g = new Game();
  const cells = Array(1054).fill(0);
  cells[0] = -1;
  cells[1] = 3;
  g.load({ number: 1, cells });
  g.launch();
  g.applyBonus(18);
  for (let n = 0; n < 60; n++) g.update(STEP);
  assert.equal(g.cells[0], 1);
  assert.equal(g.cells[1], 3);
  assert.equal(g.shots.length, 0);
});

test("every bonus triggers its recovered sound resource", () => {
  for (let type = 0; type < 22; type++) {
    const g = new Game();
    g.applyBonus(type);
    assert.ok(g.events.includes(`bonus:${type}`));
    assert.equal(soundId(`bonus:${type}`), bonusSounds[type]);
    assert.ok(existsSync(`public/assets/pack0/sound-${bonusSounds[type]}.mp3`));
  }
  assert.equal(soundId("fire"), 18);
  assert.equal(soundId("stickyBounce"), 14);
  assert.equal(soundId("ballLost"), 16);
});

test("native frequency rejects no-drop slots and suppresses skips above setting five", () => {
  assert.equal(bonusFromRoll(0, 0), null);
  assert.equal(bonusFromRoll(165 / 1200, 5), 21);
  assert.equal(bonusFromRoll(166 / 1200, 5), null);
  assert.equal(bonusFromRoll(151 / 1200, 5), 19);
  assert.equal(bonusFromRoll(151 / 1100, 6), null);
  assert.equal(bonusFromRoll(14.5 / 1200, 5), 0);
  assert.equal(bonusFromRoll(15.5 / 1200, 5), 1);
  const counts = Array(22).fill(0);
  let none = 0;
  for (let n = 0; n < 120000; n++) {
    const type = bonusFromRoll((n + 0.25) / 120000, 5);
    if (type === null) none++;
    else counts[type]++;
  }
  assert.equal(none, 103450);
  assert.equal(counts[0], 1450);
  assert.equal(counts[15], 1500);
  assert.equal(counts[16], 100);
});

test("multiball bonuses multiply every existing ball and preserve speed", () => {
  const g = new Game(() => 0.4);
  g.load({ number: 1, cells: Array(1054).fill(1) });
  g.launch();
  g.applyBonus(0);
  assert.equal(g.balls.length, 2);
  g.applyBonus(0);
  assert.equal(g.balls.length, 4);
  g.applyBonus(1);
  assert.equal(g.balls.length, 40);
  for (const ball of g.balls)
    assert.ok(
      Math.abs(Math.hypot(ball.vx, ball.vy) - g.settings.speed) < 0.0001,
    );
  assert.equal(g.bonusEligible(1), false);
  g.applyBonus(1);
  assert.equal(g.balls.length, 100);
  assert.equal(g.bonusEligible(0), false);
});

test("bonus candidates are discarded without rerolls and accepted drops obey cooldown", () => {
  let calls = 0;
  const g = new Game(() => {
    calls++;
    return 144 / 1200;
  });
  g.load({ number: 1, cells: Array(1054).fill(1) });
  g.bonusCooldown = 0;
  g.hit(0);
  assert.equal(calls, 1);
  assert.equal(g.drops.length, 0);
  g.random = () => 136 / 1200;
  g.hit(1);
  g.hit(2);
  assert.equal(g.drops.length, 1);
  assert.equal(g.drops[0].type, 16);
  assert.equal(g.bonusCooldown, 40 / 60);
});

test("explosive chain neighbors receive bonus draws when preceding draws fail", () => {
  const draws = [0.9, 136 / 1200];
  const g = new Game(() => draws.shift() ?? 0.9);
  const cells = Array(1054).fill(0);
  cells[0] = -2;
  cells[1] = -2;
  cells[2] = 1;
  g.load({ number: 1, cells });
  g.bonusCooldown = 0;
  g.hit(0);
  assert.equal(g.drops.length, 1);
  assert.equal(g.drops[0].type, 16);
  assert.equal(g.cells[1], 0);
});
