import { cn } from "@/lib/utils";

interface SiteLoaderProps {
  message?: string;
  subMessage?: string;
  className?: string;
}

/**
 * Full-screen skeleton displayed while live overrides are still loading.
 */
export function SiteLoader({
  message = "Preparing the trading workspace",
  subMessage = "Connecting to bots and syncing live metrics...",
  className,
}: SiteLoaderProps) {
  return (
    <div className={cn("min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-slate-950 to-background px-4", className)}>
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-black/40 p-10 shadow-2xl backdrop-blur-xl text-center text-white space-y-8 overflow-hidden">
        <div className="absolute inset-px rounded-[calc(1.5rem-1px)] bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
        <div className="relative space-y-8">
          <div className="relative mx-auto h-32 w-32">
            <div className="absolute inset-0 rounded-full border border-white/20" />
            <div className="absolute inset-2 rounded-full border border-primary/50" />
            <div className="absolute inset-0 rounded-full border-y-4 border-transparent border-t-primary border-b-primary/40 animate-spin" style={{ animationDuration: "3s" }} />
            <div className="absolute inset-5 rounded-full bg-gradient-to-br from-primary/80 to-primary/30 blur-xl animate-pulse" />
            <div className="absolute inset-8 rounded-full bg-background/80 flex items-center justify-center animate-pulse opacity-80">
              <div className="h-5 w-5 rounded-full bg-primary animate-ping" />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-2xl font-semibold tracking-tight">{message}</p>
            <p className="text-base text-white/70">{subMessage}</p>
          </div>

          <div className="flex items-center justify-center gap-2 text-sm text-white/60 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="h-2 w-2 rounded-full bg-primary/70" />
            <span className="h-2 w-2 rounded-full bg-primary/50" />
            <span className="uppercase tracking-[0.3em]">loading</span>
          </div>
        </div>
      </div>
    </div>
  );
}
