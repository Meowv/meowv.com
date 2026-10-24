export type TypingEffectMode = 'off' | 'stars' | 'rainbow' | 'fireworks';
export interface ChatParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  size: number;
  born: number;
  life: number;
  spin: number;
}
export function makeTypingParticles(
  x: number,
  y: number,
  now: number,
  mode: TypingEffectMode,
  random = Math.random,
): ChatParticle[] {
  if (mode === 'off') return [];
  return Array.from({ length: mode === 'stars' ? 4 : 6 }, (_, index) => {
    const angle = mode === 'fireworks' ? (index * Math.PI) / 3 : -Math.PI + random() * Math.PI;
    const speed = mode === 'fireworks' ? 80 : 25 + random() * 45;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 15,
      hue: (now + index * 60) % 360,
      size: mode === 'stars' ? 2 + random() * 2 : 2,
      born: now,
      life: 450 + random() * 250,
      spin: random() * Math.PI,
    };
  });
}
export function advanceTypingParticles(
  particles: ChatParticle[],
  now: number,
  seconds: number,
): ChatParticle[] {
  return particles
    .filter((particle) => now - particle.born < particle.life)
    .slice(-80)
    .map((particle) => ({
      ...particle,
      x: particle.x + particle.vx * seconds,
      y: particle.y + particle.vy * seconds,
      vy: particle.vy + 70 * seconds,
    }));
}
export class ChatTypingEffects {
  private particles: ChatParticle[] = [];
  private frame = 0;
  private last = 0;
  private lastBurst = -Infinity;
  private mode: TypingEffectMode = 'stars';
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  private context: CanvasRenderingContext2D | null;
  private disposed = false;
  private content = '';
  constructor(
    private canvas: HTMLCanvasElement,
    private caret: () => { x: number; y: number } | null,
  ) {
    this.context = canvas.getContext('2d');
    this.reduced.addEventListener('change', this.clear);
    document.addEventListener('visibilitychange', this.clear);
    window.addEventListener('blur', this.clear);
    window.addEventListener('resize', this.clear);
  }
  setMode(mode: TypingEffectMode) {
    this.mode = mode;
    this.clear();
  }
  contentChanged = (content: string) => {
    if (content === this.content) return;
    this.content = content;
    this.burst();
  };
  burst = () => {
    if (
      this.disposed ||
      !this.context ||
      this.mode === 'off' ||
      this.reduced.matches ||
      document.hidden
    )
      return;
    const now = performance.now();
    if (now - this.lastBurst < 50) return;
    const point = this.caret();
    if (!point) return;
    this.lastBurst = now;
    if (!this.frame) {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(window.innerWidth * ratio);
      this.canvas.height = Math.round(window.innerHeight * ratio);
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.last = now;
    }
    this.particles = [
      ...this.particles,
      ...makeTypingParticles(point.x, point.y, now, this.mode),
    ].slice(-80);
    if (!this.frame) this.frame = requestAnimationFrame(this.draw);
  };
  private draw = (now: number) => {
    this.frame = 0;
    if (this.disposed || !this.context) return;
    const context = this.context;
    this.particles = advanceTypingParticles(
      this.particles,
      now,
      Math.min((now - this.last) / 1000, 0.05),
    );
    this.last = now;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const particle of this.particles) {
      context.save();
      context.translate(particle.x, particle.y);
      context.rotate(particle.spin + (now - particle.born) / 400);
      context.globalAlpha = Math.max(0, 1 - (now - particle.born) / particle.life);
      context.fillStyle = `hsl(${particle.hue} 90% 65%)`;
      context.beginPath();
      if (this.mode === 'stars') {
        for (let index = 0; index < 8; index++) {
          const radius = index % 2 ? particle.size / 3 : particle.size;
          context.lineTo(
            Math.cos((index * Math.PI) / 4) * radius,
            Math.sin((index * Math.PI) / 4) * radius,
          );
        }
        context.closePath();
      } else context.arc(0, 0, particle.size, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    if (this.particles.length) this.frame = requestAnimationFrame(this.draw);
  };
  clear = () => {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.particles = [];
    this.context?.clearRect(0, 0, window.innerWidth, window.innerHeight);
  };
  destroy() {
    this.disposed = true;
    this.clear();
    this.reduced.removeEventListener('change', this.clear);
    document.removeEventListener('visibilitychange', this.clear);
    window.removeEventListener('blur', this.clear);
    window.removeEventListener('resize', this.clear);
  }
}
