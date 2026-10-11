import type { GameEvent } from "./engine";
export const bonusSounds = [
  3, 21, 7, 22, 19, 23, 20, 9, 1, 24, 17, 25, 26, 8, 4, 27, 12, 2, 11, 33, 34,
  35,
] as const;
export function soundId(event: GameEvent): number {
  if (event.startsWith("bonus:"))
    return bonusSounds[Number(event.slice(6))] ?? 0;
  return (
    (
      {
        bounce: 13,
        stickyBounce: 14,
        brick: 0,
        bonus: 3,
        bad: 27,
        ballLost: 16,
        lost: 27,
        fire: 18,
        clear: 0,
        explode: 15,
        chain: 5,
        reveal: 6,
      } as Record<string, number>
    )[event] ?? 0
  );
}
