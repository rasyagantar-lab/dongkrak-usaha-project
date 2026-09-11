import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Eye, 
  ArrowRight 
} from 'lucide-react';
import { Campaign, SEOValidationScore } from '../types';

interface QualityControlAuditProps {
  campaign: Campaign;
  onUpdateCampaign: (campaign: Campaign) => void;
  onNavigatePreview: () => void;
}

export const QualityControlAudit: React.FC<QualityControlAuditProps> = ({
  campaign,
  onUpdateCampaign,
  onNavigatePreview
}) => {
  const [scoreData, setScoreData] = useState<SEOValidationScore | undefined>(campaign.validationScore);
  const [isAuditing, setIsAuditing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRunAudit = async () => {
    setIsAuditing(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/gemini/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Gagal menjalankan Quality Control Audit');
      }

      const result: SEOValidationScore = await response.json();
      setScoreData(result);

      // Save to campaign
      onUpdateCampaign({
        ...campaign,
        validationScore: result,
        status: result.publishingReadiness === 'READY' 
          ? (campaign.status === 'Draft' || campaign.status === 'SEO Ready' ? 'Ready to Publish' : campaign.status)
          : campaign.status,
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menghubungi server AI Audit.');
    } finally {
      setIsAuditing(false);
    }
  };

  const getReadinessBadge = (readiness: string) => {
    switch (readiness) {
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            READY TO PUBLISH
          </span>
        );
      case 'WARNINGS':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            REQUIRES REVIEW
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="w-4 h-4 text-rose-600" />
            BLOCKED (INCOMPLETE)
          </span>
        );
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            AI Quality Control & Audit Engine
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Verifikasi kelayakan SEO, relevansi lokal, deteksi keyword stuffing, dan kelengkapan field sebelum dikirim ke DongkrakUsaha.
          </p>
        </div>
        <div>
          <button
            onClick={handleRunAudit}
            disabled={isAuditing}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 shadow-xs transition-colors disabled:opacity-50"
          >
            {isAuditing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Auditing Content...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Jalankan Audit AI
              </>
            )}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs font-medium">
          {errorMsg}
        </div>
      )}

      {/* Score Cards Grid */}
      {scoreData ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs text-center space-y-1">
            <span className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">SEO Score</span>
            <div className="text-3xl font-extrabold text-blue-600">{scoreData.seoScore}</div>
            <span className="text-3xs text-slate-500">Kerapian & Kepadatan Keyword</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs text-center space-y-1">
            <span className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">Content Quality</span>
            <div className="text-3xl font-extrabold text-indigo-600">{scoreData.contentQuality}</div>
            <span className="text-3xs text-slate-500">Persuasif & Bebas Klaim Palsu</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs text-center space-y-1">
            <span className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">Local Relevance</span>
            <div className="text-3xl font-extrabold text-emerald-600">{scoreData.localRelevance}</div>
            <span className="text-3xs text-slate-500">Cakupan Kota Target</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col items-center justify-center space-y-2">
            <span className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">Publishing Readiness</span>
            {getReadinessBadge(scoreData.publishingReadiness)}
          </div>
        </div>
      ) : (
        <div className="p-8 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center space-y-3">
          <ShieldCheck className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-xs font-bold text-slate-700">Audit Belum Dijalankan</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Klik tombol &quot;Jalankan Audit AI&quot; di atas untuk mengevaluasi kelayakan listing dan mendapatkan nilai SEO Score.
          </p>
        </div>
      )}

      {/* Audit Findings List */}
      {scoreData?.findings && scoreData.findings.length > 0 && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-xs font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center justify-between">
            <span>Detail Temuan Audit AI</span>
            <span className="text-2xs font-medium text-slate-500">
              {scoreData.findings.length} Item Diperiksa
            </span>
          </h3>

          <div className="space-y-2.5">
            {scoreData.findings.map((item, idx) => {
              let icon = <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
              let bg = 'bg-emerald-50/50 border-emerald-100 text-emerald-900';

              if (item.type === 'warning') {
                icon = <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />;
                bg = 'bg-amber-50/50 border-amber-100 text-amber-900';
              } else if (item.type === 'error') {
                icon = <XCircle className="w-4 h-4 text-rose-600 shrink-0" />;
                bg = 'bg-rose-50/50 border-rose-100 text-rose-900';
              }

              return (
                <div key={idx} className={`p-3 rounded-lg border flex items-start gap-3 ${bg}`}>
                  {icon}
                  <div className="flex-1 text-xs">
                    <span className="font-bold mr-2 uppercase text-3xs tracking-wider opacity-75">
                      [{item.category}]
                    </span>
                    <span className="font-medium">{item.message}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex justify-between items-center pt-2">
        <button
          onClick={handleRunAudit}
          className="text-xs text-blue-600 font-semibold hover:underline"
        >
          Re-run Audit
        </button>

        <button
          onClick={onNavigatePreview}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold text-xs rounded-xl hover:bg-blue-700 shadow-xs transition-colors"
        >
          <span>Lihat Preview DongkrakUsaha</span>
          <Eye className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
