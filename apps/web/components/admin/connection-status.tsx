"use client";

export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-2 h-2 rounded-full ${
          connected
            ? "bg-secondary animate-pulse shadow-[0_0_6px_rgba(255,215,9,0.4)]"
            : "bg-error animate-[blink_1s_infinite]"
        }`}
      />
      <span
        className={`text-[11px] font-headline font-bold uppercase tracking-wider ${
          connected ? "text-secondary" : "text-error"
        }`}
      >
        {connected ? "EN VIVO" : "RECONECTANDO..."}
      </span>
    </div>
  );
}
