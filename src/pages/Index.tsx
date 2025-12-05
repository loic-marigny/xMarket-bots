import { mockBots } from "@/data/mockBots";
import type { Bot } from "@/types/bot";
import { BotCard } from "@/components/BotCard";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SiteLoader } from "@/components/SiteLoader";
import { Activity } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLiveBotStats } from "@/hooks/useLiveBotStats";
import { deriveBotLifecycleState } from "@/lib/botLifecycle";

/**
 * Home dashboard that surfaces aggregate stats and the list of bots.
 * It merges mock definitions with any live overrides fetched from Firestore.
 */
const Index = () => {
  const { t } = useTranslation();
  const momentumUid = import.meta.env.VITE_BOT_MOMENTUM_UID;
  const meanReversionUid = import.meta.env.VITE_BOT_MEAN_UID;
  const trendFollowerUid = import.meta.env.VITE_BOT_TREND_UID;
  const mlMeanUid = import.meta.env.VITE_BOT_MLMEAN_UID;
  const mlTrendUid = import.meta.env.VITE_BOT_MLTREND_UID;
  // Each bot can optionally stream live overrides if the Firestore UID is configured.
  const { data: momentumOverride, loading: momentumLoading } = useLiveBotStats({ botId: "1", firestoreUid: momentumUid });
  const { data: meanReversionOverride, loading: meanReversionLoading } = useLiveBotStats({ botId: "2", firestoreUid: meanReversionUid });
  const { data: trendFollowerOverride, loading: trendFollowerLoading } = useLiveBotStats({ botId: "3", firestoreUid: trendFollowerUid });
  const { data: mlMeanOverride, loading: mlMeanLoading } = useLiveBotStats({ botId: "5", firestoreUid: mlMeanUid });
  const { data: mlTrendOverride, loading: mlTrendLoading } = useLiveBotStats({ botId: "6", firestoreUid: mlTrendUid });

  const liveOverrides = useMemo(
    () =>
      [momentumOverride, meanReversionOverride, trendFollowerOverride, mlMeanOverride, mlTrendOverride].filter(
        (override): override is Partial<Bot> => Boolean(override),
      ),
    [momentumOverride, meanReversionOverride, trendFollowerOverride, mlMeanOverride, mlTrendOverride],
  );

  // Reduce the mock dataset with any live overrides to hydrate ROI/PnL in place.
  const bots = useMemo(() => {
    if (!liveOverrides.length) return mockBots;
    return liveOverrides.reduce(
      (current, override) =>
        current.map((bot) => (bot.id === override.id ? { ...bot, ...override } : bot)),
      mockBots,
    );
  }, [liveOverrides]);

  const lifecycleStates = useMemo(() => bots.map((bot) => deriveBotLifecycleState(bot)), [bots]);
  // Dashboard KPIs used in the hero stat cards.
  const totalPnL = bots.reduce((acc, bot) => acc + bot.totalPnL, 0);
  const avgRoi = bots.reduce((acc, bot) => acc + bot.roi, 0) / bots.length;
  const activeBots = lifecycleStates.filter((state) => state.status === "active").length;
  const totalTrades = bots.reduce((acc, bot) => acc + bot.trades, 0);

  const loadingStates = [momentumLoading, meanReversionLoading, trendFollowerLoading, mlMeanLoading, mlTrendLoading];
  const waitingForLiveData = loadingStates.some(Boolean) && !liveOverrides.length;

  if (waitingForLiveData) {
    return <SiteLoader />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Activity className="w-10 h-10 text-primary" />
              <h1 className="text-5xl font-bold">{t('dashboard.title')}</h1>
            </div>
            <LanguageSwitcher />
          </div>
          <p className="text-xl text-muted-foreground">
            {t('dashboard.subtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="text-sm text-muted-foreground mb-2">{t('dashboard.totalPnl')}</div>
            <div className={`text-3xl font-bold ${totalPnL >= 0 ? "text-success" : "text-destructive"}`}>
              {totalPnL >= 0 ? "+" : ""}${totalPnL.toLocaleString()}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <div className="text-sm text-muted-foreground mb-2">{t('dashboard.avgRoi')}</div>
            <div className={`text-3xl font-bold ${avgRoi >= 0 ? "text-success" : "text-destructive"}`}>
              {avgRoi >= 0 ? "+" : ""}{avgRoi.toFixed(1)}%
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <div className="text-sm text-muted-foreground mb-2">{t('dashboard.activeBots')}</div>
            <div className="text-3xl font-bold text-primary">{activeBots}/{mockBots.length}</div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <div className="text-sm text-muted-foreground mb-2">{t('dashboard.totalTrades')}</div>
            <div className="text-3xl font-bold">{totalTrades.toLocaleString()}</div>
          </div>
        </div>

        <div>
          <h2 className="text-3xl font-bold mb-6">{t('dashboard.myBots')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {bots.map((bot) => (
              <BotCard key={bot.id} bot={bot} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
