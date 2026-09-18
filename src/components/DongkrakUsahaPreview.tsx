import { buildListingData } from '../lib/listingData';
import React from 'react';
import { Send, CheckCircle2 } from 'lucide-react';
import { Campaign, DongkrakUsahaListingData } from '../types';

interface DongkrakUsahaPreviewProps {
  campaign: Campaign;
  onUpdateCampaign: (campaign: Campaign) => void;
  onNavigatePublishing: () => void;
}

export const DongkrakUsahaPreview: React.FC<DongkrakUsahaPreviewProps> = ({
  campaign,
  onNavigatePublishing
}) => {
  // Always derived from the campaign's current content: a stored listing is only
  // consulted for the fields the operator typed by hand (links, WhatsApp opener).
  const listing: DongkrakUsahaListingData = buildListingData(campaign, campaign.dongkrakListingData);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="du-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold tracking-wider text-blue-600 uppercase bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
            DongkrakUsaha Form Preview
          </span>
          <h2 className="text-base font-bold text-slate-900 mt-2">
            Simulasi Form Input Produk
          </h2>
          <p className="text-xs text-slate-500 mt-1">Data di bawah ini akan disalin ke halaman Input Produk DongkrakUsaha.</p>
        </div>
        <button
          onClick={onNavigatePublishing}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
        >
          <Send className="w-4 h-4" />
          Lanjut ke Publishing
        </button>
      </div>

      <div className="du-card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 font-bold text-slate-700 flex items-center gap-2">
          PRODUK input
        </div>
        <div className="p-6 space-y-5 text-sm">
          
          <div>
            <label className="block font-semibold text-slate-700 mb-1 text-xs">Kategori</label>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600">{listing.kategori || '-'}</div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1 text-xs">Penawaran</label>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600">{listing.penawaran || '-'}</div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1 text-xs">Nama Produk Dongkrakusaha.com</label>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium">{listing.namaProduk}</div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1 text-xs">Upload File Gambar Produk (ukuran gambar jangan lebih dari 1 MB)</label>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-4">
              {listing.images && listing.images.length > 0 ? (
                <>
                  <img src={listing.images[0]} alt="Preview" className="w-24 h-24 object-cover rounded shadow-sm border border-slate-300" />
                  <div className="text-xs text-slate-500 flex flex-col gap-1">
                    <span className="font-semibold text-slate-700">Gambar Tersedia</span>
                    <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> Siap diunduh saat publishing</span>
                  </div>
                </>
              ) : (
                <div className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded border border-amber-200">
                  Belum ada gambar. Disarankan menambah gambar produk di form Business Information.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-xs">Harga (Jangan gunakan titik atau koma)</label>
              <div className="flex">
                <span className="bg-slate-100 border border-r-0 border-slate-200 px-3 py-2.5 rounded-l-lg text-slate-500 text-xs font-semibold">Rp</span>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-r-lg text-slate-900 w-full">{listing.harga}</div>
              </div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-xs">Harga Sebelum Diskon</label>
              <div className="flex">
                <span className="bg-slate-100 border border-r-0 border-slate-200 px-3 py-2.5 rounded-l-lg text-slate-500 text-xs font-semibold">Rp</span>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-r-lg text-slate-600 w-full">{listing.hargaSebelumDiskon || '0'}</div>
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1 text-xs">Deskripsi</label>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 whitespace-pre-wrap text-sm leading-relaxed max-h-64 overflow-y-auto">
              {listing.deskripsi}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1 text-xs flex justify-between">
              Meta Keyword 
              <span className={`text-xs ${listing.metaKeyword.length > 155 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                {listing.metaKeyword.length}/155 Karakter
              </span>
            </label>
            <div className={`p-2.5 bg-slate-50 border rounded-lg text-slate-600 ${listing.metaKeyword.length > 155 ? 'border-rose-300' : 'border-slate-200'}`}>
              {listing.metaKeyword || '-'}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1 text-xs flex justify-between">
              Meta Deskripsi Dongkrakusaha.com
              <span className={`text-xs ${listing.metaDeskripsi.length > 165 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                {listing.metaDeskripsi.length}/165 Karakter
              </span>
            </label>
            <div className={`p-2.5 bg-slate-50 border rounded-lg text-slate-600 ${listing.metaDeskripsi.length > 165 ? 'border-rose-300' : 'border-slate-200'}`}>
              {listing.metaDeskripsi || '-'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-xs">NO WhatsApp</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900">{listing.noWhatsApp || '-'}</div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-xs">Text WhatsApp</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 truncate">{listing.textWhatsApp || '-'}</div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-xs">Link Order Bukalapak</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 text-xs italic">{listing.linkBukalapak || 'Tidak diisi'}</div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-xs">Link Order Tokopedia</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 text-xs italic">{listing.linkTokopedia || 'Tidak diisi'}</div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-xs">Link Order Shopee</label>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 text-xs italic">{listing.linkShopee || 'Tidak diisi'}</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
