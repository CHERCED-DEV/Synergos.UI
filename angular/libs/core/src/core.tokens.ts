import { InjectionToken } from '@angular/core';
import { Environment, defaultEnvironment } from './core.environment';

export const ENVIRONMENT = new InjectionToken<Environment>('ENVIRONMENT', {
  providedIn: 'root',
  factory: () => defaultEnvironment,
});
