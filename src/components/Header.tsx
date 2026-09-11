import React from 'react';
import { 
  Building2, 
  Search, 
  Sparkles, 
  ShieldCheck, 
  Eye, 
  Send, 
  Settings, 
  History, 
  Globe, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle 
} from 'lucide-react';
import { Campaign, DongkrakUsahaConnectionConfig } from '../types';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  campaigns: Campaign[];
  activeCampaignId: string;
  setActiveCampaignId: (id: string) => void;
  connectionConfig: DongkrakUsahaConnectionConfig;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  campaigns,
  activeCampaignId,
  setActiveCampaignId,
  connectionConfig
}) => {
  const activeCampaign = campaigns.find(c => c.id === activeCampaignId);

  const getStatusBadge = () => {
    if (connectionConfig.status === 'Connected') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Browser Assist Aktif
        </span>
      );
    }
    if (connectionConfig.status === 'Connection Error') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          Koneksi Error
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
        <XCircle className="w-3.5 h-3.5 text-slate-400" />
        Belum Konfigurasi
      </span>
    );
  };

  const navItems = [
    { id: 'business', label: 'Profil Bisnis', icon: Building2 },
    { id: 'seo-research', label: 'SEO & Keyword', icon: Search },
    { id: 'content-writer', label: 'AI Content', icon: Sparkles },
    { id: 'qc-audit', label: 'AI QC Audit', icon: ShieldCheck },
    { id: 'dongkrak-preview', label: 'DongkrakUsaha Preview', icon: Eye },
    { id: 'publishing-hub', label: 'Publish Distribution', icon: Send },
    { id: 'connection-settings', label: 'Connection', icon: Settings },
    { id: 'history', label: 'Riwayat Publish', icon: History }
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-xs">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                DongkrakUsaha AI Marketing Suite
              </h1>
              <span className="bg-blue-50 text-blue-700 text-2xs font-semibold px-2 py-0.5 rounded-md border border-blue-200">
                v2.4 Pro
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Otomatisasi Local SEO, AI Quality Control & Direct Publishing DongkrakUsaha
            </p>
          </div>
        </div>

        {/* Campaign Selector & Connection Status */}
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
            <span className="text-xs text-slate-500 font-medium pl-1 hidden sm:inline">Campaign:</span>
            <select
              value={activeCampaignId}
              onChange={(e) => setActiveCampaignId(e.target.value)}
              className="bg-white text-xs text-slate-800 font-semibold border border-slate-200 rounded-md px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {campaigns.map((cmp) => (
                <option key={cmp.id} value={cmp.id}>
                  {cmp.businessData.name} ({cmp.status})
                </option>
              ))}
            </select>
          </div>

          <button 
            onClick={() => setActiveTab('connection-settings')} 
            className="cursor-pointer transition-transform active:scale-95"
          >
            {getStatusBadge()}
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex space-x-1 sm:space-x-3 overflow-x-auto no-scrollbar py-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
