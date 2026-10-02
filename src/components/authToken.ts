// ============================================================
// authToken.ts — Shared Firebase token helper
// ============================================================

import { auth } from "../firebase";

/**
 * Returns a fresh Firebase ID token for the current user,
 * or null if the user is not signed in.
 */
export async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(/* forceRefresh */ true);
}