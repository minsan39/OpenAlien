import Conf from 'conf';
import { Config, getProvider } from '../types';

const configStore = new Conf<Config>({
  projectName: 'openalien',
  configName: 'config',
  schema: {
    provider: {
      type: 'string',
      default: ''
    },
    apiKey: {
      type: 'string',
      default: ''
    },
    model: {
      type: 'string',
      default: ''
    },
    baseUrl: {
      type: 'string',
      default: ''
    }
  }
});

export function getConfig(): Config | null {
  const config = configStore.store;
  if (!config.apiKey || !config.provider) {
    return null;
  }
  return config;
}

export function setConfig(config: Partial<Config>): void {
  configStore.set(config);
}

export function isConfigured(): boolean {
  const config = configStore.store;
  return !!(config.apiKey && config.provider);
}

export function resetConfig(): void {
  configStore.clear();
}

export function getConfigPath(): string {
  return configStore.path;
}

export function validateConfig(config: Config): { valid: boolean; error?: string } {
  if (!config.apiKey) {
    return { valid: false, error: 'API Key 不能为空' };
  }
  
  if (!config.provider) {
    return { valid: false, error: '请选择模型提供商' };
  }

  const provider = getProvider(config.provider);
  if (!provider) {
    return { valid: false, error: '无效的模型提供商' };
  }

  return { valid: true };
}
