import { Game, WIDTH, HEIGHT, BW, BH, COLS, PADDLE_Y } from "./engine";
import type { Art } from "./assets";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private wall = document.createElement("canvas");
  private wallCtx: CanvasRenderingContext2D;
  private revision = -1;
  private pattern: CanvasPattern | null = null;
  art?: Art;
  constructor(public canvas: HTMLCanvasElement) {
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.wall.width = WIDTH;
    this.wall.height = HEIGHT;
    this.wallCtx = this.wall.getContext("2d")!;
  }
  setArt(art: Art) {
    this.art = art;
    this.revision = -1;
    this.pattern = this.ctx.createPattern(art.background, "repeat");
  }
  sprite(key: string, x: number, y: number, width?: number, height?: number) {
    const rect = this.art?.atlas[key];
    if (!rect || !this.art) return;
    const [sx, sy, w, h] = rect;
    this.ctx.drawImage(
      this.art.sprites,
      sx,
      sy,
      w,
      h,
      Math.round(x),
      Math.round(y),
      width ?? w,
      height ?? h,
    );
  }
  render(game: Game) {
    const c = this.ctx;
    c.fillStyle = this.pattern ?? "#102621";
    c.fillRect(0, 0, WIDTH, HEIGHT);
    c.fillStyle = "#00000016";
    c.fillRect(0, 0, WIDTH, HEIGHT);
    if (this.art && this.revision !== game.revision) {
      const w = this.wallCtx;
      w.clearRect(0, 0, WIDTH, HEIGHT);
      game.cells.forEach((value, i) => {
        if (value === 0 || value === -1) return;
        const x = (i % COLS) * BW,
          y = Math.floor(i / COLS) * BH;
        w.drawImage(
          this.art!.bricks,
          x,
          y,
          BW,
          BH,
          x,
          y + game.wallOffset,
          BW,
          BH,
        );
        if (value > 1) {
          w.fillStyle = "#ffffffbb";
          for (let n = 0; n < value - 1; n++)
            w.fillRect(x + BW - 5 - n * 4, y + game.wallOffset + BH - 4, 2, 2);
        }
      });
      this.revision = game.revision;
    }
    c.drawImage(this.wall, 0, 0);
    const frame = (Math.floor(game.time * 24) % 36) + 1;
    if (game.laserTime > 0) {
      this.sprite(
        `TIRS/${(Math.floor(game.time * 18) % 9) + 1}`,
        game.paddleX - game.paddleWidth / 2,
        PADDLE_Y - 13,
      );
      this.sprite(
        `TIRS/${(Math.floor(game.time * 18) % 9) + 1}`,
        game.paddleX + game.paddleWidth / 2 - 9,
        PADDLE_Y - 13,
      );
    }
    this.sprite(
      `NORMAL_BAT_LEFT/${frame}`,
      game.paddleX - game.paddleWidth / 2,
      PADDLE_Y,
    );
    this.sprite(
      `NORMAL_BAT_CENTER/${frame}`,
      game.paddleX - game.paddleWidth / 2 + 9,
      PADDLE_Y,
      game.paddleWidth - 18,
      21,
    );
    this.sprite(
      `NORMAL_BAT_RIGHT/${frame}`,
      game.paddleX + game.paddleWidth / 2 - 9,
      PADDLE_Y,
    );
    if (game.stickyTime > 0) {
      c.strokeStyle = "#b7f58c";
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(game.paddleX - game.paddleWidth / 2 + 5, PADDLE_Y);
      c.lineTo(game.paddleX + game.paddleWidth / 2 - 5, PADDLE_Y);
      c.stroke();
    }
    for (const ball of game.balls) {
      if (game.mode !== "normal") {
        c.fillStyle = game.mode === "explode" ? "#ffbb3344" : "#8ef8ff44";
        c.beginPath();
        c.arc(ball.x, ball.y, game.radius + 4, 0, Math.PI * 2);
        c.fill();
      }
      this.sprite(
        `BALLE/${frame}`,
        ball.x - game.radius,
        ball.y - game.radius,
        game.radius * 2,
        game.radius * 2,
      );
    }
    for (const drop of game.drops) {
      c.fillStyle = "#0007";
      c.fillRect(drop.x + 4, drop.y + 5, 33, 33);
      this.sprite(`BONUS/${drop.type + 1}`, drop.x, drop.y);
    }
    c.fillStyle = "#bffbff";
    c.shadowColor = "#44caff";
    c.shadowBlur = 9;
    for (const shot of game.shots) c.fillRect(shot.x - 1, shot.y, 2, 11);
    c.shadowBlur = 0;
    for (const e of game.effects) {
      const a = 1 - e.age / 0.45;
      c.globalAlpha = a;
      if (e.type === "lightning") {
        c.strokeStyle = "#ddfaff";
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(e.x, HEIGHT - 45);
        for (let y = HEIGHT - 60; y > 0; y -= 20)
          c.lineTo(e.x + Math.sin(y * 4 + game.time * 23) * 12, y);
        c.stroke();
      } else {
        const key = `${e.type === "break" ? "EXPLODER" : "COLLISION_EFFECTS"}/${Math.min(9, Math.floor(e.age * 20) + 1)}`;
        this.sprite(key, e.x - 16, e.y - 16, 32, 32);
        if (e.type === "break") {
          c.fillStyle = "#fff1b6";
          for (let i = 0; i < 5; i++) {
            const angle = i * 2.4 + e.x;
            c.fillRect(
              e.x + Math.cos(angle) * e.age * 80,
              e.y + Math.sin(angle) * e.age * 80 + e.age * e.age * 140,
              2 + a,
              2 + a,
            );
          }
        }
      }
    }
    c.globalAlpha = 1;
    const water = (Math.floor(game.time * 10) % 8) + 1;
    for (let x = 0; x < WIDTH; x += 64)
      this.sprite(`MER/${water}`, x, HEIGHT - 12);
    if (game.messageTime > 0 && game.phase === "playing") {
      c.font = "600 18px ui-monospace, monospace";
      c.textAlign = "center";
      const textWidth = c.measureText(game.message).width;
      c.fillStyle = "#10180de0";
      c.fillRect(
        WIDTH / 2 - textWidth / 2 - 20,
        HEIGHT - 84,
        textWidth + 40,
        34,
      );
      c.fillStyle = "#f1f5d5";
      c.fillText(game.message, WIDTH / 2, HEIGHT - 61);
    }
  }
}
