import { useMemo } from "react";
import { PerformancePoint } from "@/types/bot";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useTranslation } from "react-i18next";

interface PerformanceChartProps {
  data: PerformancePoint[];
}

/**
 * Stacked area chart comparing cash vs invested value over time.
 */
export const PerformanceChart = ({ data }: PerformanceChartProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "fr" ? "fr-FR" : "en-US";
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
      }),
    [locale],
  );
  const tooltipFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale],
  );
  const tooltipCurrencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }),
    [locale],
  );
  const axisCurrencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [locale],
  );

  const formatLabel = (value: string) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value;
    return dateFormatter.format(date);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const rawDate = payload[0].payload.date;
      const formattedDate = formatLabel(rawDate);
      const tooltipDate = (() => {
        const date = new Date(rawDate);
        if (!Number.isFinite(date.getTime())) return rawDate;
        return tooltipFormatter.format(date);
      })();

      return (
        <div className="bg-card border border-border p-3 rounded-lg shadow-lg">
          <p className="text-sm font-medium mb-2">{tooltipDate}</p>
          <p className="text-sm text-chart-1">
            {t("botDetail.chart.liquidity")}: {tooltipCurrencyFormatter.format(payload[0].value)}
          </p>
          <p className="text-sm text-chart-2">
            {t("botDetail.chart.positionValue")}: {tooltipCurrencyFormatter.format(payload[1].value)}
          </p>
          <p className="text-sm font-semibold mt-1 text-foreground">
            {t("botDetail.chart.total")}: {tooltipCurrencyFormatter.format(payload[0].value + payload[1].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={400}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorLiquidity" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8} />
            <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="colorPosition" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.8} />
            <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis 
          dataKey="date" 
          stroke="hsl(var(--muted-foreground))"
          style={{ fontSize: '12px' }}
          tickFormatter={formatLabel}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          style={{ fontSize: "12px" }}
          tickFormatter={(value) => axisCurrencyFormatter.format(value)}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend 
          wrapperStyle={{ paddingTop: '20px' }}
          iconType="line"
        />
        <Area
          type="monotone"
          dataKey="liquidity"
          stackId="1"
          stroke="hsl(var(--chart-1))"
          fill="url(#colorLiquidity)"
          name={t('botDetail.chart.liquidity')}
        />
        <Area
          type="monotone"
          dataKey="positionValue"
          stackId="1"
          stroke="hsl(var(--chart-2))"
          fill="url(#colorPosition)"
          name={t('botDetail.chart.positionValue')}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};
