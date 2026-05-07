import { Injectable, LoggerService } from '@nestjs/common';

export interface LogEntry {
  timestamp: string;
  level: string;
  context?: string;
  message: string;
  [key: string]: unknown;
}

function formatEntry(level: string, message: unknown, context?: string): LogEntry {
  const msg = typeof message === 'string' ? message : JSON.stringify(message);
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message: msg,
  };
  if (context) entry.context = context;
  return entry;
}

@Injectable()
export class AppLogger implements LoggerService {
  private readonly isProduction = process.env.NODE_ENV === 'production';

  private write(entry: LogEntry): void {
    // In production emit pure JSON (one line per log — easily consumed by Dokploy/Docker log drivers)
    // In development emit colorized human-readable output
    if (this.isProduction) {
      process.stdout.write(JSON.stringify(entry) + '\n');
    } else {
      const color: Record<string, string> = { DEBUG: '\x1b[36m', LOG: '\x1b[32m', WARN: '\x1b[33m', ERROR: '\x1b[31m', VERBOSE: '\x1b[35m' };
      const reset = '\x1b[0m';
      const c = color[entry.level] ?? '';
      const ctx = entry.context ? ` [${entry.context}]` : '';
      console.log(`${c}[${entry.level}]${reset}${ctx} ${entry.timestamp} ${entry.message}`);
    }
  }

  log(message: unknown, context?: string): void { this.write(formatEntry('LOG', message, context)); }
  error(message: unknown, trace?: string, context?: string): void {
    const entry = formatEntry('ERROR', message, context);
    if (trace) entry.trace = trace;
    this.write(entry);
  }
  warn(message: unknown, context?: string): void { this.write(formatEntry('WARN', message, context)); }
  debug(message: unknown, context?: string): void { this.write(formatEntry('DEBUG', message, context)); }
  verbose(message: unknown, context?: string): void { this.write(formatEntry('VERBOSE', message, context)); }

  /** Log structured data with additional fields beyond message */
  structured(level: 'log' | 'warn' | 'error', message: string, fields: Record<string, unknown>, context?: string): void {
    const entry: LogEntry = { ...formatEntry(level.toUpperCase(), message, context), ...fields };
    this.write(entry);
  }
}