import React, { useState } from 'react';
import { 
  Sparkles, 
  FileText, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  ShieldCheck, 
  Plus, 
  Trash2 
} from 'lucide-react';
import { Campaign, GeneratedContent } from '../types';

interface ContentGeneratorProps {
  campaign: Campaign;
  onUpdateCampaign: (campaign: Campaign) => void;
  onNavigateQC: () => void;
}

export const ContentGenerator: React.FC<ContentGeneratorProps> = ({
  campaign,
  onUpdateCampaign,
  onNavigateQC
}) => {
  const [content, setContent] = useState<GeneratedContent>({
    seoTitle: campaign.generatedContent?.seoTitle || campaign.businessData.name,
    metaDescription: campaign.generatedContent?.metaDescription || campaign.businessData.description,
    seoDescription: campaign.generatedContent?.seoDescription || campaign.businessData.description,
    shortSnippet: campaign.generatedContent?.shortSnippet || '',
    productHighlights: campaign.generatedContent?.productHighlights || [],
    callToAction: campaign.generatedContent?.callToAction || '',
    mappedCategory: campaign.generatedContent?.mappedCategory || campaign.businessData.category,
    tags: campaign.generatedContent?.tags || campaign.businessData.tags
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [newHighlight, setNewHighlight] = useState('');

  const handleGenerateAiContent = async () => {
    setIsGenerating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const response = await fetch('/api/gemini/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessData: campaign.businessData,
          seoStrategy: campaign.seoStrategy
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Gagal menghasilkan AI SEO Content');
      }

      const generated: GeneratedContent = await response.json();
      setContent(generated);
      setSuccessMsg('AI SEO Content berhasil dibuat dan disesuaikan dengan struktur DongkrakUsaha!');

      // Save to campaign
      saveToCampaign(generated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menghubungi server Gemini AI.');
    } finally {
      setIsGenerating(false);
    }
  };

  const saveToCampaign = (updatedContent: GeneratedContent) => {
    const updated: Campaign = {
      ...campaign,
      status: campaign.status === 'Draft' ? 'SEO Ready' : campaign.status,
      generatedContent: updatedContent,
      dongkrakListingData: {
        kategori: updatedContent.mappedCategory || campaign.businessData.category,
        penawaran: updatedContent.shortSnippet || '',
        namaProduk: updatedContent.seoTitle || campaign.businessData.name,
        harga: campaign.businessData.priceRange.replace(/\D/g, '') || '0', // Ensure no dots/commas
        hargaSebelumDiskon: '',
        deskripsi: updatedContent.seoDescription,
        metaKeyword: [...(updatedContent.tags || []), campaign.seoStrategy.mainKeyword, ...(campaign.seoStrategy.secondaryKeywords || [])].join(', ').substring(0, 155),
        metaDeskripsi: (updatedContent.metaDescription || '').substring(0, 165),
        noWhatsApp: campaign.businessData.phoneWhatsApp.replace(/\D/g, ''),
        textWhatsApp: `Halo, saya ingin bertanya tentang ${campaign.businessData.name}`,
        linkBukalapak: '',
        linkTokopedia: '',
        linkShopee: '',
        images: campaign.businessData.images
      },
      updatedAt: new Date().toISOString()
    };

    onUpdateCampaign(updated);
  };

  const handleManualSave = () => {
    saveToCampaign(content);
    setSuccessMsg('Perubahan konten berhasil disimpan!');
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const addHighlight = () => {
    if (newHighlight.trim()) {
      setContent(prev => ({
        ...prev,
        productHighlights: [...prev.productHighlights, newHighlight.trim()]
      }));
      setNewHighlight('');
    }
  };

  const removeHighlight = (idx: number) => {
    setContent(prev => ({
      ...prev,
      productHighlights: prev.productHighlights.filter((_, i) => i !== idx)
    }));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            AI SEO Content Engine
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Penulis konten otomatis berlandaskan fakta bisnis tanpa keyword stuffing & disesuaikan untuk DongkrakUsaha.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateAiContent}
            disabled={isGenerating}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 shadow-xs transition-all disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Generating SEO Copy...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate AI Content
              </>
            )}
          </button>
          <button
            onClick={handleManualSave}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-900 transition-colors"
          >
            <Save className="w-4 h-4" />
            Simpan Konten
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

      {/* Editor Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Body */}
        <div className="lg:col-span-2 space-y-5">
          {/* SEO Title */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-semibold text-slate-800">
                SEO Title Listing DongkrakUsaha
              </label>
              <span className={`text-3xs font-medium ${content.seoTitle.length > 65 ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                {content.seoTitle.length} / 65 Karakter
              </span>
            </div>
            <input
              type="text"
              value={content.seoTitle}
              onChange={(e) => setContent(prev => ({ ...prev, seoTitle: e.target.value }))}
              className="w-full text-xs font-bold text-slate-900 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Meta Description */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-semibold text-slate-800">
                Meta Description (Search Snippet)
              </label>
              <span className={`text-3xs font-medium ${content.metaDescription.length > 160 ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
                {content.metaDescription.length} / 160 Karakter
              </span>
            </div>
            <textarea
              rows={3}
              value={content.metaDescription}
              onChange={(e) => setContent(prev => ({ ...prev, metaDescription: e.target.value }))}
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Main SEO Content Body */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <label className="block text-xs font-semibold text-slate-800">
              Deskripsi Lengkap Listing & SEO Content Body
            </label>
            <textarea
              rows={12}
              value={content.seoDescription}
              onChange={(e) => setContent(prev => ({ ...prev, seoDescription: e.target.value }))}
              className="w-full text-xs border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none leading-relaxed"
            />
          </div>
        </div>

        {/* Sidebar Attributes */}
        <div className="space-y-5">
          {/* Product Highlights */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2">
              Keunggulan Layanan / Highlights
            </h3>

            <div className="flex gap-2">
              <input
                type="text"
                value={newHighlight}
                onChange={(e) => setNewHighlight(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addHighlight())}
                className="flex-1 text-xs border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Tambah keunggulan..."
              />
              <button
                onClick={addHighlight}
                className="px-2.5 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-900"
              >
                +
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {content.productHighlights.map((hl, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-2xs">
                  <span className="text-slate-700 font-medium">{hl}</span>
                  <button onClick={() => removeHighlight(idx)} className="text-slate-400 hover:text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Call To Action */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <label className="block text-xs font-semibold text-slate-800">
              Call to Action (CTA)
            </label>
            <textarea
              rows={3}
              value={content.callToAction}
              onChange={(e) => setContent(prev => ({ ...prev, callToAction: e.target.value }))}
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* DongkrakUsaha Category Mapping */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <label className="block text-xs font-semibold text-slate-800">
              Pemetaan Kategori DongkrakUsaha
            </label>
            <input
              type="text"
              value={content.mappedCategory}
              onChange={(e) => setContent(prev => ({ ...prev, mappedCategory: e.target.value }))}
              className="w-full text-xs font-medium border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center pt-2">
        <span className="text-2xs text-slate-400">
          *Konten yang dibuat akan diaudit oleh AI Quality Control sebelum dikirim.
        </span>
        <button
          onClick={onNavigateQC}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold text-xs rounded-xl hover:bg-blue-700 shadow-xs transition-colors"
        >
          <span>Jalankan AI Quality Control Audit</span>
          <ShieldCheck className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
