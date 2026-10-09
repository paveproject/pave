import { nanoid } from 'nanoid/non-secure';
import { add } from './logDump';
import { type MetricEvents } from './metrics';
import { consoleTransport } from './transports/console';
import { sentryTransport } from './transports/sentry';
import { LogContext, LogLevel, type Metadata, type Transport } from './types';
import { enabledLogLevels } from './util';
import * as env from '../env';

const TRANSPORTS: Transport[] = (function configureTransports() {
  switch (env.ENV) {
    case 'production': {
      return [sentryTransport].filter(Boolean) as Transport[];
    }
    case 'test': {
      return [];
    }
    default: {
      return [consoleTransport];
    }
  }
})();

export class Logger {
  static Level = LogLevel;
  static Context = LogContext;

  level: LogLevel;
  context: LogContext | undefined = undefined;
  contextFilter = '';

  protected debugContextRegexes: RegExp[] = [];
  protected transports: Transport[] = [];

  static create(context?: LogContext) {
    const logger = new Logger({
      level: env.LOG_LEVEL as LogLevel,
      context,
      contextFilter: env.LOG_LEVEL || '',
    });
    for (const transport of TRANSPORTS) {
      logger.addTransport(transport);
    }
    return logger;
  }

  constructor({
    level,
    context,
    contextFilter,
  }: {
    level?: LogLevel;
    context?: LogContext;
    contextFilter?: string;
  } = {}) {
    this.context = context;
    this.level = level || LogLevel.Info;
    this.contextFilter = contextFilter || '';
    if (this.contextFilter) {
      this.level = LogLevel.Debug;
    }
    this.debugContextRegexes = (this.contextFilter || '').split(',').map((filter) => {
      return new RegExp(filter.replace(/[^\w:*-]/, '').replace(/\*/g, '.*'));
    });
  }

  debug(message: string, metadata: Metadata = {}) {
    this.transport({ level: LogLevel.Debug, message, metadata });
  }

  info(message: string, metadata: Metadata = {}) {
    this.transport({ level: LogLevel.Info, message, metadata });
  }

  log(message: string, metadata: Metadata = {}) {
    this.transport({ level: LogLevel.Log, message, metadata });
  }

  warn(message: string, metadata: Metadata = {}) {
    this.transport({ level: LogLevel.Warn, message, metadata });
  }

  error(error: Error | string, metadata: Metadata = {}) {
    this.transport({ level: LogLevel.Error, message: error, metadata });
  }

  metric<E extends keyof MetricEvents>(
    event: E & string,
    metadata: MetricEvents[E],
    options: {
      /**
       * Optionally also send to StatSig
       */
      statsig?: boolean;
    } = { statsig: true },
  ) {
    for (const transport of this.transports) {
      transport(LogLevel.Info, LogContext.Metric, event, metadata, Date.now());
    }
  }

  addTransport(transport: Transport) {
    this.transports.push(transport);
    return () => {
      this.transports.splice(this.transports.indexOf(transport), 1);
    };
  }

  protected transport({
    level,
    message,
    metadata = {},
  }: {
    level: LogLevel;
    message: string | Error;
    metadata: Metadata;
  }) {
    if (
      level === LogLevel.Debug &&
      !!this.contextFilter &&
      !!this.context &&
      !this.debugContextRegexes.find((reg) => reg.test(this.context!))
    )
      return;

    const timestamp = Date.now();
    const meta = metadata || {};

    // send every log to syslog
    add({
      id: nanoid(),
      timestamp,
      level,
      context: this.context,
      message,
      metadata: meta,
    });

    if (!enabledLogLevels[this.level].includes(level)) return;

    for (const transport of this.transports) {
      transport(level, this.context, message, meta, timestamp);
    }
  }
}

/**
 * Default logger instance. See `@/logger/README` for docs.
 *
 * Basic usage:
 *
 *   `logger.debug(message[, metadata])`
 *   `logger.info(message[, metadata])`
 *   `logger.log(message[, metadata])`
 *   `logger.warn(message[, metadata])`
 *   `logger.error(error[, metadata])`
 */
export const logger = Logger.create(Logger.Context.Default);
