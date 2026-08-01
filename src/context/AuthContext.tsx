// src/context/AuthContext.tsx
import React, { createContext, useEffect, useState, useContext } from "react";
import { auth, signInWithGoogle, logout } from "../firebase";
import { onAuthStateChanged, getIdToken } from "firebase/auth";
import type { User } from "firebase/auth";

interface AuthContextProps {
  user: User | null;
  token: string | null;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextProps>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
});

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Listen for Firebase auth state
  useEffect(() => {
    let tokenRefreshInterval: ReturnType<typeof setInterval> | null = null;

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clear any existing refresh interval when auth state changes
      if (tokenRefreshInterval) {
        clearInterval(tokenRefreshInterval);
        tokenRefreshInterval = null;
      }

      setUser(firebaseUser);

      if (firebaseUser) {
        // 🧠 Get token and refresh it automatically
        const idToken = await getIdToken(firebaseUser, true);
        setToken(idToken);

        // Refresh every 55 minutes (Firebase tokens expire ~1 hour)
        tokenRefreshInterval = setInterval(async () => {
          try {
            const refreshedToken = await getIdToken(firebaseUser, true);
            setToken(refreshedToken);
          } catch (err) {
            console.error("Failed to refresh token:", err);
          }
        }, 55 * 60 * 1000);
      } else {
        setToken(null);
      }
    });

    return () => {
      unsub();
      if (tokenRefreshInterval) {
        clearInterval(tokenRefreshInterval);
      }
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login: signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

