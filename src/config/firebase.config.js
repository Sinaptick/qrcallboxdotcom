import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCbpXuSt3UHAWtAfiKbVx621vwpL5cKnkA",
  authDomain: "qrwebaccdb.firebaseapp.com",
  projectId: "qrwebaccdb",
  storageBucket: "qrwebaccdb.appspot.com",
  messagingSenderId: "611687644130",
  appId: "1:611687644130:web:3f4011c00e1baae1e397bb",
  measurementId: "G-JXF9XEFCD4",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, firebaseConfig };
export default app;