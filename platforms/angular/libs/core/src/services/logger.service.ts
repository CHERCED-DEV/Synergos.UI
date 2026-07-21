import { Injectable, isDevMode } from '@angular/core';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Platform logger. Centralises all console output so it can be
 * replaced with a remote logging provider (Sentry, Datadog, etc.)
 * without touching consumer code.
 */
@Injectable({ providedIn: 'root' })
export class LoggerService {
  debug(message: string, ...args: unknown[]): void {
    if (isDevMode()) console.debug(`[syn:debug] ${message}`, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    console.info(`[syn:info] ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[syn:warn] ${message}`, ...args);
  }

  error(message: string, error?: unknown): void {
    console.error(`[syn:error] ${message}`, error);
  }
}
