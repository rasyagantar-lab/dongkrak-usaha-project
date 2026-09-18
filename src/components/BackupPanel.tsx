import React, { useEffect, useRef, useState } from 'react';
import { DatabaseBackup, Download, Upload, RefreshCw, CheckCircle2, AlertTriangle, HardDrive, Cloud, XCircle } from 'lucide-react';

interface StorageProbe {
  mode: 'local' | 'gcs' | 'firestore';
  label: string;
  bucket: string | null;
  persistent: boolean;
  ok: boolean;
  latencyMs: number;
  error?: string;
  hint?: string;
  checkedAt: string;
}

/*
  Cadangan Data. One JSON file = every campaign + the publish history. Exists because
  hosting without a storage bucket (AI Studio as deployed today) wipes data/ on every
  restart, and because the team wants a file they can keep or move between laptops.
*/
interface BackupPanelProps {
  onReloadCampaigns: () => Promise<void>;
}

export const BackupPanel: React.FC<BackupPanelProps> = ({ onReloadCampaigns }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [busy, setBusy] = useState<'download' | 'restore' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  // Where does the data live right now, and can it actually be written? Answered by
  // a real write/read/delete round trip on the server, not by configuration alone.
  const [probe, setProbe] = useState<StorageProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const runProbe = async () => {
    setProbing(true);
    try {
      const res = await fetch('/api/storage/status');
      setProbe(await res.json());
    } catch {
      setProbe(null);
    } finally {
      setProbing(false);
    }
  };
  useEffect(() => { runProbe(); }, []);

  const handleDownload = async () => {
    setBusy('download');
    setMsg(null);
    try {
      const res = await fetch('/api/backup');
      if (!res.ok) throw new Error('Gagal membuat cadangan.');
      const blob = await res.blob();
      const name = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'dongkrakusaha-backup.json';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      setMsg({ tone: 'ok', text: `Cadangan diunduh: ${name}. Simpan di tempat aman (Drive / laptop).` });
    } catch (err: any) {
      setMsg({ tone: 'error', text: err.message || 'Gagal membuat cadangan.' });
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async (file: File) => {
    setBusy('restore');
    setMsg(null);
    try {
      const text = await file.text();
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { throw new Error('File bukan JSON yang valid.'); }
      if (mode === 'replace' && !window.confirm('Ganti SEMUA campaign dan riwayat di server dengan isi file ini? Data yang sekarang akan hilang.')) return;
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed, mode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pemulihan gagal.');
      await onReloadCampaigns();
      setMsg({ tone: 'ok', text: `Dipulihkan: ${data.campaignsAdded} campaign baru, ${data.campaignsUpdated} diperbarui, ${data.historyRecords} riwayat. Total sekarang ${data.totalCampaigns} campaign.` });
    } catch (err: any) {
      setMsg({ tone: 'error', text: err.message || 'Pemulihan gagal.' });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="du-card bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <DatabaseBackup className="w-4.5 h-4.5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">Cadangan Data</h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Satu file berisi semua campaign dan riwayat publish. Unduh secara berkala — terutama kalau app ini
            berjalan di hosting tanpa penyimpanan permanen (data bisa hilang saat server dimulai ulang) — dan
            pulihkan di sini kapan pun, termasuk untuk memindahkan data antar laptop.
          </p>
        </div>
      </div>

      {/* Storage status */}
      <div className={`rounded-lg border px-3 py-2.5 text-xs flex items-start gap-2.5 ${
        !probe ? 'bg-slate-50 border-slate-200 text-slate-600'
          : !probe.ok ? 'bg-rose-50 border-rose-200 text-rose-800'
          : probe.persistent ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
          : 'bg-amber-50 border-amber-200 text-amber-900'
      }`}>
        <span className="shrink-0 mt-0.5">
          {!probe ? <RefreshCw className="w-4 h-4 animate-spin" />
            : !probe.ok ? <XCircle className="w-4 h-4" />
            : probe.persistent ? <Cloud className="w-4 h-4" />
            : <HardDrive className="w-4 h-4" />}
        </span>
        <div className="min-w-0 flex-1 leading-relaxed">
          {!probe && <span>Memeriksa penyimpanan...</span>}
          {probe && probe.ok && probe.persistent && (
            <span><strong>Penyimpanan permanen aktif</strong> — <code className="font-mono">{probe.label}</code> tersambung (tes tulis/baca {probe.latencyMs} ms). Data aman saat server dimulai ulang.</span>
          )}
          {probe && probe.ok && !probe.persistent && (
            <span><strong>Disk lokal.</strong> Di laptop ini aman. Di hosting (AI Studio / Cloud Run) disk dibuang setiap server dimulai ulang — di sana app otomatis memakai Firestore; kalau tidak, andalkan cadangan di bawah.</span>
          )}
          {probe && !probe.ok && (
            <span><strong>Penyimpanan GAGAL</strong> — <code className="font-mono">{probe.label}</code>: {probe.error}{probe.hint ? <><br /><span className="font-semibold">Perbaikan:</span> {probe.hint}</> : null}</span>
          )}
        </div>
        <button type="button" onClick={runProbe} disabled={probing} title="Periksa ulang" className="shrink-0 p-1 rounded hover:bg-white/60 disabled:opacity-50 cursor-pointer">
          <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy !== null}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer"
        >
          {busy === 'download' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Unduh cadangan (JSON)
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-xs font-bold rounded-lg cursor-pointer"
          >
            {busy === 'restore' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Pulihkan dari file
          </button>
          <select
            value={mode}
            onChange={e => setMode(e.target.value as 'merge' | 'replace')}
            className="text-xs border border-slate-300 rounded-lg px-2 py-2 bg-white"
            title="Gabungkan = data di file ditambahkan/menimpa yang id-nya sama; Ganti semua = hapus data sekarang lalu isi dari file"
          >
            <option value="merge">gabungkan dengan data sekarang</option>
            <option value="replace">ganti semua data</option>
          </select>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleRestore(f); }}
          />
        </div>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 text-xs rounded-lg border px-3 py-2.5 ${msg.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {msg.tone === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}
    </div>
  );
};
