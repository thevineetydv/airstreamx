// ============================================================
// storage.ts — Safe localStorage wrapper
// Usage: Prevents crashes from localStorage quota exceeded
//        or JSON parse errors
// ============================================================

/**
 * Safe wrapper around localStorage that handles errors gracefully
 * Prevents crashes from quota exceeded, JSON parse errors, etc.
 */
export const safeLocalStorage = {
  /**
   * Get a string value from localStorage
   * @param key Storage key
   * @param defaultValue Value to return if key doesn't exist
   * @returns Stored value or default
   */
  getItem(key: string, defaultValue: string = ""): string {
    try {
      return localStorage.getItem(key) ?? defaultValue;
    } catch (err) {
      console.error(`[Storage] Failed to read ${key}:`, err);
      return defaultValue;
    }
  },

  /**
   * Get a JSON value from localStorage
   * @param key Storage key
   * @param defaultValue Value to return if key doesn't exist or JSON invalid
   * @returns Parsed object or default
   */
  getJSON<T>(key: string, defaultValue: T): T {
    try {
      const item = localStorage.getItem(key);
      if (!item) return defaultValue;
      return JSON.parse(item);
    } catch (err) {
      console.error(`[Storage] Failed to parse JSON from ${key}:`, err);
      return defaultValue;
    }
  },

  /**
   * Set a string value in localStorage
   * @param key Storage key
   * @param value Value to store
   */
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.error(`[Storage] Failed to write ${key}:`, err);
      // Could be quota exceeded - consider cleanup
    }
  },

  /**
   * Set a JSON value in localStorage
   * @param key Storage key
   * @param value Object to store (will be stringified)
   */
  setJSON<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.error(`[Storage] Failed to write JSON to ${key}:`, err);
    }
  },

  /**
   * Remove a value from localStorage
   * @param key Storage key
   */
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore errors
    }
  },

  /**
   * Clear all localStorage
   */
  clear(): void {
    try {
      localStorage.clear();
    } catch (err) {
      console.error("[Storage] Failed to clear localStorage:", err);
    }
  },

  /**
   * Check if key exists
   * @param key Storage key
   */
  hasItem(key: string): boolean {
    try {
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  },
};

// ─────────────────────────────────────────────────────
// Usage Examples:
// ─────────────────────────────────────────────────────

// Before (RISKY):
// const history = JSON.parse(localStorage.getItem("watch_history") || "[]");

// After (SAFE):
// const history = safeLocalStorage.getJSON("watch_history", []);

// Before (RISKY):
// localStorage.setItem("theme", newTheme);

// After (SAFE):
// safeLocalStorage.setItem("theme", newTheme);
