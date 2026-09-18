import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2, Workflow, Sparkles, KeyRound, PenLine, ShieldCheck, Image as ImageIcon,
  UserRoundPen, CheckCircle2, XCircle, MinusCircle, RefreshCw, Plus, Minus, Maximize2,
  Minimize2, Crosshair, Zap, ZapOff, ArrowRightLeft
} from 'lucide-react';
import { NODES, NODE_H, NODE_W, layout, type GraphState, type LaidOutNode, type NodeStatus } from './canvasGraph';
import { useTheme } from '../../theme/useTheme';

/*
  The pipeline as a machine you can look at: a dark, pannable, zoomable canvas where
  every agent is a node and data visibly travels between them while the run happens.

  Performance is the design constraint. Target hardware is <=8GB-RAM laptops with
  integrated GPUs and the owner asked for the full effect, so:
  - nothing animates while the pipeline is idle;
  - only the edges feeding the node currently working are animated (<=3), never all;
  - "glow" is layered low-opacity strokes, never filter: blur() -- same look at a
    fraction of the cost, and the project's no-blur rule stays intact;
  - one 1-second frame sample after a run starts drops to "mode hemat" (status colours
    only) when the machine cannot keep up. The operator can override either way and
    the choice is remembered.
*/

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  source: Building2, plan: Workflow, strategy: Sparkles, keyword: KeyRound,
  content: PenLine, audit: ShieldCheck, image: ImageIcon, handoff: UserRoundPen, sink: CheckCircle2
};

const STATUS_RING: Record<NodeStatus, string> = {
  idle: 'border-slate-700/80',
  running: 'border-sky-400',
  done: 'border-emerald-500/70',
  failed: 'border-rose-500',
  skipped: 'border-slate-700/60 border-dashed',
  waiting: 'border-amber-400'
};
const STATUS_TEXT: Record<NodeStatus, string> = {
  idle: 'text-slate-500', running: 'text-sky-300', done: 'text-emerald-300',
  failed: 'text-rose-300', skipped: 'text-slate-500', waiting: 'text-amber-300'
};
const STATUS_LABEL: Record<NodeStatus, string> = {
  idle: 'menunggu', running: 'bekerja', done: 'selesai', failed: 'gagal', skipped: 'dilewati', waiting: 'butuh Anda'
};

// Edge colours are theme variables (index.css sets the standard values, persona.css
// its own), applied through style= because SVG presentation attributes cannot read
// var(). The shapes are themed too: a theme may ask for P5 "slash" polylines instead
// of the bezier the layout draws.
const EDGE_TONE = { idle: 'var(--du-edge-idle)', done: 'var(--du-edge-done)', active: 'var(--du-edge-active)', loop: 'var(--du-edge-loop)' };

// P5 lines are straight bands with one sharp break, not curves. Rebuilt from the
// bezier's endpoints: horizontal - diagonal - horizontal (or vertical for wraps).
const slashPath = (bezier: string): string => {
  const nums = bezier.match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
  if (nums.length < 4) return bezier;
  const [sx, sy] = [nums[0], nums[1]];
  const [ex, ey] = [nums[nums.length - 2], nums[nums.length - 1]];
  const dx = ex - sx, dy = ey - sy;
  if (Math.abs(dy) > Math.abs(dx)) {
    const my = sy + dy * 0.55;
    return `M ${sx} ${sy} L ${sx} ${my - Math.sign(dy) * 18} L ${ex} ${my + Math.sign(dy) * 18} L ${ex} ${ey}`;
  }
  const x1 = sx + dx * 0.42, x2 = sx + dx * 0.58;
  return `M ${sx} ${sy} L ${x1} ${sy} L ${x2} ${ey} L ${ex} ${ey}`;
};

const LOW_POWER_KEY = 'du-canvas-low-power';
const readLowPower = (): boolean | null => {
  try { const v = localStorage.getItem(LOW_POWER_KEY); return v === null ? null : v === '1'; } catch { return null; }
};
const writeLowPower = (v: boolean) => { try { localStorage.setItem(LOW_POWER_KEY, v ? '1' : '0'); } catch { /* ignore */ } };

interface AgentCanvasProps {
  graph: GraphState;
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
  isRunning: boolean;
  progressLabel?: string;
  /** Rendered over the canvas, top area: campaign, objective, run button, summary. */
  toolbar: React.ReactNode;
}

export const AgentCanvas: React.FC<AgentCanvasProps> = ({
  graph, selectedNode, onSelectNode, isRunning, progressLabel, toolbar
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>(
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches ? 'horizontal' : 'vertical'
  );
  const [view, setView] = useState({ x: 24, y: 24, k: 1 });
  const [fullscreen, setFullscreen] = useState(false);
  const [lowPower, setLowPower] = useState<boolean>(() => readLowPower() ?? false);
  const [autoLowPower, setAutoLowPower] = useState(false);

  // deriveGraphState hands back fresh arrays on every poll, so the layout must be
  // keyed by their CONTENT. Keying by identity re-created the layout each render,
  // which re-ran the auto-fit below and snapped the operator's zoom back mid-run.
  const layoutKey = `${graph.visibleNodes.join('|')}::${graph.visibleEdges.join('|')}::${orientation}`;
  const laid = useMemo(
    () => layout({ nodes: graph.visibleNodes, edges: graph.visibleEdges }, orientation),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layoutKey]
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setOrientation(mq.matches ? 'horizontal' : 'vertical');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Fit the whole graph into the viewport: used on mount, on rotation and by the fit
  // button, because a canvas that opens half off-screen reads as broken.
  const toolbarRef = useRef<HTMLDivElement>(null);
  const fit = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    // The toolbar floats over the top of the canvas, so the graph is fitted into the
    // area below it -- otherwise the first agent sits under the run button. Its height
    // is measured, not assumed: on a phone the campaign name, the objective field and
    // the run button stack into roughly twice the desktop height.
    const pad = 28;
    const padTop = (toolbarRef.current?.offsetHeight ?? 76) + 28;
    const w = host.clientWidth - pad * 2;
    const h = host.clientHeight - padTop - pad;
    if (w <= 0 || h <= 0) return;
    // Fit for legibility, not for completeness: a canvas that shows everything at 38%
    // shows nothing. Below this floor the operator pans instead of squinting.
    const k = Math.min(1.15, Math.max(0.6, Math.min(w / laid.width, h / laid.height)));
    // Centre while the graph fits; once the legibility floor makes it wider than the
    // viewport, anchor to the start of the flow instead -- clipping the first node is
    // worse than asking the operator to pan towards the end.
    const sw = laid.width * k, sh = laid.height * k;
    setView({ k, x: sw > w ? pad : pad + (w - sw) / 2, y: sh > h ? padTop : padTop + (h - sh) / 2 });
  }, [laid.width, laid.height]);

  // Auto-fit only when the picture itself changes shape (first paint, orientation,
  // a node appearing, entering fullscreen) -- never on a data tick, so panning and
  // zooming survive a running pipeline.
  const fittedFor = useRef<string>('');
  useLayoutEffect(() => {
    const key = `${layoutKey}::${fullscreen ? 'fs' : 'inline'}`;
    if (fittedFor.current === key) return;
    if (!hostRef.current?.clientWidth) return; // tab still hidden: try again when shown
    fittedFor.current = key;
    fit();
  }, [layoutKey, fullscreen, fit]);

  // Every tab stays mounted in this app, so this panel is laid out at width 0 until
  // the operator opens it. Watch for the moment it gains size (and for real resizes)
  // and fit then -- otherwise the canvas would open stuck at 100% in a corner.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0 && !fittedFor.current) { fittedFor.current = `${layoutKey}::${fullscreen ? "fs" : "inline"}`; fit(); }
    });
    ro.observe(host);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, layoutKey, fullscreen]);

  // ---- pan & zoom ----
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; k: number } | null>(null);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView(v => {
      const k = Math.min(2.2, Math.max(0.3, v.k * factor));
      const scale = k / v.k;
      return { k, x: cx - (cx - v.x) * scale, y: cy - (cy - v.y) * scale };
    });
  }, []);

  const onWheel = (e: React.WheelEvent) => {
    const rect = hostRef.current!.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
      drag.current = null;
      return;
    }
    // Everything interactive that floats over the canvas -- node cards, the toolbar,
    // the zoom controls -- must keep its own clicks. Capturing the pointer here would
    // redirect the rest of the gesture to the canvas and swallow the click entirely.
    if ((e.target as HTMLElement).closest('[data-node], button, input, textarea, select, a, label')) return;
    drag.current = { id: e.pointerId, x: e.clientX - view.x, y: e.clientY - view.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pinch.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = hostRef.current!.getBoundingClientRect();
      const factor = (dist / pinchStart.current.dist) * (pinchStart.current.k / view.k);
      zoomAt(factor, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      return;
    }
    if (!drag.current || drag.current.id !== e.pointerId) return;
    // Read the ref NOW. A functional updater runs at render time, and while a run is
    // in flight (polling every 1.2 s) that render is often deferred -- long enough for
    // pointerup to null the ref first. Reading it inside the updater crashed the tab.
    const x = e.clientX - drag.current.x, y = e.clientY - drag.current.y;
    setView(v => ({ ...v, x, y }));
  };

  const endPointer = (e: React.PointerEvent) => {
    pinch.current.delete(e.pointerId);
    if (pinch.current.size < 2) pinchStart.current = null;
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreen) { setFullscreen(false); return; }
      const host = hostRef.current;
      if (!host) return;
      if (!fullscreen && !host.matches(':hover')) return;
      const rect = host.getBoundingClientRect();
      if (e.key === '+' || e.key === '=') zoomAt(1.15, rect.width / 2, rect.height / 2);
      if (e.key === '-') zoomAt(1 / 1.15, rect.width / 2, rect.height / 2);
      if (e.key === '0') fit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, fit, zoomAt]);

  // Wheel must be non-passive to preventDefault the page scroll; React's onWheel is
  // passive, so the listener is attached directly.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handler = (e: WheelEvent) => { e.preventDefault(); };
    host.addEventListener('wheel', handler, { passive: false });
    return () => host.removeEventListener('wheel', handler);
  }, []);

  // ---- frame sampling: one short probe per run, never a running loop ----
  useEffect(() => {
    if (!isRunning || lowPower || readLowPower() !== null) return;
    let raf = 0, frames = 0;
    const t0 = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - t0 < 1000) { raf = requestAnimationFrame(tick); return; }
      const avg = (performance.now() - t0) / Math.max(1, frames);
      if (avg > 22) { setLowPower(true); setAutoLowPower(true); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isRunning, lowPower]);

  const motionOn = isRunning && !lowPower;
  const activeSet = new Set(graph.activeEdges);
  const [theme] = useTheme();
  const shape = (p: string) => (theme === 'persona' ? slashPath(p) : p);

  const canvas = (
    <div
      ref={hostRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onClick={e => { if (!(e.target as HTMLElement).closest('[data-node]')) onSelectNode(null); }}
      className={`du-canvas relative overflow-hidden bg-slate-950 select-none touch-none ${
        fullscreen ? 'h-full w-full' : 'h-[70vh] min-h-[420px] w-full rounded-2xl border border-slate-800'
      }`}
    >
      {/* Static dot grid: a background image, so keeping it on screen costs nothing. */}
      <div aria-hidden="true" className="du-canvas-grid absolute inset-0 pointer-events-none" />

      <div
        className="absolute top-0 left-0 origin-top-left will-change-transform"
        style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.k})`, width: laid.width, height: laid.height }}
      >
        <svg width={laid.width} height={laid.height} className="absolute inset-0 overflow-visible pointer-events-none">
          {laid.edges.map(e => {
            const active = activeSet.has(e.id) && motionOn;
            const done = graph.nodes[e.to]?.status === 'done' && graph.nodes[e.from]?.status === 'done';
            const tone = e.loop ? EDGE_TONE.loop : active ? EDGE_TONE.active : done ? EDGE_TONE.done : EDGE_TONE.idle;
            return (
              <g key={e.id}>
                {/* Glow marks the edge that is carrying data RIGHT NOW. Putting it on
                    finished edges too would look richer and mean less. */}
                {active && (
                  <>
                    <path d={shape(e.path)} style={{ stroke: tone }} strokeWidth={10} fill="none" opacity={0.08} strokeLinecap="round" />
                    <path d={shape(e.path)} style={{ stroke: tone }} strokeWidth={5} fill="none" opacity={0.16} strokeLinecap="round" />
                  </>
                )}
                <path
                  d={shape(e.path)}
                  style={{ stroke: tone }}
                  className={active ? 'du-edge du-edge-flow' : 'du-edge'}
                  strokeWidth={active ? 2.2 : 1.6}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={e.advisory ? '5 6' : active ? '10 12' : undefined}
                  opacity={done || active ? 0.95 : 0.55}
                />
                {/* One packet per active edge: one hand-off is happening, so one dot
                    travels. A stream of dots would be decoration pretending to be data. */}
                {active && (
                  <circle r={4} className="du-particle" style={{ fill: 'var(--du-particle)', offsetPath: `path('${shape(e.path)}')` } as React.CSSProperties} />
                )}
                {e.loop && graph.revisionRounds > 0 && (
                  <g transform={`translate(${e.midX}, ${e.midY})`}>
                    <rect x={-36} y={-11} width={72} height={22} rx={11} style={{ fill: 'var(--du-canvas-panel)', stroke: EDGE_TONE.loop }} strokeWidth={1} opacity={0.95} />
                    <text x={0} y={4} textAnchor="middle" fontSize={11} fill="#fcd34d" fontWeight={700}>revisi ×{graph.revisionRounds}</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {laid.nodes.map(n => (
          <NodeCard
            key={n.id}
            node={n}
            state={graph.nodes[n.id]}
            selected={selectedNode === n.id}
            motionOn={motionOn}
            scale={view.k}
            onSelect={() => onSelectNode(n.id)}
          />
        ))}
      </div>

      <div ref={toolbarRef} className="absolute top-0 inset-x-0 p-3 sm:p-4 pointer-events-none">
        <div className="pointer-events-auto">{toolbar}</div>
      </div>

      {isRunning && (
        <div className="du-canvas-progress absolute left-3 bottom-3 sm:left-4 sm:bottom-4 pointer-events-none flex items-center gap-2 rounded-full bg-slate-900/90 border border-sky-500/40 px-3 py-1.5 text-2xs text-sky-200 max-w-[60%]">
          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span className="truncate">{progressLabel || 'Menyiapkan pipeline...'}</span>
        </div>
      )}

      <div className="du-canvas-controls absolute right-3 bottom-3 sm:right-4 sm:bottom-4 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => { const next = !lowPower; setLowPower(next); setAutoLowPower(false); writeLowPower(next); }}
          data-guide="orchestrator.hemat"
          title={lowPower ? 'Nyalakan gerak aliran data' : 'Matikan gerak, status tetap tampil'}
          className={`inline-flex items-center gap-1 rounded-lg bg-slate-900/90 border px-2 py-1.5 text-3xs font-semibold cursor-pointer hover:bg-slate-800 ${
            lowPower ? 'border-amber-500/50 text-amber-300' : 'border-slate-700 text-slate-400'
          }`}
        >
          {lowPower ? <ZapOff className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
          {lowPower ? (autoLowPower ? 'hemat (otomatis)' : 'hemat') : 'gerak'}
        </button>
        <div className="flex items-center rounded-lg bg-slate-900/90 border border-slate-700 overflow-hidden">
          <CtrlButton onClick={() => zoomAt(1 / 1.15, 0, 0)} title="Perkecil" guide="orchestrator.zoom"><Minus className="w-3.5 h-3.5" /></CtrlButton>
          <span className="px-2 text-3xs font-mono text-slate-400 tabular-nums">{Math.round(view.k * 100)}%</span>
          <CtrlButton onClick={() => zoomAt(1.15, 0, 0)} title="Perbesar" guide="orchestrator.zoom"><Plus className="w-3.5 h-3.5" /></CtrlButton>
          <CtrlButton onClick={fit} title="Paskan ke layar (0)" guide="orchestrator.fit"><Crosshair className="w-3.5 h-3.5" /></CtrlButton>
          <CtrlButton onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Keluar layar penuh (Esc)' : 'Layar penuh'} guide="orchestrator.fullscreen">
            {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </CtrlButton>
        </div>
      </div>
    </div>
  );

  if (!fullscreen) return canvas;
  // Portal to the body on purpose. Every tab panel keeps a finished transform from its
  // settle-in animation (fill-mode: both), and a transformed ancestor becomes the
  // containing block for position: fixed -- so an overlay rendered in place sized
  // itself to the tab box instead of the viewport and collapsed to a thin strip.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-950 animate-du-fade-in motion-reduce:animate-none" style={{ paddingBottom: 'var(--du-bottom-nav)' }}>
      {canvas}
    </div>,
    document.body
  );
};

const CtrlButton: React.FC<{ onClick: () => void; title: string; guide?: string; children: React.ReactNode }> = ({ onClick, title, guide, children }) => (
  <button type="button" onClick={onClick} title={title} data-guide={guide} className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer">
    {children}
  </button>
);

const NodeCard: React.FC<{
  node: LaidOutNode;
  state: GraphState['nodes'][string] | undefined;
  selected: boolean;
  motionOn: boolean;
  scale: number;
  onSelect: () => void;
}> = ({ node, state, selected, motionOn, scale, onSelect }) => {
  const Icon = ICONS[node.id] || Workflow;
  const status: NodeStatus = state?.status ?? 'idle';
  const running = status === 'running' && motionOn;
  return (
    <button
      data-node={node.id}
      type="button"
      onClick={onSelect}
      style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
      // The card is a fixed box on the canvas, so its content has to stay inside it:
      // flex column, clamped role line, status pinned to the bottom.
      data-status={status}
      className={`du-node absolute text-left rounded-xl border bg-slate-900/95 px-3 py-2 flex flex-col overflow-hidden transition-colors duration-200 cursor-pointer ${STATUS_RING[status]} ${
        selected ? 'ring-2 ring-sky-400/70' : 'hover:border-slate-500'
      } ${status === 'done' ? 'animate-du-node-land motion-reduce:animate-none' : ''}`}
    >
      {running && (
        <span aria-hidden="true" className="absolute -inset-1 rounded-2xl border border-sky-400/50 animate-du-node-pulse motion-reduce:animate-none pointer-events-none" />
      )}
      <div className="flex items-start gap-2.5">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
          node.kind === 'human' ? 'bg-amber-500/15 text-amber-300'
            : node.kind === 'source' ? 'bg-slate-700/60 text-slate-300'
            : node.kind === 'sink' ? 'bg-emerald-500/15 text-emerald-300'
            : 'bg-sky-500/10 text-sky-300'
        }`}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="du-node-title text-sm font-bold text-slate-100 truncate leading-tight">{node.label}</div>
          {/* Semantic zoom: at overview scale the role line is unreadable anyway, so
              the card keeps only what still carries meaning -- icon, name, status. */}
          {scale >= 0.78 && <div className="text-3xs text-slate-400 leading-snug line-clamp-2">{node.role}</div>}
        </div>
      </div>
      <div className="mt-auto flex items-center gap-1.5 pt-1">
        <span className={`du-node-status inline-flex items-center gap-1 text-3xs font-semibold ${STATUS_TEXT[status]}`}>
          {status === 'running' ? <RefreshCw className="w-3 h-3 animate-spin" />
            : status === 'done' ? <CheckCircle2 className="w-3 h-3" />
            : status === 'failed' ? <XCircle className="w-3 h-3" />
            : status === 'waiting' ? <UserRoundPen className="w-3 h-3" />
            : <MinusCircle className="w-3 h-3" />}
          {STATUS_LABEL[status]}
        </span>
        {!!state && state.durationMs > 0 && <span className="text-3xs text-slate-500 font-mono">{(state.durationMs / 1000).toFixed(1)}s</span>}
        {!!state && state.repeats > 0 && <span className="text-3xs text-amber-300 font-bold">×{state.repeats + 1}</span>}
        {!!state && state.fallback && <ArrowRightLeft className="w-3 h-3 text-amber-400" />}
      </div>
      {/* While a stage runs the server cannot say how far along it is, so the bar is
          deliberately indeterminate: it says "working", it does not fake a percentage. */}
      {status === 'running' && (
        <span aria-hidden="true" className="absolute inset-x-3 bottom-1.5 h-0.5 rounded-full bg-slate-800 overflow-hidden">
          <span className={`block h-full w-1/3 rounded-full bg-sky-400 ${motionOn ? 'animate-du-sweep motion-reduce:animate-none' : ''}`} />
        </span>
      )}
    </button>
  );
};

export const NODE_LABELS: Record<string, string> = Object.fromEntries(NODES.map(n => [n.id, n.label]));
