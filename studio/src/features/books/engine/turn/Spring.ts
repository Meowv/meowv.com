export interface SpringOptions {
  stiffness?: number;
  damping?: number;
  initialPosition?: number;
  initialVelocity?: number;
  target?: number;
}

export class Spring {
  position: number;
  velocity: number;
  target: number;
  readonly stiffness: number;
  readonly damping: number;

  constructor(options: SpringOptions = {}) {
    this.position = options.initialPosition ?? 0;
    this.velocity = options.initialVelocity ?? 0;
    this.target = options.target ?? 1;
    this.stiffness = options.stiffness ?? 205;
    this.damping = options.damping ?? 25;
  }

  step(deltaSeconds: number): number {
    const delta = Math.min(1 / 30, Math.max(0, deltaSeconds));
    const acceleration =
      -this.stiffness * (this.position - this.target) - this.damping * this.velocity;
    this.velocity += acceleration * delta;
    this.position += this.velocity * delta;
    return this.position;
  }

  isSettled(positionTolerance = 0.001, velocityTolerance = 0.005): boolean {
    return (
      Math.abs(this.position - this.target) <= positionTolerance &&
      Math.abs(this.velocity) <= velocityTolerance
    );
  }

  settle(): void {
    this.position = this.target;
    this.velocity = 0;
  }
}
