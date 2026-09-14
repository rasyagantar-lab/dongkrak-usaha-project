import React, { useState } from 'react';
import { 
  Building2, 
  MapPin, 
  Phone, 
  Globe, 
  Tag, 
  Clock, 
  DollarSign, 
  Plus, 
  Trash2, 
  Save, 
  CheckCircle2, 
  Instagram, 
  Facebook 
} from 'lucide-react';
import { Campaign, BusinessData } from '../types';

interface BusinessManagerProps {
  campaign: Campaign;
  onUpdateCampaign: (campaign: Campaign) => void;
  onAddNewCampaign: () => void;
  onDeleteCampaign?: (campaign: Campaign) => Promise<void> | void;
}

export const BusinessManager: React.FC<BusinessManagerProps> = ({
  campaign,
  onUpdateCampaign,
  onAddNewCampaign,
  onDeleteCampaign
}) => {
  const [formData, setFormData] = useState<BusinessData>({ ...campaign.businessData });
  const [newProduct, setNewProduct] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newImage, setNewImage] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleInputChange = (field: keyof BusinessData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSocialChange = (key: 'instagram' | 'facebook' | 'tiktok', value: string) => {
    setFormData(prev => ({
      ...prev,
      socialMedia: { ...prev.socialMedia, [key]: value }
    }));
  };

  const addProduct = () => {
    if (newProduct.trim()) {
      setFormData(prev => ({
        ...prev,
        productsServices: [...prev.productsServices, newProduct.trim()]
      }));
      setNewProduct('');
    }
  };

  const removeProduct = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      productsServices: prev.productsServices.filter((_, i) => i !== idx)
    }));
  };

  const addCity = () => {
    if (newCity.trim()) {
      setFormData(prev => ({
        ...prev,
        targetCities: [...prev.targetCities, newCity.trim()]
      }));
      setNewCity('');
    }
  };

  const removeCity = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      targetCities: prev.targetCities.filter((_, i) => i !== idx)
    }));
  };

  const addImage = () => {
    if (newImage.trim()) {
      setFormData(prev => ({
        ...prev,
        images: [...prev.images, newImage.trim()]
      }));
      setNewImage('');
    }
  };

  const removeImage = (idx: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== idx)
    }));
  };

  const handleSave = () => {
    const updatedCampaign: Campaign = {
      ...campaign,
      title: `Promosi ${formData.name}`,
      businessData: { ...formData },
      dongkrakListingData: {
        ...(campaign.dongkrakListingData || {
          businessName: formData.name,
          category: formData.category,
          description: formData.description,
          productsServices: formData.productsServices,
          mainKeyword: formData.mainKeyword,
          secondaryKeywords: formData.secondaryKeywords,
          targetCities: formData.targetCities,
          address: formData.address,
          whatsAppPhone: formData.phoneWhatsApp,
          website: formData.website,
          socialMediaInstagram: formData.socialMedia?.instagram || '',
          socialMediaFacebook: formData.socialMedia?.facebook || '',
          price: formData.priceRange,
          images: formData.images,
          businessHours: formData.businessHours,
          tags: formData.tags,
          seoTitle: campaign.generatedContent?.seoTitle || formData.name,
          metaDescription: campaign.generatedContent?.metaDescription || formData.description,
          seoContent: campaign.generatedContent?.seoDescription || formData.description
        }),
        businessName: formData.name,
        category: formData.category,
        description: formData.description,
        productsServices: formData.productsServices,
        address: formData.address,
        whatsAppPhone: formData.phoneWhatsApp,
        website: formData.website,
        price: formData.priceRange,
        images: formData.images,
        businessHours: formData.businessHours
      },
      updatedAt: new Date().toISOString()
    };

    onUpdateCampaign(updatedCampaign);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header Info Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            Manajemen Profil & Data Bisnis
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Data bisnis ini menjadi fondasi utama untuk AI SEO Strategy, AI Content Writer, dan Listing DongkrakUsaha.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onDeleteCampaign && (
            <button
              onClick={() => onDeleteCampaign(campaign)}
              disabled={campaign.status !== 'Draft'}
              title={campaign.status === 'Draft'
                ? 'Hapus campaign ini'
                : `Hanya campaign berstatus Draft yang bisa dihapus (ini ${campaign.status}) -- sudah ada listing/riwayat di baliknya`}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-medium rounded-lg hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Hapus
            </button>
          )}
          <button
            onClick={onAddNewCampaign}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-200 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Tambah Bisnis Baru
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 shadow-xs transition-colors"
          >
            <Save className="w-4 h-4" />
            Simpan Data Bisnis
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Data bisnis berhasil diperbarui dan disinkronkan ke seluruh modul AI.
        </div>
      )}

      {/* Main Form Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Information */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
            Informasi Dasar Bisnis
          </h3>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Bisnis <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Contoh: Bengkel Jaya Motor Bandung"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Kategori Bisnis <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => handleInputChange('category', e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Contoh: Otomotif & Bengkel"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Deskripsi Singkat Bisnis
            </label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Tuliskan deskripsi bisnis Anda secara jelas dan jujur..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Kisaran Harga Produk / Layanan
            </label>
            <div className="relative">
              <DollarSign className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={formData.priceRange}
                onChange={(e) => handleInputChange('priceRange', e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg pl-8 p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Contoh: Rp 150.000 - Rp 2.500.000"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Jam Operasional
            </label>
            <div className="relative">
              <Clock className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={formData.businessHours}
                onChange={(e) => handleInputChange('businessHours', e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg pl-8 p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Contoh: Senin - Sabtu: 08:00 - 17:00 WIB"
              />
            </div>
          </div>
        </div>

        {/* Contact & Location */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
            Kontak & Lokasi Bisnis
          </h3>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              WhatsApp / Nomor Telepon <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={formData.phoneWhatsApp}
                onChange={(e) => handleInputChange('phoneWhatsApp', e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg pl-8 p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Format: 628123456789"
              />
            </div>
            <p className="text-3xs text-slate-400 mt-1">
              Digunakan untuk tombol langsung kirim pesan WhatsApp pada listing DongkrakUsaha.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Alamat Lengkap Usaha
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg pl-8 p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Alamat fisik toko, kantor, atau bengkel..."
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Website Resmi
            </label>
            <div className="relative">
              <Globe className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={formData.website}
                onChange={(e) => handleInputChange('website', e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg pl-8 p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="https://namabisnis.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Instagram
              </label>
              <div className="relative">
                <Instagram className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={formData.socialMedia?.instagram || ''}
                  onChange={(e) => handleSocialChange('instagram', e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg pl-8 p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="@username"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Facebook Page
              </label>
              <div className="relative">
                <Facebook className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={formData.socialMedia?.facebook || ''}
                  onChange={(e) => handleSocialChange('facebook', e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg pl-8 p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Nama Halaman FB"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Products & Target Cities Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Products & Services */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
            Produk & Layanan Utama
          </h3>

          <div className="flex gap-2">
            <input
              type="text"
              value={newProduct}
              onChange={(e) => setNewProduct(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addProduct())}
              className="flex-1 text-xs border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Tambah item layanan / produk..."
            />
            <button
              onClick={addProduct}
              className="px-3 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-900"
            >
              Tambah
            </button>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {formData.productsServices.map((prod, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <span className="text-slate-700 font-medium">{prod}</span>
                <button
                  onClick={() => removeProduct(idx)}
                  className="text-slate-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Target Cities */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
            Kota & Area Target Pemasaran
          </h3>

          <div className="flex gap-2">
            <input
              type="text"
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCity())}
              className="flex-1 text-xs border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Tambah nama kota target..."
            />
            <button
              onClick={addCity}
              className="px-3 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-900"
            >
              Tambah
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {formData.targetCities.map((city, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-medium">
                <MapPin className="w-3 h-3 text-blue-500" />
                {city}
                <button onClick={() => removeCity(idx)} className="hover:text-red-600">
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Image Gallery URLs */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">
          Galeri Foto Usaha (Image URLs)
        </h3>

        <div className="flex gap-2">
          <input
            type="text"
            value={newImage}
            onChange={(e) => setNewImage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addImage())}
            className="flex-1 text-xs border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="Masukkan URL Gambar (https://...)"
          />
          <button
            onClick={addImage}
            className="px-3 py-2 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-900"
          >
            Tambah Gambar
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {formData.images.map((imgUrl, idx) => (
            <div key={idx} className="relative group rounded-lg overflow-hidden border border-slate-200 bg-slate-100 aspect-video">
              <img src={imgUrl} alt={`Gallery ${idx}`} className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(idx)}
                className="absolute top-1.5 right-1.5 bg-red-600 text-white p-1 rounded-md opacity-90 hover:opacity-100 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
