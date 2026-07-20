import { useEffect, useState } from "react";
import { mockBots } from "@/data/mockBots";
import type { Bot } from "@/types/bot";
import { fetchLiveBotStats } from "@/hooks/useLiveBotStats";
import { getLatestManualResetAt } from "@/lib/botLifecycle";

export function useDashboardBots() {
  const [bots, setBots] = useState<Bot[]>(
    () =>
      mockBots.map((bot) => ({
        ...bot,
        startDate: getLatestManualResetAt(bot) ?? bot.startDate,
      })),
  );

  useEffect(() => {
    let cancelled = false;

    const fetchAllBots = async () => {
      const mergedBots = await Promise.all(
        mockBots.map(async (bot) => {
          const localResetAt = getLatestManualResetAt(bot);
          const liveOverride = await fetchLiveBotStats({
            botId: bot.id,
            firestoreUid: bot.firestoreUid,
            resetAt: localResetAt,
            maxOrders: 100,
          });

          return {
            ...bot,
            ...(liveOverride ?? {}),
            startDate: liveOverride?.startDate ?? localResetAt ?? bot.startDate,
          };
        }),
      );

      if (!cancelled) {
        setBots(mergedBots);
      }
    };

    fetchAllBots().catch((error) => {
      console.error("Failed to fetch dashboard bot stats", error);
    });

    const interval = setInterval(fetchAllBots, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return bots;
}
