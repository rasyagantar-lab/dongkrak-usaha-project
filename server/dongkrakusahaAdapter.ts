import fs from 'fs';
import path from 'path';
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
const HISTORY_FILE = path.join(process.cwd(), 'data', 'publish-history.json');

function loadHistoryFromDisk(): PublishRecord[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[History] Could not read stored history, starting empty:', err);
    return [];
  }
}

let publishRecordsStore: PublishRecord[] = loadHistoryFromDisk();

function persistHistory() {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(publishRecordsStore, null, 2));
  } catch (err) {
    console.error('[History] Failed to persist history:', err);
  }
}

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

