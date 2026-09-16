import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, RefreshCw, X, Workflow, MapPinned, Image as ImageIcon, Send } from 'lucide-react';
import { Job, useJobCenter, formatElapsed } from '../jobs';

/*
  Compact progress notifications for background jobs -- one row per job, stacked
  above the bottom navigation. Everything animated here is transform/opacity only
  (progress bar = scaleX), per the UI conventions in DEVELOPMENT_RULES.md.
*/

interface JobTrayProps {
  onNavigate: (tab: string, campaignId?: string) => void;
}

const TAB_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  orchestrator: Workflow,
  'market-siege': MapPinned,
  'visual-asset': ImageIcon,
  'publishing-hub': Send
};

const DONE_AUTO_DISMISS_MS = 15_000;

const JobRow: React.FC<{ job: Job; onNavigate: JobTrayProps['onNavigate']; onDismiss: () => void }> = ({ job, onNavigate, onDismiss }) => {
  // Elapsed-time ticker, only while running.
  const [, force] = useState(0);
  useEffect(() => {
    if (job.status !== 'running') return;
    const t = setInterval(() => force(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [job.status]);

  // Successful jobs leave on their own; failures wait to be read.
  useEffect(() => {
    if (job.status !== 'done') return;
    const t = setTimeout(onDismiss, DONE_AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [job.status, onDismiss]);

  const Icon = TAB_ICON[job.tab] || Workflow;
  const running = job.status === 'running';
  const scale = running ? (job.progress ?? 0.08) : 1;
  const tone = job.status === 'error' ? 'bg-rose-500' : job.status === 'done' ? 'bg-emerald-500' : 'bg-violet-500';

  return (
    <div
      role="status"
      className="relative pointer-events-auto w-full sm:w-80 bg-white/95 border border-slate-200 rounded-xl shadow-lg overflow-hidden animate-du-scale-in motion-reduce:animate-none"
    >
      <button
        type="button"
        onClick={() => onNavigate(job.tab, job.campaignId)}
        className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 hover:bg-slate-50 cursor-pointer"
        title="Buka tab ini"
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 ${tone}`}>
          {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            : job.status === 'done' ? <CheckCircle2 className="w-3.5 h-3.5" />
            : <XCircle className="w-3.5 h-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{job.label}</span>
            <span className="ml-auto text-3xs font-semibold text-slate-400 shrink-0">
              {formatElapsed(job.startedAt, job.finishedAt)}
            </span>
          </div>
          {job.subject && <div className="text-2xs text-slate-500 truncate">{job.subject}</div>}
          <div className={`text-2xs mt-0.5 truncate ${job.status === 'error' ? 'text-rose-600' : 'text-slate-600'}`}>
            {job.status === 'error' ? job.error : job.status === 'done' ? (job.detail || 'Selesai') : (job.detail || 'Memulai...')}
          </div>
        </div>
      </button>
      {!running && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-1.5 right-1.5 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          aria-label="Tutup notifikasi"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      {/* Progress bar: width is fixed, only transform animates. */}
      <div className="h-1 bg-slate-100">
        <div
          className={`h-full origin-left transition-transform duration-500 ease-out motion-reduce:transition-none ${tone}`}
          style={{ transform: `scaleX(${scale})` }}
        />
      </div>
    </div>
  );
};

export const JobTray: React.FC<JobTrayProps> = ({ onNavigate }) => {
  const { jobs, dismissJob } = useJobCenter();
  const visible = Object.values(jobs)
    .filter(j => !j.dismissed)
    .sort((a, b) => b.startedAt - a.startedAt);
  if (visible.length === 0) return null;

  const shown = visible.slice(0, 3);
  const hidden = visible.length - shown.length;

  return (
    <div
      // Bottom-left on wide screens (the model-status widget owns the bottom-right);
      // on phones, full width and lifted above that widget.
      className="fixed left-3 right-3 sm:right-auto sm:left-4 z-40 flex flex-col gap-2 pointer-events-none du-tray"
    >
      {hidden > 0 && (
        <div className="pointer-events-auto self-end text-3xs font-semibold text-slate-500 bg-white/90 border border-slate-200 rounded-full px-2 py-0.5">
          +{hidden} pekerjaan lain
        </div>
      )}
      {shown.map(job => (
        <JobRow key={job.id} job={job} onNavigate={onNavigate} onDismiss={() => dismissJob(job.id)} />
      ))}
    </div>
  );
};
