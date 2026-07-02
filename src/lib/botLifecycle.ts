import type { Bot, BotActivationEvent } from "@/types/bot";

export interface BotLifecycleState {
  status: Bot["status"];
  lastEvent?: BotActivationEvent;
  lastActivatedAt?: string;
  firstActivatedAt?: string;
}

export const getLatestManualResetAt = (
  bot: Pick<Bot, "activationHistory">,
): string | undefined => {
  const resetEvents = [...(bot.activationHistory ?? [])]
    .filter(
      (event) =>
        event?.timestamp &&
        (event.reason === "Manual reset" || event.actor === "local-user" || event.source === "manual-reset"),
    )
    .sort((a, b) => parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp));

  return resetEvents[0]?.timestamp;
};

const parseTimestamp = (value?: string): number => {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
};

/**
 * Derives the current lifecycle metadata (status + activation timestamps)
 * from the persisted activation history and base bot definition.
 */
export const deriveBotLifecycleState = (bot: Bot): BotLifecycleState => {
  const events = [...(bot.activationHistory ?? [])]
    .filter((event) => Boolean(event?.timestamp && event?.action))
    .sort((a, b) => parseTimestamp(a.timestamp) - parseTimestamp(b.timestamp));

  const lastEvent = events.length ? events[events.length - 1] : undefined;
  let status: Bot["status"] = bot.status;
  if (lastEvent) {
    status = lastEvent.action === "activated" ? "active" : "paused";
  }

  const lastActivatedAt =
    [...events].reverse().find((event) => event.action === "activated")?.timestamp ??
    (status === "active" ? bot.startDate : undefined);

  const firstActivatedAt =
    events.find((event) => event.action === "activated")?.timestamp ?? bot.startDate;

  return {
    status,
    lastEvent,
    lastActivatedAt,
    firstActivatedAt,
  };
};
