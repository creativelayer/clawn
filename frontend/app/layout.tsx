import type { Metadata } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "Clown Roast Battle 🤡🔥",
  description: "The on-chain roast battle powered by $CLAWN on Base",
  other: {
    "fc:frame": JSON.stringify({
      version: "next",
      imageUrl: "https://placeholder.com/clown-roast-og.png",
      button: {
        title: "🤡 Enter the Ring",
        action: {
          type: "launch_frame",
          name: "Clown Roast Battle",
          url: "https://clownroastbattle.xyz",
          splashImageUrl: "https://placeholder.com/clown-splash.png",
          splashBackgroundColor: "#0d0015",
        },
      },
    }),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <main className="max-w-lg mx-auto px-4 pt-4 pb-20 min-h-screen">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
