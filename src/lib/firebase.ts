import { getApps, initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";

/**
 * Firebase credentials are injected via Vite env variables at build time.
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey) {
  console.warn("VITE_FIREBASE_API_KEY is missing; live bot stats will be disabled.");
}

// Avoid re-initializing the Firebase app during Vite HMR.
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const isBrowser = typeof window !== "undefined";

/**
 * In the browser we opt into long polling to function in restrictive networks.
 * On the server we can use the default Firestore client.
 */
export const db = isBrowser
  ? initializeFirestore(app, {
      experimentalForceLongPolling: true,
      useFetchStreams: false,
    })
  : getFirestore(app);
