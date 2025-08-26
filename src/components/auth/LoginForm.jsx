import React, { useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { Card, CardHeader, CardBody } from "../shared/Card.jsx";
import { Input } from "../shared/FormField.jsx";
import Button from "../../Button.jsx";
import { useFirebase } from "../../hooks/useFirebase.js";
import { mapAuthError } from "../../config/constants.js";

function LoginForm({ onSwitch }) {
  const { auth, db } = useFirebase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);

      const { getDoc, doc } = await import("firebase/firestore");
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      if (!snap.exists()) {
        setError("Account not found. Please contact support.");
        await signOut(auth);
        return;
      }
      const userDoc = snap.data();
      if (userDoc.approved === false) {
        setError("Please wait while your account is activated. You will receive access once approved by an administrator.");
        await signOut(auth);
        return;
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-md w-full">
      <CardHeader title="Sign in" subtitle="Welcome back" />
      <CardBody>
        {error &&
          (error.includes("Please wait while your account is activated") ? (
            <div className="mb-3 text-center">
              <div className="text-2xl font-bold mb-2">Welcome!</div>
              <div className="text-red-600 mb-4">{error}</div>
            </div>
          ) : (
            <div className="mb-3 text-sm text-red-600 whitespace-pre-line">{error}</div>
          ))}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required autoComplete="email" />
          <Input label="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required autoComplete="current-password" />
          <div className="flex items-center justify-between">
            <Button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
            <button type="button" onClick={onSwitch} className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline">
              Create an account
            </button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export default LoginForm;