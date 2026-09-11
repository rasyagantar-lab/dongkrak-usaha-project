import React, { useState } from 'react';
import { 
  Search, 
  Sparkles, 
  Target, 
  MapPin, 
  FileText, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  Plus, 
  Trash2 
} from 'lucide-react';
import { Campaign, SEOStrategy } from '../types';

interface SeoResearchProps {
  campaign: Campaign;
  onUpdateCampaign: (campaign: Campaign) => void;
  onNavigateNext: () => void;
}

export const SeoResearch: React.FC<SeoResearchProps> = ({
  campaign,
  onUpdateCampaign,
  onNavigateNext
}) => {
  const [strategy, setStrategy] = useState<SEOStrategy>({ ...campaign.seoStrategy });
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [newSecKey, setNewSecKey] = useState('');
  const [newLsiKey, setNewLsiKey] = useState('');

  const handleRunAiResearch = async () => {
    setIsGenerating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const response = await fetch('/api/gemini/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: campaign.businessData.name,
          category: campaign.businessData.category,
          description: campaign.businessData.description,
          productsServices: campaign.businessData.productsServices,
          targetCities: campaign.businessData.targetCities
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Gagal menjalankan AI Keyword Research');
      }

      const data: SEOStrategy = await response.json();
      setStrategy(data);
      setSuccessMsg('AI Research berhasil menemukan keyword lokal & strategi relevan!');

      // Auto update campaign
      onUpdateCampaign({
        ...campaign,
        seoStrategy: data,
        businessData: {
          ...campaign.businessData,
          mainKeyword: data.mainKeyword,
          secondaryKeywords: data.secondaryKeywords
        },
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menghubungi server Gemini AI.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveStrategy = () => {
    onUpdateCampaign({
      ...campaign,
      seoStrategy: strategy,
      businessData: {
        ...campaign.businessData,
        mainKeyword: strategy.mainKeyword,
        secondaryKeywords: strategy.secondaryKeywords
      },
      updatedAt: new Date().toISOString()
    });
    setSuccessMsg('Strategi SEO berhasil disimpan!');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const addSecondaryKeyword = () => {
    if (newSecKey.trim()) {
      setStrategy(prev => ({
        ...prev,
        secondaryKeywords: [...prev.secondaryKeywords, newSecKey.trim()]
      }));
      setNewSecKey('');
    }
  };

  const removeSecondaryKeyword = (idx: number) => {
    setStrategy(prev => ({
      ...prev,
      secondaryKeywords: prev.secondaryKeywords.filter((_, i) => i !== idx)
    }));
  };

  const addLsiKeyword = () => {
    if (newLsiKey.trim()) {
      setStrategy(prev => ({
        ...prev,
        lsiKeywords: [...prev.lsiKeywords, newLsiKey.trim()]
      }));
      setNewLsiKey('');
    }
  };

  const removeLsiKeyword = (idx: number) => {
    setStrategy(prev => ({
      ...prev,
      lsiKeywords: prev.lsiKeywords.filter((_, i) => i !== idx)
    }));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-600" />
            SEO Research & Keyword Strategy Hub
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Gunakan AI Gemini untuk menemukan kata kunci lokal berdaya konversi tinggi tanpa keyword stuffing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunAiResearch}
            disabled={isGenerating}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 shadow-xs transition-all disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Menganalisis Keyword...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Jalankan AI Research
              </>
            )}
          </button>
          <button
            onClick={handleSaveStrategy}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-900 transition-colors"
          >
            <Save className="w-4 h-4" />
            Simpan
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs font-medium">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {/* Main Form Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Main Keyword & Search Intent */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
            Target Kata Kunci Utama
          </h3>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Main Keyword (Local Intent) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={strategy.mainKeyword}
              onChange={(e) => setStrategy(prev => ({ ...prev, mainKeyword: e.target.value }))}
              className="w-full text-xs font-semibold border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Contoh: bengkel mobil bandung terdekat"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Search Intent Classification
            </label>
            <select
              value={strategy.searchIntent}
              onChange={(e) => setStrategy(prev => ({ ...prev, searchIntent: e.target.value as any }))}
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="Local Intent">Local Intent (Pengguna Mencari Layanan Terdekat)</option>
              <option value="Transactional">Transactional (Siap Membeli / Memesan)</option>
              <option value="Commercial">Commercial (Membandingkan Harga & Pilihan)</option>
              <option value="Informational">Informational (Mencari Pengetahuan / Edukasi)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Sudut Pandang Konten (Content Angle)
            </label>
            <textarea
              rows={3}
              value={strategy.contentAngle}
              onChange={(e) => setStrategy(prev => ({ ...prev, contentAngle: e.target.value }))}
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Pendekatan narasi promosi yang relevan dengan target pasar..."
            />
          </div>
        </div>

        {/* Secondary Keywords */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
            Secondary Keywords
          </h3>

          <div className="flex gap-2">
            <input
              type="text"
              value={newSecKey}
              onChange={(e) => setNewSecKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSecondaryKeyword())}
              className="flex-1 text-xs border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Tambah keyword sekunder..."
            />
            <button
              onClick={addSecondaryKeyword}
              className="px-3 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-900"
            >
              Tambah
            </button>
          </div>

          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {strategy.secondaryKeywords.map((kw, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <span className="text-slate-700 font-medium">{kw}</span>
                <button onClick={() => removeSecondaryKeyword(idx)} className="text-slate-400 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* LSI & Semantic Keywords */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
          Kata Kunci Semantik & LSI (Latent Semantic Indexing)
        </h3>

        <div className="flex gap-2">
          <input
            type="text"
            value={newLsiKey}
            onChange={(e) => setNewLsiKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLsiKeyword())}
            className="flex-1 text-xs border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="Tambah LSI keyword (misal: bergaransi, harga terjangkau, mekanik senior)..."
          />
          <button
            onClick={addLsiKeyword}
            className="px-3 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-900"
          >
            Tambah LSI
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {strategy.lsiKeywords.map((lsi, idx) => (
            <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-medium">
              <Target className="w-3.5 h-3.5 text-indigo-500" />
              {lsi}
              <button onClick={() => removeLsiKeyword(idx)} className="hover:text-red-600 font-bold ml-1">
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Bottom CTA to Next Step */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onNavigateNext}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold text-xs rounded-xl hover:bg-blue-700 shadow-xs transition-colors"
        >
          <span>Lanjut ke AI Content Generator</span>
          <FileText className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
