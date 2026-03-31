export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
  None = 4,
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export function createLogger(prefix: string, level: LogLevel = LogLevel.Debug): Logger {
  const shouldLog = (target: LogLevel) => level <= target;

  return {
    debug: (msg, ...args) => shouldLog(LogLevel.Debug) && console.debug(`[${prefix}]`, msg, ...args),
    info: (msg, ...args) => shouldLog(LogLevel.Info) && console.info(`[${prefix}]`, msg, ...args),
    warn: (msg, ...args) => shouldLog(LogLevel.Warn) && console.warn(`[${prefix}]`, msg, ...args),
    error: (msg, ...args) => shouldLog(LogLevel.Error) && console.error(`[${prefix}]`, msg, ...args),
  };
}
