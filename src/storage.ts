import { defaults, clamp, type Settings } from "./engine";
export type Save = {
  rulesVersion: number;
  pack: number;
  level: number;
  best: number;
  unlocked: number[];
  settings: Settings;
  muted: boolean;
};
export const newSave = (): Save => ({
  rulesVersion: 2,
  pack: 0,
  level: 1,
  best: 0,
  unlocked: [1, 1, 1],
  settings: { ...defaults },
  muted: false,
});
export function readSave(): Save {
  const save = newSave();
  try {
    const s = JSON.parse(localStorage.getItem("jarkanoid3-v1") ?? "null");
    if (!s || typeof s !== "object") return save;
    if (Number.isInteger(s.pack)) save.pack = clamp(s.pack, 0, 2);
    if (Number.isInteger(s.level))
      save.level = clamp(s.level, 1, save.pack === 2 ? 50 : 30);
    if (Number.isFinite(s.best)) save.best = Math.max(0, Math.floor(s.best));
    if (Array.isArray(s.unlocked))
      save.unlocked = [0, 1, 2].map((i) =>
        Number.isInteger(s.unlocked[i])
          ? clamp(s.unlocked[i], 1, i === 2 ? 50 : 30)
          : 1,
      );
    if (typeof s.muted === "boolean") save.muted = s.muted;
    if (s.settings) {
      const ranges = {
        speed: [200, 700],
        acceleration: [0, 15],
        bonusFrequency: [0, 9],
        bonusSpeed: [50, 220],
        maxBonuses: [1, 22],
        volume: [0, 1],
      };
      for (const key of Object.keys(ranges) as (keyof typeof ranges)[])
        if (Number.isFinite(s.settings[key]))
          save.settings[key] = clamp(
            s.settings[key],
            ranges[key][0],
            ranges[key][1],
          );
      if (
        !Number.isFinite(s.settings.bonusFrequency) &&
        Number.isFinite(s.settings.bonusRate)
      ) {
        save.settings.bonusFrequency =
          s.settings.bonusRate === 0
            ? 0
            : s.settings.bonusRate === 0.16
              ? 5
              : clamp(
                  Math.round(17 - 165.5 / (s.settings.bonusRate * 100)),
                  1,
                  9,
                );
      }
      if (!s.rulesVersion && s.settings.maxBonuses === 6)
        save.settings.maxBonuses = 3;
      save.settings.bonusFrequency = Math.round(save.settings.bonusFrequency);
      save.settings.maxBonuses = Math.round(save.settings.maxBonuses);
      if (typeof s.settings.music === "boolean")
        save.settings.music = s.settings.music;
    }
  } catch {
    /* Storage can be disabled by the browser. */
  }
  return save;
}
export function writeSave(save: Save) {
  try {
    localStorage.setItem("jarkanoid3-v1", JSON.stringify(save));
  } catch {
    /* Playing does not require storage. */
  }
}
