/*
  The orchestrator canvas, as data.

  This file is the ONLY place where the server's pipeline stages are translated into
  the picture the operator sees. server.ts records stages by name (`plan`, `strategy`,
  `keyword`, `content`, `audit`, `handoff`, `content-revisi-N`, `audit-ulang-N`,
  `image`); everything visual keys off the node ids below. If a stage is ever renamed
  or added on the server, change STAGE_TO_NODE here and the canvas follows -- an
  unknown stage is ignored rather than crashing the view, and its work still shows up
  in the run summary.

  Coordinates are abstract "graph units" (a node is 1 unit wide). AgentCanvas scales
  them; layout() returns the same graph laid out left-to-right (desktop) or
  top-to-bottom (narrow screens), so there is one topology, not two.
*/

export type NodeStatus = 'idle' | 'running' | 'done' | 'failed' | 'skipped' | 'waiting';
export type NodeKind = 'source' | 'agent' | 'human' | 'sink';

export interface LedgerAttempt {
  model: string;
  ok: boolean;
  status?: number;
  error?: string;
  durationMs?: number;
  kind?: 'call' | 'wait';
  note?: string;
}

export interface LedgerEntry {
  order: number;
  stage: string;
  agent: string;
  feature: string;
  status: 'done' | 'failed' | 'skipped';
  reason?: string;
  modelUsed?: string;
  modelName?: string;
  fallbackOccurred?: boolean;
  keyFingerprint?: string;
  attempts?: LedgerAttempt[];
  durationMs: number;
}

export interface GraphNode {
  id: string;
  label: string;
  /** One line under the title: what this agent is for, in the operator's language. */
  role: string;
  kind: NodeKind;
  /** [col, row] for the desktop two-band layout. */
  h: [number, number];
  /** [col, row] for the single vertical chain on phones. */
  v: [number, number];
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  /** Advisory links (the briefing) are drawn dashed: they inform, they don't block. */
  advisory?: boolean;
  /** The revision loop runs backwards and is only drawn when revisions happened. */
  loop?: boolean;
}

/*
  Two coordinate sets, because the same topology wants a different shape per frame.
  Desktop (16:9) gets two stacked bands: one long line would either clip at the right
  edge or shrink until the labels are unreadable. Phones get one vertical chain, which
  is what a narrow screen can actually show. h = [col, row] on desktop, v = [col, row]
  on phones; col advances along the flow, row separates parallel work.
*/
export const NODES: GraphNode[] = [
  { id: 'source', label: 'Data Bisnis', role: 'Sumber semua pekerjaan agent', kind: 'source', h: [0, 1], v: [0, 1] },
  { id: 'plan', label: 'Orchestrator', role: 'Menyusun rencana & risiko', kind: 'agent', h: [1, 0], v: [1, 0] },
  { id: 'strategy', label: 'Strategi', role: 'Posisi & sudut penawaran', kind: 'agent', h: [1, 2], v: [1, 2] },
  { id: 'keyword', label: 'Keyword', role: 'Kata kunci & intent lokal', kind: 'agent', h: [2, 1], v: [2, 1] },
  { id: 'content', label: 'Konten', role: 'Judul, deskripsi, CTA', kind: 'agent', h: [3, 1], v: [3, 1] },
  { id: 'audit', label: 'Audit', role: 'Skor SEO & akurasi fakta', kind: 'agent', h: [0, 5], v: [4, 1] },
  { id: 'handoff', label: 'Perlu Input Anda', role: 'Data yang hanya Anda tahu', kind: 'human', h: [1, 4], v: [5, 0] },
  { id: 'image', label: 'Brief Gambar', role: 'Konsep foto & caption', kind: 'agent', h: [1, 6], v: [5, 2] },
  { id: 'sink', label: 'Siap Pakai', role: 'Hasil siap dipakai campaign', kind: 'sink', h: [2, 5], v: [6, 1] }
];

export const EDGES: GraphEdge[] = [
  { id: 'source-plan', from: 'source', to: 'plan' },
  { id: 'source-strategy', from: 'source', to: 'strategy' },
  { id: 'plan-keyword', from: 'plan', to: 'keyword', advisory: true },
  { id: 'strategy-keyword', from: 'strategy', to: 'keyword' },
  { id: 'keyword-content', from: 'keyword', to: 'content' },
  { id: 'content-audit', from: 'content', to: 'audit' },
  { id: 'audit-handoff', from: 'audit', to: 'handoff' },
  { id: 'audit-image', from: 'audit', to: 'image' },
  { id: 'image-sink', from: 'image', to: 'sink' },
  { id: 'audit-content', from: 'audit', to: 'content', loop: true }
];

/** Server stage -> node. Revision stages fold back onto the node they re-run. */
export function nodeForStage(stage: string): string | null {
  if (stage.startsWith('content-revisi-')) return 'content';
  if (stage.startsWith('audit-ulang-')) return 'audit';
  const map: Record<string, string> = {
    plan: 'plan',
    strategy: 'strategy',
    keyword: 'keyword',
    content: 'content',
    audit: 'audit',
    handoff: 'handoff',
    image: 'image'
  };
  return map[stage] ?? null;
}

/** Which node the pipeline is working on, from the progress label the server sends. */
const LABEL_TO_NODE: Array<[RegExp, string]> = [
  [/briefing|strategi kampanye/i, 'strategy'],
  [/keyword/i, 'keyword'],
  [/menulis konten|revisi konten/i, 'content'],
  [/audit/i, 'audit'],
  [/visual|caption/i, 'image']
];

export interface NodeState {
  status: NodeStatus;
  /** The ledger entries that belong to this node (revisions add more than one). */
  entries: LedgerEntry[];
  durationMs: number;
  /** Extra rounds beyond the first: shown as "×N" on the node and on the loop edge. */
  repeats: number;
  fallback: boolean;
}

export interface GraphState {
  nodes: Record<string, NodeState>;
  /** Edge ids currently carrying data -- these are the only animated ones. */
  activeEdges: string[];
  visibleNodes: string[];
  visibleEdges: string[];
  revisionRounds: number;
}

export interface DeriveInput {
  ledger: LedgerEntry[];
  isRunning: boolean;
  /** Progress label from the server while a run is in flight ("Audit kualitas"). */
  progressLabel?: string;
  hasHumanFindings: boolean;
  revisionRounds: number;
  /** A finished run exists (so source/sink can read as done rather than idle). */
  finished: boolean;
  pipelineOk?: boolean;
}

const EMPTY: NodeState = { status: 'idle', entries: [], durationMs: 0, repeats: 0, fallback: false };

export function deriveGraphState(input: DeriveInput): GraphState {
  const { ledger, isRunning, progressLabel, hasHumanFindings, revisionRounds, finished, pipelineOk } = input;
  const nodes: Record<string, NodeState> = {};
  for (const n of NODES) nodes[n.id] = { ...EMPTY, entries: [] };

  for (const entry of ledger) {
    const id = nodeForStage(entry.stage);
    if (!id || !nodes[id]) continue;
    const s = nodes[id];
    s.entries.push(entry);
    s.durationMs += entry.durationMs;
    s.repeats = Math.max(0, s.entries.length - 1);
    s.fallback = s.fallback || !!entry.fallbackOccurred;
    // A later failure matters more than an earlier success: the operator needs to see
    // the problem, not the round that happened to work.
    s.status = entry.status === 'failed' ? 'failed' : entry.status === 'skipped' && s.status !== 'done' ? 'skipped' : 'done';
  }

  // The stage the server says it is working on right now.
  let runningNode: string | null = null;
  if (isRunning) {
    for (const [re, id] of LABEL_TO_NODE) {
      if (progressLabel && re.test(progressLabel)) { runningNode = id; break; }
    }
    // Fall back to "the first node with no ledger entry yet" so the canvas never
    // looks frozen when a label is missing or unexpected.
    if (!runningNode) {
      const order = ['strategy', 'keyword', 'content', 'audit', 'image'];
      runningNode = order.find(id => nodes[id].entries.length === 0) ?? null;
    }
    if (runningNode && nodes[runningNode].status !== 'failed') nodes[runningNode].status = 'running';
    // plan and strategy start together; show both until plan reports in.
    if (runningNode === 'strategy' && nodes.plan.entries.length === 0) nodes.plan.status = 'running';
  }

  if (hasHumanFindings) nodes.handoff.status = 'waiting';
  nodes.source.status = ledger.length > 0 || isRunning ? 'done' : 'idle';
  nodes.sink.status = finished ? (pipelineOk ? 'done' : 'failed') : isRunning ? 'idle' : 'idle';

  const visibleNodes = NODES.filter(n => n.id !== 'handoff' || hasHumanFindings).map(n => n.id);
  const visibleEdges = EDGES.filter(e => {
    if (e.loop) return revisionRounds > 0;
    if (e.to === 'handoff') return hasHumanFindings;
    return true;
  }).map(e => e.id);

  // Only edges that feed the node being worked on are animated -- the whole point of
  // the animation is "data is moving HERE", and a canvas where everything flows says
  // nothing (and costs the most on a weak GPU).
  const activeEdges: string[] = [];
  if (isRunning && runningNode) {
    for (const e of EDGES) {
      if (e.to !== runningNode || e.loop) continue;
      if (!visibleEdges.includes(e.id)) continue;
      const upstream = nodes[e.from];
      if (upstream.status === 'done' || e.from === 'source') activeEdges.push(e.id);
    }
    if (runningNode === 'strategy' || runningNode === 'plan') {
      for (const id of ['source-plan', 'source-strategy']) if (!activeEdges.includes(id)) activeEdges.push(id);
    }
  }

  return { nodes, activeEdges: activeEdges.slice(0, 3), visibleNodes, visibleEdges, revisionRounds };
}

// ---- layout ----

export interface LaidOutNode extends GraphNode { x: number; y: number; }
export interface LaidOutEdge extends GraphEdge { path: string; midX: number; midY: number; }
export interface Layout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
  nodeWidth: number;
  nodeHeight: number;
}

export const NODE_W = 190;
export const NODE_H = 106;

/**
 * Horizontal: columns advance left to right (desktop, reads like a flow diagram).
 * Vertical: the same graph rotated, because on a phone a wide canvas means endless
 * sideways panning -- the topology is identical, only the axis changes.
 */
export function layout(graph: { nodes: string[]; edges: string[] }, orientation: 'horizontal' | 'vertical'): Layout {
  const horizontal = orientation === 'horizontal';
  const GAP_MAIN = horizontal ? 96 : 72;
  const GAP_CROSS = horizontal ? 44 : 36;
  const MAIN_STEP = (horizontal ? NODE_W : NODE_H) + GAP_MAIN;
  const CROSS_STEP = ((horizontal ? NODE_H : NODE_W) + GAP_CROSS) * 0.62;

  const nodes: LaidOutNode[] = NODES.filter(n => graph.nodes.includes(n.id)).map(n => {
    const [col, row] = horizontal ? n.h : n.v;
    return horizontal
      ? { ...n, x: col * MAIN_STEP, y: row * CROSS_STEP }
      : { ...n, x: row * CROSS_STEP, y: col * MAIN_STEP };
  });

  const byId = new Map(nodes.map(n => [n.id, n]));
  const edges: LaidOutEdge[] = EDGES.filter(e => graph.edges.includes(e.id)).flatMap(e => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) return [];

    // An edge that moves to the next band travels backwards along the main axis; a
    // plain bezier would cut straight through the first band. It wraps below instead,
    // the way a reader's eye moves from the end of a line to the start of the next.
    const wraps = horizontal && b.x < a.x - MAIN_STEP;
    if (wraps) {
      const startX = a.x + NODE_W / 2, startY = a.y + NODE_H;
      const endX = b.x + NODE_W / 2, endY = b.y;
      const midY = (startY + endY) / 2;
      return [{
        ...e,
        path: `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY - 40}, ${endX} ${endY}`,
        midX: (startX + endX) / 2,
        midY
      }];
    }

    const from = horizontal ? { x: a.x + NODE_W, y: a.y + NODE_H / 2 } : { x: a.x + NODE_W / 2, y: a.y + NODE_H };
    const to = horizontal ? { x: b.x, y: b.y + NODE_H / 2 } : { x: b.x + NODE_W / 2, y: b.y };
    // The revision edge runs backwards inside a band; bowing it away from the forward
    // line keeps "went back for another round" readable at a glance.
    const bow = e.loop ? (horizontal ? 70 : 96) : 0;
    const path = e.loop
      ? horizontal
        ? `M ${a.x + NODE_W / 2} ${a.y} C ${a.x} ${a.y - bow}, ${b.x + NODE_W} ${b.y - bow}, ${b.x + NODE_W / 2} ${b.y}`
        : `M ${a.x} ${a.y + NODE_H / 2} C ${a.x - bow} ${a.y}, ${b.x - bow} ${b.y + NODE_H}, ${b.x} ${b.y + NODE_H / 2}`
      : horizontal
        ? `M ${from.x} ${from.y} C ${from.x + GAP_MAIN * 0.6} ${from.y}, ${to.x - GAP_MAIN * 0.6} ${to.y}, ${to.x} ${to.y}`
        : `M ${from.x} ${from.y} C ${from.x} ${from.y + GAP_MAIN * 0.6}, ${to.x} ${to.y - GAP_MAIN * 0.6}, ${to.x} ${to.y}`;
    return [{ ...e, path, midX: (from.x + to.x) / 2, midY: (from.y + to.y) / 2 - (e.loop ? bow * 0.75 : 0) }];
  });

  const width = Math.max(...nodes.map(n => n.x + NODE_W), NODE_W);
  const height = Math.max(...nodes.map(n => n.y + NODE_H), NODE_H);
  return { nodes, edges, width, height, nodeWidth: NODE_W, nodeHeight: NODE_H };
}
