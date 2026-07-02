import { config as loadEnv } from "dotenv";
loadEnv();
loadEnv({ path: ".env.local", override: false });

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import admin from "firebase-admin";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  setDoc,
} from "firebase/firestore";

interface BotConfig {
  id: string;
  displayName?: string;
  initialCredits?: number;
  credentialPrefix?: string;
  emailEnv?: string;
  passwordEnv?: string;
}

const DEFAULT_CREDITS = 1_000_000;
const DEFAULT_CONFIG_PATH = path.resolve("scripts/admin/bots.json");
const RESET_COLLECTIONS = ["orders", "positions", "wealthHistory"] as const;
const ADMIN_DELETE_BATCH_SIZE = 50;
const ADMIN_DELETE_PAUSE_MS = 400;

async function bootstrapAdmin(): Promise<boolean> {
  if (admin.apps.length) return true;

  const credsPath = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!credsPath || !existsSync(credsPath)) {
    return false;
  }

  const serviceAccount = JSON.parse(await readFile(credsPath, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return true;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable ${key}`);
  }
  return value;
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

async function neutralizeCollectionDocs(
  uid: string,
  collectionName: (typeof RESET_COLLECTIONS)[number],
  credits: number,
): Promise<number> {
  const db = getFirestore();
  const snapshot = await getDocs(collection(db, "users", uid, collectionName));
  if (snapshot.empty) return 0;

  await Promise.all(
    snapshot.docs.map(async (docSnap) => {
      if (collectionName === "orders") {
        await setDoc(
          docSnap.ref,
          {
            qty: 0,
            fillPrice: 0,
            side: "reset",
            status: "reset",
            resetAt: Date.now(),
          },
          { merge: true },
        );
        return;
      }

      if (collectionName === "positions") {
        await setDoc(
          docSnap.ref,
          {
            qty: 0,
            avgPrice: 0,
            lots: [],
            resetAt: Date.now(),
          },
          { merge: true },
        );
        return;
      }

      await setDoc(
        docSnap.ref,
        {
          cash: credits,
          stocks: 0,
          total: credits,
          source: "manual-reset",
          snapshotType: "reset",
          resetAt: Date.now(),
        },
        { merge: true },
      );
    }),
  );

  return snapshot.size;
}

async function adminResetBotState(bot: BotConfig): Promise<void> {
  const { email } = loadCredentials(bot);
  const credits = bot.initialCredits ?? DEFAULT_CREDITS;
  const user = await admin.auth().getUserByEmail(email);
  const uid = user.uid;
  const db = admin.firestore();

  const deletedCounts = await Promise.all(
    RESET_COLLECTIONS.map(async (collectionName) => {
      const docs = await db.collection("users").doc(uid).collection(collectionName).listDocuments();
      if (!docs.length) {
        return { collectionName, count: 0 };
      }

      let deleted = 0;
      for (let index = 0; index < docs.length; index += ADMIN_DELETE_BATCH_SIZE) {
        const batch = db.batch();
        const slice = docs.slice(index, index + ADMIN_DELETE_BATCH_SIZE);
        for (const docRef of slice) {
          batch.delete(docRef);
        }
        await batch.commit();
        deleted += slice.length;
        await sleep(ADMIN_DELETE_PAUSE_MS);
      }

      return { collectionName, count: deleted };
    }),
  );

  await db.collection("users").doc(uid).set(
    {
      email,
      bot: true,
      cash: credits,
      initialCredits: credits,
      resetAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const summary = deletedCounts.map(({ collectionName, count }) => `${collectionName}=${count}`).join(", ");
  console.log(`[bot-reset-live] ${bot.id} (${uid}) reset to $${credits}. Deleted: ${summary}`);
}

async function resetBotState(bot: BotConfig): Promise<void> {
  const { email, password } = loadCredentials(bot);
  const credits = bot.initialCredits ?? DEFAULT_CREDITS;
  const auth = getAuth();
  const db = getFirestore();

  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  try {
    const deletedCounts = await Promise.all(
      RESET_COLLECTIONS.map(async (collectionName) => ({
        collectionName,
        count: await neutralizeCollectionDocs(uid, collectionName, credits),
      })),
    );

    await setDoc(
      doc(db, "users", uid),
      {
        email,
        bot: true,
        cash: credits,
        initialCredits: credits,
        resetAt: Date.now(),
      },
      { merge: true },
    );

    const summary = deletedCounts.map(({ collectionName, count }) => `${collectionName}=${count}`).join(", ");
    console.log(`[bot-reset-live] ${bot.id} (${uid}) reset to $${credits}. Neutralized: ${summary}`);
  } finally {
    await signOut(auth);
  }
}

async function main(): Promise<void> {
  const configPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_CONFIG_PATH;
  const file = await readFile(configPath, "utf8");
  const entries: BotConfig[] = JSON.parse(file);

  const adminReady = await bootstrapAdmin();
  if (adminReady) {
    for (const bot of entries) {
      await adminResetBotState(bot);
    }
  } else {
    const firebaseConfig = {
      apiKey: requiredEnv("VITE_FIREBASE_API_KEY"),
      authDomain: requiredEnv("VITE_FIREBASE_AUTH_DOMAIN"),
      projectId: requiredEnv("VITE_FIREBASE_PROJECT_ID"),
      storageBucket: requiredEnv("VITE_FIREBASE_STORAGE_BUCKET"),
      messagingSenderId: requiredEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
      appId: requiredEnv("VITE_FIREBASE_APP_ID"),
    };

    initializeApp(firebaseConfig);

    for (const bot of entries) {
      await resetBotState(bot);
    }
  }

  console.log(`[bot-reset-live] Completed reset for ${entries.length} bots.`);
}

main().catch((err) => {
  console.error("[bot-reset-live] Failed", err);
  process.exit(1);
});
