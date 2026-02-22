import Resolver from '@forge/resolver';
import { setSendGridApiKey, getSendGridApiKey, saveAppConfig, getAppConfig, getDefaultConfig } from '../services/configService';

const resolver = new Resolver();

// Set SendGrid API key
resolver.define('setSendGridApiKey', async (req) => {
  const { apiKey } = req.payload;
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('API key is required');
  }
  await setSendGridApiKey(apiKey);
  return { success: true };
});

// Get SendGrid API key (masked for security)
resolver.define('getSendGridApiKey', async () => {
  const apiKey = await getSendGridApiKey();
  if (!apiKey) {
    return { apiKey: null };
  }
  // Return masked version for display (show only last 4 characters)
  const masked = apiKey.length > 4 
    ? `****${apiKey.slice(-4)}` 
    : '****';
  return { apiKey: masked };
});

// Save app configuration
resolver.define('saveConfig', async (req) => {
  const config = req.payload;
  await saveAppConfig(config);
  return { success: true };
});

// Get app configuration
resolver.define('getConfig', async () => {
  const config = await getAppConfig();
  return config || getDefaultConfig();
});

export const handler = resolver.getDefinitions();