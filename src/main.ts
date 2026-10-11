import "./style.css";
import {
  Game,
  WIDTH,
  BONUSES,
  BAD_BONUSES,
  defaults,
  type Phase,
} from "./engine";
import { loadArt, json, asset, type Manifest } from "./assets";
import { Renderer } from "./renderer";
import { Sound } from "./audio";
import { readSave, writeSave } from "./storage";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const save = readSave(),
  game = new Game(),
  sound = new Sound();
game.settings = { ...save.settings };
sound.setVolume(save.settings.volume);
sound.setMuted(save.muted);
sound.setMusic(save.settings.music);
let manifest: Manifest,
  pack = save.pack,
  level = save.level,
  loading = true,
  token = 0,
  lastPhase: Phase | "" = "",
  lastFrame = 0;
let levelDialogPack = pack,
  menuPaused = false;
const keys = new Set<string>();
$("#app").innerHTML = `
  <header class="masthead"><a href="./" class="brand" aria-label="Jarkanoid 3 home">JARKANOÏD<span>3</span><small>BROWSER EDITION</small></a>
    <div class="edition"><i></i> THE 2003 CLASSIC, BACK IN PLAY</div><button class="quiet" id="about">About this port ↗</button></header>
  <main><div class="game-heading"><div><span class="eyebrow" id="pack-label">THE ORIGINAL</span><h1>Break the wall.</h1></div>
    <div class="top-actions"><button id="mute" class="icon-button" aria-label="Mute audio" title="Mute audio (M)">♫</button><button id="fullscreen" class="icon-button" aria-label="Enter fullscreen" title="Fullscreen (F)">⛶</button></div></div>
  <div class="layout"><section class="machine" aria-label="Jarkanoid 3 game">
    <div class="machine-top"><span><i></i> JIII / <b id="level-title">LEVEL 01</b></span><span class="machine-tag">JÉRÔME BARJOT · 2003</span></div>
    <div class="screen" id="screen"><canvas id="game" tabindex="0" aria-label="Game field. Move with mouse, touch, or arrow keys. Space launches. P pauses."></canvas>
      <div class="screen-overlay" id="overlay"><div class="overlay-panel"><span class="eyebrow" id="overlay-kicker">RECOVERING THE CLASSIC</span><h2 id="overlay-title">Loading…</h2><p id="overlay-copy">Preparing the original game resources.</p><button id="primary" class="primary" hidden>Launch ball <span>↗</span></button></div></div>
    </div>
    <div class="scoreboard"><div><span>SCORE</span><strong id="score">000000</strong></div><div><span>BEST</span><strong id="best">000000</strong></div><div><span>LIVES</span><strong id="lives">03</strong></div><div><span>BALLS</span><strong id="balls">01</strong></div><div class="bricks-stat"><span>BRICKS</span><strong id="bricks">000</strong></div></div>
  </section>
  <aside><div class="panel session-panel"><div class="section-label"><span>YOUR SESSION</span><span class="live-dot">●</span></div><div class="level-number"><span id="level-big">01</span><div>LEVEL<span id="level-count">OF 30</span></div></div>
    <div class="progress"><div id="progress"></div></div><div class="progress-label"><span id="progress-text">Ready when you are</span><span id="progress-percent">0%</span></div>
    <button id="pause" class="wide">Ⅱ <span>Pause game</span><kbd>P</kbd></button><button id="levels" class="wide">▦ <span>Choose a level</span><span>↗</span></button><button id="settings" class="wide">☷ <span>Game settings</span><span>↗</span></button><button id="restart" class="quiet restart">↻ Restart session</button>
  </div>
  <div class="panel controls"><div class="section-label">HOW TO PLAY</div><p>Move the bat.<br>Keep the ball alive.<br><em>Break every brick.</em></p><div class="control-row"><span>Move</span><span>Mouse / touch / <kbd>←</kbd><kbd>→</kbd></span></div><div class="control-row"><span>Launch / fire</span><span>Click / <kbd>Space</kbd></span></div><div class="control-row"><span>Pause</span><kbd>P</kbd></div><button id="bonuses" class="bonus-link">22 bonuses. Learn the symbols <span>↗</span></button></div>
  <div class="footnote"><span>110</span> original levels.<br>Three packs. One more try.</div></aside></div>
  <footer><span>Original game by <a href="http://www.jarkanoid.com/aboutjb.htm" target="_blank" rel="noreferrer">Jérôme Barjot</a></span><span>TypeScript + Canvas · Unofficial preservation port</span><span id="status" role="status" aria-live="polite">Loading game data</span></footer></main>
  <dialog id="dialog"><div class="dialog-header"><div><span class="eyebrow" id="dialog-kicker">JARKANOÏD 3</span><h2 id="dialog-title"></h2></div><button id="close-dialog" class="icon-button" aria-label="Close dialog">×</button></div><div id="dialog-content"></div></dialog>`;
const canvas = $<HTMLCanvasElement>("#game"),
  renderer = new Renderer(canvas),
  dialog = $<HTMLDialogElement>("#dialog");
const score = $("#score"),
  best = $("#best"),
  lives = $("#lives"),
  balls = $("#balls"),
  bricks = $("#bricks");
best.textContent = String(save.best).padStart(6, "0");

function store() {
  save.pack = pack;
  save.level = level;
  save.best = Math.max(save.best, game.score);
  save.settings = { ...game.settings };
  save.muted = sound.muted;
  writeSave(save);
}
async function load(nextPack: number, nextLevel: number, fresh = true) {
  const request = ++token;
  loading = true;
  game.firing = false;
  keys.clear();
  $("#overlay").hidden = false;
  $("#overlay-kicker").textContent = "ONE MOMENT";
  $("#overlay-title").textContent = "Loading level…";
  $("#overlay-copy").textContent = "Preparing the original artwork.";
  $("#primary").hidden = true;
  try {
    const data = await loadArt(nextPack, nextLevel);
    if (request !== token) return;
    pack = nextPack;
    level = nextLevel;
    renderer.setArt(data.art);
    game.load(data.level, fresh);
    loading = false;
    lastPhase = "";
    const p = manifest.packs[pack];
    $("#pack-label").textContent = p.name;
    $("#level-title").textContent = `LEVEL ${String(level).padStart(2, "0")}`;
    $("#level-big").textContent = String(level).padStart(2, "0");
    $("#level-count").textContent = `OF ${p.levels}`;
    $("#status").textContent = `${p.name} · Level ${level} · Ready to play`;
    store();
    void sound.track(pack, p.music[level - 1]);
    updateUI();
  } catch (error) {
    if (request !== token) return;
    $("#overlay-kicker").textContent = "ASSETS UNAVAILABLE";
    $("#overlay-title").textContent = "Couldn’t load the game.";
    $("#overlay-copy").textContent =
      "Run npm run setup:assets to recover the original files, then reload this page.";
    $("#status").textContent = String(error);
    console.error(error);
  }
}
function activate() {
  if (loading) return;
  void sound
    .unlock()
    .then(() => sound.track(pack, manifest.packs[pack].music[level - 1]));
  if (game.phase === "paused") game.pause();
  else if (game.phase === "cleared") {
    if (level < manifest.packs[pack].levels) void load(pack, level + 1, false);
    else void load((pack + 1) % manifest.packs.length, 1, false);
  } else if (game.phase === "gameover") void load(pack, level, true);
  else game.launch();
  canvas.focus({ preventScroll: true });
  updateUI();
}
function pause() {
  if (loading || dialog.open) return;
  game.pause();
  sound.pause(game.phase === "paused");
  updateUI();
}
function updateUI() {
  score.textContent = String(game.score).padStart(6, "0");
  best.textContent = String(Math.max(save.best, game.score)).padStart(6, "0");
  lives.textContent = String(game.lives).padStart(2, "0");
  balls.textContent = String(game.balls.length).padStart(2, "0");
  bricks.textContent = String(game.remaining).padStart(3, "0");
  const total = game.original.filter(Boolean).length,
    percent = total ? Math.round((1 - game.remaining / total) * 100) : 0;
  $("#progress").style.width = `${percent}%`;
  $("#progress-percent").textContent = `${percent}%`;
  $("#progress-text").textContent =
    game.phase === "ready"
      ? "Ready when you are"
      : `${total - game.remaining} bricks cleared`;
  $("#pause").innerHTML =
    game.phase === "paused"
      ? "▶ <span>Resume game</span><kbd>P</kbd>"
      : "Ⅱ <span>Pause game</span><kbd>P</kbd>";
  $<HTMLButtonElement>("#pause").disabled =
    loading || game.phase === "cleared" || game.phase === "gameover";
  if (lastPhase === game.phase || loading) return;
  lastPhase = game.phase;
  $("#overlay").hidden = game.phase === "playing";
  $("#primary").hidden = false;
  const title = $("#overlay-title"),
    copy = $("#overlay-copy"),
    kicker = $("#overlay-kicker"),
    button = $("#primary");
  if (game.phase === "ready") {
    kicker.textContent = `${manifest.packs[pack].name} / LEVEL ${String(level).padStart(2, "0")}`;
    title.textContent = "Ready to break out?";
    copy.textContent = "Move your mouse or drag to aim the bat.";
    button.innerHTML = "Launch ball <span>↗</span>";
  }
  if (game.phase === "paused") {
    kicker.textContent = "TAKE YOUR TIME";
    title.textContent = "On a break.";
    copy.textContent = "Your wall will be right here.";
    button.innerHTML = "Resume game <span>▶</span>";
  }
  if (game.phase === "gameover") {
    kicker.textContent = "ONE MORE TRY?";
    title.textContent = "Game over.";
    copy.textContent = `You scored ${game.score.toLocaleString()} points.`;
    button.innerHTML = "Play again <span>↻</span>";
    store();
  }
  if (game.phase === "cleared") {
    kicker.textContent = "WALL, MEET BALL.";
    title.textContent =
      level === manifest.packs[pack].levels
        ? "Pack complete!"
        : "Level cleared.";
    copy.textContent = `${game.score.toLocaleString()} points. ${game.lives} ${game.lives === 1 ? "life" : "lives"} in hand.`;
    button.innerHTML =
      level === manifest.packs[pack].levels
        ? "Play next pack <span>→</span>"
        : "Next level <span>→</span>";
    save.unlocked[pack] = Math.max(
      save.unlocked[pack],
      Math.min(level + 1, manifest.packs[pack].levels),
    );
    store();
  }
  if (game.phase !== "playing")
    $("#status").textContent =
      `${manifest.packs[pack].name} · Level ${level} · ${game.phase}`;
}
function openDialog(title: string, content: string) {
  menuPaused = game.running;
  if (menuPaused) game.pause();
  sound.pause(true);
  keys.clear();
  $("#dialog-title").textContent = title;
  $("#dialog-content").innerHTML = content;
  dialog.showModal();
  updateUI();
}
function closeDialog() {
  dialog.close();
  if (menuPaused && game.phase === "paused") game.pause();
  sound.pause(game.phase === "paused");
  menuPaused = false;
  updateUI();
  canvas.focus({ preventScroll: true });
}
$("#close-dialog").onclick = closeDialog;
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeDialog();
});
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeDialog();
  }
});
function showLevels() {
  levelDialogPack = pack;
  openDialog(
    "Choose your wall.",
    '<p class="dialog-intro">All 110 original levels are yours to explore. Choosing a level starts a fresh session.</p><div class="pack-tabs"></div><div class="level-grid"></div>',
  );
  drawLevels();
}
function drawLevels() {
  $(".pack-tabs").innerHTML = manifest.packs
    .map(
      (p) =>
        `<button data-pack="${p.id}" class="${p.id === levelDialogPack ? "selected" : ""}">${p.name}<span>${p.levels} levels</span></button>`,
    )
    .join("");
  document.querySelectorAll<HTMLButtonElement>("[data-pack]").forEach(
    (b) =>
      (b.onclick = () => {
        levelDialogPack = Number(b.dataset.pack);
        drawLevels();
      }),
  );
  $(".level-grid").innerHTML = Array.from(
    { length: manifest.packs[levelDialogPack].levels },
    (_, i) =>
      `<button class="level-card ${levelDialogPack === pack && i + 1 === level ? "selected" : ""}" data-level="${i + 1}"><img src="${asset(levelDialogPack, `level-${i + 1}.jpg`)}" loading="lazy" alt=""><span>LEVEL ${String(i + 1).padStart(2, "0")}<i>${i + 1 < save.unlocked[levelDialogPack] ? "✓" : "↗"}</i></span></button>`,
  ).join("");
  document.querySelectorAll<HTMLButtonElement>("[data-level]").forEach(
    (b) =>
      (b.onclick = () => {
        const selected = Number(b.dataset.level);
        menuPaused = false;
        closeDialog();
        void load(levelDialogPack, selected);
      }),
  );
}
$("#levels").onclick = () => {
  if (!loading) showLevels();
};
$("#settings").onclick = () => {
  const sliders = [
    ["speed", "Starting ball speed", 200, 700, 10, "px/s"],
    ["acceleration", "Ball acceleration", 0, 15, 1, "px/s²"],
    ["bonusRate", "Bonus frequency", 0, 0.5, 0.01, "%"],
    ["bonusSpeed", "Falling bonus speed", 50, 220, 5, "px/s"],
    ["maxBonuses", "Bonuses on screen", 1, 22, 1, ""],
    ["volume", "Audio volume", 0, 1, 0.05, "%"],
  ] as const;
  openDialog(
    "Make it your game.",
    `<p class="dialog-intro">Tune the pace, the risk, and the reward. Settings save automatically.</p><div class="settings-list">${sliders.map(([key, label, min, max, step, unit]) => `<label class="setting"><span>${label}<output id="value-${key}"></output></span><input type="range" id="setting-${key}" min="${min}" max="${max}" step="${step}" value="${game.settings[key]}" data-unit="${unit}"></label>`).join("")}<label class="check-setting">Original music <input type="checkbox" id="music-setting" ${game.settings.music ? "checked" : ""}></label></div><button class="wide" id="restore">Restore default settings</button>`,
  );
  for (const [key, , , , , unit] of sliders) {
    const input = $<HTMLInputElement>(`#setting-${key}`);
    const show = () => {
      $(`#value-${key}`).textContent =
        `${unit === "%" ? Math.round(game.settings[key] * 100) : game.settings[key]}${unit ? ` ${unit}` : ""}`;
    };
    input.oninput = () => {
      game.settings[key] = Number(input.value);
      sound.setVolume(game.settings.volume);
      store();
      show();
    };
    show();
  }
  $<HTMLInputElement>("#music-setting").onchange = (e) => {
    game.settings.music = (e.target as HTMLInputElement).checked;
    sound.setMusic(game.settings.music);
    store();
  };
  $("#restore").onclick = () => {
    game.settings = { ...defaults };
    sound.setVolume(defaults.volume);
    sound.setMusic(defaults.music);
    store();
    for (const [key] of sliders) {
      const input = $<HTMLInputElement>(`#setting-${key}`);
      input.value = String(defaults[key]);
      input.dispatchEvent(new Event("input"));
    }
    $<HTMLInputElement>("#music-setting").checked = defaults.music;
  };
};
$("#bonuses").onclick = () => {
  openDialog(
    "Catch the good stuff.",
    `<p class="dialog-intro">Blue helps. Red hurts. Some effects replace one another, so choose what you catch.</p><div class="bonus-grid">${BONUSES.map(([name, desc], i) => `<div class="bonus-item"><canvas width="33" height="33" data-bonus="${i}"></canvas><div><strong class="${BAD_BONUSES.has(i) ? "danger" : ""}">${name}</strong><p>${desc}</p></div></div>`).join("")}</div>`,
  );
  document.querySelectorAll<HTMLCanvasElement>("[data-bonus]").forEach((c) => {
    const rect = renderer.art?.atlas[`BONUS/${Number(c.dataset.bonus) + 1}`];
    if (rect && renderer.art)
      c.getContext("2d")!.drawImage(
        renderer.art.sprites,
        ...rect,
        0,
        0,
        33,
        33,
      );
  });
};
$("#about").onclick = () =>
  openDialog(
    "A classic, recovered.",
    `<div class="about-copy"><p>Jarkanoid 3 was created by <strong>Jérôme Barjot / ElitzaSoftware</strong>. This unofficial browser port uses the original game’s 110 level layouts, graphics, animated sprites, sound effects, and music, recovered from the official installer.</p><p>The engine is a new TypeScript implementation informed by static analysis of the Visual Basic 6 executable. It is playable without Windows, DirectX, or plugins.</p><p>Physics, effect timing, MIDI instruments, and the interface are adapted for the browser. The original 3D intro and outro sequences are not reproduced. This is a preservation port, not a claim of byte-for-byte equivalence or recovered original source code.</p><p>Original game and assets © Jérôme Barjot. <a href="http://www.jarkanoid.com/" target="_blank" rel="noreferrer">Visit the original website ↗</a></p></div>`,
  );
$("#restart").onclick = () => {
  if (loading) return;
  openDialog(
    "Start a fresh session?",
    '<p class="dialog-intro">Your current score and lives will reset. Your best score and unlocked levels stay saved.</p><button class="primary" id="confirm-restart">Restart this level ↻</button>',
  );
  $("#confirm-restart").onclick = () => {
    store();
    menuPaused = false;
    closeDialog();
    void load(pack, level, true);
  };
};
function mute() {
  sound.setMuted(!sound.muted);
  $("#mute").textContent = sound.muted ? "♪̸" : "♫";
  $("#mute").setAttribute(
    "aria-label",
    sound.muted ? "Unmute audio" : "Mute audio",
  );
  $("#mute").setAttribute("aria-pressed", String(sound.muted));
  store();
}
$("#mute").onclick = () => {
  void sound.unlock();
  mute();
};
if (sound.muted) {
  $("#mute").textContent = "♪̸";
  $("#mute").setAttribute("aria-label", "Unmute audio");
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $(".machine").requestFullscreen();
  } catch {
    $("#status").textContent = "Fullscreen is not available in this browser.";
  }
}
$("#fullscreen").onclick = () => void fullscreen();
$("#pause").onclick = pause;
$("#primary").onclick = activate;
function pointer(e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  game.movePaddle(((e.clientX - r.left) / r.width) * WIDTH);
}
canvas.addEventListener("pointermove", (e) => {
  if (!loading && game.running) pointer(e);
});
canvas.addEventListener("pointerdown", (e) => {
  if (loading) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  pointer(e);
  activate();
  game.firing = true;
});
canvas.addEventListener("pointerup", () => {
  game.firing = false;
});
canvas.addEventListener("pointercancel", () => {
  game.firing = false;
});
window.addEventListener("keydown", (e) => {
  if (dialog.open || e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  if (
    [
      "arrowleft",
      "arrowright",
      " ",
      "p",
      "escape",
      "a",
      "d",
      "m",
      "f",
    ].includes(k)
  )
    e.preventDefault();
  keys.add(k);
  if (e.repeat) return;
  if (k === " ") {
    activate();
    game.firing = true;
  }
  if (k === "p" || k === "escape") pause();
  if (k === "m") mute();
  if (k === "f") void fullscreen();
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
  if (e.key === " ") game.firing = false;
});
window.addEventListener("blur", () => {
  keys.clear();
  game.firing = false;
  if (!dialog.open && game.phase === "playing") pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && game.phase === "playing") pause();
});
window.addEventListener("pagehide", store);
let nextHud = 0;
function frame(time: number) {
  const dt = lastFrame ? (time - lastFrame) / 1000 : 0;
  lastFrame = time;
  if (!loading) {
    if (game.running && !dialog.open) {
      const direction =
        (keys.has("arrowright") || keys.has("d") ? 1 : 0) -
        (keys.has("arrowleft") || keys.has("a") ? 1 : 0);
      if (direction)
        game.movePaddle(game.paddleX + direction * 760 * Math.min(dt, 0.05));
      game.update(dt);
    }
    renderer.render(game);
    for (const event of game.events.splice(0)) void sound.effect(event, pack);
    if (time > nextHud || game.phase !== lastPhase) {
      updateUI();
      nextHud = time + 100;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
json<Manifest>(`${import.meta.env.BASE_URL}assets/manifest.json`)
  .then((m) => {
    manifest = m;
    return load(pack, level);
  })
  .catch((error) => {
    $("#overlay-title").textContent = "Original assets needed.";
    $("#overlay-copy").textContent =
      "Run npm run setup:assets, then reload this page.";
    $("#status").textContent = String(error);
  });
if (import.meta.env.DEV)
  Object.assign(window, {
    __jarkanoid: {
      game,
      load,
      renderer,
      sound,
      get pack() {
        return pack;
      },
      get level() {
        return level;
      },
    },
  });
