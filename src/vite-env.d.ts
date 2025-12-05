/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BOT_MOMENTUM_UID?: string;
  readonly VITE_BOT_MEAN_UID?: string;
  readonly VITE_BOT_TREND_UID?: string;
  readonly VITE_BOT_MLMEAN_UID?: string;
  readonly VITE_BOT_MLTREND_UID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
