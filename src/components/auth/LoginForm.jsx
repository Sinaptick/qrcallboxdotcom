import React, { useState } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification
} from "firebase/auth";
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
  const [success, setSuccess] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setNeedsVerification(false);
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);

      // Check if email is verified for non-Google providers
      if (!cred.user.emailVerified && cred.user.providerData[0]?.providerId === 'password') {
        setError("Please verify your email address before signing in. Check your inbox for a verification link.");
        setNeedsVerification(true);
        await signOut(auth);
        return;
      }

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

  async function handleForgotPassword(e) {
    e.preventDefault();
    if (!resetEmail) {
      setError("Please enter your email address.");
      return;
    }
    
    setResetLoading(true);
    setError("");
    setSuccess("");
    
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setSuccess("Password reset email sent! Check your inbox for instructions.");
      setShowForgotPassword(false);
      setResetEmail("");
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setResetLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!email) {
      setError("Please enter your email address first.");
      return;
    }

    setVerificationLoading(true);
    setError("");
    setSuccess("");

    try {
      // Sign in temporarily to get the user object
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(cred.user);
      await signOut(auth);
      setSuccess("Verification email sent! Check your inbox.");
      setNeedsVerification(false);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setVerificationLoading(false);
    }
  }

  if (showForgotPassword) {
    return (
      <Card className="max-w-md w-full">
        <CardHeader title="Reset Password" subtitle="Enter your email to receive reset instructions" />
        <CardBody>
          {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
          {success && <div className="mb-3 text-sm text-green-700">{success}</div>}
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <Input 
              label="Email" 
              type="email" 
              value={resetEmail} 
              onChange={(e) => setResetEmail(e.target.value)} 
              required 
              autoComplete="email"
              placeholder="Enter your email address"
            />
            <div className="flex items-center justify-between gap-3">
              <Button type="submit" disabled={resetLoading}>
                {resetLoading ? "Sending…" : "Send Reset Email"}
              </Button>
              <button 
                type="button" 
                onClick={() => {
                  setShowForgotPassword(false);
                  setError("");
                  setSuccess("");
                  setResetEmail("");
                }} 
                className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        </CardBody>
      </Card>
    );
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
        
        {success && <div className="mb-3 text-sm text-green-700">{success}</div>}

        {needsVerification && (
          <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="text-sm text-yellow-800 mb-2">
              Need to verify your email? We can send you another verification email.
            </div>
            <Button
              onClick={handleResendVerification}
              disabled={verificationLoading}
              className="text-xs bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1"
            >
              {verificationLoading ? "Sending…" : "Resend Verification Email"}
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required autoComplete="email" />
          <Input label="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required autoComplete="current-password" />
          
          <div className="flex items-center justify-between">
            <Button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
            <div className="flex flex-col items-end gap-1">
              <button 
                type="button" 
                onClick={() => {
                  setShowForgotPassword(true);
                  setError("");
                  setSuccess("");
                  setResetEmail(email);
                }} 
                className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline"
              >
                Forgot password?
              </button>
              <button type="button" onClick={onSwitch} className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline">
                Create an account
              </button>
            </div>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export default LoginForm;