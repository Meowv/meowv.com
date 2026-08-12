import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

type ParticleKind = 'confetti' | 'star' | 'dot';

interface Particle {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  gravity: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: ParticleKind;
  rotation: number;
  rotationSpeed: number;
}

const PARTICLE_COLORS = [
  '#f43f5e',
  '#f59e0b',
  '#22c55e',
  '#06b6d4',
  '#8b5cf6',
  '#ec4899',
  '#fbbf24',
];
const MAX_CELEBRATION_LEVEL = 8;
const MAX_PARTICLES = 144;
const FRAME_INTERVAL = 1000 / 30;
const CARD_TARGET_SELECTOR = '.tools-card, .bookmark-card';
const VISIBLE_CARD_CLASS = 'is-tools-celebration-visible';

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomSigned(magnitude: number): number {
  return randomBetween(-magnitude, magnitude);
}

export function useToolsCelebration(
  canvasRef: Ref<HTMLCanvasElement | null>,
  catalogRef: Ref<HTMLElement | null>,
) {
  const celebrationBurst = ref(0);
  const celebrationLevel = ref(0);
  const particles: Particle[] = [];

  let animationRunning = false;
  let burstTimer: number | null = null;
  let frameTimer: number | null = null;
  let lastFrame = 0;
  let context: CanvasRenderingContext2D | null = null;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let particleModeEnabled = false;
  let reducedMotionQuery: MediaQueryList | null = null;
  let cardObserver: IntersectionObserver | null = null;
  let cardMutationObserver: MutationObserver | null = null;
  let cardRefreshFrame: number | null = null;
  const observedCards = new Set<HTMLElement>();

  function refreshCardTargets(): void {
    cardRefreshFrame = null;
    const catalog = catalogRef.value;
    if (!catalog || !cardObserver) return;
    const nextCards = new Set(
      Array.from(catalog.querySelectorAll<HTMLElement>(CARD_TARGET_SELECTOR)),
    );

    for (const card of observedCards) {
      if (nextCards.has(card)) continue;
      cardObserver.unobserve(card);
      card.classList.remove(VISIBLE_CARD_CLASS);
      observedCards.delete(card);
    }
    for (const card of nextCards) {
      if (observedCards.has(card)) continue;
      observedCards.add(card);
      cardObserver.observe(card);
    }
  }

  function scheduleCardTargetRefresh(): void {
    if (cardRefreshFrame !== null) return;
    cardRefreshFrame = window.requestAnimationFrame(refreshCardTargets);
  }

  function startCardShake(): void {
    if (cardObserver) {
      scheduleCardTargetRefresh();
      return;
    }
    const catalog = catalogRef.value;
    if (!catalog) return;
    cardObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle(VISIBLE_CARD_CLASS, entry.isIntersecting);
        }
      },
      { root: catalog, rootMargin: '80px 0px' },
    );
    cardMutationObserver = new MutationObserver(scheduleCardTargetRefresh);
    cardMutationObserver.observe(catalog, { childList: true, subtree: true });
    refreshCardTargets();
  }

  function stopCardShake(): void {
    if (cardRefreshFrame !== null) window.cancelAnimationFrame(cardRefreshFrame);
    cardRefreshFrame = null;
    cardMutationObserver?.disconnect();
    cardMutationObserver = null;
    cardObserver?.disconnect();
    cardObserver = null;
    for (const card of observedCards) card.classList.remove(VISIBLE_CARD_CLASS);
    observedCards.clear();
  }

  function resizeCanvas(): boolean {
    const canvas = canvasRef.value;
    if (!canvas) return false;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return false;
    if (width !== canvasWidth || height !== canvasHeight || canvas.width === 0) {
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      context = canvas.getContext('2d');
      context?.setTransform(1, 0, 0, 1, 0, 0);
      canvasWidth = width;
      canvasHeight = height;
    }
    return context !== null;
  }

  function spawnBurst(count: number): void {
    const originX = randomBetween(canvasWidth * 0.06, canvasWidth * 0.94);
    const originY = randomBetween(canvasHeight * 0.08, canvasHeight * 0.9);

    for (let index = 0; index < count && particles.length < MAX_PARTICLES; index++) {
      const roll = Math.random();
      const kind: ParticleKind = roll < 0.58 ? 'confetti' : roll < 0.82 ? 'dot' : 'star';
      const angle = randomBetween(0, Math.PI * 2);
      const speed = randomBetween(40, 155);
      particles.push({
        x: originX + randomSigned(8),
        y: originY + randomSigned(8),
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        gravity: randomBetween(35, 135),
        life: 0,
        maxLife: randomBetween(0.75, 1.4),
        size:
          kind === 'confetti'
            ? randomBetween(4, 8)
            : kind === 'star'
              ? randomBetween(9, 14)
              : randomBetween(2, 4),
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        kind,
        rotation: randomBetween(0, Math.PI * 2),
        rotationSpeed: randomSigned(7),
      });
    }
  }

  function spawnAcrossPage(originCount: number): void {
    const level = Math.max(1, celebrationLevel.value);
    const minCount = 3 + level * 0.45;
    const maxCount = 6 + level * 0.75;
    for (let index = 0; index < originCount && particles.length < MAX_PARTICLES; index++) {
      spawnBurst(Math.floor(randomBetween(minCount, maxCount)));
    }
  }

  function getNextBurstDelay(): number {
    const level = Math.max(1, celebrationLevel.value);
    const minDelay = Math.max(160, 440 - (level - 1) * 38);
    const maxDelay = Math.max(340, 760 - (level - 1) * 60);
    return randomBetween(minDelay, maxDelay);
  }

  function getRandomOriginCount(): number {
    const level = Math.max(1, celebrationLevel.value);
    let count = 1;
    if (Math.random() < level / 10) count += 1;
    if (level >= 6 && Math.random() < (level - 5) * 0.12) count += 1;
    return count;
  }

  function startAnimation(): void {
    if (animationRunning || particles.length === 0) return;
    animationRunning = true;
    lastFrame = performance.now();
    drawFrame(lastFrame);
  }

  function scheduleNextFrame(): void {
    const delay = Math.max(0, lastFrame + FRAME_INTERVAL - performance.now());
    frameTimer = window.setTimeout(() => {
      frameTimer = null;
      drawFrame(performance.now());
    }, delay);
  }

  function scheduleNextBurst(): void {
    if (
      !particleModeEnabled ||
      reducedMotionQuery?.matches ||
      document.visibilityState === 'hidden'
    )
      return;
    if (burstTimer !== null) window.clearTimeout(burstTimer);
    burstTimer = window.setTimeout(() => {
      burstTimer = null;
      if (resizeCanvas()) {
        spawnAcrossPage(getRandomOriginCount());
        startAnimation();
      }
      scheduleNextBurst();
    }, getNextBurstDelay());
  }

  function drawStar(target: CanvasRenderingContext2D, particle: Particle): void {
    target.save();
    target.translate(particle.x, particle.y);
    target.rotate(particle.rotation);
    target.beginPath();
    for (let index = 0; index < 8; index++) {
      const radius = index % 2 === 0 ? particle.size / 2 : particle.size / 5;
      const angle = -Math.PI / 2 + (index * Math.PI) / 4;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) target.moveTo(x, y);
      else target.lineTo(x, y);
    }
    target.closePath();
    target.fill();
    target.restore();
  }

  function drawFrame(now: number): void {
    const target = context;
    if (!target) {
      animationRunning = false;
      return;
    }
    const elapsed = Math.min(Math.max((now - lastFrame) / 1000, 0), 0.05);
    lastFrame = now;
    target.clearRect(0, 0, canvasWidth, canvasHeight);

    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index];
      particle.life += elapsed;
      if (particle.life >= particle.maxLife) {
        particles[index] = particles[particles.length - 1];
        particles.pop();
        continue;
      }
      particle.velocityY += particle.gravity * elapsed;
      particle.x += particle.velocityX * elapsed;
      particle.y += particle.velocityY * elapsed;
      particle.rotation += particle.rotationSpeed * elapsed;
      target.globalAlpha = 1 - particle.life / particle.maxLife;
      target.fillStyle = particle.color;

      if (particle.kind === 'confetti') {
        target.save();
        target.translate(particle.x, particle.y);
        target.rotate(particle.rotation);
        target.fillRect(
          -particle.size / 2,
          -particle.size / 2,
          particle.size,
          particle.size * 0.58,
        );
        target.restore();
      } else if (particle.kind === 'star') {
        drawStar(target, particle);
      } else {
        target.beginPath();
        target.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        target.fill();
      }
    }
    target.globalAlpha = 1;

    if (particles.length > 0) {
      scheduleNextFrame();
    } else {
      animationRunning = false;
    }
  }

  function pauseParticles(): void {
    if (burstTimer !== null) window.clearTimeout(burstTimer);
    if (frameTimer !== null) window.clearTimeout(frameTimer);
    animationRunning = false;
    burstTimer = null;
    frameTimer = null;
    particles.length = 0;
    context?.clearRect(0, 0, canvasWidth, canvasHeight);
  }

  function triggerCelebration(): void {
    celebrationBurst.value += 1;
    celebrationLevel.value = Math.min(celebrationLevel.value + 1, MAX_CELEBRATION_LEVEL);
    startCardShake();

    particleModeEnabled = true;
    if (reducedMotionQuery?.matches) return;
    if (resizeCanvas()) {
      spawnAcrossPage(2 + Math.ceil(celebrationLevel.value / 3));
      startAnimation();
    }
    scheduleNextBurst();
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      pauseParticles();
      return;
    }
    if (!particleModeEnabled || reducedMotionQuery?.matches) return;
    if (resizeCanvas()) {
      spawnAcrossPage(2);
      startAnimation();
    }
    scheduleNextBurst();
  }

  function handleMotionPreferenceChange(): void {
    if (reducedMotionQuery?.matches) {
      pauseParticles();
      return;
    }
    if (!particleModeEnabled) return;
    if (resizeCanvas()) {
      spawnAcrossPage(2);
      startAnimation();
    }
    scheduleNextBurst();
  }

  onMounted(() => {
    reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionQuery.addEventListener('change', handleMotionPreferenceChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  });
  onBeforeUnmount(() => {
    reducedMotionQuery?.removeEventListener('change', handleMotionPreferenceChange);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    particleModeEnabled = false;
    pauseParticles();
    stopCardShake();
  });

  return { celebrationBurst, celebrationLevel, triggerCelebration };
}
