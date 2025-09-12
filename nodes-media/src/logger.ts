// Simple logger module for nodes-media
// This is a basic logger that wraps console methods and provides child logger functionality

interface LogContext {
  [key: string]: any;
}

class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const contextStr = Object.keys(this.context).length > 0 ? ` [${JSON.stringify(this.context)}]` : '';
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level}]${contextStr} ${message}${dataStr}`;
  }

  info(data: any, message?: string): void {
    if (typeof data === 'string') {
      console.log(this.formatMessage('INFO', data));
    } else {
      console.log(this.formatMessage('INFO', message || '', data));
    }
  }

  warn(data: any, message?: string): void {
    if (typeof data === 'string') {
      console.warn(this.formatMessage('WARN', data));
    } else {
      console.warn(this.formatMessage('WARN', message || '', data));
    }
  }

  error(data: any, message?: string): void {
    if (typeof data === 'string') {
      console.error(this.formatMessage('ERROR', data));
    } else {
      console.error(this.formatMessage('ERROR', message || '', data));
    }
  }

  debug(data: any, message?: string): void {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      if (typeof data === 'string') {
        console.debug(this.formatMessage('DEBUG', data));
      } else {
        console.debug(this.formatMessage('DEBUG', message || '', data));
      }
    }
  }

  child(context: LogContext): Logger {
    return new Logger({ ...this.context, ...context });
  }
}

export const logger = new Logger();