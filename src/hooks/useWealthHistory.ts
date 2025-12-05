import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, type QueryDocumentSnapshot, type Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PerformancePoint } from "@/types/bot";

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
};

const toDateString = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as Timestamp)?.toDate === "function") {
    try {
      return (value as Timestamp).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
};

const docToPoint = (docSnap: QueryDocumentSnapshot): PerformancePoint => {
  const data = docSnap.data() as Record<string, unknown>;
  return {
    date: toDateString(data?.ts) ?? new Date().toISOString(),
    liquidity: toNumber(data?.cash),
    positionValue: toNumber(data?.stocks),
  };
};

/**
 * Streams the cumulative wealth history (cash + stocks) for a bot.
 * Falls back to `null` when the Firestore UID is missing so mock data can be used.
 */
export function useWealthHistory(uid?: string | null) {
  const [history, setHistory] = useState<PerformancePoint[] | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(uid));

  useEffect(() => {
    if (!uid) {
      console.warn("[useWealthHistory] Missing UID, falling back to mock data.");
      setHistory(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    console.debug("[useWealthHistory] Subscribing to wealthHistory for", uid);
    const q = query(
      collection(db, "users", uid, "wealthHistory"),
      orderBy("ts", "asc"),
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const entries = snapshot.docs.map(docToPoint);
        console.debug("[useWealthHistory] loaded", entries.length, "points for", uid);
        setHistory(entries);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load wealth history", error);
        setHistory(null);
        setLoading(false);
      },
    );
  }, [uid]);

  return { history, loading };
}
