import React, { useState, useEffect } from 'react';
import {
  History,
  ExternalLink,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Globe,
  Clock,
  Send
} from 'lucide-react';
import { PublishRecord } from '../types';

export const PublishingHistory: React.FC = () => {
  const [historyRecords, setHistoryRecords] = useState<PublishRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/dongkrakusaha/history');
      if (response.ok) {
        const data = await response.json();
        setHistoryRecords(data);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSaveUrl = async (record: PublishRecord) => {
    const url = (urlDrafts[record.id] || '').trim();
    if (!url.startsWith('http')) {
      setSaveErrors(prev => ({ ...prev, [record.id]: 'URL harus diawali dengan http:// atau https://' }));
      return;
    }

    setSavingId(record.id);
    setSaveErrors(prev => ({ ...prev, [record.id]: '' }));

    try {
      const response = await fetch('/api/dongkrakusaha/mark-published', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: record.campaignId, publishedUrl: url, historyRecordId: record.id })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.errorMessage || 'Gagal menyimpan URL publish.');
      }
      setUrlDrafts(prev => ({ ...prev, [record.id]: '' }));
      await fetchHistory();
    } catch (err: any) {
      setSaveErrors(prev => ({ ...prev, [record.id]: err.message || 'Gagal menyimpan URL publish.' }));
    } finally {
      setSavingId(null);
    }
  };

  const filteredRecords = historyRecords.filter(r => 
    r.businessName.toLowerCase().includes(searchFilter.toLowerCase()) ||
    r.campaignTitle.toLowerCase().includes(searchFilter.toLowerCase()) ||
    (r.externalListingId && r.externalListingId.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="du-card bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            Riwayat Publishing & Catatan Status
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Daftar riwayat aktivitas publishing ke platform DongkrakUsaha lengkap dengan External Listing ID & URL.
          </p>
        </div>

        <button
          onClick={fetchHistory}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Search Bar */}
      <div className="du-card bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="flex-1 text-xs border-none focus:outline-none placeholder-slate-400"
          placeholder="Cari berdasarkan nama bisnis, judul campaign, atau External Listing ID..."
        />
      </div>

      {/* History Records Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            <span>Memuat catatan riwayat...</span>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <Globe className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-600">Belum Ada Catatan Publishing</p>
            <p className="text-3xs">Gunakan modul Publishing Distribution untuk mengirim campaign pertama Anda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="p-3.5">Nama Bisnis & Campaign</th>
                  <th className="p-3.5">Akun Publisher</th>
                  <th className="p-3.5">Platform</th>
                  <th className="p-3.5">Tanggal</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">External Listing ID</th>
                  <th className="p-3.5">Link / Diagnostic Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((record) => {
                  const isSuccess = record.status === 'Published';
                  const isPending = record.status === 'Submitted';
                  return (
                    <tr key={record.id} className="hover:bg-slate-50/50">
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900">{record.businessName}</div>
                        <div className="text-3xs text-slate-500">{record.campaignTitle}</div>
                      </td>
                      <td className="p-3.5 text-slate-700 font-medium text-xs">
                        {record.accountUsed || 'Account Session'}
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 bg-red-50 text-red-700 text-3xs font-bold rounded border border-red-200">
                          {record.platform}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-600 font-mono text-3xs">
                        {new Date(record.publishedAt).toLocaleString('id-ID')}
                      </td>
                      <td className="p-3.5">
                        {isSuccess ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-3xs font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Published
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-3xs font-bold bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3 text-amber-600" />
                            Submitted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-3xs font-bold bg-rose-100 text-rose-800">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-xs font-semibold text-slate-700">
                        {record.externalListingId || '-'}
                      </td>
                      <td className="p-3.5 max-w-xs">
                        {isSuccess && record.publishedUrl ? (
                          <a
                            href={record.publishedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 font-bold hover:underline"
                          >
                            <span>Lihat Listing</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : isPending ? (
                          <div className="space-y-1.5 min-w-[220px]">
                            <p className="text-3xs text-amber-700 font-medium">
                              URL publik baru tersedia ~24 jam setelah submit. Isi di sini begitu sudah ada:
                            </p>
                            <div className="flex gap-1.5">
                              <input
                                type="url"
                                value={urlDrafts[record.id] || ''}
                                onChange={(e) => setUrlDrafts(prev => ({ ...prev, [record.id]: e.target.value }))}
                                placeholder="https://dongkrakusaha.com/iklan/..."
                                className="flex-1 text-3xs border border-slate-300 rounded p-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                              />
                              <button
                                onClick={() => handleSaveUrl(record)}
                                disabled={savingId === record.id || !(urlDrafts[record.id] || '').trim()}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-3xs font-bold rounded disabled:opacity-50 cursor-pointer shrink-0"
                              >
                                {savingId === record.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                Simpan
                              </button>
                            </div>
                            {saveErrors[record.id] && (
                              <p className="text-3xs text-rose-600 font-medium">{saveErrors[record.id]}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-3xs text-rose-600 font-medium line-clamp-2">
                            {record.errorMessage || 'No error details recorded.'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
