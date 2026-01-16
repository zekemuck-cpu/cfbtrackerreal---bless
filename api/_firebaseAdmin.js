import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (only once)
function initAdmin() {
  if (getApps().length === 0) {
    // Use service account credentials from environment variable
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

    initializeApp({
      credential: cert(serviceAccount),
    });
  }
  return getFirestore();
}

export const db = initAdmin();
