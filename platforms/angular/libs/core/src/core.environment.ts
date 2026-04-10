export interface CacheConfig {
  enabled?: boolean;
  ttlSeconds?: number;
  includeUrls?: readonly string[];
}

export interface Environment {
  production: boolean;
  apiBaseUrl: string;
  cdnBaseUrl: string;
  /** API key sent as X-Api-Key on requests to apiBaseUrl. Leave unset in public/browser contexts. */
  apiKey?: string;
  cache?: CacheConfig;
}

export const defaultEnvironment: Environment = {
  production: false,
  apiBaseUrl: '',
  cdnBaseUrl: '',
  cache: {
    enabled: false,
    ttlSeconds: 120,
    includeUrls: [],
  },
};
