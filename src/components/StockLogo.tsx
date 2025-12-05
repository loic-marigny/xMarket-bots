import { useMemo, useState } from "react";
import manifest from "@/../public/companies/manifest.json";

interface StockLogoProps {
  src?: string;
  alt: string;
  fallbackText?: string;
  size?: number;
}

const normalizeTicker = (value?: string) =>
  value?.trim().toUpperCase().replace(/[^A-Z]/g, "") ?? "";

/**
 * Displays a stock/company logo when available, otherwise a ticker fallback badge.
 */
export const StockLogo = ({ src, alt, fallbackText, size = 32 }: StockLogoProps) => {
  const [errored, setErrored] = useState(false);
  const displayText = fallbackText ?? alt.charAt(0).toUpperCase();
  const ticker = useMemo(() => normalizeTicker(src ?? alt), [src, alt]);
  const manifestRecord = manifest as Record<string, string>;
  const resolvedSrc = ticker && ticker in manifestRecord ? `/companies/${manifestRecord[ticker]}` : src;

  if (!resolvedSrc || errored) {
    return (
      <div
        className="flex items-center justify-center rounded bg-muted text-muted-foreground font-semibold"
        style={{ width: size, height: size }}
        aria-label={alt}
      >
        {displayText}
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className="rounded object-cover"
      style={{ width: size, height: size }}
      loading="lazy"
      onError={() => setErrored(true)}
    />
  );
};
