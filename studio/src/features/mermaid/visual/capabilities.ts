import type { EditorOp, ParseResult } from '@visimer/core';

export interface MermaidAddAction {
  label: string;
  operation: EditorOp;
}

export function visualReadOnly(result: ParseResult): boolean {
  return !result.typeInfo || result.typeInfo.capability !== 'edit';
}

export function addActionFor(result: ParseResult): MermaidAddAction | null {
  if (result.flowchart) {
    return {
      label: '新增节点',
      operation: { type: 'addNode', shape: 'rect', label: '新节点' },
    };
  }
  if (result.sequence) {
    return {
      label: '新增参与者',
      operation: { type: 'seq.addParticipant', name: '新参与者' },
    };
  }
  if (result.state) {
    return {
      label: '新增状态',
      operation: { type: 'st.addState', label: '新状态' },
    };
  }
  if (result.classGraph) {
    return {
      label: '新增类',
      operation: { type: 'cl.addClass', name: 'NewClass' },
    };
  }
  if (result.er) {
    return {
      label: '新增实体',
      operation: { type: 'er.addEntity', name: 'NewEntity' },
    };
  }
  if (result.pie) {
    return {
      label: '新增切片',
      operation: { type: 'pie.addSlice', label: '新切片', value: 1 },
    };
  }
  if (result.gantt) {
    return {
      label: '新增任务',
      operation: { type: 'gantt.addTask', name: '新任务', meta: 'task1, 1d' },
    };
  }
  if (result.lineItems) {
    return {
      label: '新增条目',
      operation: { type: 'li.addItem' },
    };
  }
  return null;
}

export function selectionSupportsConnect(
  result: ParseResult,
  selection: readonly string[],
): boolean {
  if (selection.length !== 1) return false;
  const entity = selection[0];
  if (!entity) return false;
  if (result.flowchart) return entity.startsWith('node:');
  if (result.state) return entity.startsWith('state:');
  if (result.classGraph) return entity.startsWith('class:');
  if (result.er) return entity.startsWith('entity:');
  return false;
}
