export type CampaignStatus = 
  | 'Draft' 
  | 'SEO Ready' 
  | 'Ready to Publish' 
  | 'Publishing' 
  | 'Published' 
  | 'Publishing Failed';

export interface BusinessData {
  id: string;
  name: string;
  category: string;
  description: string;
  productsServices: string[];
  mainKeyword: string;
  secondaryKeywords: string[];
  targetCities: string[];
  address: string;
  phoneWhatsApp: string;
  website: string;
  socialMedia: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
  };
  priceRange: string;
  images: string[];
  businessHours: string;
  tags: string[];
}

export interface SEOStrategy {
  mainKeyword: string;
  secondaryKeywords: string[];
  lsiKeywords: string[];
  searchIntent: 'Informational' | 'Transactional' | 'Commercial' | 'Local Intent';
  targetCities: string[];
  contentAngle: string;
}

export interface GeneratedContent {
  seoTitle: string;
  metaDescription: string;
  seoDescription: string;
  shortSnippet: string;
  productHighlights: string[];
  callToAction: string;
  mappedCategory: string;
  tags: string[];
}

export interface SEOValidationScore {
  seoScore: number;
  contentQuality: number;
  localRelevance: number;
  publishingReadiness: 'READY' | 'WARNINGS' | 'BLOCKED';
  findings: {
    type: 'pass' | 'warning' | 'error';
    category: 'Keywords' | 'Location' | 'Factual Consistency' | 'Duplicate Content' | 'Required Fields';
    message: string;
  }[];
}

export interface DongkrakUsahaListingData {
  kategori: string;
  penawaran: string;
  namaProduk: string;
  harga: string;
  hargaSebelumDiskon: string;
  deskripsi: string;
  metaKeyword: string;
  metaDeskripsi: string;
  noWhatsApp: string;
  textWhatsApp: string;
  linkBukalapak: string;
  linkTokopedia: string;
  linkShopee: string;
  images: string[];
}

export interface DongkrakUsahaConnectionConfig {
  status: 'Not Connected' | 'Connected' | 'Connection Error' | 'Session Expired';
  mode: 'Browser Manual Assist' | 'Export Mode';
  authMethod: 'Browser Session';
  lastTested?: string;
  errorMessage?: string;
}

export interface PublishRecord {
  id: string;
  campaignId: string;
  businessName: string;
  campaignTitle: string;
  platform: 'DongkrakUsaha' | 'Website' | 'Other';
  publishedAt: string;
  status: CampaignStatus;
  externalListingId?: string;
  publishedUrl?: string;
  lastUpdated: string;
  errorMessage?: string;
  accountUsed?: string;
}

export interface Campaign {
  id: string;
  title: string;
  businessData: BusinessData;
  seoStrategy: SEOStrategy;
  generatedContent: GeneratedContent;
  validationScore?: SEOValidationScore;
  dongkrakListingData?: DongkrakUsahaListingData;
  status: CampaignStatus;
  externalListingId?: string;
  publishedUrl?: string;
  updatedAt: string;
}

export interface BulkQueueItem {
  campaignId: string;
  campaignTitle: string;
  businessName: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  errorMessage?: string;
  publishedUrl?: string;
  externalListingId?: string;
}
