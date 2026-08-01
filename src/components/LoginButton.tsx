// ============================================================
// LoginButton.tsx
// ============================================================

import { useAuth } from "../context/AuthContext";

export default function LoginButton() {
  const { user, login, logout } = useAuth();

  if (user) {
    return (
      <div className="flex flex-col items-center gap-2">
        {user.photoURL && (
          <img src={user.photoURL} alt="avatar" className="w-12 h-12 rounded-full" />
        )}
        <span className="text-lg font-semibold">{user.displayName}</span>
        <button onClick={logout} className="px-4 py-2 rounded bg-[#1a0000] hover:bg-gray-600 text-white">
          Logout
        </button>
      </div>
    );
  }

  return (
    <button onClick={login} className="px-4 py-2 rounded bg-red-600 text-white font-medium">
      Sign in with Google
    </button>
  );
}

