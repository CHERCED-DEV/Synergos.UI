import { useMemo } from 'react';
import { createLogger, LogLevel } from '../services/logger.service';

export function useLogger(prefix: string, level: LogLevel = LogLevel.Debug) {
  return useMemo(() => createLogger(prefix, level), [prefix, level]);
}
