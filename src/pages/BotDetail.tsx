import { useParams, Link } from "react-router-dom";
import { Fragment, useMemo, useState } from "react";
import { mockBots } from "@/data/mockBots";
import type { Bot, Trade } from "@/types/bot";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, Activity, DollarSign, Target, Calendar, Clock } from "lucide-react";
import { PerformanceChart } from "@/components/PerformanceChart";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useWealthHistory } from "@/hooks/useWealthHistory";
import { useLiveBotStats } from "@/hooks/useLiveBotStats";
import { deriveBotLifecycleState } from "@/lib/botLifecycle";
import { Markdown } from "@/components/Markdown";
import { StockLogo } from "@/components/StockLogo";
import { cn } from "@/lib/utils";

/**
 * Detailed view for a single bot. It merges mock data with any live override,
 * exposes performance charts, open/closed trades, and localized metadata.
 */
const BotDetail = () => {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const momentumUid = import.meta.env.VITE_BOT_MOMENTUM_UID;
  const meanReversionUid = import.meta.env.VITE_BOT_MEAN_UID;
  const trendFollowerUid = import.meta.env.VITE_BOT_TREND_UID;
  const mlMeanUid = import.meta.env.VITE_BOT_MLMEAN_UID;
  const mlTrendUid = import.meta.env.VITE_BOT_MLTREND_UID;
  const { data: momentumOverride } = useLiveBotStats({ botId: "1", firestoreUid: momentumUid });
  const { data: meanReversionOverride } = useLiveBotStats({ botId: "2", firestoreUid: meanReversionUid });
  const { data: trendFollowerOverride } = useLiveBotStats({ botId: "3", firestoreUid: trendFollowerUid });
  const { data: mlMeanOverride } = useLiveBotStats({ botId: "5", firestoreUid: mlMeanUid });
  const { data: mlTrendOverride } = useLiveBotStats({ botId: "6", firestoreUid: mlTrendUid });
  // Build a quick lookup so overrides can be merged into the mock definition.
  const overridesMap = useMemo(() => {
    const map = new Map<string, Partial<Bot>>();
    [momentumOverride, meanReversionOverride, trendFollowerOverride, mlMeanOverride, mlTrendOverride].forEach((override) => {
      if (override?.id) {
        map.set(override.id, override);
      }
    });
    return map;
  }, [momentumOverride, meanReversionOverride, trendFollowerOverride, mlMeanOverride, mlTrendOverride]);
  const baseBot = mockBots.find((b) => b.id === id);
  const bot = baseBot
    ? overridesMap.get(baseBot.id)
      ? { ...baseBot, ...overridesMap.get(baseBot.id)! }
      : baseBot
    : undefined;
  const locale = i18n.language === "fr" ? fr : enUS;
  const localeCode = i18n.language === "fr" ? "fr-FR" : "en-US";
  const [expandedOpenTrade, setExpandedOpenTrade] = useState<string | null>(null);
  const [expandedLotGroups, setExpandedLotGroups] = useState<Record<string, boolean>>({});
  const [closedSortKey, setClosedSortKey] = useState<keyof Trade | null>(null);
  const [closedSortDir, setClosedSortDir] = useState<"asc" | "desc">("desc");
  const usdFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [],
  );
  const numberFormatter = useMemo(() => new Intl.NumberFormat(localeCode), [localeCode]);
  const formatMoney = (value: number) => usdFormatter.format(value);
  const formatSignedMoney = (value: number) => (value >= 0 ? `+${usdFormatter.format(value)}` : usdFormatter.format(value));
  const formatPrice = (value: number) => usdFormatter.format(value);

  const toggleLotGroup = (key: string) =>
    setExpandedLotGroups((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));

  // Collapse multiple lot fills at the same price to keep the UI compact.
  const groupLotsByPrice = (lots?: NonNullable<Bot["openTrades"][number]["lots"]>) => {
    if (!lots?.length) return [];
    const groups = new Map<
      string,
      {
        price: number;
        totalQty: number;
        lots: typeof lots;
      }
    >();
    lots.forEach((lot) => {
      const key = lot.price.toFixed(4);
      if (!groups.has(key)) {
        groups.set(key, { price: lot.price, totalQty: 0, lots: [] });
      }
      const entry = groups.get(key)!;
      entry.totalQty += lot.qty;
      entry.lots.push(lot);
    });
    return Array.from(groups.values()).map((group) => ({
      ...group,
      totalQty: Math.round(group.totalQty * 1e6) / 1e6,
    }));
  };

  // Keep closed trades sortable client-side without mutating the original array.
  const sortedClosedTrades = useMemo(() => {
    if (!closedSortKey) return bot.closedTrades;
    const sorted = [...bot.closedTrades].sort((a: Trade, b: Trade) => {
      const dir = closedSortDir === "asc" ? 1 : -1;
      const aValue = (a as any)[closedSortKey];
      const bValue = (b as any)[closedSortKey];
      if (typeof aValue === "number" && typeof bValue === "number") {
        return (aValue - bValue) * dir;
      }
      if (closedSortKey.toLowerCase().includes("date")) {
        const aDate = aValue ? new Date(aValue).getTime() : 0;
        const bDate = bValue ? new Date(bValue).getTime() : 0;
        return (aDate - bDate) * dir;
      }
      return String(aValue ?? "").localeCompare(String(bValue ?? "")) * dir;
    });
    return sorted;
  }, [bot.closedTrades, closedSortKey, closedSortDir]);

  const requestClosedSort = (key: keyof Trade) => {
    setClosedSortKey((prev) => {
      if (prev === key) {
        setClosedSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
        return prev;
      }
      setClosedSortDir("asc");
      return key;
    });
  };

  const renderSortLabel = (key: keyof Trade, label: string, align: "left" | "right" = "left") => {
    const isActive = closedSortKey === key;
    const icon = isActive ? (closedSortDir === "asc" ? "▲" : "▼") : "⇅";
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-xs uppercase tracking-wide",
          align === "right" ? "justify-end" : "justify-start",
          isActive ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="text-sm normal-case tracking-normal">{label}</span>
        <span className="text-[10px] leading-none">{icon}</span>
      </div>
    );
  };

  if (!bot) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="container mx-auto px-4 py-8 max-w-6xl flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold">{t("botDetail.notFound.title")}</h1>
            <Link to="/">
              <Button>{t("botDetail.notFound.cta")}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isPositive = bot.roi >= 0;
  const lifecycle = deriveBotLifecycleState(bot);
  const runningSince = lifecycle.firstActivatedAt ?? bot.startDate;
  const lastEventDate = lifecycle.lastEvent?.timestamp ? format(new Date(lifecycle.lastEvent.timestamp), 'PP p', { locale }) : null;
  const statusColors = {
    active: "bg-success/20 text-success border-success/30",
    paused: "bg-chart-4/20 text-chart-4 border-chart-4/30",
    stopped: "bg-muted text-muted-foreground border-border",
  };
  
  const statusLabels = {
    active: t('botDetail.status.active'),
    paused: t('botDetail.status.paused'),
    stopped: t('botDetail.status.stopped'),
  };

  // Fallback to a known bot UID when the API doesn't return one yet.
  const fallbackUid =
    bot.firestoreUid ??
    (bot.id === "1"
      ? momentumUid
      : bot.id === "2"
      ? meanReversionUid
      : bot.id === "3"
      ? trendFollowerUid
      : bot.id === "5"
      ? mlMeanUid
      : bot.id === "6"
      ? mlTrendUid
      : undefined);
  const { history: wealthHistory } = useWealthHistory(fallbackUid);

  // Use Firestore wealth history when available, otherwise default to mock points.
  const performanceData =
    wealthHistory && wealthHistory.length ? wealthHistory : bot.performanceData;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Link to="/">
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('botDetail.back')}
          </Button>
        </Link>

        <div className="flex items-start justify-between mb-8 gap-6">
          <div>
            <h1 className="text-4xl font-bold mb-2">{bot.name}</h1>
            <p className="text-lg text-muted-foreground">{bot.description}</p>
            <div className="flex flex-col gap-2 mt-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{t('botDetail.runningSince')} {format(new Date(runningSince), 'PP', { locale })}</span>
              </div>
              {lastEventDate && lifecycle.lastEvent?.action === "deactivated" && (
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>{t('botDetail.lastPause')}: {lastEventDate}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-4">
            <LanguageSwitcher />
            <Badge className={statusColors[lifecycle.status]} variant="outline">
              {statusLabels[lifecycle.status]}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <TrendingUp className="w-4 h-4" />
            <span>{t('botDetail.roi')}</span>
          </div>
          <p className={`text-3xl font-bold ${isPositive ? "text-success" : "text-destructive"}`}>
              {isPositive ? "+" : ""}{bot.roi.toFixed(1)}%
            </p>
          </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <DollarSign className="w-4 h-4" />
            <span>{t('botDetail.pnl')}</span>
          </div>
          <p className={`text-3xl font-bold ${bot.totalPnL >= 0 ? "text-success" : "text-destructive"}`}>
              {formatSignedMoney(bot.totalPnL)}
            </p>
          </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Target className="w-4 h-4" />
            <span>{t('botDetail.winRate')}</span>
          </div>
          <p className="text-3xl font-bold">{bot.winRate.toFixed(1)}%</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Activity className="w-4 h-4" />
            <span>{t('botDetail.trades')}</span>
          </div>
          <p className="text-3xl font-bold">{numberFormatter.format(bot.trades)}</p>
        </Card>
      </div>

      {bot.liveMetrics && (
        <Card className="p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">{t('botDetail.liveMetrics.title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">{t('botDetail.liveMetrics.cash')}</div>
              <p className="text-2xl font-semibold">{formatMoney(bot.liveMetrics.cash)}</p>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{t('botDetail.liveMetrics.marketValue')}</div>
              <p className="text-2xl font-semibold">{formatMoney(bot.liveMetrics.marketValue)}</p>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{t('botDetail.liveMetrics.lastTrade')}</div>
              <p className="text-2xl font-semibold">
                {bot.liveMetrics.lastTradeAt ? format(new Date(bot.liveMetrics.lastTradeAt), 'PP p', { locale }) : t('botDetail.liveMetrics.never')}
              </p>
            </div>
          </div>
        </Card>
      )}

        <Card className="p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">{t('botDetail.performance')}</h2>
          <PerformanceChart data={performanceData} />
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-[35%_auto] gap-8 mb-8 items-stretch">
          <Card className="p-6 order-2 lg:order-1 flex flex-col">
            <h2 className="text-2xl font-bold mb-4">{t('botDetail.strategy')}</h2>
            <Markdown className="space-y-3 text-sm text-foreground flex-1">{bot.strategy}</Markdown>
          </Card>

          <Card className="p-6 order-1 lg:order-2">
            <h2 className="text-2xl font-bold mb-4">{t('botDetail.code')}</h2>
            <pre className="bg-secondary p-4 rounded-lg overflow-x-auto text-sm max-w-full" style={{ maxWidth: "100%" }}>
              <code className="text-foreground block whitespace-pre-wrap break-words">{bot.code}</code>
            </pre>
          </Card>
        </div>

        <Card className="p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">{t('botDetail.openTrades')}</h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('botDetail.table.company')}</TableHead>
                  <TableHead className="text-right">{t('botDetail.table.quantity')}</TableHead>
                  <TableHead className="text-right">{t('botDetail.table.purchasePrice')}</TableHead>
                  <TableHead className="text-right">{t('botDetail.table.purchaseValue')}</TableHead>
                  <TableHead className="text-right">{t('botDetail.table.currentPrice')}</TableHead>
                  <TableHead className="text-right">{t('botDetail.table.currentValue')}</TableHead>
                  <TableHead className="text-right">{t('botDetail.table.pnl')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bot.openTrades.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      {t('botDetail.openTradesEmpty', { defaultValue: "No open positions yet." })}
                    </TableCell>
                  </TableRow>
                ) : (
                  bot.openTrades.map((trade) => (
                  <Fragment key={trade.id}>
                    <TableRow>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="mr-2 text-sm text-muted-foreground hover:text-foreground"
                            onClick={() => setExpandedOpenTrade((prev) => (prev === trade.id ? null : trade.id))}
                            aria-label={expandedOpenTrade === trade.id ? t("botDetail.table.collapse") : t("botDetail.table.expand")}
                          >
                            {expandedOpenTrade === trade.id ? "▾" : "▸"}
                          </button>
                          <StockLogo src={trade.logo} alt={trade.company} size={32} />
                          <span className="font-medium">{trade.company}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{numberFormatter.format(trade.quantity)}</TableCell>
                      <TableCell className="text-right">{formatPrice(trade.purchasePrice)}</TableCell>
                      <TableCell className="text-right">{formatMoney(trade.purchaseValue)}</TableCell>
                      <TableCell className="text-right">
                        {typeof trade.currentPrice === "number" ? formatPrice(trade.currentPrice) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {typeof trade.currentValue === "number" ? formatMoney(trade.currentValue) : "-"}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${trade.pnl >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatSignedMoney(trade.pnl)}
                      </TableCell>
                    </TableRow>
                    {expandedOpenTrade === trade.id && trade.lots && trade.lots.length > 0 && (
                      <TableRow key={`${trade.id}-lots`}>
                        <TableCell colSpan={7} className="bg-muted/30">
                          <div className="space-y-3">
                            <p className="text-sm font-semibold">{t("botDetail.table.lotBreakdown")}</p>
                            <div className="space-y-2">
                              {groupLotsByPrice(trade.lots).map((group) => {
                                const groupKey = `${trade.id}-${group.price.toFixed(4)}`;
                                const isExpanded = Boolean(expandedLotGroups[groupKey]);
                                return (
                                  <div key={groupKey} className="rounded border border-border bg-background/60">
                                    <button
                                      type="button"
                                      className="flex w-full items-center justify-between px-3 py-2 text-sm"
                                      onClick={() => toggleLotGroup(groupKey)}
                                      aria-label={
                                        isExpanded ? t("botDetail.table.collapse") : t("botDetail.table.expand")
                                      }
                                    >
                                      <div className="flex items-center gap-3 text-muted-foreground">
                                        <span>{isExpanded ? "▾" : "▸"}</span>
                                        <span className="font-medium text-foreground">
                                          {numberFormatter.format(group.totalQty)} @ {formatPrice(group.price)}
                                        </span>
                                      </div>
                                      <span className="text-xs text-muted-foreground">{group.lots.length} lots</span>
                                    </button>
                                    {isExpanded && (
                                      <div className="border-t border-border px-5 py-3 space-y-1 text-sm text-muted-foreground">
                                        {group.lots.map((lot) => (
                                          <div key={lot.id} className="flex items-center justify-between">
                                            <span>{numberFormatter.format(lot.qty)} @ {formatPrice(lot.price)}</span>
                                            <span>{format(new Date(lot.purchaseDate), "PP p", { locale })}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">{t('botDetail.closedTrades')}</h2>
            {closedSortKey && (
              <p className="text-sm text-muted-foreground">
                {t('botDetail.table.sortedBy')}: {t(`botDetail.table.${closedSortKey}`)} {closedSortDir === "asc" ? "↑" : "↓"}
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => requestClosedSort("company")}
                  >
                    {renderSortLabel("company", t('botDetail.table.company'))}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => requestClosedSort("quantity")}
                  >
                    {renderSortLabel("quantity", t('botDetail.table.quantity'), "right")}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => requestClosedSort("purchasePrice")}
                  >
                    {renderSortLabel("purchasePrice", t('botDetail.table.purchasePrice'), "right")}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => requestClosedSort("purchaseValue")}
                  >
                    {renderSortLabel("purchaseValue", t('botDetail.table.purchaseValue'), "right")}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => requestClosedSort("purchaseDate")}
                  >
                    {renderSortLabel("purchaseDate", t('botDetail.table.purchaseDate'), "right")}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => requestClosedSort("sellPrice")}
                  >
                    {renderSortLabel("sellPrice", t('botDetail.table.sellPrice'), "right")}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => requestClosedSort("sellValue")}
                  >
                    {renderSortLabel("sellValue", t('botDetail.table.sellValue'), "right")}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => requestClosedSort("sellDate")}
                  >
                    {renderSortLabel("sellDate", t('botDetail.table.sellDate'), "right")}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => requestClosedSort("pnl")}
                  >
                    {renderSortLabel("pnl", t('botDetail.table.pnl'), "right")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bot.closedTrades.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      {t('botDetail.closedTradesEmpty', { defaultValue: "No trades have been closed yet." })}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedClosedTrades.map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <StockLogo src={trade.logo} alt={trade.company} size={32} />
                        <span className="font-medium">{trade.company}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{numberFormatter.format(trade.quantity)}</TableCell>
                    <TableCell className="text-right">{formatPrice(trade.purchasePrice)}</TableCell>
                    <TableCell className="text-right">{formatMoney(trade.purchaseValue)}</TableCell>
                    <TableCell className="text-right">
                      {trade.purchaseDate ? format(new Date(trade.purchaseDate), 'PP p', { locale }) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {typeof trade.sellPrice === "number" ? formatPrice(trade.sellPrice) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {typeof trade.sellValue === "number" ? formatMoney(trade.sellValue) : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {trade.sellDate ? format(new Date(trade.sellDate), 'PP p', { locale }) : "-"}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${trade.pnl >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatSignedMoney(trade.pnl)}
                    </TableCell>
                  </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default BotDetail;
