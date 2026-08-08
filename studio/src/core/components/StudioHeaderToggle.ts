import {
  calculateHeaderToggleX,
  clampHeaderToggleX,
  getHeaderToggleX,
  isHeaderToggleDragging,
  setHeaderToggleX,
} from '@/core/shared/header-toggle';

const TAG_NAME = 'studio-header-toggle';

function isVisible(value: unknown): boolean {
  return value === true || value === '' || value === 'true';
}

class StudioHeaderToggle extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['visible'];
  }

  private readonly button: HTMLButtonElement;
  private visibleValue = true;
  private position = clampHeaderToggleX(getHeaderToggleX());
  private dragStart: { clientX: number; position: number } | null = null;
  private moved = false;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host {
          position: var(--studio-header-toggle-position, fixed);
          z-index: 50;
          top: var(--studio-header-toggle-top, 35px);
          left: var(--studio-header-toggle-x, 50%);
          display: block;
          width: 26px;
          height: 26px;
          transform: translateX(-50%);
          transition: top 180ms ease, transform 180ms ease;
        }

        :host([data-collapsed='true']) {
          top: var(--studio-header-toggle-collapsed-top, 14px);
        }

        button {
          display: grid;
          width: 100%;
          height: 100%;
          padding: 0;
          border: 1px solid color-mix(in srgb, var(--studio-header-toggle-color, var(--color-brand)) 82%, transparent);
          border-radius: 999px;
          color: #fff;
          background: var(--studio-header-toggle-color, var(--color-brand));
          box-shadow: 0 3px 10px color-mix(in srgb, var(--studio-header-toggle-color, var(--color-brand)) 28%, transparent);
          cursor: pointer;
          opacity: 0.18;
          place-items: center;
          touch-action: none;
          transition: opacity 180ms ease, color 180ms ease, background 180ms ease;
        }

        :host(:hover), :host(:focus-within) {
          transform: translate(-50%, -1px);
        }

        :host(:hover) button, button:focus-visible {
          color: #fff;
          background: var(--studio-header-toggle-hover-color, color-mix(in srgb, var(--studio-header-toggle-color, var(--color-brand)) 88%, #000));
          opacity: 0.6;
        }

        button:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--studio-header-toggle-color, var(--color-brand)) 48%, transparent);
          outline-offset: 2px;
        }

        svg {
          width: 10px;
          height: 10px;
          fill: none;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 2;
        }
      </style>
      <button type="button"></button>
    `;
    this.button = shadow.querySelector('button')!;
    this.button.addEventListener('pointerdown', this.handlePointerDown);
    this.button.addEventListener('click', this.handleClick);
  }

  get visible(): boolean {
    return this.visibleValue;
  }

  set visible(value: boolean | string) {
    const nextVisible = isVisible(value);
    this.visibleValue = nextVisible;
    this.toggleAttribute('visible', nextVisible);
    this.updateAppearance();
  }

  connectedCallback(): void {
    this.position = clampHeaderToggleX(getHeaderToggleX());
    this.updateAppearance();
    this.updatePosition();
  }

  disconnectedCallback(): void {
    this.stopDragging();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, value: string | null): void {
    if (name !== 'visible') return;
    this.visibleValue = isVisible(value);
    this.updateAppearance();
  }

  private updateAppearance(): void {
    if (!this.isConnected) return;
    const collapsed = !this.visibleValue;
    const label = collapsed ? '显示顶部栏' : '隐藏顶部栏';
    this.dataset.collapsed = String(collapsed);
    this.button.setAttribute('aria-label', label);
    this.button.title = label;
    this.button.innerHTML = collapsed
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg>';
  }

  private updatePosition(): void {
    this.style.setProperty('--studio-header-toggle-x', `${this.position}%`);
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    this.dragStart = { clientX: event.clientX, position: this.position };
    this.moved = false;
    document.addEventListener('pointermove', this.handlePointerMove);
    document.addEventListener('pointerup', this.stopDragging);
    document.addEventListener('pointercancel', this.stopDragging);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.dragStart) return;
    const nextPosition = calculateHeaderToggleX(
      this.dragStart.position,
      this.dragStart.clientX,
      event.clientX,
      window.innerWidth,
    );
    if (!this.moved && isHeaderToggleDragging(event.clientX - this.dragStart.clientX)) {
      this.moved = true;
    }
    this.position = nextPosition;
    this.updatePosition();
    setHeaderToggleX(nextPosition);
  };

  private stopDragging = (): void => {
    if (!this.dragStart) return;
    const moved = this.moved;
    document.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('pointerup', this.stopDragging);
    document.removeEventListener('pointercancel', this.stopDragging);
    this.dragStart = null;
    if (moved) window.setTimeout(() => (this.moved = false));
  };

  private handleClick = (event: MouseEvent): void => {
    if (!this.moved) return;
    event.preventDefault();
    event.stopPropagation();
    this.moved = false;
  };
}

export function registerStudioHeaderToggle(): void {
  if (!customElements.get(TAG_NAME)) customElements.define(TAG_NAME, StudioHeaderToggle);
}
