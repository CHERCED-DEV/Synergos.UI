import { InjectionToken } from '@angular/core';
import { Environment, defaultEnvironment } from './core.environment';

export interface ViewportBreakpoint {
  readonly name: string;
  readonly minWidth: number;
}

export type LayoutTemplateMap = Readonly<Record<string, string>>;

export const defaultViewportBreakpoints: readonly ViewportBreakpoint[] = [
  { name: 'xs', minWidth: 0 },
  { name: 'sm', minWidth: 480 },
  { name: 'md', minWidth: 640 },
  { name: 'lg', minWidth: 768 },
  { name: 'xl', minWidth: 992 },
  { name: 'xxl', minWidth: 1248 },
];

export const ENVIRONMENT = new InjectionToken<Environment>('ENVIRONMENT', {
  providedIn: 'root',
  factory: () => defaultEnvironment,
});

export const EVENT_BUS_CHANNEL = new InjectionToken<string>('EVENT_BUS_CHANNEL', {
  providedIn: 'root',
  factory: () => 'synergos-events',
});

export const VIEWPORT_BREAKPOINTS = new InjectionToken<readonly ViewportBreakpoint[]>(
  'VIEWPORT_BREAKPOINTS',
  {
    providedIn: 'root',
    factory: () => defaultViewportBreakpoints,
  },
);

export const LAYOUT_TEMPLATE_MAP = new InjectionToken<LayoutTemplateMap>('LAYOUT_TEMPLATE_MAP', {
  providedIn: 'root',
  factory: () => ({}),
});

export interface ElementRegistryEntry {
  readonly alias?: string;
  readonly name?: string;
  readonly tag: string;
}

export const ELEMENT_REGISTRY_TOKEN = new InjectionToken<readonly ElementRegistryEntry[]>(
  'ELEMENT_REGISTRY',
  {
    providedIn: 'root',
    factory: () => [],
  },
);
