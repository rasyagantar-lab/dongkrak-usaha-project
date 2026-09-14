import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { BusinessManager } from './components/BusinessManager';
// ContentGenerator and QualityControlAudit are no longer mounted: their work moved
// into the orchestrator pipeline. The files are kept for now rather than deleted, so
// the old single-agent prompts stay recoverable if a manual rerun is ever wanted.
import { DongkrakUsahaPreview } from './components/DongkrakUsahaPreview';
import { PublishingHub } from './components/PublishingHub';
import { ConnectionSettings } from './components/ConnectionSettings';
import { PublishingHistory } from './components/PublishingHistory';
import { ModelStatusIndicator } from './components/ModelStatusIndicator';
import { OrchestratorPanel } from './components/OrchestratorPanel';
import { VisualAssetStudio } from './components/VisualAssetStudio';
import { MarketSiegePanel } from './components/MarketSiegePanel';
import { WelcomeSplash } from './components/WelcomeSplash';
import { GettingStartedGuide } from './components/GettingStartedGuide';
import { INITIAL_CAMPAIGNS } from './data/sampleBusinesses';
import { Campaign, DongkrakUsahaConnectionConfig } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('business');
  const [campaigns, setCampaigns] = useState<Campaign[]>(INITIAL_CAMPAIGNS);
  const [activeCampaignId, setActiveCampaignId] = useState<string>(INITIAL_CAMPAIGNS[0].id);

  const [connectionConfig, setConnectionConfig] = useState<DongkrakUsahaConnectionConfig>({
    status: 'Not Connected',
    mode: 'Browser Manual Assist',
    authMethod: 'Browser Session'
  });

  // Load server state on mount
  useEffect(() => {
    const fetchServerState = async () => {
      try {
        const [campRes, connRes] = await Promise.all([
          fetch('/api/campaigns'),
          fetch('/api/dongkrakusaha/connection')
        ]);

        if (campRes.ok) {
          const loadedCampaigns: Campaign[] = await campRes.json();
          if (Array.isArray(loadedCampaigns) && loadedCampaigns.length > 0) {
            setCampaigns(loadedCampaigns);
            setActiveCampaignId(loadedCampaigns[0].id);
          }
        }

        if (connRes.ok) {
          const loadedConn: DongkrakUsahaConnectionConfig = await connRes.json();
          setConnectionConfig(loadedConn);
        }
      } catch (err) {
        console.warn('Initial server state load fallback to default local state:', err);
      }
    };

    fetchServerState();
  }, []);

  const activeCampaign = campaigns.find(c => c.id === activeCampaignId) || campaigns[0];

  // Tracks which campaign is awaiting an autopost submit result. Lives at the App
  // root (never unmounts while the SPA is open) so switching tabs right after
  // clicking Submit can't cause the DONGKRAK_SUBMIT_RESULT response to be missed --
  // it previously lived inside PublishingHub, which unmounts on tab navigation.
  //
  // NOTE: this used to also auto-detect a "public listing URL" from a later
  // STATE_UPDATED broadcast and call mark-published automatically. That was removed
  // (see PROJECT_KNOWLEDGE.md "Share web" / platform constraint finding, 2026-09-13):
  // DongkrakUsaha does not navigate to a public listing URL after submit at all --
  // it returns to the admin product list, and the real public URL is only obtainable
  // ~24h later through a separate platform-gated action. So there is no such
  // broadcast to detect. Submit success is now recorded immediately as 'Submitted'
  // (real, proven evidence: dispatch + image upload succeeded), and the real public
  // URL is added later via the existing manual "Tandai Selesai" flow once available.
  const pendingAutopostCampaignRef = useRef<string | null>(null);

  useEffect(() => {
    const handleGlobalExtensionMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'DONGKRAK_SUBMIT_RESULT') return;
      const campaignId = pendingAutopostCampaignRef.current;
      if (!campaignId) return;

      const payload = event.data.payload || {};
      pendingAutopostCampaignRef.current = null;
      if (!payload.success || !payload.dispatched) return;

      fetch('/api/dongkrakusaha/mark-submitted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId })
      }).then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.errorMessage || 'Gagal mencatat submit');
        setCampaigns(prev => prev.map(c => c.id === data.campaign.id ? data.campaign : c));
      }).catch((error: any) => {
        console.warn('Submit bookkeeping failed:', error.message);
      });
    };

    window.addEventListener('message', handleGlobalExtensionMessage);
    return () => window.removeEventListener('message', handleGlobalExtensionMessage);
  }, []);

  // Re-pull the full campaign list from the server. Used after server-side bulk
  // operations (market-siege drafting) that create records the client never built.
  const handleReloadCampaigns = async () => {
    try {
      const res = await fetch('/api/campaigns');
      if (!res.ok) return;
      const loaded: Campaign[] = await res.json();
      if (Array.isArray(loaded) && loaded.length > 0) {
        setCampaigns(loaded);
        setActiveCampaignId(prev => (loaded.some(c => c.id === prev) ? prev : loaded[0].id));
      }
    } catch (err) {
      console.warn('Failed to reload campaigns from server:', err);
    }
  };

  const handleDeleteCampaign = async (target: Campaign) => {
    const label = target.siegeTargetArea ? `${target.businessData.name} — ${target.siegeTargetArea}` : target.businessData.name;
    if (!window.confirm(`Hapus campaign "${label}"? Tidak bisa dibatalkan.`)) return;
    try {
      const res = await fetch(`/api/campaigns/${target.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { window.alert(data.error || 'Gagal menghapus.'); return; }
      await handleReloadCampaigns();
    } catch (err: any) {
      window.alert(err?.message || 'Gagal menghapus.');
    }
  };

  // Sync campaign updates to backend
  const handleUpdateCampaign = async (updatedCampaign: Campaign) => {
    setCampaigns(prev => prev.map(c => c.id === updatedCampaign.id ? updatedCampaign : c));

    try {
      await fetch(`/api/campaigns/${updatedCampaign.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedCampaign)
      });
    } catch (err) {
      console.warn('Failed to sync campaign update to server:', err);
    }
  };

  const handleAddNewCampaign = async () => {
    const newId = `cmp-${Date.now()}`;
    const newCampaign: Campaign = {
      id: newId,
      title: 'Promosi Bisnis Baru',
      status: 'Draft',
      updatedAt: new Date().toISOString(),
      businessData: {
        id: `biz-${Date.now()}`,
        name: 'Nama Usaha Baru',
        category: 'Jasa & Perdagangan',
        description: 'Tuliskan deskripsi bisnis Anda secara lengkap...',
        productsServices: ['Layanan Utama 1', 'Layanan Utama 2'],
        mainKeyword: 'layanan terdekat jakarta',
        secondaryKeywords: ['jasa murah berkualitas'],
        targetCities: ['Jakarta', 'Tangerang'],
        address: 'Jl. Utama No. 1, Jakarta',
        phoneWhatsApp: '628120000000',
        website: 'https://bisnisbaru.com',
        socialMedia: {
          instagram: '@bisnisbaru'
        },
        priceRange: 'Rp 100.000 - Rp 1.000.000',
        images: ['https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=800&q=80'],
        businessHours: 'Senin - Sabtu: 09:00 - 17:00 WIB',
        tags: ['Bisnis', 'Jasa', 'Jakarta']
      },
      seoStrategy: {
        mainKeyword: 'layanan terdekat jakarta',
        secondaryKeywords: ['jasa murah berkualitas'],
        lsiKeywords: ['pelayanan terpercaya', 'harga bersahabat'],
        searchIntent: 'Local Intent',
        targetCities: ['Jakarta', 'Tangerang'],
        contentAngle: 'Spesialis Jasa Terpercaya Berpengalaman'
      },
      generatedContent: {
        seoTitle: 'Bisnis Baru - Jasa Terpercaya & Bergaransi di Jakarta',
        metaDescription: 'Layanan jasa terpercaya di Jakarta dengan pengerjaan cepat dan garansi.',
        seoDescription: 'Informasi lengkap mengenai layanan usaha kami di wilayah Jakarta dan sekitarnya.',
        shortSnippet: 'Layanan usaha profesional di Jakarta.',
        productHighlights: ['Garansi Pengerjaan', 'Harga Terjangkau'],
        callToAction: 'Hubungi via WhatsApp sekarang untuk penawaran terbaik!',
        mappedCategory: 'Jasa & Perdagangan',
        tags: ['Bisnis', 'Jasa']
      }
    };

    setCampaigns(prev => [newCampaign, ...prev]);
    setActiveCampaignId(newId);
    setActiveTab('business');

    try {
      await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCampaign)
      });
    } catch (err) {
      console.warn('Failed to save new campaign to server:', err);
    }
  };

  const handleUpdateConnection = (config: DongkrakUsahaConnectionConfig) => {
    setConnectionConfig(config);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans">
      <WelcomeSplash />

      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        campaigns={campaigns}
        activeCampaignId={activeCampaignId}
        setActiveCampaignId={setActiveCampaignId}
        connectionConfig={connectionConfig}
      />

      {/* Keyed on BOTH the tab and the active campaign. Every per-campaign panel seeds
          local state from the campaign prop once on mount (form fields, orchestrator
          results, caption drafts); without the campaign id in the key, switching
          campaigns in the header dropdown left the old campaign's data on screen --
          and "Terapkan ke Campaign" could write campaign A's results into campaign B.
          Remounting also re-triggers the short settle-in animation. */}
      <main key={`${activeTab}:${activeCampaign?.id || ''}`} className="flex-1 p-4 sm:p-6 lg:p-8 animate-du-panel-in motion-reduce:animate-none">
        {activeTab === 'orchestrator' && (
          <OrchestratorPanel
            campaign={activeCampaign}
            onUpdateCampaign={handleUpdateCampaign}
          />
        )}

        {activeTab === 'business' && (
          <div className="max-w-5xl mx-auto mb-6">
            <GettingStartedGuide onGoTo={setActiveTab} />
          </div>
        )}
        {activeTab === 'business' && (
          <BusinessManager
            campaign={activeCampaign}
            onUpdateCampaign={handleUpdateCampaign}
            onAddNewCampaign={handleAddNewCampaign}
            onDeleteCampaign={handleDeleteCampaign}
          />
        )}

        {activeTab === 'market-siege' && (
          <MarketSiegePanel
            campaigns={campaigns}
            onReloadCampaigns={handleReloadCampaigns}
            onUpdateCampaign={handleUpdateCampaign}
          />
        )}

        {activeTab === 'visual-asset' && (
          <VisualAssetStudio
            campaign={activeCampaign}
            onUpdateCampaign={handleUpdateCampaign}
          />
        )}

        {activeTab === 'dongkrak-preview' && (
          <DongkrakUsahaPreview
            campaign={activeCampaign}
            onUpdateCampaign={handleUpdateCampaign}
            onNavigatePublishing={() => setActiveTab('publishing-hub')}
          />
        )}

        {activeTab === 'publishing-hub' && (
          <PublishingHub
            campaigns={campaigns}
            activeCampaign={activeCampaign}
            connectionConfig={connectionConfig}
            onUpdateCampaign={handleUpdateCampaign}
            onNavigateSettings={() => setActiveTab('connection-settings')}
            onNavigateHistory={() => setActiveTab('history')}
            pendingAutopostCampaignRef={pendingAutopostCampaignRef}
          />
        )}

        {activeTab === 'connection-settings' && (
          <ConnectionSettings
            connectionConfig={connectionConfig}
            onUpdateConnection={handleUpdateConnection}
          />
        )}

        {activeTab === 'history' && (
          <PublishingHistory />
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-400">
        DongkrakUsaha AI Marketing Suite & Direct Publishing Adapter • Powered by Google Gemini AI
      </footer>
      
      <ModelStatusIndicator />
    </div>
  );
}
