import { WIDTH, HEIGHT, clamp, roundEven } from "./engine";

export const CLEAR_HOLD_FRAMES = 15;
export const TURN_FRAMES = 52;
export const TRANSITION_FRAMES = CLEAR_HOLD_FRAMES + TURN_FRAMES * 4;

export function transitionFrame(frame: number) {
  const tick = clamp(Math.floor(frame), 0, TRANSITION_FRAMES);
  if (tick < CLEAR_HOLD_FRAMES)
    return { inset: 0, top: 0, mirrored: false, next: false };
  if (tick >= TRANSITION_FRAMES)
    return { inset: 0, top: 0, mirrored: false, next: true };
  const turn = tick - CLEAR_HOLD_FRAMES;
  const stage = Math.floor(turn / TURN_FRAMES);
  const step = turn % TURN_FRAMES;
  const inset = stage % 2 === 0 ? 1 + step * 10 : WIDTH / 2 - step * 10;
  return {
    inset,
    top: roundEven(inset / 10),
    mirrored: stage === 1 || stage === 2,
    next: stage === 3,
  };
}

export class LevelTransition {
  private previous: HTMLCanvasElement;
  private next?: HTMLCanvasElement;
  private elapsed = 0;
  private resolve!: () => void;
  readonly finished = new Promise<void>((resolve) => (this.resolve = resolve));

  constructor(private canvas: HTMLCanvasElement) {
    this.previous = this.snapshot();
  }

  private snapshot() {
    const image = document.createElement("canvas");
    image.width = WIDTH;
    image.height = HEIGHT;
    image.getContext("2d")!.drawImage(this.canvas, 0, 0);
    return image;
  }

  setNext() {
    this.next = this.snapshot();
    this.render();
  }

  cancel() {
    this.resolve();
  }

  update(dt: number) {
    this.elapsed += clamp(dt, 0, 0.05) * 60;
    if (!this.next)
      this.elapsed = Math.min(this.elapsed, CLEAR_HOLD_FRAMES - 1);
    if (this.elapsed >= TRANSITION_FRAMES) this.resolve();
  }

  render() {
    const { inset, top, mirrored, next } = transitionFrame(this.elapsed);
    const c = this.canvas.getContext("2d")!;
    c.save();
    c.fillStyle = "#000";
    c.fillRect(0, 0, WIDTH, HEIGHT);
    if (mirrored) {
      c.translate(WIDTH, 0);
      c.scale(-1, 1);
    }
    if (inset < WIDTH / 2)
      c.drawImage(
        next && this.next ? this.next : this.previous,
        inset,
        top,
        WIDTH - inset * 2,
        HEIGHT - top * 2,
      );
    c.restore();
  }
}
