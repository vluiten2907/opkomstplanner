import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Vul deze waarden in via .env (zie .env.example). Ze zijn publiek: de beveiliging zit in de Firestore-regels.
const cfg = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};
export const configured = !!cfg.apiKey && !!cfg.projectId;
export const app = initializeApp(configured ? cfg : { apiKey: 'demo', projectId: 'demo', appId: 'demo' });
export const auth = getAuth(app);
export const db = getFirestore(app);
