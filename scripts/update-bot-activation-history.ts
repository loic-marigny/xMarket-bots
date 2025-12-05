import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type ActivationAction = "activated" | "deactivated";

interface ActivationEvent {
  timestamp: string;
  action: ActivationAction;
  reason?: string;
  actor?: string;
  source?: string;
}

const BOT_HISTORY_DIR = resolve("src", "bots");

const isActivationAction = (value: string): value is ActivationAction =>
  value === "activated" || value === "deactivated";

async function loadHistory(botSlug: string): Promise<ActivationEvent[]> {
  const historyPath = resolve(BOT_HISTORY_DIR, botSlug, "history.json");
  try {
    const rawContent = await readFile(historyPath, "utf-8");
    const content = rawContent.replace(/^\uFEFF/, "");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is ActivationEvent => typeof entry?.timestamp === "string" && isActivationAction(entry?.action));
    }
    return [];
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      throw new Error(`Missing history.json for bot "${botSlug}". Expected at ${historyPath}`);
    }
    throw err;
  }
}

async function saveHistory(botSlug: string, history: ActivationEvent[]): Promise<void> {
  const historyPath = resolve(BOT_HISTORY_DIR, botSlug, "history.json");
  await writeFile(historyPath, JSON.stringify(history, null, 2) + "\n", "utf-8");
}

(async function main() {
  const [, , botSlugArg, actionArg = "activated"] = process.argv;
  if (!botSlugArg) {
    console.error("Usage: tsx scripts/update-bot-activation-history.ts <bot-slug> [activated|deactivated]");
    process.exit(1);
  }
  if (!isActivationAction(actionArg)) {
    console.error(`Invalid action "${actionArg}". Use "activated" or "deactivated".`);
    process.exit(1);
  }

  const botSlug = botSlugArg;
  const action: ActivationAction = actionArg;
  const reason = process.env.BOT_HISTORY_REASON ?? "GitHub workflow run";
  const actor = process.env.BOT_HISTORY_ACTOR ?? process.env.GITHUB_ACTOR ?? "github-actions";
  const source = process.env.BOT_HISTORY_SOURCE ?? process.env.GITHUB_WORKFLOW ?? "run-bots";
  const now = new Date().toISOString();

  const history = await loadHistory(botSlug);
  const lastEvent = history[history.length - 1];

  const parsedLastTs = lastEvent?.timestamp ? Date.parse(lastEvent.timestamp) : NaN;
  const parsedNow = Date.parse(now);
  const recentlySameAction =
    lastEvent?.action === action &&
    Number.isFinite(parsedLastTs) &&
    Number.isFinite(parsedNow) &&
    parsedNow - parsedLastTs < 1000 * 60 * 30; // prevent duplicate entries within 30 minutes

  if (recentlySameAction) {
    console.log(`[bot-history] Skipping update for "${botSlug}" - latest "${action}" event already recorded within 30 minutes.`);
    process.exit(0);
  }

  history.push({
    timestamp: now,
    action,
    reason,
    actor,
    source,
  });

  await saveHistory(botSlug, history);
  console.log(`[bot-history] Recorded ${action} for "${botSlug}" at ${now}`);
})().catch((err) => {
  console.error("[bot-history] Failed to update activation history", err);
  process.exit(1);
});
