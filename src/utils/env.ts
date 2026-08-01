/**
 * Centralized environment configuration
 * Single source of truth for all environment variables
 */

// Development: Vite exposes env vars via import.meta.env
// Build time: Environment variables must be prefixed with VITE_

const getEnv = (key: string, defaultValue?: string): string => {
  const value = (import.meta.env as any)[key];
  if (!value && !defaultValue) {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
      `Please set it in .env file or export as environment variable`
    );
  }
  return value || defaultValue || "";
};

export const ENV = {
  // API Configuration
  API_BASE: getEnv("VITE_API_BASE", "http://localhost:3000/api"),
  
  // Firebase Configuration
  FIREBASE_API_KEY: getEnv("VITE_FIREBASE_API_KEY"),
  FIREBASE_AUTH_DOMAIN: getEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  FIREBASE_PROJECT_ID: getEnv("VITE_FIREBASE_PROJECT_ID"),
  FIREBASE_STORAGE_BUCKET: getEnv("VITE_FIREBASE_STORAGE_BUCKET", ""),
  FIREBASE_MESSAGING_SENDER_ID: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", ""),
  FIREBASE_APP_ID: getEnv("VITE_FIREBASE_APP_ID"),
  FIREBASE_MEASUREMENT_ID: getEnv("VITE_FIREBASE_MEASUREMENT_ID", ""),
  
  // App Configuration
  NODE_ENV: (import.meta.env.MODE || "development") as "development" | "production",
  DEV: import.meta.env.DEV,
  PROD: import.meta.env.PROD,
  
  // Feature Flags (optional, can be toggled)
  ENABLE_ANALYTICS: getEnv("VITE_ENABLE_ANALYTICS", "true") === "true",
  ENABLE_ERROR_TRACKING: getEnv("VITE_ENABLE_ERROR_TRACKING", "true") === "true",
} as const;

// Validate on startup
export function validateEnv(): void {
  const required = [
    "VITE_API_BASE",
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
  ];

  const missing = required.filter((key) => {
    try {
      getEnv(key, undefined);
      return false;
    } catch {
      return true;
    }
  });

  if (missing.length > 0) {
    console.error(
      `Missing required environment variables:\n${missing.join("\n")}\n` +
      `Please set them in your .env file`
    );
  }
}

export type Env = typeof ENV;
