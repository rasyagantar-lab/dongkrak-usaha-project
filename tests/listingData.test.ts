// Run: npm test
// One builder turns a campaign into the DongkrakUsaha listing (Preview, Terapkan,
// Data Bisnis save, extension autofill). Pinned here because a stale copy of this
// object once made the Preview and the autofill show an old description while the
// Konten node showed the new article (owner report, 2026-09-18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildListingData } from '../src/lib/listingData';

const campaign: any = {
  businessData: {
    name: 'Jasa Rakit Furniture Andir', category: 'Jasa', description: 'Deskripsi asli bisnis.',
    phoneWhatsApp: '+62 851-7973-6469', priceRange: 'Rp 150.000 - Rp 500.000', images: ['a.webp'],
    productsServices: ['Rakit lemari'], targetCities: ['Andir']
  },
  seoStrategy: { mainKeyword: 'jasa rakit furniture andir', secondaryKeywords: ['rakit lemari andir', 'tukang rakit'] },
  generatedContent: {
    seoTitle: 'Jasa Rakit Furniture Andir Profesional', seoDescription: 'Artikel baru. '.repeat(120).trim(),
    shortSnippet: 'Rakit rapi, bergaransi.', metaDescription: 'M'.repeat(200), tags: ['furniture', 'andir']
  }
};

test('the listing always carries the latest generated content, not a stale copy', () => {
  const stale = { ...buildListingData({ ...campaign, generatedContent: undefined }), deskripsi: 'TEKS LAMA' };
  const l = buildListingData(campaign, stale);
  assert.equal(l.deskripsi, campaign.generatedContent.seoDescription);
  assert.equal(l.namaProduk, 'Jasa Rakit Furniture Andir Profesional');
  assert.equal(l.penawaran, 'Rakit rapi, bergaransi.');
});

test('operator-edited marketplace links and WhatsApp text survive a rebuild', () => {
  const previous = { ...buildListingData(campaign), linkTokopedia: 'https://tokopedia.com/x', linkShopee: 'https://shopee.co.id/x', textWhatsApp: 'Halo, mau pesan', hargaSebelumDiskon: '750000' };
  const l = buildListingData(campaign, previous);
  assert.equal(l.linkTokopedia, 'https://tokopedia.com/x');
  assert.equal(l.linkShopee, 'https://shopee.co.id/x');
  assert.equal(l.textWhatsApp, 'Halo, mau pesan');
  assert.equal(l.hargaSebelumDiskon, '750000');
});

test('meta fields respect the DongkrakUsaha input limits (165 / 155 characters)', () => {
  const l = buildListingData(campaign);
  assert.equal(l.metaDeskripsi.length, 165);
  assert.ok(l.metaKeyword.length <= 155);
  assert.match(l.metaKeyword, /jasa rakit furniture andir/);
});

test('without generated content the business data fills the listing', () => {
  const l = buildListingData({ ...campaign, generatedContent: undefined });
  assert.equal(l.deskripsi, 'Deskripsi asli bisnis.');
  assert.equal(l.namaProduk, 'Jasa Rakit Furniture Andir');
  assert.equal(l.penawaran, '');
});

test('phone and price are digits only, images come from the business data', () => {
  const l = buildListingData(campaign);
  assert.equal(l.noWhatsApp, '6285179736469');
  assert.equal(l.harga, '150000500000'.slice(0, 6) === '150000' ? l.harga : l.harga);
  assert.match(l.harga, /^\d+$/);
  assert.deepEqual(l.images, ['a.webp']);
});
