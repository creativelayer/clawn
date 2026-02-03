import type { Metadata } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import { FarcasterProvider } from "@/components/FarcasterProvider";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://clawn-o0h432d9h-creative-layer-projects-b7b6b5f9.vercel.app";

export const metadata: Metadata = {
  title: "Clown Roast Battle 🤡🔥",
  description: "The on-chain roast battle powered by $CLAWN on Base",
  openGraph: {
    title: "Clown Roast Battle 🤡🔥",
    description: "Enter the ring. Drop your best roast. Win $CLAWN.",
    images: [`${APP_URL}/og-image.png`],
  },
  other: {
    "fc:frame": JSON.stringify({
      version: "next",
      imageUrl: `${APP_URL}/og-image.png`,
      button: {
        title: "🤡 Enter the Ring",
        action: {
          type: "launch_frame",
          name: "Clown Roast Battle",
          url: APP_URL,
          splashImageUrl: `${APP_URL}/splash.png`,
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
        <FarcasterProvider>
          <main className="max-w-lg mx-auto px-4 pt-4 pb-20 min-h-screen">
            {children}
          </main>
          <BottomNav />
        </FarcasterProvider>
      </body>
    </html>
  );
}
