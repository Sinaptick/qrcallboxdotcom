import { useMemo } from "react";
import { app, auth, db } from "../config/firebase.config.js";

export function useFirebase() {
  return useMemo(() => ({ app, auth, db }), []);
}