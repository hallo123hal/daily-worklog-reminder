import { storage } from '@forge/api';

const CONFIG_KEYS = {
  SENDGRID_API_KEY: 'sendgrid_api_key',
  APP_CONFIG: 'app_config'
};

export interface AppConfig {
  thresholdHours: number;
  scanTime: string;
  excludedUsers: string[];
  emailRecipients: string[];
  enabled: boolean;
  lastExecution?: {
    date: string;
    usersFound: number;
    status: 'success' | 'error';
    errorMessage?: string;
  };
}

// Store SendGrid API key
export async function setSendGridApiKey(apiKey: string): Promise<void> {
  await storage.set(CONFIG_KEYS.SENDGRID_API_KEY, apiKey);
}

// Get SendGrid API key
export async function getSendGridApiKey(): Promise<string | null> {
  return await storage.get(CONFIG_KEYS.SENDGRID_API_KEY);
}

// Store app configuration
export async function saveAppConfig(config: AppConfig): Promise<void> {
  await storage.set(CONFIG_KEYS.APP_CONFIG, config);
}

// Get app configuration
export async function getAppConfig(): Promise<AppConfig | null> {
  return await storage.get(CONFIG_KEYS.APP_CONFIG);
}

// Get default configuration
export function getDefaultConfig(): AppConfig {
  return {
    thresholdHours: 5,
    scanTime: '17:30',
    excludedUsers: [],
    emailRecipients: [],
    enabled: true
  };
}