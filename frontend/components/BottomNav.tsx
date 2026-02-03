"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { swapToken } from "@/lib/farcaster";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
  { href: "#buy", label: "Buy $CLAWN", icon: "💰", action: true },
  { href: "#profile", label: "Profile", icon: "🤡" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-clown-bg/95 backdrop-blur border-t border-clown-purple/20 px-2 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-14 max-w-lg mx-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          if (item.action) {
            return (
              <button
                key={item.label}
                onClick={() => swapToken()}
                className="flex flex-col items-center gap-0.5 text-clown-yellow"
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-[10px]">{item.label}</span>
              </button>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 ${
                active ? "text-clown-pink" : "text-white/50"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-[10px]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
