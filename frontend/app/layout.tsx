import type { Metadata } from "next";
import Script from "next/script";
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
      <head>
        {/* Load Farcaster SDK via CDN and call ready() immediately */}
        <Script 
          src="https://cdn.jsdelivr.net/npm/@farcaster/miniapp-sdk@0.2.2/dist/index.min.js"
          strategy="beforeInteractive"
        />
        <Script id="fc-ready" strategy="beforeInteractive">
          {`
            (function checkAndCallReady() {
              if (typeof miniapp !== 'undefined' && miniapp.sdk) {
                miniapp.sdk.actions.ready();
                console.log('[FC] ready() called via CDN SDK');
              } else {
                setTimeout(checkAndCallReady, 10);
              }
            })();
          `}
        </Script>
      </head>
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
