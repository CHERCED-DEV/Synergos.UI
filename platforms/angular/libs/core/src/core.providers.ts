import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideHttpClient, withInterceptors, withInterceptorsFromDi } from '@angular/common/http';
import { Environment } from './core.environment';
import {
  ENVIRONMENT,
  LAYOUT_TEMPLATE_MAP,
  VIEWPORT_BREAKPOINTS,
  type LayoutTemplateMap,
  type ViewportBreakpoint,
} from './core.tokens';
import { authInterceptor, cacheInterceptor } from './interceptors';

export interface CoreConfig {
  environment: Environment;
  layoutTemplates?: LayoutTemplateMap;
  viewportBreakpoints?: readonly ViewportBreakpoint[];
}

export function provideCoreConfig(config: CoreConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: ENVIRONMENT, useValue: config.environment },
    ...(config.layoutTemplates ? [{ provide: LAYOUT_TEMPLATE_MAP, useValue: config.layoutTemplates }] : []),
    ...(config.viewportBreakpoints
      ? [{ provide: VIEWPORT_BREAKPOINTS, useValue: config.viewportBreakpoints }]
      : []),
    provideHttpClient(withInterceptors([cacheInterceptor, authInterceptor]), withInterceptorsFromDi()),
  ]);
}
