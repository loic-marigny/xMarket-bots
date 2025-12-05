import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import admin from "firebase-admin";

interface BotConfig {
  id: string;
  displayName?: string;
  initialCredits?: number;
  credentialPrefix?: string;
  emailEnv?: string;
  passwordEnv?: string;
}

interface ProvisionResult {
  id: string;
  uid: string;
  email: string;
  created: boolean;
}

const DEFAULT_CREDITS = 1_000_000;
const DEFAULT_CONFIG_PATH = path.resolve("scripts/admin/bots.json");
const OUTPUT_PATH = path.resolve("scripts/admin/bots-output.json");

async function bootstrapAdmin(): Promise<void> {
  if (admin.apps.length) return;

  const credsPath = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!credsPath) {
    throw new Error("FIREBASE_ADMIN_CREDENTIALS env variable is required.");
  }

  const serviceAccount = JSON.parse(await readFile(credsPath, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

async function ensureUserDocument(uid: string, email: string, credits?: number): Promise<void> {
  const db = admin.firestore();
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      email,
      initialCredits: credits ?? DEFAULT_CREDITS,
      cash: credits ?? DEFAULT_CREDITS,
      bot: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

function envNameFor(bot: BotConfig): { emailKey: string; passwordKey: string } {
  const sanitized = bot.credentialPrefix ?? `BOT_${bot.id.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`;
  const emailKey = bot.emailEnv ?? `${sanitized}_EMAIL`;
  const passwordKey = bot.passwordEnv ?? `${sanitized}_PASSWORD`;
  return { emailKey, passwordKey };
}

function loadCredentials(bot: BotConfig): { email: string; password: string } {
  const { emailKey, passwordKey } = envNameFor(bot);
  const email = process.env[emailKey];
  const password = process.env[passwordKey];
  if (!email) {
    throw new Error(`Missing environment variable ${emailKey} for bot "${bot.id}"`);
  }
  if (!password) {
    throw new Error(`Missing environment variable ${passwordKey} for bot "${bot.id}"`);
  }
  return { email, password };
}

async function provisionBots(configPath: string): Promise<ProvisionResult[]> {
  const file = await readFile(configPath, "utf8");
  const entries: BotConfig[] = JSON.parse(file);

  const results: ProvisionResult[] = [];
  for (const bot of entries) {
    if (!bot.id) {
      throw new Error(`Bot entry is missing required fields: ${JSON.stringify(bot)}`);
    }

    const creds = loadCredentials(bot);
    let user = null;
    let created = false;
    try {
      user = await admin.auth().getUserByEmail(creds.email);
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        user = await admin.auth().createUser({
          email: creds.email,
          password: creds.password,
          displayName: bot.displayName ?? bot.id,
          disabled: false,
        });
        created = true;
      } else {
        throw err;
      }
    }

    await ensureUserDocument(user.uid, creds.email, bot.initialCredits);
    results.push({ id: bot.id, uid: user.uid, email: creds.email, created });
  }

  return results;
}

async function main(): Promise<void> {
  const configPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_CONFIG_PATH;
  await bootstrapAdmin();
  const results = await provisionBots(configPath);
  await writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`Provisioned ${results.length} bots. Details saved to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
