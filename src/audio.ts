import { Midi } from "@tonejs/midi";
import { asset } from "./assets";
import type { GameEvent } from "./engine";

type Note = {
  time: number;
  duration: number;
  midi: number;
  velocity: number;
  percussion: boolean;
};
const soundIds: Record<GameEvent, number> = {
  bounce: 3,
  brick: 7,
  bonus: 12,
  bad: 14,
  lost: 2,
  fire: 19,
  clear: 1,
  explode: 9,
};
export class Sound {
  private ctx?: AudioContext;
  private master?: GainNode;
  private musicGain?: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Set<string>();
  private music?: AudioBufferSourceNode;
  private notes: Note[] = [];
  private musicLength = 0;
  private cursor = 0;
  private startTime = 0;
  private sequence = 0;
  private musicKey = "";
  private lastEffect = new Map<GameEvent, number>();
  private timer: ReturnType<typeof setInterval>;
  muted = false;
  volume = 0.55;
  musicEnabled = true;
  constructor() {
    this.timer = setInterval(() => this.schedule(), 100);
  }
  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.musicGain.gain.value = 0.25;
      this.setVolume(this.volume);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }
  setVolume(value: number) {
    this.volume = value;
    if (this.master) this.master.gain.value = this.muted ? 0 : value;
  }
  setMuted(value: boolean) {
    this.muted = value;
    this.setVolume(this.volume);
  }
  setMusic(value: boolean) {
    this.musicEnabled = value;
    if (this.musicGain) this.musicGain.gain.value = value ? 0.25 : 0;
  }
  async effect(event: GameEvent, pack: number) {
    if (!this.ctx || this.muted) return;
    const time = this.ctx.currentTime;
    if (time - (this.lastEffect.get(event) ?? -1) < 0.065) return;
    this.lastEffect.set(event, time);
    const key = asset(pack, `sound-${soundIds[event]}.mp3`);
    try {
      let buffer = this.buffers.get(key);
      if (!buffer) {
        if (this.pending.has(key)) return;
        this.pending.add(key);
        const response = await fetch(key);
        if (!response.ok) throw new Error("Missing sound");
        buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
        this.buffers.set(key, buffer);
        this.pending.delete(key);
      }
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.master!);
      source.start();
    } catch {
      this.pending.delete(key);
    }
  }
  async track(pack: number, filename: string | null) {
    if (!this.ctx || !filename) return;
    const key = asset(pack, filename);
    if (key === this.musicKey) return;
    this.musicKey = key;
    const sequence = ++this.sequence;
    this.music?.stop();
    this.music = undefined;
    this.notes = [];
    this.cursor = 0;
    try {
      const response = await fetch(key);
      if (!response.ok) throw new Error("Missing music");
      const data = await response.arrayBuffer();
      if (sequence !== this.sequence) return;
      if (filename.endsWith(".mid")) {
        const midi = new Midi(data);
        this.notes = midi.tracks
          .flatMap((t) =>
            t.notes.map((n) => ({
              time: n.time,
              duration: n.duration,
              midi: n.midi,
              velocity: n.velocity,
              percussion: t.instrument.percussion,
            })),
          )
          .sort((a, b) => a.time - b.time);
        this.musicLength = Math.max(1, midi.duration + 0.5);
        this.startTime = this.ctx.currentTime + 0.15;
      } else {
        const buffer = await this.ctx.decodeAudioData(data);
        if (sequence !== this.sequence) return;
        this.music = this.ctx.createBufferSource();
        this.music.buffer = buffer;
        this.music.loop = true;
        this.music.connect(this.musicGain!);
        this.music.start();
      }
    } catch (error) {
      console.warn("Music unavailable", error);
      this.musicKey = "";
    }
  }
  private schedule() {
    if (!this.ctx || !this.notes.length || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    if (now - this.startTime >= this.musicLength) {
      this.startTime += this.musicLength;
      this.cursor = 0;
    }
    while (
      this.cursor < this.notes.length &&
      this.notes[this.cursor].time < now - this.startTime + 0.25
    ) {
      const note = this.notes[this.cursor++],
        when = this.startTime + note.time;
      if (when < now - 0.1 || !this.musicEnabled || this.muted) continue;
      const osc = this.ctx.createOscillator(),
        gain = this.ctx.createGain();
      osc.type = note.percussion ? "triangle" : "sine";
      osc.frequency.value = 440 * 2 ** ((note.midi - 69) / 12);
      const start = Math.max(now, when),
        duration = Math.min(note.duration, 2);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(note.velocity * 0.14, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        start + Math.max(0.04, duration),
      );
      osc.connect(gain);
      gain.connect(this.musicGain!);
      osc.start(start);
      osc.stop(start + Math.max(0.05, duration) + 0.01);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    }
  }
  pause(paused: boolean) {
    if (this.ctx) void (paused ? this.ctx.suspend() : this.ctx.resume());
  }
  dispose() {
    clearInterval(this.timer);
    this.music?.stop();
    void this.ctx?.close();
  }
}
