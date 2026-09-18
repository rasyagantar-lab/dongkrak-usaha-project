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
import { JobTray } from './components/JobTray';
import { BottomNav } from './components/BottomNav';
import { JobCenterProvider } from './jobs';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GuideCompanion } from './guide/GuideCompanion';
import { PersonaRail } from './theme/persona/PersonaRail';
import { ScreenTitle } from './theme/persona/ScreenTitle';
import { ResultBanner } from './theme/persona/ResultBanner';
import { INITIAL_CAMPAIGNS } from './data/sampleBusinesses';
import { Campaign, DongkrakUsahaConnectionConfig } from './types';

// Every tab stays mounted; the inactive ones are display:none via [hidden]. Work in
// progress (an orchestrator run, a realisation batch, the extension handshake in the
// publishing hub) therefore keeps going when the user looks at another tab, and
// their form inputs are still there when they come back. The settle-in animation
// restarts each time a section goes from hidden to shown, so tab switches still feel
// like a transition without any remount.
const TAB_LABELS: Record<string, string> = {
  business: 'Data Bisnis', 'market-siege': 'Kepung Pasar', orchestrator: 'AI Orchestrator',
  'visual-asset': 'Visual Aset', 'dongkrak-preview': 'Preview', 'publishing-hub': 'Publish',
  'connection-settings': 'Koneksi', history: 'Riwayat'
};

const TAB_NUM: Record<string, number> = { business: 1, 'market-siege': 2, orchestrator: 3, 'visual-asset': 4, 'dongkrak-preview': 5, 'publishing-hub': 6 };

const TabPanel: React.FC<{ id: string; active: string; children: React.ReactNode }> = ({ id, active, children }) => (
  <section hidden={active !== id} className="animate-du-panel-in motion-reduce:animate-none">
    {/* Persona theme only: the P5 screen word; renders nothing in the standard theme. */}
    <ScreenTitle num={TAB_NUM[id]} label={TAB_LABELS[id] || id} />
    {/* Per-tab boundary: a render error in one panel must not white-screen the whole
        app while a pipeline is running in another. */}
    <ErrorBoundary label={TAB_LABELS[id] || id}>{children}</ErrorBoundary>
  </section>
);

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('business');
  // Riwayat re-fetches on every visit (it has no in-progress work to protect).
  const [historyVisits, setHistoryVisits] = useState(0);
  const goToTab = (tab: string) => {
    if (tab === 'history') setHistoryVisits(n => n + 1);
    setActiveTab(tab);
  };
  const handleNavigateFromTray = (tab: string, campaignId?: string) => {
    if (campaignId) setActiveCampaignId(campaignId);
    goToTab(tab);
  };
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
    <JobCenterProvider>
    {/* Outermost net, deliberately inside the Job Center: a crash in the shell (header,
        tray, nav) used to unmount everything and leave a white page with no way back
        except reloading. Retrying from here re-mounts the UI while running jobs, which
        live in the provider above, keep going. */}
    <ErrorBoundary label="Aplikasi">
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans" style={{ paddingBottom: 'var(--du-bottom-nav)' }}>
      <WelcomeSplash />

      <Header
        setActiveTab={goToTab}
        campaigns={campaigns}
        activeCampaignId={activeCampaignId}
        setActiveCampaignId={setActiveCampaignId}
        connectionConfig={connectionConfig}
      />

      {/* Each per-campaign panel is keyed on the active campaign: they seed local state
          from the campaign prop once on mount, and without the key switching campaigns in
          the header dropdown left the old campaign's data on screen. The tab itself is no
          longer part of the key -- see TabPanel. Long-running work is held by the Job
          Center, so a campaign switch mid-run loses nothing either. */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <TabPanel id="orchestrator" active={activeTab}>
          <OrchestratorPanel
            key={`orch:${activeCampaign?.id || ''}`}
            campaign={activeCampaign}
            onUpdateCampaign={handleUpdateCampaign}
          />
        </TabPanel>

        <TabPanel id="business" active={activeTab}>
          <div className="max-w-5xl mx-auto mb-6">
            <GettingStartedGuide onGoTo={goToTab} />
          </div>
          <BusinessManager
            key={`biz:${activeCampaign?.id || ''}`}
            campaign={activeCampaign}
            onUpdateCampaign={handleUpdateCampaign}
            onAddNewCampaign={handleAddNewCampaign}
            onDeleteCampaign={handleDeleteCampaign}
          />
        </TabPanel>

        <TabPanel id="market-siege" active={activeTab}>
          <MarketSiegePanel
            campaigns={campaigns}
            onReloadCampaigns={handleReloadCampaigns}
            onUpdateCampaign={handleUpdateCampaign}
          />
        </TabPanel>

        <TabPanel id="visual-asset" active={activeTab}>
          <VisualAssetStudio
            key={`visual:${activeCampaign?.id || ''}`}
            campaign={activeCampaign}
            onUpdateCampaign={handleUpdateCampaign}
          />
        </TabPanel>

        <TabPanel id="dongkrak-preview" active={activeTab}>
          <DongkrakUsahaPreview
            key={`preview:${activeCampaign?.id || ''}`}
            campaign={activeCampaign}
            onUpdateCampaign={handleUpdateCampaign}
            onNavigatePublishing={() => goToTab('publishing-hub')}
          />
        </TabPanel>

        <TabPanel id="publishing-hub" active={activeTab}>
          <PublishingHub
            campaigns={campaigns}
            activeCampaign={activeCampaign}
            connectionConfig={connectionConfig}
            onUpdateCampaign={handleUpdateCampaign}
            onNavigateSettings={() => goToTab('connection-settings')}
            onNavigateHistory={() => goToTab('history')}
            pendingAutopostCampaignRef={pendingAutopostCampaignRef}
          />
        </TabPanel>

        <TabPanel id="connection-settings" active={activeTab}>
          <ConnectionSettings
            connectionConfig={connectionConfig}
            onUpdateConnection={handleUpdateConnection}
            onReloadCampaigns={handleReloadCampaigns}
          />
        </TabPanel>

        <TabPanel id="history" active={activeTab}>
          <PublishingHistory key={`history:${historyVisits}`} />
        </TabPanel>
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-400">
        DongkrakUsaha AI Marketing Suite • Dibuat oleh Muhamad Rasya Ramadhan (PKL SMK Yadika 5) • Pembimbing: Aceng Komarudin
      </footer>
      
      <ModelStatusIndicator />
      <JobTray onNavigate={handleNavigateFromTray} />
      <BottomNav activeTab={activeTab} setActiveTab={goToTab} />
      <PersonaRail activeTab={activeTab} setActiveTab={goToTab} />
      <GuideCompanion />
      <ResultBanner />
    </div>
    </ErrorBoundary>
    </JobCenterProvider>
  );
}
