"use client";

import { useEffect, useState } from "react";

export default function Timer({ endsAt }: { endsAt: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    function update() {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Round ended!");
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      );
    }
    update();
    const i = setInterval(update, 1000);
    return () => clearInterval(i);
  }, [endsAt]);

  return (
    <div className="text-center">
      <p className="text-xs text-clown-purple uppercase tracking-widest mb-1">Time Remaining</p>
      <p className="text-3xl font-mono font-bold glow-yellow text-clown-yellow">{remaining}</p>
    </div>
  );
}
