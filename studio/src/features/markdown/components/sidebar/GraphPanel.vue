<script setup lang="ts">
import { Network, Search } from '@/features/markdown/icons';
import {
  drag,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  select,
  zoom,
  type D3DragEvent,
  type ForceCenter,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type {
  KnowledgeGraphLink,
  KnowledgeGraphNode,
} from '@/features/markdown/services/knowledge';
import { useWorkspaceStore } from '@/features/markdown/stores/workspace';

interface GraphNode extends KnowledgeGraphNode, SimulationNodeDatum {}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  type: KnowledgeGraphLink['type'];
}

const store = useWorkspaceStore();
const svgElement = ref<SVGSVGElement | null>(null);
const graphQuery = ref('');
let simulation: Simulation<GraphNode, GraphLink> | null = null;
let resizeObserver: ResizeObserver | null = null;
let renderFrame: number | null = null;
let viewportFrame: number | null = null;
let centerForce: ForceCenter<GraphNode> | null = null;

const visibleGraph = computed(() => {
  const query = graphQuery.value.trim().toLocaleLowerCase();
  if (!query) {
    return store.knowledgeGraph;
  }

  const directlyMatched = new Set(
    store.knowledgeGraph.nodes
      .filter((node) =>
        [node.label, node.path ?? '', ...(node.tags ?? [])].some((value) =>
          value.toLocaleLowerCase().includes(query),
        ),
      )
      .map((node) => node.id),
  );
  const visibleIds = new Set(directlyMatched);

  for (const link of store.knowledgeGraph.links) {
    if (directlyMatched.has(link.source) || directlyMatched.has(link.target)) {
      visibleIds.add(link.source);
      visibleIds.add(link.target);
    }
  }

  return {
    nodes: store.knowledgeGraph.nodes.filter((node) => visibleIds.has(node.id)),
    links: store.knowledgeGraph.links.filter(
      (link) => visibleIds.has(link.source) && visibleIds.has(link.target),
    ),
  };
});

function nodeRadius(node: GraphNode): number {
  if (node.type === 'document') {
    return node.path === store.activePath ? 10 : 7;
  }
  return 5;
}

function nodeColor(node: GraphNode): string {
  if (node.type === 'tag') {
    return '#8b5cf6';
  }
  if (node.type === 'category') {
    return '#f59e0b';
  }
  if (node.type === 'missing') {
    return '#98a2b3';
  }
  return 'var(--color-brand)';
}

function graphDimensions(element: SVGSVGElement): { width: number; height: number } {
  return {
    width: Math.max(element.clientWidth, 240),
    height: Math.max(element.clientHeight, 360),
  };
}

function updateGraphViewport(): void {
  viewportFrame = null;
  const element = svgElement.value;
  if (!element || !simulation) return;
  const { width, height } = graphDimensions(element);
  select(element).attr('viewBox', `0 0 ${width} ${height}`);
  centerForce?.x(width / 2).y(height / 2);
  simulation.alpha(0.35).restart();
}

function scheduleGraphViewport(): void {
  if (viewportFrame !== null) return;
  viewportFrame = requestAnimationFrame(updateGraphViewport);
}

function scheduleGraphRender(): void {
  if (renderFrame !== null) return;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = null;
    renderGraph();
  });
}

function renderGraph(): void {
  const element = svgElement.value;
  if (!element) {
    return;
  }

  simulation?.stop();
  const { width, height } = graphDimensions(element);
  const nodes: GraphNode[] = visibleGraph.value.nodes.map((node) => ({
    ...node,
  }));
  const links: GraphLink[] = visibleGraph.value.links.map((link) => ({
    ...link,
  }));
  const svg = select(element);
  svg.selectAll('*').remove();
  svg.attr('viewBox', `0 0 ${width} ${height}`);

  const scene = svg.append('g');
  svg.call(
    zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.55, 2.6])
      .on('zoom', (event) => scene.attr('transform', event.transform)),
  );

  const linkSelection = scene
    .append('g')
    .attr('aria-hidden', 'true')
    .selectAll<SVGLineElement, GraphLink>('line')
    .data(links)
    .join('line')
    .attr('class', 'graph-link')
    .attr('stroke-width', (link) => (link.type === 'wiki' ? 1.4 : 0.8));

  const nodeSelection = scene
    .append('g')
    .selectAll<SVGGElement, GraphNode>('g')
    .data(nodes)
    .join('g')
    .attr('class', 'graph-node')
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', (node) => node.label)
    .on('click', (_event, node) => {
      if (node.path) {
        void store.openDocument(node.path);
      }
    })
    .on('keydown', (event: KeyboardEvent, node) => {
      if ((event.key === 'Enter' || event.key === ' ') && node.path) {
        event.preventDefault();
        void store.openDocument(node.path);
      }
    });

  nodeSelection
    .append('circle')
    .attr('r', nodeRadius)
    .attr('fill', nodeColor)
    .attr('stroke', (node) => (node.path === store.activePath ? '#1d4ed8' : '#ffffff'))
    .attr('stroke-width', (node) => (node.path === store.activePath ? 3 : 1.5));

  nodeSelection
    .append('text')
    .attr('x', (node) => nodeRadius(node) + 4)
    .attr('y', 4)
    .text((node) => (node.label.length > 14 ? `${node.label.slice(0, 13)}…` : node.label));

  const dragBehavior = drag<SVGGElement, GraphNode>()
    .on('start', (event: D3DragEvent<SVGGElement, GraphNode, GraphNode>, node) => {
      if (!event.active) {
        simulation?.alphaTarget(0.25).restart();
      }
      node.fx = node.x;
      node.fy = node.y;
    })
    .on('drag', (event: D3DragEvent<SVGGElement, GraphNode, GraphNode>, node) => {
      node.fx = event.x;
      node.fy = event.y;
    })
    .on('end', (event: D3DragEvent<SVGGElement, GraphNode, GraphNode>, node) => {
      if (!event.active) {
        simulation?.alphaTarget(0);
      }
      node.fx = null;
      node.fy = null;
    });
  nodeSelection.call(dragBehavior);

  centerForce = forceCenter<GraphNode>(width / 2, height / 2);
  simulation = forceSimulation<GraphNode, GraphLink>(nodes)
    .force(
      'link',
      forceLink<GraphNode, GraphLink>(links)
        .id((node) => node.id)
        .distance((link) => (link.type === 'wiki' ? 62 : 42))
        .strength((link) => (link.type === 'wiki' ? 0.75 : 0.35)),
    )
    .force('charge', forceManyBody().strength(-115))
    .force('center', centerForce)
    .force(
      'collide',
      forceCollide<GraphNode>().radius((node) => nodeRadius(node) + 12),
    )
    .on('tick', () => {
      linkSelection
        .attr('x1', (link) => (link.source as GraphNode).x ?? 0)
        .attr('y1', (link) => (link.source as GraphNode).y ?? 0)
        .attr('x2', (link) => (link.target as GraphNode).x ?? 0)
        .attr('y2', (link) => (link.target as GraphNode).y ?? 0);
      nodeSelection.attr('transform', (node) => `translate(${node.x ?? 0},${node.y ?? 0})`);
    });
}

watch(
  () => store.knowledgeGraph,
  () => scheduleGraphRender(),
);
watch(
  () => store.activePath,
  () => scheduleGraphRender(),
);
watch(graphQuery, () => scheduleGraphRender());

onMounted(() => {
  void nextTick(renderGraph);
  if (svgElement.value) {
    resizeObserver = new ResizeObserver(scheduleGraphViewport);
    resizeObserver.observe(svgElement.value);
  }
});

onBeforeUnmount(() => {
  if (renderFrame !== null) cancelAnimationFrame(renderFrame);
  if (viewportFrame !== null) cancelAnimationFrame(viewportFrame);
  resizeObserver?.disconnect();
  simulation?.stop();
});
</script>

<template>
  <section class="panel" aria-labelledby="graph-panel-title">
    <header class="panel__header">
      <h2 id="graph-panel-title" class="panel__title">知识图谱</h2>
      <span class="text-xs text-[var(--color-text-muted)]">
        {{ visibleGraph.nodes.length }} 个节点
      </span>
    </header>
    <div class="search-panel__form">
      <label class="field">
        <Search :size="16" aria-hidden="true" />
        <input
          v-model="graphQuery"
          type="search"
          placeholder="搜索节点并保留相邻关系"
          aria-label="搜索知识图谱节点"
        />
      </label>
    </div>
    <div class="panel__body">
      <div v-if="visibleGraph.nodes.length" class="graph-host">
        <svg ref="svgElement" aria-label="文档、标签与分类关系图" />
      </div>
      <div v-else class="panel__empty">
        <div>
          <Network :size="28" class="mx-auto mb-3" aria-hidden="true" />
          <p class="m-0">添加 [[双向链接]] 后会生成知识关系图</p>
        </div>
      </div>
    </div>
  </section>
</template>
