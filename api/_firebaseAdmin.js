import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let firestoreDb = null;

// Initialize Firebase Admin (only once)
export function initAdmin() {
  if (firestoreDb) {
    return firestoreDb;
  }

  try {
    if (getApps().length === 0) {
      // Use service account credentials from environment variable
      const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT;

      if (!serviceAccountStr) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set');
      }

      let serviceAccount;
      try {
        serviceAccount = JSON.parse(serviceAccountStr);
      } catch (parseError) {
        throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT JSON: ${parseError.message}`);
      }

      // Validate required fields
      if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT is missing required fields (project_id, private_key, or client_email)');
      }

      console.log('[Firebase Admin] Initializing with project:', serviceAccount.project_id);

      initializeApp({
        credential: cert(serviceAccount),
      });
    }

    firestoreDb = getFirestore();
    console.log('[Firebase Admin] Firestore initialized successfully');
    return firestoreDb;
  } catch (error) {
    console.error('[Firebase Admin] Initialization failed:', error.message);
    throw error;
  }
}

// Lazy getter for db. Forwards .collection(), .doc(), .runTransaction(),
// and .batch() — the surfaces the API routes use.
export const db = {
  collection: (...args) => initAdmin().collection(...args),
  doc: (...args) => initAdmin().doc(...args),
  runTransaction: (...args) => initAdmin().runTransaction(...args),
  batch: (...args) => initAdmin().batch(...args),
};

// Re-export Admin Auth and FieldValue so API routes don't have to import
// from firebase-admin directly (and hit the init-order trap).
export const adminAuth = () => {
  initAdmin(); // ensure default app is initialized
  return getAuth();
};

export { FieldValue };
