import { 
  Campaign, 
  DongkrakUsahaListingData, 
  DongkrakUsahaConnectionConfig, 
  PublishRecord 
} from '../src/types';

export interface PublishResult {
  success: boolean;
  externalListingId?: string;
  publishedUrl?: string;
  errorMessage?: string;
  timestamp: string;
  modeUsed: 'Browser Manual Assist' | 'Export Mode';
  accountUsed?: string;
}

export interface DongkrakUsahaPublisher {
  connect(config: DongkrakUsahaConnectionConfig): Promise<DongkrakUsahaConnectionConfig>;
  validateConnection(): Promise<DongkrakUsahaConnectionConfig>;
  markPublished(campaign: Campaign, publishedUrl: string): Promise<PublishResult>;
}

// Global server memory store for published records & connection configuration
let currentConnectionConfig: DongkrakUsahaConnectionConfig = {
  status: 'Not Connected',
  mode: 'Browser Manual Assist',
  authMethod: 'Browser Session',
  lastTested: new Date().toISOString()
};

const publishRecordsStore: PublishRecord[] = [];

export class OfficialDongkrakUsahaAdapter implements DongkrakUsahaPublisher {

  public static getStoreConfig(): DongkrakUsahaConnectionConfig {
    return currentConnectionConfig;
  }

  public static setStoreConfig(config: DongkrakUsahaConnectionConfig): DongkrakUsahaConnectionConfig {
    currentConnectionConfig = { ...config, lastTested: new Date().toISOString() };
    return currentConnectionConfig;
  }

  public static getHistory(): PublishRecord[] {
    return publishRecordsStore;
  }

  public static addHistoryRecord(record: PublishRecord) {
    publishRecordsStore.unshift(record);
  }

  async connect(config: DongkrakUsahaConnectionConfig): Promise<DongkrakUsahaConnectionConfig> {
    currentConnectionConfig = {
      ...config,
      lastTested: new Date().toISOString()
    };
    return currentConnectionConfig;
  }

  async validateConnection(): Promise<DongkrakUsahaConnectionConfig> {
    return currentConnectionConfig;
  }

  async markPublished(campaign: Campaign, publishedUrl: string): Promise<PublishResult> {
    const extIdMatch = publishedUrl.match(/-([A-Za-z0-9]+)$/);
    const extId = extIdMatch ? extIdMatch[1] : `DU-${Math.floor(100000 + Math.random() * 900000)}`;

    return {
      success: true,
      externalListingId: extId,
      publishedUrl: publishedUrl,
      timestamp: new Date().toISOString(),
      modeUsed: 'Browser Manual Assist',
      accountUsed: 'Browser Session User'
    };
  }
}

