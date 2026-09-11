import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { BusinessManager } from './components/BusinessManager';
import { SeoResearch } from './components/SeoResearch';
import { ContentGenerator } from './components/ContentGenerator';
import { QualityControlAudit } from './components/QualityControlAudit';
import { DongkrakUsahaPreview } from './components/DongkrakUsahaPreview';
import { PublishingHub } from './components/PublishingHub';
import { ConnectionSettings } from './components/ConnectionSettings';
import { PublishingHistory } from './components/PublishingHistory';
import { ModelStatusIndicator } from './components/ModelStatusIndicator';
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
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        campaigns={campaigns}
        activeCampaignId={activeCampaignId}
        setActiveCampaignId={setActiveCampaignId}
        connectionConfig={connectionConfig}
      />

      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        {activeTab === 'business' && (
          <BusinessManager
            campaign={activeCampaign}
            onUpdateCampaign={handleUpdateCampaign}
            onAddNewCampaign={handleAddNewCampaign}
          />
        )}

        {activeTab === 'seo-research' && (
          <SeoResearch
            campaign={activeCampaign}
            onUpdateCampaign={handleUpdateCampaign}
            onNavigateNext={() => setActiveTab('content-writer')}
          />
        )}

        {activeTab === 'content-writer' && (
          <ContentGenerator
            campaign={activeCampaign}
            onUpdateCampaign={handleUpdateCampaign}
            onNavigateQC={() => setActiveTab('qc-audit')}
          />
        )}

        {activeTab === 'qc-audit' && (
          <QualityControlAudit
            campaign={activeCampaign}
            onUpdateCampaign={handleUpdateCampaign}
            onNavigatePreview={() => setActiveTab('dongkrak-preview')}
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
