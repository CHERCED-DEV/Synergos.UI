export interface Environment {
  production: boolean;
  apiBaseUrl: string;
  cdnBaseUrl: string;
}

export const defaultEnvironment: Environment = {
  production: false,
  apiBaseUrl: '',
  cdnBaseUrl: '',
};
