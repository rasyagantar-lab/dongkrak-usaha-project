import * as storage from './storage';
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

// Publish history used to live only in RAM, so every server restart silently wiped
// it back to empty. Restarts are routine during development, so real records were
// being destroyed by ordinary work. History is now persisted to disk.
const HISTORY_KEY = 'data/publish-history.json';

// Storage-backed (local disk by default, GCS when GCS_BUCKET is set). Loaded once at
// boot via loadHistory(); every mutation writes through.
let publishRecordsStore: PublishRecord[] = [];

function persistHistory() {
  const snapshot = JSON.stringify(publishRecordsStore, null, 2);
  storage.writeText(HISTORY_KEY, snapshot).catch(err => console.error('[History] Failed to persist history:', err));
}

export class OfficialDongkrakUsahaAdapter implements DongkrakUsahaPublisher {

  public static getStoreConfig(): DongkrakUsahaConnectionConfig {
    return currentConnectionConfig;
  }

  public static setStoreConfig(config: DongkrakUsahaConnectionConfig): DongkrakUsahaConnectionConfig {
    currentConnectionConfig = { ...config, lastTested: new Date().toISOString() };
    return currentConnectionConfig;
  }

  public static async loadHistory(): Promise<void> {
    try {
      const text = await storage.readText(HISTORY_KEY);
      const parsed = text === null ? [] : JSON.parse(text);
      publishRecordsStore = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('[History] Could not read stored history, starting empty:', err);
      publishRecordsStore = [];
    }
  }

  public static getHistory(): PublishRecord[] {
    return publishRecordsStore;
  }

  public static addHistoryRecord(record: PublishRecord) {
    publishRecordsStore.unshift(record);
    persistHistory();
  }

  public static updateHistoryRecord(id: string, patch: Partial<PublishRecord>): PublishRecord | null {
    const index = publishRecordsStore.findIndex(r => r.id === id);
    if (index === -1) return null;
    publishRecordsStore[index] = {
      ...publishRecordsStore[index],
      ...patch,
      lastUpdated: new Date().toISOString()
    };
    persistHistory();
    return publishRecordsStore[index];
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

