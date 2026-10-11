import type { Level } from "./engine";
export type Pack = {
  id: number;
  name: string;
  levels: number;
  music: (string | null)[];
  sceneMusic: Record<"intro" | "outro" | "youwon", string | null>;
};
export type Manifest = { packs: Pack[]; sha256: Record<string, string> };
export type Atlas = Record<string, [number, number, number, number]>;
export type Art = {
  background: HTMLImageElement;
  bricks: HTMLImageElement;
  sprites: HTMLImageElement;
  atlas: Atlas;
};
export const asset = (pack: number, name: string) =>
  `${import.meta.env.BASE_URL}assets/pack${pack}/${name}`;
export async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Could not load ${url} (${response.status})`);
  return response.json() as Promise<T>;
}
async function picture(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}
const packs = new Map<
  number,
  Promise<{ levels: Level[]; sprites: HTMLImageElement; atlas: Atlas }>
>();
export async function loadArt(
  pack: number,
  level: number,
): Promise<{ art: Art; level: Level }> {
  if (!packs.has(pack))
    packs.set(
      pack,
      Promise.all([
        json<Level[]>(asset(pack, "levels.json")),
        picture(asset(pack, "sprites.png")),
        json<Atlas>(asset(pack, "sprites.json")),
      ])
        .then(([levels, sprites, atlas]) => ({ levels, sprites, atlas }))
        .catch((e) => {
          packs.delete(pack);
          throw e;
        }),
    );
  const [data, background, bricks] = await Promise.all([
    packs.get(pack)!,
    picture(asset(pack, `tile-${level}.png`)),
    picture(asset(pack, `level-${level}.jpg`)),
  ]);
  if (!data.levels[level - 1]) throw new Error("Level does not exist");
  return {
    level: data.levels[level - 1],
    art: { background, bricks, sprites: data.sprites, atlas: data.atlas },
  };
}
