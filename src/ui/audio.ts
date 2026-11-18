import type { FxKind } from '../game/types';

/**
 * Ton ohne Dateien: alles wird mit der Web Audio API erzeugt (Konzept Kap. 14).
 * Muhen = Sägezahn mit Tiefpass und Abfall, Explosion = gefiltertes Rauschen,
 * Glocken = Sinus mit Obertönen, Platschen = hohes Rauschen.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  enabled = true;
  volume = 0.7;

  /** Browser erlauben Ton erst nach einer Eingabe: beim ersten Klick aufrufen. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private ready(): AudioContext | null {
    return this.enabled && this.ctx && this.master && this.ctx.state === 'running' ? this.ctx : null;
  }

  private env(at: number, attack: number, hold: number, release: number, peak = 1): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.setValueAtTime(peak, at + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
    g.connect(this.master!);
    return g;
  }

  private noise(at: number, dur: number, type: BiquadFilterType, freq: number, peak: number, sweepTo?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    src.connect(f).connect(this.env(at, 0.005, dur * 0.2, dur * 0.8, peak));
    src.start(at);
    src.stop(at + dur + 0.05);
  }

  private tone(at: number, type: OscillatorType, from: number, to: number, dur: number, peak: number, filter?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + dur);
    let node: AudioNode = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      o.connect(f);
      node = f;
    }
    node.connect(this.env(at, 0.02, dur * 0.4, dur * 0.6, peak));
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  /** Muhen: tiefer Ton, der langsam abfällt. pitch 1 = normal. */
  moo(pitch = 1, at?: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = at ?? ctx.currentTime;
    const base = 120 * pitch * (0.9 + Math.random() * 0.2);
    this.tone(t, 'sawtooth', base * 1.15, base * 0.8, 0.9, 0.35, 700);
    this.tone(t, 'sawtooth', base * 2.3, base * 1.6, 0.9, 0.08, 1200);
  }

  bell(at?: number, pitch = 1): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = at ?? ctx.currentTime;
    for (const [mul, peak] of [
      [1, 0.25],
      [2.76, 0.1],
      [5.4, 0.05],
    ] as const) {
      this.tone(t, 'sine', 880 * pitch * mul, 880 * pitch * mul * 0.99, 1.2, peak);
    }
  }

  boom(size: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = Math.min(1.6, size / 3);
    this.noise(t, 0.5 + s * 0.5, 'lowpass', 900, 0.9 * Math.max(0.4, s), 80);
    this.tone(t, 'sine', 90, 35, 0.5 + s * 0.3, 0.6 * s);
  }

  play(kind: FxKind, value: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (kind) {
      case 'boom':
        this.boom(value);
        break;
      case 'collapse':
        this.noise(t, 1.4, 'lowpass', 500, 0.8, 60);
        break;
      case 'home':
        this.moo(0.8);
        break;
      case 'splash':
        this.noise(t, 0.6, 'highpass', 900, 0.4, 3000);
        this.noise(t + 0.05, 0.4, 'bandpass', 600, 0.3);
        break;
      case 'heal':
        this.tone(t, 'triangle', 520, 780, 0.35, 0.2);
        this.tone(t + 0.12, 'triangle', 660, 990, 0.35, 0.15);
        break;
      case 'crate':
        this.tone(t, 'square', 660, 660, 0.08, 0.1);
        this.tone(t + 0.09, 'square', 880, 880, 0.08, 0.1);
        this.tone(t + 0.18, 'square', 1320, 1320, 0.15, 0.1);
        break;
      case 'promo':
        this.bell(t, 1);
        this.bell(t + 0.18, 1.26);
        this.bell(t + 0.36, 1.5);
        break;
      case 'shot':
        this.noise(t, 0.25, 'bandpass', 500, 0.35, 2500);
        break;
      case 'bell':
        this.bell(t, 1.2);
        this.bell(t + 0.25, 1.2);
        break;
      case 'stun':
        this.tone(t, 'sine', 1200, 600, 0.4, 0.12);
        break;
      case 'build':
        for (let i = 0; i < 3; i++) this.noise(t + i * 0.15, 0.08, 'bandpass', 300, 0.5);
        break;
      case 'click':
        this.tone(t, 'square', 1800, 1500, 0.05, 0.12);
        break;
      case 'flood':
        this.noise(t, 2.5, 'lowpass', 300, 0.5, 120);
        break;
      case 'puff':
        this.noise(t, 0.15, 'bandpass', 1500, 0.2);
        break;
      case 'jump':
        this.moo(1.3);
        break;
      case 'melee':
        this.noise(t, 0.15, 'lowpass', 400, 0.8);
        this.tone(t, 'sine', 160, 60, 0.2, 0.5);
        break;
      case 'cloak':
        this.tone(t, 'sine', 900, 200, 0.6, 0.15);
        break;
      case 'revive':
        this.bell(t, 0.75);
        this.moo(1.1, t + 0.3);
        break;
      case 'dmg':
        if (value >= 20) this.moo(1.4);
        break;
    }
  }

  /** Kurzes Ticken in den letzten Sekunden der Zugzeit. */
  tick(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.tone(ctx.currentTime, 'square', 1000, 1000, 0.04, 0.08);
  }

  /** „Du bist dran“. */
  yourTurn(): void {
    const ctx = this.ready();
    if (!ctx) return;
    this.bell(ctx.currentTime, 1);
    this.bell(ctx.currentTime + 0.15, 1.5);
  }
}
