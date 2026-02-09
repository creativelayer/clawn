"use client";

import { useState } from "react";

const MAX_CHARS = 280;

export default function RoastInput({
  onSubmit,
  disabled,
  buttonText = "🎪 Submit Roast (50,000 $CLAWN)",
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  buttonText?: string;
}) {
  const [text, setText] = useState("");

  const remaining = MAX_CHARS - text.length;
  const overLimit = remaining < 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Drop your roast here... 🎤🔥"
          rows={4}
          className="w-full bg-clown-bg border border-clown-purple/40 rounded-xl p-4 text-white placeholder-white/30 focus:outline-none focus:border-clown-pink resize-none"
          maxLength={MAX_CHARS + 10}
        />
        <span
          className={`absolute bottom-3 right-3 text-xs font-mono ${
            overLimit ? "text-red-500" : remaining < 30 ? "text-clown-yellow" : "text-white/30"
          }`}
        >
          {remaining}
        </span>
      </div>
      <button
        onClick={() => {
          if (text.trim() && !overLimit) {
            onSubmit(text.trim());
            setText("");
          }
        }}
        disabled={disabled || overLimit || !text.trim()}
        className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {buttonText}
      </button>
    </div>
  );
}
