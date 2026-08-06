import MindElixir, { type MindElixirData, type NodeObj, type Theme, type Topic } from 'mind-elixir';
import 'mind-elixir/style.css';
import type { MindDirection } from '../types';

export interface VisualMindEditorCallbacks {
  onChange: () => void;
  onSelect: (node: NodeObj | null) => void;
}

function directionValue(direction: MindDirection): 0 | 1 | 2 | 3 {
  switch (direction) {
    case 'left':
      return 0;
    case 'right':
      return 1;
    case 'down':
      return 3;
    default:
      return 2;
  }
}

export class VisualMindEditorAdapter {
  private instance: MindElixir | null = null;
  private selectedNode: Topic | null = null;
  private container: HTMLElement | null = null;
  private panPointerId: number | null = null;
  private panX = 0;
  private panY = 0;
  private onSelect: (node: NodeObj | null) => void = () => undefined;

  private readonly handleDoubleClick = (event: MouseEvent): void => {
    if (!this.instance || this.container?.querySelector('#input-box')) return;
    const target = event.target instanceof Element ? event.target.closest('me-tpc') : null;
    if (target) void this.instance.beginEdit(target as Topic);
  };

  private readonly handleNodePointerDown = (event: PointerEvent): void => {
    if (!(event.target instanceof Element)) return;
    const node = event.target.closest<Topic>('me-tpc');
    if (!node) return;
    queueMicrotask(() => {
      this.select(node.nodeObj, this.onSelect);
      this.instance?.container.focus();
    });
  };

  private readonly handleNodeKeyDown = (event: KeyboardEvent): void => {
    if (
      !this.instance ||
      event.isComposing ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey ||
      (event.key !== 'Tab' && event.key !== 'Enter')
    )
      return;
    const selectedId = this.selectedNode?.nodeObj.id;
    if (!selectedId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.finishEditing();
    if (event.key === 'Tab') void this.addChild(selectedId);
    else void this.addSibling(selectedId);
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.instance || event.deltaY === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const unit =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? this.instance.container.clientHeight || window.innerHeight
          : 1;
    const delta = Math.max(-0.12, Math.min(0.12, -event.deltaY * unit * 0.0015));
    this.instance.scale(
      Math.max(
        this.instance.scaleMin,
        Math.min(this.instance.scaleMax, this.instance.scaleVal + delta),
      ),
      { x: event.clientX, y: event.clientY },
    );
  };

  private readonly handleCanvasPointerDown = (event: PointerEvent): void => {
    if (
      !this.instance ||
      event.button !== 0 ||
      !(event.target instanceof Element) ||
      !event.target.classList.contains('map-container')
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.panPointerId = event.pointerId;
    this.panX = event.clientX;
    this.panY = event.clientY;
    this.container?.classList.add('mind-is-panning');
    window.addEventListener('pointermove', this.handleCanvasPointerMove);
    window.addEventListener('pointerup', this.handleCanvasPointerUp, { once: true });
    window.addEventListener('pointercancel', this.handleCanvasPointerUp, { once: true });
  };

  private readonly handleCanvasPointerMove = (event: PointerEvent): void => {
    if (!this.instance || event.pointerId !== this.panPointerId) return;
    const deltaX = event.clientX - this.panX;
    const deltaY = event.clientY - this.panY;
    this.panX = event.clientX;
    this.panY = event.clientY;
    this.instance.move(deltaX, deltaY);
  };

  private readonly handleCanvasPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.panPointerId) return;
    this.panPointerId = null;
    this.container?.classList.remove('mind-is-panning');
    window.removeEventListener('pointermove', this.handleCanvasPointerMove);
    window.removeEventListener('pointerup', this.handleCanvasPointerUp);
    window.removeEventListener('pointercancel', this.handleCanvasPointerUp);
  };

  private select(node: NodeObj | null, callback: (node: NodeObj | null) => void): void {
    this.container
      ?.querySelectorAll('me-tpc.mind-node-selected')
      .forEach((element) => element.classList.remove('mind-node-selected'));
    this.selectedNode = node ? this.findNode(node.id) : null;
    this.selectedNode?.classList.add('mind-node-selected');
    callback(this.selectedNode?.nodeObj ?? null);
  }

  private findNode(nodeId: string): Topic | null {
    if (!this.instance) return null;
    try {
      return this.instance.findEle(nodeId);
    } catch {
      return null;
    }
  }

  private getTargetNode(nodeId?: string): Topic | null {
    if (!this.instance) return null;
    if (nodeId) {
      const hoveredNode = this.findNode(nodeId);
      if (hoveredNode) return hoveredNode;
    }
    const selectedId = this.selectedNode?.nodeObj.id;
    return (
      (selectedId ? this.findNode(selectedId) : null) ??
      this.instance.currentNode ??
      this.findNode(this.instance.nodeData.id)
    );
  }

  private finishEditing(): void {
    this.container?.querySelectorAll<HTMLElement>('#input-box').forEach((input) => {
      input.blur();
      if (input.isConnected) input.dispatchEvent(new FocusEvent('blur'));
    });
  }

  private restoreSelection(nodeId?: string): void {
    if (!this.instance) return;
    const node =
      (nodeId ? this.findNode(nodeId) : null) ?? this.findNode(this.instance.nodeData.id);
    if (!node) return;
    this.instance.selectNode(node);
    this.select(node.nodeObj, this.onSelect);
  }

  mount(
    container: HTMLElement,
    data: MindElixirData,
    direction: MindDirection,
    theme: Theme,
    callbacks: VisualMindEditorCallbacks,
  ): void {
    this.dispose();
    this.container = container;
    this.onSelect = callbacks.onSelect;
    this.instance = new MindElixir({
      el: container,
      direction: directionValue(direction),
      editable: true,
      toolBar: false,
      contextMenu: true,
      keypress: true,
      overflowHidden: true,
      newTopicName: '新节点',
      theme,
    });
    this.instance.init(data);
    this.instance.bus.addListener('operation', callbacks.onChange);
    this.instance.bus.addListener('selectNodes', (nodes) =>
      this.select(nodes.at(-1) ?? null, callbacks.onSelect),
    );
    this.instance.bus.addListener('selectNewNode', (node) => this.select(node, callbacks.onSelect));
    this.instance.bus.addListener('unselectNodes', () => {
      if (!this.instance?.currentNode) this.select(null, callbacks.onSelect);
    });
    this.instance.bus.addListener('expandNode', callbacks.onChange);
    container.addEventListener('dblclick', this.handleDoubleClick);
    container.addEventListener('pointerdown', this.handleNodePointerDown, true);
    container.addEventListener('pointerdown', this.handleCanvasPointerDown, true);
    container.addEventListener('keydown', this.handleNodeKeyDown, true);
    container.addEventListener('wheel', this.handleWheel, { capture: true, passive: false });
    const root = this.findNode(this.instance.nodeData.id);
    if (root) {
      this.instance.selectNode(root);
      this.select(root.nodeObj, callbacks.onSelect);
    }
  }

  getData(): MindElixirData | null {
    return this.instance?.getData() ?? null;
  }
  get selected(): NodeObj | null {
    return this.selectedNode?.nodeObj ?? null;
  }
  async addChild(nodeId?: string): Promise<void> {
    this.finishEditing();
    const target = this.getTargetNode(nodeId);
    if (this.instance && target) await this.instance.addChild(target);
  }
  async addSibling(nodeId?: string): Promise<void> {
    this.finishEditing();
    const target = this.getTargetNode(nodeId);
    if (!this.instance || !target) return;
    if (target.nodeObj.parent) await this.instance.insertSibling('after', target);
    else await this.instance.addChild(target);
  }
  async addParent(): Promise<void> {
    await this.instance?.insertParent(this.selectedNode ?? undefined);
  }
  async removeSelected(): Promise<void> {
    if (this.instance && this.selectedNode) await this.instance.removeNodes([this.selectedNode]);
  }
  async removeNode(nodeId: string): Promise<void> {
    const node = this.findNode(nodeId);
    if (!this.instance || !node || node.closest('me-root')) return;
    this.instance.selectNode(node);
    this.select(node.nodeObj, this.onSelect);
    await this.instance.removeNodes([node]);
  }
  undo(): void {
    const selectedId = this.selectedNode?.nodeObj.id;
    this.instance?.undo();
    this.restoreSelection(selectedId);
  }
  redo(): void {
    const selectedId = this.selectedNode?.nodeObj.id;
    this.instance?.redo();
    this.restoreSelection(selectedId);
  }
  fit(): void {
    this.instance?.scaleFit();
  }
  center(): void {
    this.instance?.toCenter();
  }
  zoomIn(): void {
    if (this.instance)
      this.instance.scale(Math.min(this.instance.scaleVal + 0.15, this.instance.scaleMax));
  }
  zoomOut(): void {
    if (this.instance)
      this.instance.scale(Math.max(this.instance.scaleVal - 0.15, this.instance.scaleMin));
  }
  setDirection(direction: MindDirection): void {
    if (!this.instance) return;
    const selectedId = this.selectedNode?.nodeObj.id;
    const value = directionValue(direction);
    [
      this.instance.initLeft,
      this.instance.initRight,
      this.instance.initSide,
      this.instance.initDown,
    ][value].call(this.instance);
    this.restoreSelection(selectedId);
  }
  setTheme(theme: Theme): void {
    const selectedId = this.selectedNode?.nodeObj.id;
    this.instance?.changeTheme(structuredClone(theme));
    this.restoreSelection(selectedId);
  }
  async updateSelected(update: Partial<NodeObj>): Promise<void> {
    if (this.instance && this.selectedNode)
      await this.instance.reshapeNode(this.selectedNode, update);
  }
  dispose(): void {
    this.container?.removeEventListener('dblclick', this.handleDoubleClick);
    this.container?.removeEventListener('pointerdown', this.handleNodePointerDown, true);
    this.container?.removeEventListener('pointerdown', this.handleCanvasPointerDown, true);
    this.container?.removeEventListener('keydown', this.handleNodeKeyDown, true);
    this.container?.removeEventListener('wheel', this.handleWheel, true);
    window.removeEventListener('pointermove', this.handleCanvasPointerMove);
    window.removeEventListener('pointerup', this.handleCanvasPointerUp);
    window.removeEventListener('pointercancel', this.handleCanvasPointerUp);
    this.instance?.destroy();
    this.instance = null;
    this.selectedNode = null;
    this.container = null;
    this.panPointerId = null;
    this.onSelect = () => undefined;
  }
}
