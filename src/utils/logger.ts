// ============================================================
// logger.ts — Production-safe logging system
// Features:
// - Only logs in development by default
// - Structured error reporting (can integrate with Sentry)
// - Component-tagged messages for easier debugging
// - Error levels (debug, info, warn, error)
// ============================================================

const isDev = process.env.NODE_ENV === "development";

/**
 * Production-safe logger with component tagging
 */
export const logger = {
  /**
   * Debug level - only in development
   * @param component Component/module name
   * @param message Debug message
   * @param data Additional data to log
   */
  debug(component: string, message: string, data?: any): void {
    if (!isDev) return;
    console.debug(`[${component}] ${message}`, data);
  },

  /**
   * Info level - shown in development, silent in production
   * @param component Component/module name
   * @param message Info message
   */
  info(component: string, message: string): void {
    if (!isDev) return;
    console.info(`[${component}] ${message}`);
  },

  /**
   * Warning level - always shown
   * @param component Component/module name
   * @param message Warning message
   * @param error Optional error object
   */
  warn(component: string, message: string, error?: any): void {
    console.warn(`[${component}] ${message}`, error);
  },

  /**
   * Error level - always shown, should be tracked in production
   * @param component Component/module name
   * @param message Error message
   * @param error Error object
   * @param metadata Additional context
   */
  error(component: string, message: string, error: any, metadata?: Record<string, any>): void {
    const errorInfo =
      error instanceof Error
        ? { message: error.message, stack: error.stack, name: error.name }
        : { value: error };

    console.error(`[${component}] ${message}`, errorInfo, metadata);

    // TODO: In production, send to error tracking service (Sentry, etc.)
    // if (!isDev) {
    //   Sentry.captureException(error, {
    //     tags: { component },
    //     extra: { message, metadata },
    //   });
    // }
  },

  /**
   * Log API calls
   * @param method HTTP method
   * @param endpoint API endpoint
   * @param status HTTP status code
   * @param duration Time taken in ms
   */
  api(method: string, endpoint: string, status: number, duration: number): void {
    const statusColor = status < 300 ? "✓" : status < 400 ? "⚠" : "✗";
    logger.debug("API", `${statusColor} ${method.toUpperCase()} ${endpoint} → ${status} (${duration}ms)`);
  },

  /**
   * Log API errors
   * @param method HTTP method
   * @param endpoint API endpoint
   * @param error Error details
   */
  apiError(method: string, endpoint: string, error: any): void {
    logger.error(
      "API",
      `Failed ${method.toUpperCase()} ${endpoint}`,
      error instanceof Error ? error : new Error(String(error))
    );
  },
};