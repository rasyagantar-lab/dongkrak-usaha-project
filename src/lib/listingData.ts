import type { Campaign, DongkrakUsahaListingData } from '../types';

/*
  The DongkrakUsaha listing is a VIEW of the campaign, never a second copy of it.

  Four places show or send the listing -- the Preview tab, "Terapkan ke Campaign" in
  the orchestrator, the Data Bisnis save, and the extension autofill -- and until
  2026-09-18 each built its own object, or none at all. The orchestrator's apply
  never rebuilt it, so the Preview and the autofill kept showing the description
  from before the run while the Konten node showed the new article. This builder
  is the only place the mapping lives; everything else calls it.

  Fields the operator edits by hand on the listing (marketplace links, the WhatsApp
  opener, the strike-through price) are carried over from the previous listing, so
  a rebuild after a new run never erases them.
*/

const digits = (s: string | undefined) => String(s || '').replace(/\D/g, '');

/** Limits of the real DongkrakUsaha inputs (measured 2026-09-18: every meta input
    declares maxlength 165; the app has always capped the keyword line at 155). */
export const LISTING_LIMITS = { metaDeskripsi: 165, metaKeyword: 155 };

export function buildListingData(campaign: Campaign, previous?: Partial<DongkrakUsahaListingData> | null): DongkrakUsahaListingData {
  const b = campaign.businessData;
  const c = campaign.generatedContent;
  const s = campaign.seoStrategy;
  const keywords = [...(c?.tags || []), s?.mainKeyword, ...(s?.secondaryKeywords || [])]
    .map(k => String(k || '').trim())
    .filter(Boolean);
  return {
    namaProduk: c?.seoTitle || b.name,
    kategori: b.category,
    deskripsi: c?.seoDescription || b.description,
    penawaran: c?.shortSnippet || '',
    noWhatsApp: digits(b.phoneWhatsApp),
    harga: digits(b.priceRange) || '0',
    hargaSebelumDiskon: previous?.hargaSebelumDiskon || '0',
    images: b.images || [],
    metaKeyword: [...new Set(keywords)].join(', ').substring(0, LISTING_LIMITS.metaKeyword),
    metaDeskripsi: (c?.metaDescription || b.description || '').substring(0, LISTING_LIMITS.metaDeskripsi),
    textWhatsApp: previous?.textWhatsApp || `Halo, saya ingin bertanya tentang ${b.name}`,
    linkBukalapak: previous?.linkBukalapak || '',
    linkTokopedia: previous?.linkTokopedia || '',
    linkShopee: previous?.linkShopee || ''
  };
}
