export interface CacheConfig {
  enabled?: boolean;
  ttlSeconds?: number;
  includeUrls?: readonly string[];
}

export interface Environment {
  production: boolean;
  apiBaseUrl: string;
  cdnBaseUrl: string;
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
