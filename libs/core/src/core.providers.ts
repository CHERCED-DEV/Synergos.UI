import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { Environment } from './core.environment';
import { ENVIRONMENT } from './core.tokens';

export interface CoreConfig {
  environment: Environment;
}

export function provideCoreConfig(config: CoreConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ENVIRONMENT, useValue: config.environment },
    provideHttpClient(withInterceptorsFromDi()),
  ]);
}
