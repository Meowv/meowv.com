import type { MermaidCanvasView, Tool } from '@visimer/dom';
import type { MermaidWysiwygEditor, TextPaneBinding } from '@visimer/core';
import type { MermaidConfig } from 'mermaid';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  addActionFor,
  selectionSupportsConnect,
  visualReadOnly,
  type MermaidAddAction,
} from '@/features/mermaid/visual/capabilities';
import { createSerializedMermaidAdapter } from '@/features/mermaid/visual/mermaidAdapter';
import { createViewportScaleSync } from '@/features/mermaid/visual/viewportAdapter';
import { installVisualChrome } from '@/features/mermaid/visual/visualChrome';

export type MermaidVisualRenderResult =
  { ok: true; empty: false } | { ok: false; empty: boolean; error: string };

interface MermaidEditingSessionOptions {
  code: string;
  config: MermaidConfig;
  container: HTMLElement;
  monacoEditor: MonacoEditor.IStandaloneCodeEditor;
  onCodeChange(code: string): void;
  onRender(result: MermaidVisualRenderResult): void;
  onViewportScale(scale: number): void;
}

export class MermaidEditingSession {
  private readonly options: MermaidEditingSessionOptions;
  private engine: MermaidWysiwygEditor | null = null;
  private view: MermaidCanvasView | null = null;
  private binding: TextPaneBinding | null = null;
  private viewportSync: { sync(): void; dispose(): void } | null = null;
  private chrome: { dispose(): void } | null = null;
  private disposers: Array<() => void> = [];
  private config: MermaidConfig;
  private mountSequence = 0;
  private pendingEditEntity: string | null = null;
  private touchConnectPending = false;
  private touchConnectSource: string | null = null;
  private selectionRestoreTimer: number | undefined;
  private disposed = false;

  constructor(options: MermaidEditingSessionOptions) {
    this.options = options;
    this.config = options.config;
  }

  get selection(): readonly string[] {
    return this.engine?.selection ?? [];
  }

  get diagramType(): string {
    return this.engine?.result.typeInfo?.name ?? '';
  }

  get addAction(): MermaidAddAction | null {
    return this.engine ? addActionFor(this.engine.result) : null;
  }

  get supportsConnectSelection(): boolean {
    return Boolean(
      this.engine &&
      !this.touchConnectPending &&
      selectionSupportsConnect(this.engine.result, this.engine.selection),
    );
  }

  async mount(): Promise<void> {
    await this.rebuild();
  }

  async setDocument(code: string, config: MermaidConfig): Promise<void> {
    this.config = config;
    await this.rebuild(code);
  }

  setConfig(config: MermaidConfig): void {
    this.config = config;
    this.view?.setMermaidConfig(config as Record<string, unknown>);
  }

  undo(): void {
    this.binding?.undo();
  }

  redo(): void {
    this.binding?.redo();
  }

  async render(): Promise<void> {
    if (!this.engine?.code.trim()) {
      this.options.onRender({ ok: false, empty: true, error: '' });
      return;
    }
    await this.view?.render();
  }

  zoomBy(factor: number): void {
    this.view?.zoomBy(factor);
    this.viewportSync?.sync();
  }

  fitView(): void {
    this.view?.fitView();
    this.viewportSync?.sync();
  }

  setTool(tool: Tool): void {
    this.view?.setTool(tool);
  }

  addEntity(): boolean {
    const action = this.addAction;
    if (!action || !this.engine) return false;
    const result = this.engine.dispatch(action.operation, 'canvas');
    this.pendingEditEntity = result?.created?.[0] ?? null;
    return Boolean(result?.created?.length);
  }

  beginTouchConnect(): void {
    if (!this.view || !this.supportsConnectSelection) return;
    this.touchConnectPending = true;
    this.touchConnectSource = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mountSequence += 1;
    this.teardown();
  }

  private async rebuild(code = this.engine?.code ?? this.options.code): Promise<void> {
    const sequence = ++this.mountSequence;
    this.teardown();
    const model = this.options.monacoEditor.getModel();
    if (model && model.getValue() !== code) model.setValue(code);
    const [{ MermaidWysiwygEditor }, { MermaidCanvasView }, { bindMonaco }] = await Promise.all([
      import('@visimer/core'),
      import('@visimer/dom'),
      import('@visimer/monaco'),
    ]);
    if (this.disposed || sequence !== this.mountSequence) return;

    const engine = new MermaidWysiwygEditor({ code });
    const binding = bindMonaco(engine, this.options.monacoEditor, {
      highlightClassName: 'mermaid-monaco-entity',
    });
    const mermaid = createSerializedMermaidAdapter();
    const accentColor = getComputedStyle(this.options.container)
      .getPropertyValue('--mermaid-accent')
      .trim();
    let readOnly = visualReadOnly(engine.result);
    const keepSelectionForStudioChrome = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        !target.closest(
          '.mermaid-toolbar, .mermaid-preview-toolbar, .mermaid-config-panel, .mermaid-sidebar__tabs, .mermaid-mobile-tabs',
        )
      ) {
        return;
      }
      const selected = [...engine.selection];
      if (!selected.length) return;
      if (this.selectionRestoreTimer) window.clearTimeout(this.selectionRestoreTimer);
      this.selectionRestoreTimer = window.setTimeout(() => {
        this.selectionRestoreTimer = undefined;
        if (engine.selection.length === 0) engine.setSelection(selected, 'api');
      }, 0);
    };
    document.addEventListener('pointerdown', keepSelectionForStudioChrome, true);
    const view = new MermaidCanvasView({
      editor: engine,
      container: this.options.container,
      mermaid,
      mermaidConfig: this.config as Record<string, unknown>,
      panZoom: true,
      readOnly,
      accentColor: accentColor || undefined,
      hooks: {
        onEntityClick: (entityId, event) => this.handleEntityClick(entityId, event),
      },
    });

    this.engine = engine;
    this.binding = binding;
    this.view = view;
    this.viewportSync = createViewportScaleSync(
      this.options.container,
      this.options.onViewportScale,
    );
    this.chrome = installVisualChrome(this.options.container, this);
    this.disposers = [
      () => document.removeEventListener('pointerdown', keepSelectionForStudioChrome, true),
      engine.on('change', ({ code: nextCode }) => {
        const nextReadOnly = visualReadOnly(engine.result);
        if (nextReadOnly !== readOnly) {
          readOnly = nextReadOnly;
          view.setReadOnly(nextReadOnly);
        }
        this.options.onCodeChange(nextCode);
      }),
      view.on('render', ({ ok, error }) => {
        if (ok) {
          this.options.onRender({ ok: true, empty: false });
          const entity = this.pendingEditEntity;
          this.pendingEditEntity = null;
          if (entity && engine.entityExists(entity)) view.editEntityLabel(entity);
        } else {
          const empty = !engine.code.trim();
          this.options.onRender({ ok: false, empty, error: error ?? '' });
        }
      }),
    ];
  }

  private handleEntityClick(entityId: string, event: MouseEvent): void {
    if (!this.touchConnectPending || !this.engine) return;
    if (!this.touchConnectSource) {
      if (this.isConnectableEntity(entityId)) {
        this.touchConnectSource = entityId;
        event.preventDefault();
      }
      return;
    }
    const source = this.touchConnectSource;
    this.touchConnectPending = false;
    this.touchConnectSource = null;
    const operation = this.connectOperation(source, entityId);
    if (operation) this.engine.dispatch(operation, 'canvas');
  }

  private isConnectableEntity(entityId: string): boolean {
    if (!this.engine) return false;
    return Boolean(
      (this.engine.result.flowchart && entityId.startsWith('node:')) ||
      (this.engine.result.state && entityId.startsWith('state:')) ||
      (this.engine.result.classGraph && entityId.startsWith('class:')) ||
      (this.engine.result.er && entityId.startsWith('entity:')),
    );
  }

  private connectOperation(source: string, target: string) {
    if (!this.engine || source === target) return null;
    if (this.engine.result.flowchart && source.startsWith('node:') && target.startsWith('node:')) {
      return {
        type: 'connect' as const,
        source: source.slice(5),
        target: target.slice(5),
      };
    }
    if (this.engine.result.state && source.startsWith('state:') && target.startsWith('state:')) {
      return {
        type: 'st.connect' as const,
        source: source.slice(6),
        target: target.slice(6),
      };
    }
    if (
      this.engine.result.classGraph &&
      source.startsWith('class:') &&
      target.startsWith('class:')
    ) {
      return {
        type: 'cl.connect' as const,
        source: source.slice(6),
        target: target.slice(6),
      };
    }
    if (this.engine.result.er && source.startsWith('entity:') && target.startsWith('entity:')) {
      return {
        type: 'er.connect' as const,
        source: source.slice(7),
        target: target.slice(7),
      };
    }
    return null;
  }

  private teardown(): void {
    if (this.selectionRestoreTimer) window.clearTimeout(this.selectionRestoreTimer);
    this.selectionRestoreTimer = undefined;
    this.chrome?.dispose();
    this.chrome = null;
    this.viewportSync?.dispose();
    this.viewportSync = null;
    this.disposers.forEach((dispose) => dispose());
    this.disposers = [];
    this.binding?.dispose();
    this.binding = null;
    this.view?.destroy();
    this.view = null;
    this.engine = null;
    this.pendingEditEntity = null;
    this.touchConnectPending = false;
    this.touchConnectSource = null;
  }
}
