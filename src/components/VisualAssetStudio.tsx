import React, { useState, useEffect, useRef } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Wand2,
  Info
} from 'lucide-react';
import { Campaign } from '../types';
import { useJobCenter, useJob } from '../jobs';

interface VisualAssetStudioProps {
  campaign: Campaign;
  onUpdateCampaign: (campaign: Campaign) => void;
}

interface BasePhoto {
  slug: string;
  basePath: string;
  bytes: number;
  updatedAt: string;
}

interface ComposeResult {
  assetUrl: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  durationMs: number;
}

// Mirrors the server-side slugifyCategory so the UI can predict which stored base
// photo belongs to the active campaign without an extra round trip.
const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const CAPTION_LIMITS = { title: 28, subtitle: 40, badge: 14 };

export const VisualAssetStudio: React.FC<VisualAssetStudioProps> = ({ campaign, onUpdateCampaign }) => {
  const category = campaign?.businessData?.category || '';
  const categorySlug = slugify(category);

  const [basePhotos, setBasePhotos] = useState<BasePhoto[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isFetchingCaption, setIsFetchingCaption] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [applied, setApplied] = useState(false);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [badge, setBadge] = useState('');
  const [result, setResult] = useState<ComposeResult | null>(null);

  // AI base-photo generation (alternative to uploading a real photo). The prompt is
  // pre-filled from the Image Brief's visualPrompt when the caption is fetched.
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  // Generation (3-15 s on Cloudflare) runs as an App-level job keyed by category, so
  // it survives tab/campaign switches; the panel reacts to the job's outcome below.
  const { startJob } = useJobCenter();
  const genJobId = `image:base:${categorySlug}`;
  const genJob = useJob<{ message: string }>(genJobId);
  const isGenerating = genJob?.status === 'running';
  const handledGenRef = useRef<number>(0);
  useEffect(() => {
    if (!genJob || genJob.status === 'running' || !genJob.finishedAt) return;
    if (handledGenRef.current === genJob.finishedAt) return;
    if (Date.now() - genJob.finishedAt > 60_000) return; // stale outcome from long ago
    handledGenRef.current = genJob.finishedAt;
    if (genJob.status === 'done') {
      loadBasePhotos();
      setResult(null);
      setShowAiPrompt(false);
      setErrorMsg('');
      setInfoMsg(genJob.result?.message || 'Foto dasar dibuat.');
    } else {
      setErrorMsg(genJob.error || 'Generate gambar gagal.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genJob?.status, genJob?.finishedAt]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeBasePhoto = basePhotos.find(p => p.slug === categorySlug);

  const loadBasePhotos = async () => {
    try {
      const res = await fetch('/api/image/base-photos');
      const data = await res.json();
      setBasePhotos(Array.isArray(data.basePhotos) ? data.basePhotos : []);
    } catch {
      setBasePhotos([]);
    }
  };

  useEffect(() => {
    loadBasePhotos();
  }, []);

  // Sensible starting caption from data the campaign already holds, so the panel is
  // usable even before the AI caption is requested.
  // Prefer the brief the orchestrator already produced for this campaign -- no second
  // agent call, no wasted quota. Fall back to plain business-data defaults otherwise.
  useEffect(() => {
    const brief = campaign?.imageBrief;
    if (brief?.caption) {
      setTitle(String(brief.caption.title || '').slice(0, CAPTION_LIMITS.title));
      setSubtitle(String(brief.caption.subtitle || '').slice(0, CAPTION_LIMITS.subtitle));
      setBadge(String(brief.caption.badge || '').slice(0, CAPTION_LIMITS.badge));
      setAiPrompt(String(brief.visualPrompt || ''));
      setInfoMsg('Caption dan deskripsi foto diambil dari hasil AI Orchestrator campaign ini.');
    } else {
      setTitle((campaign?.businessData?.name || '').slice(0, CAPTION_LIMITS.title));
      const city = campaign?.businessData?.targetCities?.[0];
      setSubtitle([category, city].filter(Boolean).join(' - ').slice(0, CAPTION_LIMITS.subtitle));
      setBadge('');
      setAiPrompt('');
      setInfoMsg('');
    }
    setResult(null);
    setApplied(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id, campaign?.imageBrief]);

  const handleUpload = async (file: File) => {
    setErrorMsg('');
    setInfoMsg('');
    if (!category) {
      setErrorMsg('Campaign ini belum punya kategori bisnis. Isi dulu di Profil Bisnis.');
      return;
    }
    setIsUploading(true);
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Gagal membaca file.'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/image/base-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, imageBase64 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload gagal.');

      await loadBasePhotos();
      setResult(null);
      setInfoMsg(`Foto dasar untuk "${category}" tersimpan (${data.width}x${data.height}).`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Upload gagal.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFetchCaption = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setIsFetchingCaption(true);
    try {
      const res = await fetch('/api/gemini/image-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessData: campaign.businessData,
          seoStrategy: campaign.seoStrategy,
          generatedContent: campaign.generatedContent,
          audit: campaign.validationScore
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengambil caption dari AI.');

      const caption = data.caption;
      if (!caption) throw new Error('Agent tidak mengembalikan caption.');

      setTitle(String(caption.title || '').slice(0, CAPTION_LIMITS.title));
      setSubtitle(String(caption.subtitle || '').slice(0, CAPTION_LIMITS.subtitle));
      setBadge(String(caption.badge || '').slice(0, CAPTION_LIMITS.badge));
      // The brief's visual prompt is exactly what the AI base-photo generator needs,
      // so hand it over instead of making the user rewrite it.
      if (typeof data.visualPrompt === 'string' && data.visualPrompt.trim()) {
        setAiPrompt(prev => prev || data.visualPrompt.trim());
      }
      setInfoMsg(`Caption diambil dari Image Brief Agent (${data._meta?.modelUsed || 'model tidak tercatat'}).`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengambil caption dari AI.');
    } finally {
      setIsFetchingCaption(false);
    }
  };

  const handleGenerateBasePhoto = async () => {
    setErrorMsg('');
    setInfoMsg('');
    if (!category) {
      setErrorMsg('Campaign ini belum punya kategori bisnis. Isi dulu di Profil Bisnis.');
      return;
    }
    if (aiPrompt.trim().length < 15) {
      setErrorMsg('Tulis deskripsi gambar yang lebih jelas (minimal 15 karakter), atau ambil dari AI di langkah 2 dulu.');
      return;
    }
    const prompt = aiPrompt.trim();
    startJob<{ message: string }>(
      { id: genJobId, tab: 'visual-asset', campaignId: campaign.id, label: 'Foto dasar AI', subject: category },
      async (update, signal) => {
        update({ detail: 'Menggambar foto dasar...' });
        const res = await fetch('/api/image/generate-base-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, prompt }),
          signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Generate gambar gagal.');
        const providerLabel = data.provider === 'cloudflare' ? 'Cloudflare Workers AI' : data.provider === 'huggingface' ? 'Hugging Face' : data.provider;
        const message = `Foto dasar untuk "${category}" dibuat oleh ${providerLabel} (${data.width}x${data.height}, ${((data.durationMs || 0) / 1000).toFixed(1)} dtk).`;
        update({ detail: message });
        return { message };
      }
    );
  };

  const handleCompose = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setApplied(false);
    if (!activeBasePhoto) {
      setErrorMsg('Belum ada foto dasar untuk kategori ini. Upload dulu di atas.');
      return;
    }
    if (!title.trim()) {
      setErrorMsg('Judul caption wajib diisi.');
      return;
    }
    setIsComposing(true);
    try {
      const res = await fetch('/api/image/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          basePath: activeBasePhoto.basePath,
          title: title.trim(),
          subtitle: subtitle.trim(),
          badge: badge.trim() || undefined,
          outputFormat: 'webp'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Render gagal.');
      setResult(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Render gagal.');
    } finally {
      setIsComposing(false);
    }
  };

  const handleApply = () => {
    if (!result) return;
    // The extension fetches this URL from inside the dongkrakusaha.com tab, so it must
    // be absolute. A relative path would resolve against dongkrakusaha.com and 404.
    const absoluteUrl = `${window.location.origin}${result.assetUrl}`;
    onUpdateCampaign({
      ...campaign,
      businessData: {
        ...campaign.businessData,
        images: [absoluteUrl, ...(campaign.businessData.images || []).filter(u => u !== absoluteUrl)]
      },
      dongkrakListingData: campaign.dongkrakListingData
        ? {
            ...campaign.dongkrakListingData,
            images: [absoluteUrl, ...(campaign.dongkrakListingData.images || []).filter(u => u !== absoluteUrl)]
          }
        : campaign.dongkrakListingData
    });
    setApplied(true);
    setInfoMsg('Gambar ini sekarang dipakai sebagai foto listing campaign.');
  };

  const counter = (value: string, max: number) => (
    <span className={`text-2xs font-medium ${value.length > max ? 'text-rose-600' : 'text-slate-400'}`}>
      {value.length}/{max}
    </span>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center text-white shrink-0">
          <ImageIcon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Visual Aset Listing</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Satu foto asli per kategori, dipakai ulang tiap listing dengan caption berbeda. Render lokal, tanpa kuota AI.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2.5 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
      {infoMsg && !errorMsg && (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-2.5 text-xs">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{infoMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Step 1: base photo */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800">1. Foto Dasar Kategori</h3>
            <span className="text-2xs font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200">
              {category || 'kategori belum diisi'}
            </span>
          </div>

          {activeBasePhoto ? (
            <div className="space-y-2.5">
              <img
                src={activeBasePhoto.basePath}
                alt={`Foto dasar ${category}`}
                className="w-full rounded-lg border border-slate-200 object-cover max-h-64"
              />
              <p className="text-2xs text-slate-500">
                {(activeBasePhoto.bytes / 1024).toFixed(0)} KB &middot; diperbarui{' '}
                {new Date(activeBasePhoto.updatedAt).toLocaleString('id-ID')}
              </p>
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-200 rounded-lg py-8 text-center">
              <ImageIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Belum ada foto dasar untuk kategori ini.</p>
              <p className="text-2xs text-slate-400 mt-1">Pakai foto produk asli agar listing lebih dipercaya.</p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isGenerating}
              className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg px-3 py-2.5 transition-colors"
            >
              {isUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {activeBasePhoto ? 'Ganti Foto' : 'Upload Foto'}
            </button>
            <button
              onClick={() => setShowAiPrompt(v => !v)}
              disabled={isUploading || isGenerating}
              className={`flex items-center justify-center gap-2 text-xs font-semibold rounded-lg px-3 py-2.5 border transition-colors ${
                showAiPrompt
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
              } disabled:opacity-50`}
            >
              <Sparkles className="w-4 h-4" />
              Buat dengan AI
            </button>
          </div>

          {showAiPrompt && (
            <div className="mt-3 space-y-2 p-3 bg-violet-50/60 border border-violet-200 rounded-lg">
              <label className="block text-2xs font-semibold text-slate-600 uppercase tracking-wide">
                Deskripsi gambar yang diinginkan
              </label>
              <textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                rows={3}
                placeholder="Contoh: foto produk kursi kayu jati minimalis di ruang tamu terang, gaya katalog. Atau klik 'Ambil dari AI' di langkah 2 agar terisi otomatis."
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
              />
              <p className="text-2xs text-slate-500 leading-relaxed">
                Ini hanya foto dasarnya. Teks caption tetap ditempel lokal di langkah 3, jadi tulis deskripsi
                <strong> tanpa</strong> teks/tulisan di dalam gambar. Foto asli produk tetap lebih dipercaya pembeli.
              </p>
              <button
                onClick={handleGenerateBasePhoto}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg px-3 py-2 transition-colors"
              >
                {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {isGenerating ? 'Membuat gambar...' : 'Generate Foto Dasar'}
              </button>
            </div>
          )}
        </div>

        {/* Step 2: caption */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800">2. Caption Listing</h3>
            <button
              onClick={handleFetchCaption}
              disabled={isFetchingCaption}
              className="flex items-center gap-1.5 text-2xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 border border-violet-200 rounded-md px-2 py-1 transition-colors"
            >
              {isFetchingCaption ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Ambil dari AI
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-2xs font-semibold text-slate-600 uppercase tracking-wide">Judul</label>
                {counter(title, CAPTION_LIMITS.title)}
              </div>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Custom Furniture Kayu Jati"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-2xs font-semibold text-slate-600 uppercase tracking-wide">Subjudul</label>
                {counter(subtitle, CAPTION_LIMITS.subtitle)}
              </div>
              <input
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
                placeholder="Jasa Custom & Rakit di Bandung"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-2xs font-semibold text-slate-600 uppercase tracking-wide">
                  Badge Promo <span className="normal-case font-normal text-slate-400">(opsional)</span>
                </label>
                {counter(badge, CAPTION_LIMITS.badge)}
              </div>
              <input
                value={badge}
                onChange={e => setBadge(e.target.value)}
                placeholder="GRATIS KONSUL"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          <button
            onClick={handleCompose}
            disabled={isComposing || !activeBasePhoto}
            className="mt-4 w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-lg px-3 py-2.5 transition-colors"
          >
            {isComposing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            Render Gambar Listing
          </button>
        </div>
      </div>

      {/* Step 3: result */}
      {result && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800">3. Hasil</h3>
            <span className="text-2xs text-slate-500">
              {result.width}x{result.height} &middot; {result.format.toUpperCase()} &middot;{' '}
              {(result.bytes / 1024).toFixed(0)} KB &middot; {result.durationMs}ms
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <img
              src={result.assetUrl}
              alt="Hasil render listing"
              className="md:col-span-2 w-full rounded-lg border border-slate-200"
            />
            <div className="space-y-2.5">
              <button
                onClick={handleApply}
                disabled={applied}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-xs font-semibold rounded-lg px-3 py-2.5 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                {applied ? 'Sudah Dipakai' : 'Gunakan untuk Campaign Ini'}
              </button>
              <p className="text-2xs text-slate-500 leading-relaxed">
                Gambar ini akan jadi foto yang diunggah otomatis ke DongkrakUsaha saat publish.
                File disimpan lokal di aplikasi ini, jadi aplikasi harus tetap berjalan saat publish.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
