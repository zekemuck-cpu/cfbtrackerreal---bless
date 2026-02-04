import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCR0ahCPS5vZQbuRgRzh0EI5HNe6e2E-2Y",
  authDomain: "cfbtracker-200ab.firebaseapp.com",
  projectId: "cfbtracker-200ab",
  storageBucket: "cfbtracker-200ab.firebasestorage.app",
  messagingSenderId: "406010526116",
  appId: "1:406010526116:web:7be6a63fb683b1dd7ba931",
  measurementId: "G-P3PV4K9TYW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Add scope for Google Drive file access (files created by or opened with the app)
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

// CRITICAL: Use memory-only cache to disable IndexedDB persistence
// This forces all reads/writes to go directly to the Firestore server,
// preventing cache-related data inconsistencies that were causing
// stint migration data to not persist correctly.
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
});

export default app;
