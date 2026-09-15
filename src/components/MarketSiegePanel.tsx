import React, { useMemo, useState } from 'react';
import {
  MapPinned,
  Layers,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Clock,
  Trash2
} from 'lucide-react';
import { Campaign, BulkQueueItem } from '../types';
import { useJobCenter, useJob, pollOrchestratorProgress } from '../jobs';

const REALIZE_JOB_ID = 'siege:realize';

interface MarketSiegePanelProps {
  campaigns: Campaign[];
  onReloadCampaigns: () => Promise<void>;
  onUpdateCampaign: (campaign: Campaign) => Promise<void> | void;
}

// Accepts one area per line OR comma-separated on one line, trimmed and de-duplicated.
const parseAreaNames = (raw: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[\n,]+/)) {
    const name = piece.trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
};

const statusBadge = (status: BulkQueueItem['status']) => {
  if (status === 'success') return <span className="inline-flex items-center gap-1 text-3xs font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded"><CheckCircle2 className="w-3 h-3" />SELESAI</span>;
  if (status === 'failed') return <span className="inline-flex items-center gap-1 text-3xs font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded"><XCircle className="w-3 h-3" />GAGAL</span>;
  if (status === 'processing') return <span className="inline-flex items-center gap-1 text-3xs font-bold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded"><RefreshCw className="w-3 h-3 animate-spin" />JALAN</span>;
  return <span className="inline-flex items-center gap-1 text-3xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded"><Clock className="w-3 h-3" />ANTRE</span>;
};

export const MarketSiegePanel: React.FC<MarketSiegePanelProps> = ({ campaigns, onReloadCampaigns, onUpdateCampaign }) => {
  // Parents are campaigns that are not themselves siege clones.
  const parentOptions = useMemo(() => campaigns.filter(c => !c.siegeBatchId), [campaigns]);
  const [parentId, setParentId] = useState<string>(parentOptions[0]?.id || '');
  const [areaText, setAreaText] = useState('');
  const [objective, setObjective] = useState('Meningkatkan penjualan dan visibilitas lokal');

  const [isDrafting, setIsDrafting] = useState(false);
  const [draftMsg, setDraftMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // The realisation batch runs inside the App-level Job Center (src/jobs.tsx): the
  // per-area queue is the job's live meta, so leaving this tab mid-batch neither
  // stops the loop nor loses the badges.
  const { startJob } = useJobCenter();
  const realizeJob = useJob<{ ok: number; failed: number }>(REALIZE_JOB_ID);
  const isRealizing = realizeJob?.status === 'running';
  const queue: Record<string, BulkQueueItem> = realizeJob?.meta?.queue || {};

  const parent = parentOptions.find(c => c.id === parentId) || parentOptions[0];
  const parsedAreas = useMemo(() => parseAreaNames(areaText), [areaText]);

  // Group existing clones by batch, newest batch first.
  const batches = useMemo(() => {
    const map = new Map<string, Campaign[]>();
    for (const c of campaigns) {
      if (!c.siegeBatchId) continue;
      map.set(c.siegeBatchId, [...(map.get(c.siegeBatchId) || []), c]);
    }
    return [...map.entries()].sort((a, b) => (b[0] > a[0] ? 1 : -1));
  }, [campaigns]);

  const handleDraft = async () => {
    setErrorMsg('');
    setDraftMsg('');
    if (!parent) {
      setErrorMsg('Pilih campaign induk dulu.');
      return;
    }
    if (parsedAreas.length === 0) {
      setErrorMsg('Isi minimal satu nama kecamatan / area.');
      return;
    }
    setIsDrafting(true);
    try {
      const res = await fetch('/api/campaigns/siege', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentCampaignId: parent.id, areaNames: parsedAreas })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat draft.');
      await onReloadCampaigns();
      setAreaText('');
      setDraftMsg(`${data.created} draft dibuat dari "${data.parentName}" — tanpa memakai kuota AI sama sekali. Centang yang mau direalisasikan di bawah.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal membuat draft.');
    } finally {
      setIsDrafting(false);
    }
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleBatch = (items: Campaign[], on: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      for (const c of items) {
        if (c.status !== 'Draft') continue;
        if (on) next.add(c.id); else next.delete(c.id);
      }
      return next;
    });
  };

  // Realisation runs STRICTLY one campaign at a time. Every agent draws on a shared
  // per-key Gemini allowance; firing several orchestrator runs in parallel would just
  // race each other into 429s. One failure records itself and the loop continues.
  const handleRealize = () => {
    setErrorMsg('');
    const targets = campaigns.filter(c => selected.has(c.id) && c.status === 'Draft');
    if (targets.length === 0) {
      setErrorMsg('Belum ada draft yang dicentang.');
      return;
    }
    const n = targets.length;

    startJob<{ ok: number; failed: number }>(
      {
        id: REALIZE_JOB_ID,
        tab: 'market-siege',
        label: 'Realisasi Kepung Pasar',
        subject: `${n} area · ${targets[0].businessData.name}`
      },
      async (update, signal) => {
        let queue: Record<string, BulkQueueItem> = {};
        for (const c of targets) {
          queue[c.id] = { campaignId: c.id, campaignTitle: c.title, businessName: c.businessData.name, status: 'pending' };
        }
        const setQ = (id: string, changes: Partial<BulkQueueItem>) => {
          queue = { ...queue, [id]: { ...queue[id], ...changes } };
          update({ meta: { queue } });
        };
        update({ meta: { queue }, progress: 0, detail: `Mulai · 0/${n}` });

        let ok = 0;
        let failed = 0;
        for (let i = 0; i < n; i++) {
          const c = targets[i];
          const area = c.siegeTargetArea || c.title;
          setQ(c.id, { status: 'processing' });
          update({ progress: i / n, detail: `${area} (${i + 1}/${n})` });
          const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const stopPolling = pollOrchestratorProgress(runId, (u) => update({
            progress: (i + (u.progress ?? 0)) / n,
            detail: `${area} (${i + 1}/${n}) · ${u.detail || ''}`
          }), signal);
          try {
            const res = await fetch('/api/orchestrator/run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ businessData: c.businessData, objective, campaign: c, runId }),
              signal
            });
            const run = await res.json();
            if (!res.ok || !run?.ok) throw new Error(run?.error || `Pipeline ${run?.pipelineStatus || 'gagal'}`);

            // Same apply logic as OrchestratorPanel.handleApply, so a realised clone ends up
            // in exactly the state a manually orchestrated campaign would.
            const { seoStrategy, generatedContent, audit, imageBrief } = run.outputs || {};
            await onUpdateCampaign({
              ...c,
              seoStrategy: seoStrategy || c.seoStrategy,
              generatedContent: generatedContent || c.generatedContent,
              validationScore: audit || c.validationScore,
              imageBrief: imageBrief || c.imageBrief,
              status: audit?.publishingReadiness === 'READY' ? 'Ready to Publish' : 'SEO Ready',
              updatedAt: new Date().toISOString()
            });
            ok++;
            setQ(c.id, {
              status: 'success',
              errorMessage: audit ? `Audit ${audit.publishingReadiness} · SEO ${audit.seoScore}` : undefined
            });
          } catch (err: any) {
            if (signal.aborted) throw err;
            failed++;
            setQ(c.id, { status: 'failed', errorMessage: err.message || 'Gagal' });
          } finally {
            stopPolling();
          }
        }

        await onReloadCampaigns();
        update({ progress: 1, detail: `${ok} selesai${failed ? `, ${failed} gagal` : ''} dari ${n} area` });
        return { ok, failed };
      }
    ).then(() => setSelected(new Set()));
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const handleDelete = async (c: Campaign) => {
    if (!window.confirm(`Hapus draft "${c.siegeTargetArea}"? Ini tidak bisa dibatalkan.`)) return;
    setDeletingId(c.id);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/campaigns/${c.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus.');
      setSelected(prev => { const n = new Set(prev); n.delete(c.id); return n; });
      await onReloadCampaigns();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menghapus.');
    } finally {
      setDeletingId(null);
    }
  };

  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);
  const handleDeleteBatchDrafts = async (batchId: string, items: Campaign[]) => {
    const drafts = items.filter(c => c.status === 'Draft');
    if (drafts.length === 0) return;
    if (!window.confirm(`Hapus ${drafts.length} draft di batch ini? Yang sudah direalisasikan/di-submit tidak ikut terhapus.`)) return;
    setDeletingBatch(batchId);
    setErrorMsg('');
    let failed = 0;
    for (const c of drafts) {
      try {
        const res = await fetch(`/api/campaigns/${c.id}`, { method: 'DELETE' });
        if (!res.ok) failed++;
      } catch { failed++; }
    }
    setSelected(new Set());
    setDeletingBatch(null);
    await onReloadCampaigns();
    if (failed) setErrorMsg(`${failed} draft gagal dihapus.`);
  };

  const selectedCount = campaigns.filter(c => selected.has(c.id) && c.status === 'Draft').length;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shrink-0">
          <MapPinned className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Kepung Pasar</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Satu bisnis, banyak kecamatan. Buat draft untuk semua area secara gratis, lalu pilih mana yang
            dijalankan AI-nya — supaya kuota model tidak boros untuk area yang belum tentu dipakai.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2.5 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{errorMsg}</span>
        </div>
      )}
      {draftMsg && !errorMsg && (
        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2.5 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /><span>{draftMsg}</span>
        </div>
      )}

      {/* Step 1: draft */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-slate-800">1. Buat Draft per Area (gratis, tanpa AI)</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-2xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Campaign induk</label>
            <select
              value={parent?.id || ''}
              onChange={e => setParentId(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
            >
              {parentOptions.map(c => (
                <option key={c.id} value={c.id}>{c.businessData.name} — {c.businessData.targetCities?.[0] || 'tanpa kota'}</option>
              ))}
            </select>
            {parent && (
              <p className="text-2xs text-slate-500 mt-1.5 leading-relaxed">
                Kota utama induk: <strong>{parent.businessData.targetCities?.[0] || '-'}</strong>. Setiap kemunculan
                teks itu (atau placeholder <code className="bg-slate-100 px-1 rounded">[...]</code>) akan diganti nama area.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-2xs font-semibold text-slate-600 uppercase tracking-wide">Daftar kecamatan / area</label>
              <span className="text-2xs text-slate-400">{parsedAreas.length} area</span>
            </div>
            <textarea
              value={areaText}
              onChange={e => setAreaText(e.target.value)}
              rows={5}
              placeholder={'Satu per baris atau pisahkan dengan koma:\nCiputat\nPamulang\nSerpong, Pondok Aren'}
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        <button
          onClick={handleDraft}
          disabled={isDrafting || !parent || parsedAreas.length === 0}
          className="w-full md:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg px-4 py-2.5 transition-colors"
        >
          {isDrafting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
          Buat {parsedAreas.length > 0 ? parsedAreas.length : ''} Draft
        </button>
      </div>

      {/* Step 2: select + realise */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">2. Pilih &amp; Realisasikan (memakai AI)</h3>
            <p className="text-2xs text-slate-500 mt-0.5">
              Dijalankan satu per satu, bukan bersamaan, agar tidak berebut kuota. Draft yang tidak dicentang tetap gratis.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={objective}
              onChange={e => setObjective(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-2 focus:ring-2 focus:ring-violet-500 focus:outline-none w-56"
              placeholder="Tujuan campaign"
            />
            <button
              onClick={handleRealize}
              disabled={isRealizing || selectedCount === 0}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg px-4 py-2 transition-colors shrink-0"
            >
              {isRealizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Realisasikan {selectedCount > 0 ? `(${selectedCount})` : ''}
            </button>
          </div>
        </div>

        {batches.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-lg py-8 text-center">
            <Info className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Belum ada draft. Buat dulu di langkah 1.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {batches.map(([batchId, items]) => {
              const parentName = campaigns.find(c => c.id === items[0]?.siegeParentId)?.businessData.name || items[0]?.businessData.name;
              const draftItems = items.filter(c => c.status === 'Draft');
              const allChecked = draftItems.length > 0 && draftItems.every(c => selected.has(c.id));
              return (
                <div key={batchId} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-50 border-b border-slate-200">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">{parentName}</div>
                      <div className="text-3xs text-slate-500">
                        {items.length} area · {draftItems.length} masih draft · batch {batchId.replace('siege-', '')}
                      </div>
                    </div>
                    {draftItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteBatchDrafts(batchId, items)}
                        disabled={isRealizing || deletingBatch === batchId}
                        className="inline-flex items-center gap-1 text-2xs text-rose-600 hover:text-rose-700 disabled:opacity-40 shrink-0"
                      >
                        {deletingBatch === batchId ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        hapus {draftItems.length} draft
                      </button>
                    )}
                    {draftItems.length > 0 && (
                      <label className="flex items-center gap-1.5 text-2xs text-slate-600 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={e => toggleBatch(items, e.target.checked)}
                          disabled={isRealizing}
                          className="w-3.5 h-3.5 accent-violet-600"
                        />
                        pilih semua draft
                      </label>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map(c => {
                      const q = queue[c.id];
                      const isDraft = c.status === 'Draft';
                      return (
                        <label
                          key={c.id}
                          className={`flex items-center gap-3 px-3 py-2.5 text-xs ${isDraft ? 'cursor-pointer hover:bg-slate-50' : 'bg-slate-50/50'}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(c.id)}
                            onChange={() => toggle(c.id)}
                            disabled={!isDraft || isRealizing}
                            className="w-3.5 h-3.5 accent-violet-600 disabled:opacity-40"
                          />
                          <MapPinned className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-semibold text-slate-800 w-36 truncate shrink-0">{c.siegeTargetArea}</span>
                          <span className="text-slate-500 truncate flex-1 min-w-0">{c.title}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            {q ? statusBadge(q.status) : (
                              <span className={`text-3xs font-bold px-1.5 py-0.5 rounded ${
                                isDraft ? 'text-slate-600 bg-slate-100' : 'text-emerald-700 bg-emerald-100'
                              }`}>{c.status.toUpperCase()}</span>
                            )}
                          </div>
                          {q?.errorMessage && (
                            <span className={`text-3xs w-40 truncate shrink-0 ${q.status === 'failed' ? 'text-rose-600' : 'text-slate-500'}`}>
                              {q.errorMessage}
                            </span>
                          )}
                          {isDraft && !q && (
                            <button
                              type="button"
                              onClick={e => { e.preventDefault(); handleDelete(c); }}
                              disabled={isRealizing || deletingId === c.id}
                              title="Hapus draft ini"
                              className="text-slate-300 hover:text-rose-600 disabled:opacity-40 transition-colors shrink-0"
                            >
                              {deletingId === c.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
