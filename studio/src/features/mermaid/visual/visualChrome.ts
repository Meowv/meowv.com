import type { MermaidAddAction } from '@/features/mermaid/visual/capabilities';

const TEXT_TRANSLATIONS: Record<string, string> = {
  'Add attribute': '新增属性',
  'Add member': '新增成员',
  'Add note': '新增备注',
  'Animate edge': '边动画',
  Annotation: '注解',
  Arrow: '箭头',
  'Cardinality (e.g. 1, 0..1, 1..*, *)': '基数（如 1、0..1、1..*、*）',
  Colors: '颜色',
  Delete: '删除',
  Duplicate: '复制',
  'Edge color': '连线颜色',
  'Edge curve (diagram-wide)': '连线曲线（全局）',
  'Edge curve': '连线曲线',
  'Edit label': '编辑标签',
  'Edit line': '编辑条目',
  'Edit schedule (id, start, duration)': '编辑排期（ID、开始、时长）',
  'Edit text': '编辑文字',
  'Edit value': '编辑数值',
  Fill: '填充',
  Fragment: '片段',
  'Message type': '消息类型',
  'Move to composite': '移入复合状态',
  'Node shape': '节点形状',
  Note: '备注',
  'Participant type': '参与者类型',
  'Relation type': '关系类型',
  'Remove annotation': '移除注解',
  'Rename class': '重命名类',
  'Rename entity': '重命名实体',
  'Rename subgraph': '重命名子图',
  'Rename task': '重命名任务',
  Rename: '重命名',
  'Reverse direction': '反转方向',
  'State type': '状态类型',
  Stroke: '线条',
  'Wrap in fragment': '包裹片段',
  Border: '边框',
  Text: '文字',
  'Default (curved)': '默认（曲线）',
  'Natural spline': '自然曲线',
  'Straight segments': '直线段',
  'No animation': '无动画',
  'Fast flow': '快速流动',
  'Slow flow': '慢速流动',
  'No arrow': '无箭头',
  'Double point': '双向箭头',
  'Double cross': '双十字',
  'Double dot': '双圆点',
  Arrowhead: '箭头',
  Rectangle: '矩形',
  Rounded: '圆角矩形',
  Stadium: '胶囊形',
  Diamond: '菱形',
  Hexagon: '六边形',
  Circle: '圆形',
  Cylinder: '圆柱',
  Subroutine: '子程序',
  Solid: '实线',
  Dotted: '虚线',
  Thick: '粗线',
  Invisible: '不可见',
  Default: '默认',
  Natural: '自然',
  Linear: '直线',
  None: '无',
  Slow: '慢速',
  Fast: '快速',
  state: '状态',
  choice: '选择',
  fork: '分叉',
  join: '汇合',
  inheritance: '继承',
  composition: '组合',
  aggregation: '聚合',
  association: '关联',
  dependency: '依赖',
  realization: '实现',
  'link (solid)': '实线连接',
  'link (dashed)': '虚线连接',
  'Self message': '自调用消息',
  'Note over': '备注覆盖',
  'Note left': '左侧备注',
  'Note right': '右侧备注',
};

const COARSE_POINTER =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);

export interface VisualChromeSession {
  readonly selection: readonly string[];
  readonly addAction: MermaidAddAction | null;
  readonly supportsConnectSelection: boolean;
  addEntity(): boolean;
  beginTouchConnect(): void;
}

export function translateVisualText(value: string): string {
  const exact = TEXT_TRANSLATIONS[value];
  if (exact) return exact;
  const color = value.match(/^(Fill|Border|Text|Stroke):\s*(.+)$/u);
  if (color) {
    const prefix = TEXT_TRANSLATIONS[color[1] ?? ''] ?? color[1];
    const suffix = color[2] === 'default' ? '默认' : color[2];
    return `${prefix}：${suffix}`;
  }
  return value;
}

function localizeElement(element: Element): void {
  const titled = [
    ...(element.hasAttribute('title') ? [element] : []),
    ...element.querySelectorAll('[title]'),
  ];
  for (const target of titled) {
    if (!(target instanceof HTMLElement) && !(target instanceof SVGElement)) continue;
    const title = target.getAttribute('title');
    if (title) {
      const next = translateVisualText(title);
      if (next !== title) target.setAttribute('title', next);
    }
  }

  const selectors = [
    '.mw-popover-panel-title',
    '.mw-popover-section-title',
    '.mw-cell-label',
    '.mw-plus-menu button',
  ];
  for (const target of element.matches(selectors.join(','))
    ? [element]
    : [...element.querySelectorAll(selectors.join(','))]) {
    const current = target.textContent?.trim() ?? '';
    const original = target.getAttribute('data-mermaid-original-text') ?? current;
    if (!target.hasAttribute('data-mermaid-original-text')) {
      target.setAttribute('data-mermaid-original-text', original);
    }
    const next = translateVisualText(original);
    if (target.textContent !== next) target.textContent = next;
  }
}

function createExtraButton(
  className: string,
  glyph: string,
  title: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `mw-popover-btn text mermaid-visual-extra ${className}`;
  button.textContent = glyph;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function enhancePopover(popover: HTMLElement, session: VisualChromeSession): void {
  localizeElement(popover);
  const hasSelection = session.selection.length === 1;

  if (
    hasSelection &&
    session.addAction &&
    !popover.querySelector('[data-mermaid-action="add-entity"]')
  ) {
    const button = createExtraButton(
      'mermaid-visual-extra--add',
      '＋',
      session.addAction.label,
      () => {
        session.addEntity();
        popover.remove();
      },
    );
    button.dataset.mermaidAction = 'add-entity';
    const deleteButton = popover.querySelector('.mw-popover-btn.danger');
    popover.insertBefore(button, deleteButton);
  }

  if (
    hasSelection &&
    COARSE_POINTER &&
    session.supportsConnectSelection &&
    !popover.querySelector('[data-mermaid-action="connect"]')
  ) {
    const button = createExtraButton('mermaid-visual-extra--connect', '↗', '连线', () => {
      session.beginTouchConnect();
      popover.remove();
    });
    button.dataset.mermaidAction = 'connect';
    const deleteButton = popover.querySelector('.mw-popover-btn.danger');
    popover.insertBefore(button, deleteButton);
  }
}

export function installVisualChrome(
  container: HTMLElement,
  session: VisualChromeSession,
): { dispose(): void } {
  const enhance = (root: ParentNode = container) => {
    if (root instanceof Element) localizeElement(root);
    const popovers =
      root instanceof HTMLElement && root.matches('.mw-popover')
        ? [root, ...root.querySelectorAll<HTMLElement>('.mw-popover')]
        : [...root.querySelectorAll<HTMLElement>('.mw-popover')];
    for (const popover of popovers) {
      enhancePopover(popover, session);
    }
    const menus =
      root instanceof HTMLElement && root.matches('.mw-plus-menu')
        ? [root, ...root.querySelectorAll<HTMLElement>('.mw-plus-menu')]
        : [...root.querySelectorAll<HTMLElement>('.mw-plus-menu')];
    for (const menu of menus) {
      localizeElement(menu);
    }
  };

  const observer =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (node instanceof Element) enhance(node);
              else if (node.parentElement) enhance(node.parentElement);
            }
            if (record.type === 'attributes' && record.target instanceof Element) {
              localizeElement(record.target);
            }
          }
        });

  observer?.observe(container, {
    attributes: true,
    attributeFilter: ['title'],
    childList: true,
    subtree: true,
  });
  enhance();

  return {
    dispose() {
      observer?.disconnect();
    },
  };
}
