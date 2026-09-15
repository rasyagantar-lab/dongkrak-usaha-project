import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/*
  Job Center -- long-running work owned by the App, not by a tab panel.

  Before this, an orchestrator run (30-150 s) lived in OrchestratorPanel's own state.
  Switching tabs or campaigns unmounted the panel, the fetch kept going on the
  network, and its result landed in a component that no longer existed -- the user
  saw "progress lost" every time they looked elsewhere. Panels now hand the async
  work to startJob(); the store keeps status/progress/result keyed by a stable job id
  (e.g. `orchestrator:cmp-001`) and any panel that mounts later simply reads it back.
  The JobTray renders every job for a compact per-tab progress notification.
*/

export type JobStatus = 'running' | 'done' | 'error';

export interface Job<T = any> {
  id: string;
  tab: string;             // owning tab id, for the tab badge and click-to-navigate
  campaignId?: string;     // campaign to switch to when the tray entry is clicked
  label: string;           // "AI Orchestrator"
  subject?: string;        // business / area name
  status: JobStatus;
  progress?: number;       // 0..1; undefined = indeterminate
  detail?: string;         // "Tahap 3/6 · Audit kualitas"
  meta?: any;              // job-specific live data (ledger, per-item queue)
  result?: T;
  error?: string;
  startedAt: number;
  finishedAt?: number;
  dismissed?: boolean;     // hidden from the tray (result stays readable by panels)
}

export interface JobUpdate {
  progress?: number;
  detail?: string;
  meta?: any;
}

export interface JobSpec {
  id: string;
  tab: string;
  campaignId?: string;
  label: string;
  subject?: string;
}

export type JobRunner<T> = (update: (u: JobUpdate) => void, signal: AbortSignal) => Promise<T>;

interface JobCenterValue {
  jobs: Record<string, Job>;
  startJob: <T>(spec: JobSpec, runner: JobRunner<T>) => Promise<T | undefined>;
  dismissJob: (id: string) => void;
  clearJob: (id: string) => void;
  cancelJob: (id: string) => void;
}

const JobCenterContext = createContext<JobCenterValue | null>(null);

export const JobCenterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const controllers = useRef<Map<string, AbortController>>(new Map());
  // Mirror of the latest state so startJob can refuse a duplicate start without
  // waiting for a render.
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const patch = useCallback((id: string, changes: Partial<Job>) => {
    setJobs(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], ...changes } } : prev));
  }, []);

  const startJob = useCallback(async <T,>(spec: JobSpec, runner: JobRunner<T>): Promise<T | undefined> => {
    if (jobsRef.current[spec.id]?.status === 'running') return undefined;
    const controller = new AbortController();
    controllers.current.set(spec.id, controller);
    const job: Job<T> = { ...spec, status: 'running', startedAt: Date.now(), dismissed: false };
    setJobs(prev => ({ ...prev, [spec.id]: job }));

    const update = (u: JobUpdate) => patch(spec.id, u);
    try {
      const result = await runner(update, controller.signal);
      patch(spec.id, { status: 'done', result, progress: 1, finishedAt: Date.now() });
      return result;
    } catch (err: any) {
      const message = controller.signal.aborted ? 'Dibatalkan.' : (err?.message || 'Gagal.');
      patch(spec.id, { status: 'error', error: message, finishedAt: Date.now() });
      return undefined;
    } finally {
      controllers.current.delete(spec.id);
    }
  }, [patch]);

  const dismissJob = useCallback((id: string) => patch(id, { dismissed: true }), [patch]);
  const clearJob = useCallback((id: string) => {
    setJobs(prev => { if (!prev[id]) return prev; const next = { ...prev }; delete next[id]; return next; });
  }, []);
  const cancelJob = useCallback((id: string) => { controllers.current.get(id)?.abort(); }, []);

  const value = useMemo(() => ({ jobs, startJob, dismissJob, clearJob, cancelJob }), [jobs, startJob, dismissJob, clearJob, cancelJob]);
  return <JobCenterContext.Provider value={value}>{children}</JobCenterContext.Provider>;
};

export const useJobCenter = (): JobCenterValue => {
  const ctx = useContext(JobCenterContext);
  if (!ctx) throw new Error('useJobCenter must be used inside <JobCenterProvider>');
  return ctx;
};

export const useJob = <T = any,>(id: string): Job<T> | undefined => useJobCenter().jobs[id] as Job<T> | undefined;

// Polls the server-side orchestrator snapshot while a run is in flight and feeds it
// to the job. Stops on its own when the run finishes or the fetch aborts.
export const pollOrchestratorProgress = (runId: string, update: (u: JobUpdate) => void, signal: AbortSignal) => {
  let stopped = false;
  const tick = async () => {
    if (stopped || signal.aborted) return;
    try {
      const res = await fetch(`/api/orchestrator/progress/${encodeURIComponent(runId)}`, { signal });
      if (res.ok) {
        const p = await res.json();
        if (!stopped) {
          update({
            progress: p.total ? Math.min(0.95, p.completed / p.total) : undefined,
            detail: `Tahap ${Math.min(p.completed + 1, p.total)}/${p.total} · ${p.label}`,
            meta: { ledger: p.ledger }
          });
        }
        if (p.finished) return;
      }
    } catch {
      /* transient; next tick retries */
    }
    if (!stopped && !signal.aborted) setTimeout(tick, 2000);
  };
  setTimeout(tick, 600);
  return () => { stopped = true; };
};

export const formatElapsed = (fromMs: number, toMs: number = Date.now()) => {
  const s = Math.max(0, Math.round((toMs - fromMs) / 1000));
  return s < 60 ? `${s} dtk` : `${Math.floor(s / 60)} mnt ${s % 60} dtk`;
};
