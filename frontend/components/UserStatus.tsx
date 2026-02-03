"use client";

import { useFarcaster } from "./FarcasterProvider";
import { addMiniApp } from "@/lib/farcaster";

export default function UserStatus() {
  const { user, isInFrame, isLoading, signIn } = useFarcaster();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 text-white/40 text-sm">
        <span className="animate-pulse">🤡</span>
        <span>Loading...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="card flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Not signed in</p>
          <p className="text-xs text-white/50">Sign in to compete</p>
        </div>
        <button
          onClick={signIn}
          className="bg-clown-pink text-white text-sm font-bold py-2 px-4 rounded-lg hover:bg-clown-pink/80 transition-colors"
        >
          🔐 Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="card flex items-center gap-3">
      {user.pfpUrl ? (
        <img
          src={user.pfpUrl}
          alt={user.username || "User"}
          className="w-10 h-10 rounded-full border-2 border-clown-pink"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-clown-pink/30 flex items-center justify-center text-xl">
          🤡
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate">
          {user.displayName || user.username || `FID ${user.fid}`}
        </p>
        {user.username && (
          <p className="text-xs text-white/50 truncate">@{user.username}</p>
        )}
      </div>
      {!isInFrame && (
        <button
          onClick={() => addMiniApp()}
          className="text-xs text-clown-yellow hover:underline"
        >
          + Add to Warpcast
        </button>
      )}
    </div>
  );
}
