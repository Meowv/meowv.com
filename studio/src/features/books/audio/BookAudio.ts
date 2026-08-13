import type { TurnDirection } from '../engine/turn/PageCurl';

export type BookSound = 'open' | 'close' | 'turn';

export interface BookAudioOptions {
  enabled?: boolean;
  volume?: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

function setEnvelope(
  parameter: AudioParam,
  startTime: number,
  peak: number,
  attack: number,
  duration: number,
): void {
  parameter.cancelScheduledValues(startTime);
  parameter.setValueAtTime(0.0001, startTime);
  parameter.exponentialRampToValueAtTime(Math.max(0.0001, peak), startTime + attack);
  parameter.exponentialRampToValueAtTime(0.0001, startTime + duration);
}

export class BookAudio {
  #context: AudioContext | null = null;
  #masterGain: GainNode | null = null;
  #enabled: boolean;
  #volume: number;
  #disposed = false;

  constructor(options: BookAudioOptions = {}) {
    this.#enabled = options.enabled ?? true;
    this.#volume = clamp(options.volume ?? 0.22, 0, 1);
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) {
      throw new RangeError('volume 必须是有限数值。');
    }
    this.#volume = clamp(volume, 0, 1);
    if (this.#context && this.#masterGain) {
      this.#masterGain.gain.setTargetAtTime(this.#volume, this.#context.currentTime, 0.015);
    }
  }

  async #getContext(): Promise<AudioContext | null> {
    if (!this.#enabled || this.#disposed || typeof globalThis.AudioContext !== 'function') {
      return null;
    }
    if (!this.#context) {
      this.#context = new globalThis.AudioContext({ latencyHint: 'interactive' });
      this.#masterGain = this.#context.createGain();
      this.#masterGain.gain.value = this.#volume;
      this.#masterGain.connect(this.#context.destination);
    }
    if (this.#context.state === 'suspended') {
      await this.#context.resume();
    }
    return this.#context.state === 'running' ? this.#context : null;
  }

  #noiseBuffer(context: AudioContext, duration: number): AudioBuffer {
    const frameCount = Math.max(1, Math.ceil(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < frameCount; index += 1) {
      // 相关噪声比纯白噪声更接近轻薄纸张摩擦，也避免尖锐高频。
      previous = previous * 0.72 + (Math.random() * 2 - 1) * 0.28;
      channel[index] = previous;
    }
    return buffer;
  }

  #playPaperNoise(
    context: AudioContext,
    startTime: number,
    options: { duration: number; frequency: number; peak: number; sweep: number },
  ): void {
    if (!this.#masterGain) {
      return;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.#noiseBuffer(context, options.duration);
    filter.type = 'bandpass';
    filter.Q.value = 0.72;
    filter.frequency.setValueAtTime(options.frequency, startTime);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(80, options.frequency * options.sweep),
      startTime + options.duration,
    );
    setEnvelope(gain.gain, startTime, options.peak, 0.018, options.duration);
    source.connect(filter).connect(gain).connect(this.#masterGain);
    source.start(startTime);
    source.stop(startTime + options.duration + 0.02);
  }

  #playCoverTone(
    context: AudioContext,
    startTime: number,
    startFrequency: number,
    endFrequency: number,
    peak: number,
  ): void {
    if (!this.#masterGain) {
      return;
    }
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(startFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + 0.11);
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    setEnvelope(gain.gain, startTime, peak, 0.008, 0.14);
    oscillator.connect(filter).connect(gain).connect(this.#masterGain);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.16);
  }

  async playTurn(direction: TurnDirection = 'forward'): Promise<void> {
    const context = await this.#getContext();
    if (!context) {
      return;
    }
    const startTime = context.currentTime + 0.006;
    this.#playPaperNoise(context, startTime, {
      duration: 0.24,
      frequency: direction === 'forward' ? 1150 : 980,
      peak: 0.085,
      sweep: direction === 'forward' ? 1.7 : 1.4,
    });
    this.#playPaperNoise(context, startTime + 0.17, {
      duration: 0.12,
      frequency: 720,
      peak: 0.046,
      sweep: 0.7,
    });
  }

  async playOpen(): Promise<void> {
    const context = await this.#getContext();
    if (!context) {
      return;
    }
    const startTime = context.currentTime + 0.006;
    this.#playPaperNoise(context, startTime, {
      duration: 0.32,
      frequency: 520,
      peak: 0.052,
      sweep: 1.45,
    });
    this.#playCoverTone(context, startTime + 0.24, 104, 78, 0.038);
  }

  async playClose(): Promise<void> {
    const context = await this.#getContext();
    if (!context) {
      return;
    }
    const startTime = context.currentTime + 0.006;
    this.#playPaperNoise(context, startTime, {
      duration: 0.23,
      frequency: 650,
      peak: 0.045,
      sweep: 0.68,
    });
    this.#playCoverTone(context, startTime + 0.17, 92, 62, 0.052);
  }

  play(sound: BookSound, direction: TurnDirection = 'forward'): Promise<void> {
    if (sound === 'turn') {
      return this.playTurn(direction);
    }
    return sound === 'open' ? this.playOpen() : this.playClose();
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    const context = this.#context;
    this.#context = null;
    this.#masterGain = null;
    if (context && context.state !== 'closed') {
      await context.close();
    }
  }
}
