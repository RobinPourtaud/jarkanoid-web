export const WIDTH = 1023,
  HEIGHT = 768,
  COLS = 31,
  ROWS = 34,
  BW = 33,
  BH = 20;
export const PADDLE_Y = 727,
  MAX_BALLS = 100,
  STEP = 1 / 120;
export type Phase = "ready" | "playing" | "paused" | "cleared" | "gameover";
export type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  stuck: boolean;
  offset: number;
};
export type Drop = { x: number; y: number; type: number };
export type Shot = { x: number; y: number };
export type Effect = {
  x: number;
  y: number;
  age: number;
  type: "hit" | "break" | "lightning";
};
export type Level = { number: number; cells: number[] };
export type Settings = {
  speed: number;
  acceleration: number;
  bonusFrequency: number;
  bonusSpeed: number;
  maxBonuses: number;
  volume: number;
  music: boolean;
};
export const defaults: Settings = {
  speed: 390,
  acceleration: 4,
  bonusFrequency: 5,
  bonusSpeed: 105,
  maxBonuses: 3,
  volume: 0.55,
  music: true,
};
export const BONUSES = [
  ["Split balls", "Doubles the balls in play, up to 100."],
  ["Tenfold balls", "Adds nine copies of each ball, up to 100 at once."],
  ["Wider bat", "Makes your bat wider."],
  ["Piercing ball", "Balls pass straight through bricks."],
  ["Descending wall", "Moves the wall closer to your bat."],
  ["Explosive ball", "Hits damage the surrounding bricks."],
  ["Power ball", "Breaks tough bricks in one hit."],
  ["Laser bat", "Hold the mouse button or Space to fire."],
  ["Lightning", "A lightning strike clears a column."],
  ["Sticky bat", "Catches balls; click or press Space to release."],
  ["Narrower bat", "Makes your bat narrower."],
  ["Larger balls", "Increases the size of your balls."],
  ["Smaller balls", "Decreases the size of your balls."],
  ["Fast balls", "Speeds up the balls."],
  ["Slow balls", "Slows down the balls."],
  ["Lose a life", "Removes one life."],
  ["Extra life", "Adds one life."],
  ["Chain reaction", "Detonates the explosive bricks."],
  ["Rain", "Reveals hidden bricks under an animated rain shower."],
  ["Next level", "Awards 1,000 points and clears the level."],
  ["5,000 points", "Adds 5,000 points."],
  ["Lose 5,000", "Removes 5,000 points."],
] as const;
export const BONUS_WEIGHTS = [
  15, 15, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 15, 1, 7, 7, 1, 7, 7,
] as const;
export function bonusFromRoll(random: number, frequency = 5): number | null {
  if (frequency <= 0) return null;
  const denominator = (17 - clamp(Math.round(frequency), 1, 9)) * 100;
  const value = clamp(random, 0, 1 - Number.EPSILON) * denominator;
  const floor = Math.floor(value);
  let draw = value - floor === 0.5 ? floor + (floor % 2) : Math.round(value);
  if (draw > 165) return null;
  for (let type = 0; type < BONUS_WEIGHTS.length; type++) {
    draw -= BONUS_WEIGHTS[type];
    if (draw < 0) return type === 19 && denominator < 1200 ? null : type;
  }
  return null;
}
export const BAD_BONUSES = new Set([4, 10, 12, 13, 15, 21]);
export type GameEvent =
  | `bonus:${number}`
  | "stickyBounce"
  | "ballLost"
  | "reveal"
  | "chain"
  | "bounce"
  | "brick"
  | "bonus"
  | "bad"
  | "lost"
  | "fire"
  | "clear"
  | "explode";
export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export class Game {
  phase: Phase = "ready";
  beforePause: Phase = "ready";
  settings = { ...defaults };
  cells: number[] = [];
  original: number[] = [];
  balls: Ball[] = [];
  drops: Drop[] = [];
  shots: Shot[] = [];
  effects: Effect[] = [];
  events: GameEvent[] = [];
  score = 0;
  lives = 3;
  paddleX = WIDTH / 2;
  paddleWidth = 87;
  radius = 5;
  wallOffset = 0;
  revision = 0;
  time = 0;
  mode: "normal" | "pierce" | "explode" | "power" = "normal";
  modeTime = 0;
  laserTime = 0;
  stickyTime = 0;
  rainTime = 0;
  shootCooldown = 0;
  bonusCooldown = 0;
  firing = false;
  message = "";
  messageTime = 0;
  private accumulator = 0;
  constructor(public random: () => number = Math.random) {}

  load(level: Level, fresh = false) {
    if (
      level.cells.length !== COLS * ROWS ||
      level.cells.some((v) => ![-2, -1, 0, 1, 2, 3].includes(v))
    )
      throw new Error("Invalid level grid");
    if (fresh) {
      this.score = 0;
      this.lives = 3;
    }
    this.original = [...level.cells];
    this.cells = [...level.cells];
    this.wallOffset = 0;
    this.drops = [];
    this.shots = [];
    this.effects = [];
    this.events = [];
    this.resetPowers();
    this.paddleX = WIDTH / 2;
    this.serve();
    this.revision++;
  }

  get remaining() {
    return this.cells.reduce((n, c) => n + (c !== 0 ? 1 : 0), 0);
  }
  get running() {
    return this.phase === "ready" || this.phase === "playing";
  }

  resetPowers() {
    this.paddleWidth = 87;
    this.radius = 5;
    this.mode = "normal";
    this.modeTime = this.laserTime = this.stickyTime = this.rainTime = 0;
    this.shootCooldown = 0;
    this.bonusCooldown = 40 / 60;
    this.firing = false;
  }

  serve() {
    this.balls = [
      {
        x: this.paddleX,
        y: PADDLE_Y - this.radius - 1,
        vx: 0,
        vy: 0,
        stuck: true,
        offset: 0,
      },
    ];
    this.phase = "ready";
    this.accumulator = 0;
    this.message = "Click or press Space to launch";
    this.messageTime = 3;
  }

  movePaddle(x: number) {
    this.paddleX = clamp(x, this.paddleWidth / 2, WIDTH - this.paddleWidth / 2);
    for (const ball of this.balls)
      if (ball.stuck) {
        ball.offset = clamp(
          ball.offset,
          -this.paddleWidth / 2 + this.radius,
          this.paddleWidth / 2 - this.radius,
        );
        ball.x = clamp(
          this.paddleX + ball.offset,
          this.radius,
          WIDTH - this.radius,
        );
        ball.y = PADDLE_Y - this.radius - 1;
      }
  }

  launch() {
    if (!this.running) return;
    for (const ball of this.balls)
      if (ball.stuck) {
        const angle =
          clamp(ball.offset / (this.paddleWidth / 2), -0.85, 0.85) * 1.1 + 0.13;
        ball.vx = Math.sin(angle) * this.settings.speed;
        ball.vy = -Math.cos(angle) * this.settings.speed;
        ball.stuck = false;
      }
    this.phase = "playing";
    this.messageTime = 0;
  }

  pause() {
    if (this.phase === "paused") {
      this.phase = this.beforePause;
      this.accumulator = 0;
    } else if (this.running) {
      this.beforePause = this.phase;
      this.phase = "paused";
      this.firing = false;
    }
  }

  update(elapsed: number) {
    if (!this.running) return;
    this.accumulator += clamp(elapsed, 0, 0.1);
    while (this.accumulator >= STEP) {
      this.tick(STEP);
      this.accumulator -= STEP;
      if (!this.running) break;
    }
  }

  tick(dt: number) {
    this.time += dt;
    this.messageTime = Math.max(0, this.messageTime - dt);
    for (const e of this.effects) e.age += dt;
    this.effects = this.effects.filter((e) => e.age < 0.45);
    if (this.phase !== "playing") return;
    this.modeTime = Math.max(0, this.modeTime - dt);
    if (!this.modeTime) this.mode = "normal";
    this.laserTime = Math.max(0, this.laserTime - dt);
    const wasSticky = this.stickyTime > 0;
    this.stickyTime = Math.max(0, this.stickyTime - dt);
    if (wasSticky && !this.stickyTime) this.launch();
    this.rainTime = Math.max(0, this.rainTime - dt);
    this.shootCooldown -= dt;
    if (this.firing && this.laserTime > 0 && this.shootCooldown <= 0) {
      this.shots.push(
        { x: this.paddleX - this.paddleWidth / 2 + 6, y: PADDLE_Y },
        { x: this.paddleX + this.paddleWidth / 2 - 6, y: PADDLE_Y },
      );
      this.shootCooldown = 0.15;
      this.emit("fire");
    }
    this.bonusCooldown = Math.max(0, this.bonusCooldown - dt);
    for (const ball of this.balls) {
      if (ball.stuck) continue;
      const speed = Math.hypot(ball.vx, ball.vy);
      this.setSpeed(
        ball,
        Math.min(850, speed + this.settings.acceleration * dt),
      );
      const steps = Math.max(
        1,
        Math.ceil((Math.hypot(ball.vx, ball.vy) * dt) / 3),
      );
      for (let n = 0; n < steps; n++) {
        this.moveBall(ball, dt / steps);
        if (ball.stuck || ball.y > HEIGHT + this.radius || !this.running) break;
      }
    }
    if (this.balls.some((b) => b.y > HEIGHT + this.radius))
      this.emit("ballLost");
    this.balls = this.balls.filter((b) => b.y <= HEIGHT + this.radius);
    for (const shot of this.shots) {
      const oldY = shot.y;
      shot.y -= 780 * dt;
      const col = Math.floor(shot.x / BW);
      for (
        let row = Math.min(ROWS - 1, Math.floor((oldY - this.wallOffset) / BH));
        row >= Math.max(0, Math.floor((shot.y - this.wallOffset) / BH));
        row--
      ) {
        const index = row * COLS + col;
        if (col >= 0 && col < COLS && this.cells[index]) {
          this.hit(index, true);
          shot.y = -100;
          break;
        }
      }
    }
    this.shots = this.shots.filter((s) => s.y > -20);
    for (const drop of this.drops) {
      const oldY = drop.y;
      drop.y += this.settings.bonusSpeed * dt;
      if (
        drop.y + 33 >= PADDLE_Y &&
        oldY <= PADDLE_Y + 21 &&
        Math.abs(drop.x + 16.5 - this.paddleX) < this.paddleWidth / 2 + 16.5
      ) {
        this.applyBonus(drop.type);
        drop.y = HEIGHT + 100;
        if (!this.running) break;
      }
    }
    this.drops = this.drops.filter((d) => d.y < HEIGHT);
    if (this.phase === "playing" && this.remaining === 0) this.clear();
    else if (this.phase === "playing" && this.balls.length === 0)
      this.loseLife();
    if (
      this.cells.some((c) => c === -1) &&
      this.cells.every((c) => c === 0 || c === -1)
    )
      this.reveal();
  }

  private moveBall(ball: Ball, dt: number) {
    const oldX = ball.x,
      oldY = ball.y,
      r = this.radius;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    if (ball.x < r) {
      ball.x = r;
      ball.vx = Math.abs(ball.vx);
      this.emit("bounce");
    }
    if (ball.x > WIDTH - r) {
      ball.x = WIDTH - r;
      ball.vx = -Math.abs(ball.vx);
      this.emit("bounce");
    }
    if (ball.y < r) {
      ball.y = r;
      ball.vy = Math.abs(ball.vy);
      this.emit("bounce");
    }
    if (
      ball.vy > 0 &&
      oldY + r <= PADDLE_Y &&
      ball.y + r >= PADDLE_Y &&
      Math.abs(ball.x - this.paddleX) <= this.paddleWidth / 2 + r
    ) {
      ball.y = PADDLE_Y - r - 0.1;
      const relative = clamp(
        (ball.x - this.paddleX) / (this.paddleWidth / 2),
        -0.95,
        0.95,
      );
      const speed = Math.max(
        this.settings.speed * 0.65,
        Math.hypot(ball.vx, ball.vy),
      );
      const angle = relative * 1.13;
      ball.vx = Math.sin(angle) * speed;
      if (Math.abs(ball.vx) < 25) ball.vx = (ball.vx < 0 ? -1 : 1) * 25;
      ball.vy = -Math.sqrt(Math.max(1, speed * speed - ball.vx * ball.vx));
      if (this.stickyTime > 0) {
        ball.stuck = true;
        ball.offset = ball.x - this.paddleX;
      }
      this.emit(this.stickyTime > 0 ? "stickyBounce" : "bounce");
      return;
    }
    const x0 = clamp(Math.floor((ball.x - r) / BW), 0, COLS - 1),
      x1 = clamp(Math.floor((ball.x + r) / BW), 0, COLS - 1);
    const y0 = Math.max(0, Math.floor((ball.y - r - this.wallOffset) / BH)),
      y1 = Math.min(ROWS - 1, Math.floor((ball.y + r - this.wallOffset) / BH));
    for (let row = y0; row <= y1; row++)
      for (let col = x0; col <= x1; col++) {
        const index = row * COLS + col;
        if (!this.cells[index]) continue;
        const left = col * BW,
          top = row * BH + this.wallOffset;
        const dx = ball.x - clamp(ball.x, left, left + BW),
          dy = ball.y - clamp(ball.y, top, top + BH);
        if (dx * dx + dy * dy >= r * r) continue;
        this.hit(index, this.mode === "pierce" || this.mode === "power");
        if (this.mode === "explode") this.explode(index);
        if (this.mode === "pierce") continue;
        if (oldY + r <= top) {
          ball.y = top - r - 0.01;
          ball.vy = -Math.abs(ball.vy);
        } else if (oldY - r >= top + BH) {
          ball.y = top + BH + r + 0.01;
          ball.vy = Math.abs(ball.vy);
        } else if (oldX + r <= left) {
          ball.x = left - r - 0.01;
          ball.vx = -Math.abs(ball.vx);
        } else if (oldX - r >= left + BW) {
          ball.x = left + BW + r + 0.01;
          ball.vx = Math.abs(ball.vx);
        } else if (Math.abs(dx) > Math.abs(dy)) {
          ball.x += Math.sign(dx || -ball.vx) * (r - Math.abs(dx) + 0.1);
          ball.vx *= -1;
        } else {
          ball.y += Math.sign(dy || -ball.vy) * (r - Math.abs(dy) + 0.1);
          ball.vy *= -1;
        }
        return;
      }
  }

  hit(index: number, force = false) {
    const value = this.cells[index];
    if (!value) return;
    const x = (index % COLS) * BW + BW / 2,
      y = Math.floor(index / COLS) * BH + this.wallOffset + BH / 2;
    if (value === -1 && !force) {
      this.cells[index] = 1;
      this.emit("reveal");
    } else this.cells[index] = force || value < 0 ? 0 : value - 1;
    this.revision++;
    if (this.cells[index] === 0) {
      this.score += 10;
      this.effects.push({ x, y, age: 0, type: "break" });
      this.emit("brick");
      this.tryDrop(x, y);
      if (value === -2) this.chain(index);
    } else {
      this.effects.push({ x, y, age: 0, type: "hit" });
      this.emit("bounce");
    }
  }

  private tryDrop(x: number, y: number) {
    if (
      this.bonusCooldown === 0 &&
      this.drops.length < this.settings.maxBonuses
    ) {
      const type = bonusFromRoll(this.random(), this.settings.bonusFrequency);
      if (type !== null && this.bonusEligible(type)) {
        this.drops.push({ x: x - 16.5, y, type });
        this.bonusCooldown = 40 / 60;
      }
    }
  }

  private chain(index: number) {
    const queue = [index],
      seen = new Set([index]);
    while (queue.length) {
      const cell = queue.shift()!;
      for (const neighbor of this.neighbors(cell))
        if (this.cells[neighbor] === -2 && !seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
          this.cells[neighbor] = 0;
          this.score += 15;
          this.revision++;
          this.tryDrop(
            (neighbor % COLS) * BW + BW / 2,
            Math.floor(neighbor / COLS) * BH + this.wallOffset + BH / 2,
          );
          this.effects.push({
            x: (neighbor % COLS) * BW + BW / 2,
            y: Math.floor(neighbor / COLS) * BH + this.wallOffset + BH / 2,
            age: 0,
            type: "break",
          });
        }
    }
    this.emit("chain");
  }

  private neighbors(index: number) {
    const result: number[] = [],
      col = index % COLS,
      row = Math.floor(index / COLS);
    for (let y = Math.max(0, row - 1); y <= Math.min(ROWS - 1, row + 1); y++)
      for (let x = Math.max(0, col - 1); x <= Math.min(COLS - 1, col + 1); x++)
        if (x !== col || y !== row) result.push(y * COLS + x);
    return result;
  }

  explode(index: number) {
    for (const n of this.neighbors(index)) this.hit(n);
    this.emit("explode");
  }
  reveal() {
    this.cells = this.cells.map((c) => (c === -1 ? 1 : c));
    this.revision++;
  }
  private setSpeed(ball: Ball, speed: number) {
    const previous = Math.hypot(ball.vx, ball.vy);
    if (previous > 0) {
      ball.vx *= speed / previous;
      ball.vy *= speed / previous;
    }
  }
  private addBalls(count: number) {
    const sources = [...this.balls];
    for (const source of sources) {
      const speed = Math.hypot(source.vx, source.vy) || this.settings.speed;
      const direction = Math.atan2(source.vy, source.vx);
      for (let i = 0; i < count && this.balls.length < MAX_BALLS; i++) {
        const angle =
          count === 9
            ? direction - ((i + 1) * Math.PI) / 5
            : this.random() * Math.PI * 2;
        this.balls.push({
          x: source.x,
          y: source.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          stuck: false,
          offset: 0,
        });
      }
    }
  }
  bonusEligible(type: number) {
    if (this.drops.some((d) => d.type === type)) return false;
    switch (type) {
      case 0:
        return this.balls.length <= 50 && !this.drops.some((d) => d.type === 1);
      case 1:
        return this.balls.length <= 10 && !this.drops.some((d) => d.type === 0);
      case 2:
        return this.paddleWidth < 247;
      case 3:
        return this.mode !== "pierce";
      case 5:
        return this.mode !== "explode";
      case 6:
        return this.mode !== "power" && this.cells.some((c) => c > 1);
      case 7:
        return this.laserTime === 0;
      case 8:
        return !this.effects.some((e) => e.type === "lightning");
      case 9:
        return this.stickyTime === 0;
      case 10:
        return this.paddleWidth > 27;
      case 11:
        return this.radius < 7.5;
      case 12:
        return this.radius > 2.5;
      case 13:
        return this.balls.some((b) => !b.stuck && Math.hypot(b.vx, b.vy) < 779);
      case 14:
        return this.balls.some((b) => !b.stuck && Math.hypot(b.vx, b.vy) > 241);
      case 16:
        return this.lives < 100;
      case 17:
        return this.cells.includes(-2);
      case 18:
        return this.rainTime === 0 && this.cells.includes(-1);
      default:
        return type >= 0 && type < BONUSES.length;
    }
  }
  applyBonus(type: number) {
    if (!Number.isInteger(type) || type < 0 || type >= BONUSES.length) return;
    this.score += type === 19 || type >= 20 ? 0 : 20;
    this.message = BONUSES[type][0];
    this.messageTime = 2.2;
    this.emit(`bonus:${type}`);
    switch (type) {
      case 0:
        this.addBalls(1);
        break;
      case 1:
        this.addBalls(9);
        break;
      case 2:
        this.paddleWidth = Math.min(247, this.paddleWidth + 20);
        break;
      case 3:
        this.mode = "pierce";
        this.modeTime = 30;
        break;
      case 4: {
        const bottomRow = Math.max(
          0,
          ...this.cells.map((c, i) => (c ? Math.floor(i / COLS) + 1 : 0)),
        );
        this.wallOffset = Math.min(
          this.wallOffset + 20,
          Math.max(0, PADDLE_Y - 55 - bottomRow * BH),
        );
        this.revision++;
        break;
      }
      case 5:
        this.mode = "explode";
        this.modeTime = 30;
        break;
      case 6:
        this.mode = "power";
        this.modeTime = 30;
        break;
      case 7:
        this.laserTime = 30;
        break;
      case 8: {
        const occupied = this.cells.flatMap((c, i) => (c ? [i % COLS] : []));
        const col = occupied[Math.floor(this.random() * occupied.length)];
        if (col !== undefined) {
          for (let row = 0; row < ROWS; row++) this.hit(row * COLS + col, true);
          this.effects.push({
            x: col * BW + BW / 2,
            y: 0,
            age: 0,
            type: "lightning",
          });
        }
        break;
      }
      case 9:
        this.stickyTime = 30;
        break;
      case 10:
        this.paddleWidth = Math.max(27, this.paddleWidth - 20);
        break;
      case 11:
        this.radius = Math.min(7.5, this.radius + 2.5);
        break;
      case 12:
        this.radius = Math.max(2.5, this.radius - 2.5);
        break;
      case 13:
        for (const b of this.balls) this.setSpeed(b, 780);
        break;
      case 14:
        for (const b of this.balls) this.setSpeed(b, 240);
        break;
      case 15:
        this.lives--;
        if (this.lives <= 0) {
          this.phase = "gameover";
          this.emit("lost");
        }
        break;
      case 16:
        this.lives = Math.min(100, this.lives + 1);
        break;
      case 17:
        for (let i = 0; i < this.cells.length; i++)
          if (this.cells[i] === -2) this.hit(i, true);
        break;
      case 18:
        this.rainTime = 800 / 60;
        this.reveal();
        break;
      case 19:
        this.score += 1000;
        this.clear();
        break;
      case 20:
        this.score += 5000;
        break;
      case 21:
        this.score = Math.max(0, this.score - 5000);
        break;
    }
    this.movePaddle(this.paddleX);
  }
  loseLife() {
    this.lives--;
    this.emit("lost");
    this.drops = [];
    this.shots = [];
    this.resetPowers();
    if (this.lives <= 0) {
      this.phase = "gameover";
      this.balls = [];
    } else this.serve();
  }
  clear() {
    this.phase = "cleared";
    this.firing = false;
    this.emit("clear");
  }
  emit(event: GameEvent) {
    if (!this.events.includes(event)) this.events.push(event);
  }
}
