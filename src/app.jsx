// --- Imports (keep at very top) ---
import React, { useEffect, useMemo, useState, useCallback } from "react";
import Heatmap from "./Heatmap.jsx";
import * as QR from "qrcode";
import { mint } from "./lib/api.js";
import PosterWithQR from "./PosterWithQR.jsx";
import { initializeApp, getApps } from "firebase/app";
import UnapprovedUsersList from "./UnapprovedUsersList.jsx";
import InsightsAI from "./InsightsAI.jsx";
import GroupMeSetup from "./GroupMeSetup.jsx";
// import WorkvivoSetup from "./WorkvivoSetup.jsx"; // Temporarily disabled
import ContactUs from "./ContactUs.jsx";
import TicketQueue from "./TicketQueue.jsx";
import MyTickets from "./MyTickets.jsx";
import Setup from "./Setup.jsx";
import BlockedIPsManager from "./BlockedIPsManager.jsx";
import AdminPanel from "./components/admin/AdminPanel.jsx";
import Button from "./Button.jsx"; // must export default Button in Button.jsx
import { ThemeProvider, useTheme } from "./ThemeContext.jsx";
import QRLockIcon from "./QRLockIcon.jsx";
import TermsOfService from "./TermsOfService.jsx";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

// -----------------------------
// 🧯 Error Boundary
// -----------------------------
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-red-50 p-8">
          <h1 className="text-2xl font-bold text-red-700 mb-2">Something went wrong.</h1>
          <pre className="bg-white p-4 rounded-xl border border-red-200 text-red-800 text-sm overflow-auto max-w-xl w-full">
            {this.state.error && this.state.error.toString()}
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// -----------------------------
// Firebase Setup
// -----------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCbpXuSt3UHAWtAfiKbVx621vwpL5cKnkA",
  authDomain: "qrwebaccdb.firebaseapp.com",
  projectId: "qrwebaccdb",
  storageBucket: "qrwebaccdb.appspot.com",
  messagingSenderId: "611687644130",
  appId: "1:611687644130:web:3f4011c00e1baae1e397bb",
  measurementId: "G-JXF9XEFCD4",
};

export function useFirebase() {
  const app = useMemo(
    () => (getApps().length ? getApps()[0] : initializeApp(firebaseConfig)),
    []
  );
  const auth = useMemo(() => getAuth(app), [app]);
  const db = useMemo(() => getFirestore(app), [app]);
  return { app, auth, db };
}

// -----------------------------
// 🧱 UI Primitives (Tailwind)
// -----------------------------
function Card({ children, className = "" }) {
  return (
    <div className={`bg-secondary rounded-2xl shadow-sm ring-1 ring-black/5 border border-themed ${className}`}>
      {children}
    </div>
  );
}
function CardHeader({ title, subtitle }) {
  return (
    <div className="p-6 border-b border-themed">
      <h2 className="text-xl font-semibold tracking-tight text-primary">{title}</h2>
      {subtitle ? <p className="text-sm text-muted mt-1">{subtitle}</p> : null}
    </div>
  );
}
function CardBody({ children, className = "" }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}
function Input({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  name,
  autoComplete,
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-primary">{label}</span>
      <input
        className="mt-1 w-full rounded-xl border-themed bg-primary text-primary focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 border px-3 py-2"
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
      />
    </label>
  );
}
function Tabs({ tabs, current, onChange }) {
  return (
    <div className="flex gap-1 sm:gap-2 flex-wrap">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm rounded-xl border ${
            current === t
              ? "bg-indigo-600 text-white border-indigo-500"
              : "bg-tertiary text-primary border-themed hover:bg-secondary"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
function Banner({ children }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-800 text-sm">
      {children}
    </div>
  );
}

// -----------------------------
// 🧾 Generate QR Codes
// -----------------------------
function GenerateQR() {
  const [store, setStore] = useState("");
  const [area, setArea] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const posterRef = React.useRef();

  const ready = /^\d{3,6}$/.test(store.trim()) && !!area.trim() && !error && !busy;

  function validate() {
    setError("");
    const s = store.trim();
    const a = area.trim();
    if (!s || !a) return setError("Please enter both Store number and Area.");
    if (!/^\d{3,6}$/.test(s)) return setError("Store number must be 3–6 digits.");
    if (!/^[a-zA-Z0-9\s._-]{1,50}$/.test(a)) {
      return setError("Area allows letters, numbers, space, . _ - (max 50 chars).");
    }
    return { s, a };
  }

  async function generate() {
    setError("");
    try {
      const ok = validate();
      if (!ok) return;
      setBusy(true);
      setQrDataUrl("");
      const data = await mint(store.trim(), area.trim());
      const shortUrl = `${window.location.origin}/s?t=${encodeURIComponent(data.token)}`;
      const dataUrl = await QR.toDataURL(shortUrl, {
        width: 600,
        errorCorrectionLevel: "L",
        margin: 0,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      setQrDataUrl(dataUrl);
    } catch (e) {
      console.error(e);
      setQrDataUrl("");
      setError(e.message || "Could not generate QR. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPng() {
    if (!qrDataUrl) return;
    const DPI = 300;
    const width = Math.round(3.5 * DPI); // 1050px
    const height = Math.round(5 * DPI);  // 1500px
    const qrSize = Math.round(1.55 * DPI); // 465px
    const qrBottom = Math.round(0.20 * DPI); // 60px

    const posterImg = new window.Image();
    posterImg.src = "/poster-template.png";
    await new Promise((resolve) => { posterImg.onload = resolve; });

    const qrImg = new window.Image();
    qrImg.src = qrDataUrl;
    await new Promise((resolve) => { qrImg.onload = resolve; });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(posterImg, 0, 0, width, height);
    ctx.drawImage(qrImg, (width - qrSize) / 2, height - qrBottom - qrSize, qrSize, qrSize);

    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `QR_${store}_${area}.png`;
    a.click();
  }

  function handlePrintPoster() {
    if (posterRef.current && posterRef.current.print) {
      posterRef.current.print();
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-secondary rounded-2xl border border-themed p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm text-primary">Store number</span>
            <input
              className="mt-1 w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2
                         placeholder:text-muted focus:border-indigo-500 focus:outline-none
                         focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. 1458"
              value={store}
              onChange={(e) => setStore(e.target.value)}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-sm text-primary">Area</span>
            <input
              className="mt-1 w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2
                         placeholder:text-muted focus:border-indigo-500 focus:outline-none
                         focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Electronics"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
          </label>
        </div>

        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <Button onClick={generate} disabled={!ready} className="w-full sm:w-auto">
            {busy ? "Generating…" : "Generate QR"}
          </Button>

          <button
            onClick={downloadPng}
            disabled={!qrDataUrl}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold
                       bg-tertiary text-primary hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            Download PNG
          </button>

          {qrDataUrl && (
            <Button onClick={handlePrintPoster} className="w-full sm:w-auto">Print</Button>
          )}
        </div>
      </div>

      <div className="bg-secondary rounded-2xl border border-themed p-4 sm:p-6 grid place-items-center">
        {qrDataUrl ? (
          <PosterWithQR ref={posterRef} qrDataUrl={qrDataUrl} />
        ) : (
          <div className="w-48 h-48 sm:w-64 sm:h-64 grid place-items-center text-muted border border-themed rounded-xl">
            QR preview
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------
// Auth Views
// -----------------------------
function SignInForm({ onSwitch }) {
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

      // Verify user doc exists and is approved
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

function RegisterForm({ onSwitch }) {
  const { auth } = useFirebase();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    storeNumber: "",
    jobTitle: "",
    phone: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const passwordOk = validatePassword(form.password);
  const passwordsMatch = form.password && form.password === form.confirm;

  function updateField(k) {
    return (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!passwordOk) return setError("Password must be at least 8 chars, include a letter and a number.");
    if (!passwordsMatch) return setError("Passwords do not match.");
    if (!/^[0-9]{3,6}$/.test(form.storeNumber)) return setError("Store number should be 3–6 digits.");
    try {
      setLoading(true);
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await updateProfile(cred.user, { displayName: `${form.firstName} ${form.lastName}`.trim() });
      await setDoc(doc(getFirestore(), "users", cred.user.uid), {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        storeNumber: form.storeNumber.trim(),
        jobTitle: form.jobTitle.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        createdAt: serverTimestamp(),
        emailVerified: cred.user.emailVerified || false,
        approved: false,
      });
      await sendEmailVerification(cred.user);
      setSuccess("Account created. Check your inbox to verify your email before signing in.");
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-xl w-full">
      <CardHeader title="Create your account" subtitle="Register to manage QR assistance alerts" />
      <CardBody>
        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
        {success && <div className="mb-3 text-sm text-green-700">{success}</div>}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Input label="First name" value={form.firstName} onChange={updateField("firstName")} required autoComplete="given-name" />
          <Input label="Last name" value={form.lastName} onChange={updateField("lastName")} required autoComplete="family-name" />
          <Input label="Store number" value={form.storeNumber} onChange={updateField("storeNumber")} required />
          <Input label="Job title" value={form.jobTitle} onChange={updateField("jobTitle")} required />
          <Input label="Phone number" value={form.phone} onChange={updateField("phone")} required autoComplete="tel" />
          <Input label="Email address" type="email" value={form.email} onChange={updateField("email")} required autoComplete="email" />
          <Input label="Password" type="password" value={form.password} onChange={updateField("password")} required autoComplete="new-password" />
          <Input label="Confirm password" type="password" value={form.confirm} onChange={updateField("confirm")} required autoComplete="new-password" />

          <div className="sm:col-span-2 space-y-2 text-sm text-secondary">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${passwordOk ? "bg-emerald-500" : "bg-gray-600"}`} />
              <span>At least 8 chars, with a letter and a number</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${passwordsMatch ? "bg-emerald-500" : "bg-gray-600"}`} />
              <span>Passwords match</span>
            </div>
          </div>

          <div className="sm:col-span-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mt-2">
            <Button type="submit" disabled={loading}>{loading ? "Creating…" : "Create account"}</Button>
            <button type="button" onClick={onSwitch} className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline">Have an account? Sign in</button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

// -----------------------------
// App Shell w/ Tabs (single definition)
// -----------------------------
function Settings({ user }) {
  const { isDark, toggleTheme } = useTheme();
  const { db } = useFirebase();
  const [userDoc, setUserDoc] = useState(null);
  const [pendingChanges, setPendingChanges] = useState({});
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    storeNumber: '',
    jobTitle: ''
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [showChangeForm, setShowChangeForm] = useState(false);

  useEffect(() => {
    async function loadUserData() {
      try {
        const { getDoc, doc } = await import("firebase/firestore");
        const userDocRef = doc(db, "users", user.uid);
        const snap = await getDoc(userDocRef);
        
        if (snap.exists()) {
          const userData = snap.data();
          setUserDoc(userData);
          setFormData({
            firstName: userData.firstName || '',
            lastName: userData.lastName || '',
            phone: userData.phone || '',
            storeNumber: userData.storeNumber || '',
            jobTitle: userData.jobTitle || ''
          });
          setPendingChanges(userData.pendingChanges || {});
        }
      } catch (err) {
        console.error("Error loading user data:", err);
      } finally {
        setLoading(false);
      }
    }
    
    if (user?.uid) loadUserData();
  }, [user?.uid, db]);

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmitChanges = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');

    try {
      const { updateDoc, doc, serverTimestamp } = await import("firebase/firestore");
      
      // Find what fields have changed
      const changes = {};
      Object.keys(formData).forEach(field => {
        if (formData[field] !== (userDoc[field] || '')) {
          changes[field] = formData[field];
        }
      });

      if (Object.keys(changes).length === 0) {
        setMessage('No changes to submit.');
        setSubmitting(false);
        return;
      }

      // Save pending changes
      await updateDoc(doc(db, "users", user.uid), {
        pendingChanges: {
          ...changes,
          requestedAt: serverTimestamp(),
          status: 'pending'
        }
      });

      setPendingChanges({
        ...changes,
        requestedAt: new Date(),
        status: 'pending'
      });

      setMessage('Changes submitted for admin approval.');
      setShowChangeForm(false);
    } catch (err) {
      setMessage('Error submitting changes: ' + (err.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="animate-pulse text-muted">Loading settings...</div>;

  return (
    <div className="space-y-6">
      {/* Theme Settings */}
      <div className="bg-secondary rounded-xl p-4 border border-themed">
        <h3 className="text-lg font-semibold text-primary mb-3">Appearance</h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-primary">Theme</div>
            <div className="text-sm text-muted">Choose between light and dark mode</div>
          </div>
          <button
            onClick={toggleTheme}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
              isDark ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isDark ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <div className="mt-2 text-xs text-muted">
          Current: {isDark ? 'Dark' : 'Light'} mode
        </div>
      </div>

      {/* Account Information */}
      <div className="bg-secondary rounded-xl p-4 border border-themed">
        <h3 className="text-lg font-semibold text-primary mb-3">Account Information</h3>
        
        {/* Current Info */}
        <div className="mb-4 p-3 bg-tertiary rounded border border-themed">
          <div className="text-sm font-medium text-primary mb-2">Current Information</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted">Email:</span> <span className="text-primary">{user.email}</span></div>
            <div><span className="text-muted">Name:</span> <span className="text-primary">{userDoc?.firstName} {userDoc?.lastName}</span></div>
            <div><span className="text-muted">Phone:</span> <span className="text-primary">{userDoc?.phone || 'Not set'}</span></div>
            <div><span className="text-muted">Store:</span> <span className="text-primary">{userDoc?.storeNumber || 'Not set'}</span></div>
            <div><span className="text-muted">Job Title:</span> <span className="text-primary">{userDoc?.jobTitle || 'Not set'}</span></div>
          </div>
        </div>

        {/* Pending Changes Status */}
        {pendingChanges.status === 'pending' && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-amber-800">
            <div className="text-sm font-medium mb-1">Changes Pending Approval</div>
            <div className="text-xs">
              Submitted: {pendingChanges.requestedAt?.toLocaleDateString?.() || 'Recently'}
            </div>
            <div className="mt-2 text-xs">
              {Object.entries(pendingChanges).filter(([key]) => key !== 'requestedAt' && key !== 'status').map(([field, value]) => (
                <div key={field}><span className="capitalize">{field}:</span> {value}</div>
              ))}
            </div>
          </div>
        )}

        {/* Request Changes Button/Form */}
        {!showChangeForm ? (
          <div className="text-center">
            <Button 
              onClick={() => setShowChangeForm(true)}
              disabled={pendingChanges.status === 'pending'}
              className="w-full sm:w-auto"
            >
              Request Account Changes
            </Button>
            {pendingChanges.status === 'pending' && (
              <div className="text-xs text-muted mt-2">
                Changes are pending admin approval
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmitChanges} className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-primary">Request Account Changes</div>
              <button
                type="button"
                onClick={() => { setShowChangeForm(false); setMessage(''); }}
                className="text-xs text-muted hover:text-primary"
              >
                Cancel
              </button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="First Name"
                value={formData.firstName}
                onChange={(e) => handleFieldChange('firstName', e.target.value)}
              />
              <Input
                label="Last Name"
                value={formData.lastName}
                onChange={(e) => handleFieldChange('lastName', e.target.value)}
              />
              <Input
                label="Phone"
                value={formData.phone}
                onChange={(e) => handleFieldChange('phone', e.target.value)}
              />
              <Input
                label="Store Number"
                value={formData.storeNumber}
                onChange={(e) => handleFieldChange('storeNumber', e.target.value)}
              />
            </div>
            
            <Input
              label="Job Title"
              value={formData.jobTitle}
              onChange={(e) => handleFieldChange('jobTitle', e.target.value)}
            />

            {message && (
              <div className={`text-sm p-2 rounded ${
                message.includes('Error') ? 'bg-red-100 text-red-700 border border-red-200' : 
                'bg-green-100 text-green-700 border border-green-200'
              }`}>
                {message}
              </div>
            )}

            <div className="flex gap-2">
              <Button 
                type="submit" 
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {submitting ? 'Submitting...' : 'Submit Changes for Approval'}
              </Button>
              <Button 
                type="button"
                onClick={() => { setShowChangeForm(false); setMessage(''); }}
                className="bg-tertiary text-primary hover:bg-secondary"
              >
                Cancel
              </Button>
            </div>
            
            <div className="text-xs text-muted">
              Changes require admin approval before taking effect.
            </div>
          </form>
        )}

        {message && !showChangeForm && (
          <div className={`text-sm p-2 rounded mt-3 ${
            message.includes('Error') ? 'bg-red-100 text-red-700 border border-red-200' : 
            'bg-green-100 text-green-700 border border-green-200'
          }`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

const Dashboard = React.memo(function Dashboard({ userDoc, isAdmin, selectedStores = [] }) {
  const { db } = useFirebase();
  const [stats, setStats] = useState({
    uniqueAreas: 0,
    totalRequests: 0,
    avgResponseTime: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Run when we have store selection
    
    let mounted = true;
    
    async function fetchDashboardStats() {
      try {
        // Get start and end of today (local time)
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        
        // Use cached scan data for better performance
        const allScans = await fetchScansWithCache(db);
        
        // Filter to today's scans
        let todayLogs = allScans.filter(scan => {
          if (!scan.timestamp) return false;
          const scanTime = scan.timestamp.toDate ? scan.timestamp.toDate() : new Date(scan.timestamp);
          return scanTime >= startOfDay && scanTime < endOfDay;
        });
        
        // Filter by selected stores
        if (selectedStores.length > 0) {
          const normalizedSelected = selectedStores.map(store => String(store).replace(/^0+/, '') || '0');
          todayLogs = todayLogs.filter(scan => {
            if (!scan.storeNumber) return false;
            const normalizedScanStore = String(scan.storeNumber).replace(/^0+/, '') || '0';
            return normalizedSelected.includes(normalizedScanStore);
          });
        }
        
        if (!mounted) return;
        
        // Calculate unique areas scanned today (use areaDescription from scans)
        const uniqueAreas = new Set(todayLogs.map(scan => (scan.areaDescription || scan.area)?.toLowerCase()?.trim()).filter(Boolean)).size;
        
        // Total requests today
        const totalRequests = todayLogs.length;
        
        // Calculate average response time for claimed scans in business hours (6:00 AM - 10:59 PM)
        const respondedScans = todayLogs.filter(scan => {
          if (!scan.claimedAt || !scan.timestamp) return false;
          
          // Check if response was within business hours (6:00 AM - 10:59 PM)
          const responseTime = scan.claimedAt.toDate ? scan.claimedAt.toDate() : new Date(scan.claimedAt);
          const hour = responseTime.getHours();
          return hour >= 6 && hour <= 22; // 6:00 AM (6) through 10:59 PM (22)
        });
        
        let avgResponseTime = 0;
        
        if (respondedScans.length > 0) {
          const totalResponseTime = respondedScans.reduce((sum, scan) => {
            const requestTime = scan.timestamp.toDate ? scan.timestamp.toDate() : new Date(scan.timestamp);
            const responseTime = scan.claimedAt.toDate ? scan.claimedAt.toDate() : new Date(scan.claimedAt);
            const diff = responseTime - requestTime;
            return sum + (diff / 60000); // Convert to minutes
          }, 0);
          avgResponseTime = Math.round(totalResponseTime / respondedScans.length);
        }
        
        setStats({
          uniqueAreas,
          totalRequests,
          avgResponseTime
        });
        
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        if (mounted) {
          setStats({ uniqueAreas: 0, totalRequests: 0, avgResponseTime: 0 });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchDashboardStats();
    return () => { mounted = false; };
  }, [db, selectedStores]);

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="rounded-xl border border-themed bg-tertiary p-4">
        <div className="text-sm text-muted">Areas scanned today</div>
        <div className="mt-2 text-2xl font-semibold text-primary">
          {loading ? "—" : stats.uniqueAreas}
        </div>
        <div className="text-xs text-muted mt-1">unique locations</div>
      </div>
      <div className="rounded-xl border border-themed bg-tertiary p-4">
        <div className="text-sm text-muted">Requests today</div>
        <div className="mt-2 text-2xl font-semibold text-primary">
          {loading ? "—" : stats.totalRequests}
        </div>
        <div className="text-xs text-muted mt-1">total scans</div>
      </div>
      <div className="rounded-xl border border-themed bg-tertiary p-4">
        <div className="text-sm text-muted">Avg. response time</div>
        <div className="mt-2 text-2xl font-semibold text-primary">
          {loading ? "—" : stats.avgResponseTime > 0 ? `${stats.avgResponseTime}m` : "—"}
        </div>
        <div className="text-xs text-muted mt-1">6am-10:59pm only</div>
      </div>
    </div>
  );
});

// Top Responders component
const TopResponders = React.memo(function TopResponders({ db, userDoc, isAdmin, timePeriod = 'weekly', selectedStores = [] }) {
  const [responders, setResponders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const { getDocs, collection, query, where, orderBy } = await import("firebase/firestore");
        
        // Calculate date range based on selected period
        const now = new Date();
        let startDate;
        
        switch (timePeriod) {
          case 'daily':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'weekly':
            const dayOfWeek = now.getDay();
            startDate = new Date(now.getTime() - (dayOfWeek * 24 * 60 * 60 * 1000));
            startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
            break;
          case 'monthly':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'quarterly':
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            break;
          case 'yearly':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
          case 'alltime':
            startDate = new Date(2020, 0, 1); // Far back date
            break;
          default:
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }
        
        // Query scans from the scans collection
        const scansSnap = await getDocs(collection(db, "scans"));
        const scans = scansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log('TopResponders: Found', scans.length, 'total scans');
        console.log('TopResponders: Time period:', timePeriod, 'Start date:', startDate);
        
        // Filter by selected stores
        let accessibleScans = scans;
        if (selectedStores.length > 0) {
          const normalizedSelected = selectedStores.map(store => String(store).replace(/^0+/, '') || '0');
          accessibleScans = scans.filter(scan => {
            if (!scan.storeNumber) return false;
            const normalizedScanStore = String(scan.storeNumber).replace(/^0+/, '') || '0';
            return normalizedSelected.includes(normalizedScanStore);
          });
        }
        
        // Filter to claimed scans within time period and business hours
        const filteredScans = accessibleScans.filter(scan => {
          // Must have claimedByName
          if (!scan.claimedByName) return false;
          
          // Get the claim time
          let claimTime = null;
          if (scan.claimedAt) {
            claimTime = scan.claimedAt.toDate ? scan.claimedAt.toDate() : new Date(scan.claimedAt);
          } else if (scan.timestamp) {
            // Fallback to scan timestamp if no claimedAt
            claimTime = scan.timestamp.toDate ? scan.timestamp.toDate() : new Date(scan.timestamp);
          }
          
          if (!claimTime || isNaN(claimTime)) return false;
          
          const hour = claimTime.getHours();
          
          // Filter by business hours (6 AM - 10:59 PM)
          if (hour < 6 || hour > 22) return false;
          
          // Filter by time period
          if (timePeriod !== 'alltime' && claimTime < startDate) return false;
          
          return true;
        });
        
        console.log('TopResponders: After filtering:', filteredScans.length, 'claimed scans');
        // Aggregate data by responder name
        const responderStats = {};
        
        filteredScans.forEach(scan => {
          const name = scan.claimedByName;
          if (!name) return;
          
          if (!responderStats[name]) {
            responderStats[name] = {
              name,
              totalResponses: 0,
              totalResponseTime: 0,
              fastestResponse: Infinity,
              slowestResponse: 0
            };
          }
          
          // Calculate response time in seconds if we have both timestamps
          let responseTimeSeconds = 0;
          if (scan.claimedAt && scan.timestamp) {
            const claimedTime = scan.claimedAt.toDate ? scan.claimedAt.toDate() : new Date(scan.claimedAt);
            const scanTime = scan.timestamp.toDate ? scan.timestamp.toDate() : new Date(scan.timestamp);
            responseTimeSeconds = Math.max(0, (claimedTime - scanTime) / 1000);
          }
          
          responderStats[name].totalResponses++;
          if (responseTimeSeconds > 0) {
            responderStats[name].totalResponseTime += responseTimeSeconds;
            responderStats[name].fastestResponse = Math.min(responderStats[name].fastestResponse, responseTimeSeconds);
            responderStats[name].slowestResponse = Math.max(responderStats[name].slowestResponse, responseTimeSeconds);
          }
        });
        
        // Calculate averages and sort by total responses
        const sortedResponders = Object.values(responderStats)
          .map(responder => {
            const avgSeconds = responder.totalResponses > 0 ? responder.totalResponseTime / responder.totalResponses : 0;
            return {
              ...responder,
              avgResponseTime: Math.round(avgSeconds / 60), // Convert to minutes
              fastestResponseMin: responder.fastestResponse === Infinity ? 0 : Math.round(responder.fastestResponse / 60),
              slowestResponseMin: Math.round(responder.slowestResponse / 60)
            };
          })
          .sort((a, b) => b.totalResponses - a.totalResponses)
          .slice(0, 5);
        
        console.log('TopResponders: Final sorted responders:', sortedResponders);
        
        if (mounted) {
          setResponders(sortedResponders);
        }
      } catch (err) {
        console.error("Error loading responders:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [db, timePeriod, selectedStores]);

  const getRankEmoji = (index) => {
    const emojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    return emojis[index] || `${index + 1}️⃣`;
  };

  const getPeriodLabel = () => {
    switch (timePeriod) {
      case 'daily': return 'Today';
      case 'weekly': return 'This Week';  
      case 'monthly': return 'This Month';
      case 'quarterly': return 'This Quarter';
      case 'yearly': return 'This Year';
      case 'alltime': return 'All Time';
      default: return 'Today';
    }
  };

  return (
    <div className="rounded-xl border border-themed bg-tertiary p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-primary">Top Responders</h3>
        <select 
          value={timePeriod}
          onChange={(e) => setTimePeriod(e.target.value)}
          className="px-3 py-1 text-sm border border-themed bg-secondary rounded"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="alltime">All Time</option>
        </select>
      </div>
      
      <div className="text-sm text-muted mb-3">{getPeriodLabel()} • Business Hours Only</div>
      
      {loading ? (
        <div className="text-center py-4 text-muted">Loading...</div>
      ) : responders.length === 0 ? (
        <div className="text-center py-4 text-muted">No responses yet for this period</div>
      ) : (
        <div className="space-y-3">
          {responders.map((responder, index) => (
            <div key={responder.name} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div className="flex items-center space-x-3">
                <span className="text-lg">{getRankEmoji(index)}</span>
                <div>
                  <div className="font-medium text-primary">{responder.name}</div>
                  <div className="text-xs text-muted">
                    {responder.totalResponses} response{responder.totalResponses !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-primary">
                  {responder.avgResponseTime}m avg
                </div>
                <div className="text-xs text-muted">
                  {responder.fastestResponseMin}m - {responder.slowestResponseMin}m
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// Admin pending changes management
function PendingChangesList({ db }) {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { getDocs, collection, query, where } = await import("firebase/firestore");
        const q = query(collection(db, "users"), where("pendingChanges.status", "==", "pending"));
        const snap = await getDocs(q);
        if (mounted) {
          setPendingUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        if (mounted) setError("Error loading pending changes: " + (err.message || err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [db]);

  async function handleApproveChanges(userId, pendingChanges) {
    try {
      const { updateDoc, doc } = await import("firebase/firestore");
      
      // Apply the pending changes to the user document
      const updates = { ...pendingChanges };
      delete updates.requestedAt;
      delete updates.status;
      
      // Clear pending changes
      updates.pendingChanges = null;
      
      await updateDoc(doc(db, "users", userId), updates);
      setPendingUsers(users => users.filter(u => u.id !== userId));
    } catch (err) {
      alert("Error approving changes: " + (err.message || err));
    }
  }

  async function handleRejectChanges(userId) {
    try {
      const { updateDoc, doc } = await import("firebase/firestore");
      await updateDoc(doc(db, "users", userId), {
        pendingChanges: null
      });
      setPendingUsers(users => users.filter(u => u.id !== userId));
    } catch (err) {
      alert("Error rejecting changes: " + (err.message || err));
    }
  }

  if (loading) return <div className="mb-4 text-sm text-muted">Loading pending changes…</div>;
  if (error) return <div className="mb-4 text-sm text-red-600">{error}</div>;
  if (!pendingUsers.length) return <div className="mb-4 text-sm text-muted">No pending profile changes.</div>;

  return (
    <div className="mb-6">
      <div className="font-semibold mb-2 text-primary">Pending Profile Changes</div>
      <div className="space-y-4">
        {pendingUsers.map(user => (
          <div key={user.id} className="border border-themed rounded-xl p-4 bg-secondary">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-medium text-primary">{user.firstName} {user.lastName}</div>
                <div className="text-sm text-muted">{user.email}</div>
                <div className="text-xs text-muted">
                  Requested: {user.pendingChanges?.requestedAt?.toDate?.()?.toLocaleDateString() || 'Recently'}
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => handleApproveChanges(user.id, user.pendingChanges)}
                  className="bg-green-500 hover:bg-green-600"
                >
                  Approve
                </Button>
                <Button 
                  onClick={() => handleRejectChanges(user.id)}
                  className="bg-red-500 hover:bg-red-600"
                >
                  Reject
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {Object.entries(user.pendingChanges || {}).filter(([key]) => key !== 'requestedAt' && key !== 'status').map(([field, newValue]) => (
                <div key={field} className="border border-themed rounded p-2 bg-tertiary">
                  <div className="font-medium text-primary capitalize">{field.replace(/([A-Z])/g, ' $1')}</div>
                  <div className="text-red-600">
                    <span className="text-xs">Current:</span> {user[field] || 'Not set'}
                  </div>
                  <div className="text-green-600">
                    <span className="text-xs">Requested:</span> {newValue}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Admin user search (standalone)
function UserStatusSearch({ db }) {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    if (!email.trim()) return setError("Enter an email address.");
    setLoading(true);
    try {
      const { getDocs, collection, query, where } = await import("firebase/firestore");
      const q = query(collection(db, "users"), where("email", "==", email.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) {
        setError("No user found with that email.");
      } else {
        setResult(snap.docs[0].data());
      }
    } catch (err) {
      setError("Error searching: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-secondary rounded-xl p-4 border border-themed max-w-lg">
      <form onSubmit={handleSearch} className="flex gap-2 mb-2">
        <input
          type="email"
          className="flex-1 rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm"
          placeholder="Search user by email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </Button>
      </form>
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
      {result && (
        <div className="text-sm bg-tertiary rounded-xl border border-themed p-3 text-primary">
          <div><strong>Name:</strong> {result.firstName} {result.lastName}</div>
          <div><strong>Email:</strong> {result.email}</div>
          <div><strong>Store:</strong> {result.storeNumber}</div>
          <div><strong>Job Title:</strong> {result.jobTitle}</div>
          <div><strong>Phone:</strong> {result.phone}</div>
          <div><strong>Email Verified:</strong> {result.emailVerified ? "Yes" : "No"}</div>
          <div><strong>Approved:</strong> {result.approved ? "Yes" : "No"}</div>
        </div>
      )}
    </div>
  );
}

function Shell({ user, onSignOut }) {
  const { db } = useFirebase();
  const isAdmin = user?.email === "sinaptick@gmail.com";
  const tabs = isAdmin
    ? ["Dashboard", "Insights", "Generate QR", "Settings", "Admin", "Setup"]
    : ["Dashboard", "Insights", "Generate QR", "Settings", "Setup"];
  const [active, setActive] = useState("Dashboard");
  const [showContactUs, setShowContactUs] = useState(false);
  const [currentAdminView, setCurrentAdminView] = useState("overview");
  const [currentSettingsView, setCurrentSettingsView] = useState("account");

  // Approval gate
  const [userDoc, setUserDoc] = useState(null);
  useEffect(() => {
    if (!user?.uid) return;
    let mounted = true;
    (async () => {
      const { getDoc, doc } = await import("firebase/firestore");
      const snap = await getDoc(doc(db, "users", user.uid));
      if (mounted) setUserDoc(snap.exists() ? snap.data() : null);
    })();
    return () => { mounted = false; };
  }, [user, db]);

  // Insights filters + data
  const [stores, setStores] = useState([]);
  const [selectedStores, setSelectedStores] = useState([]);

  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState([]);

  const [areas, setAreas] = useState([]);
  const [selectedAreas, setSelectedAreas] = useState([]);

  const [showStores, setShowStores] = useState(false);
  const [showWeeks, setShowWeeks] = useState(false);
  const [showAreas, setShowAreas] = useState(false);

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Load logs + build options
  useEffect(() => {
    if (active !== "Insights") return;
    let mounted = true;
    setLogsLoading(true);
    (async () => {
      try {
        console.log("Loading logs for insights...");
        const { getDocs, collection } = await import("firebase/firestore");
        const logsSnap = await getDocs(collection(db, "logs"));
        console.log("Logs query returned:", logsSnap.docs.length, "documents");
        const logsArr = [];
        const storeSet = new Set();
        const weekMap = new Map();
        const areaSet = new Set();
        const week0 = new Date(2025, 1, 1);

        logsSnap.forEach((d) => {
          const data = d.data();
          logsArr.push(data);
          if (data?.store) storeSet.add(String(data.store));
          if (data?.area) areaSet.add(data.area);

          let ts = data?.ts;
          let dateObj = null;
          try {
            if (ts && typeof ts.toDate === "function") dateObj = ts.toDate();
            else if (ts && ts.seconds) dateObj = new Date(ts.seconds * 1000);
            else if (typeof ts === "string" || typeof ts === "number") dateObj = new Date(ts);

            if (dateObj && !isNaN(dateObj)) {
              const diffDays = Math.floor((dateObj - week0) / (1000 * 60 * 60 * 24));
              if (diffDays >= 0) {
                const weekNum = Math.floor(diffDays / 7) + 1;
                const weekStart = new Date(week0.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000);
                const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
                const label = `Week ${weekNum} (${weekStart.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}–${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })})`;
                weekMap.set(weekNum, label);
              }
            }
          } catch {}
        });

        if (mounted) {
          setLogs(logsArr);
          const sortedStores = Array.from(storeSet).sort();
          setStores(sortedStores);
          
          // Auto-select user's store if it exists in the available stores and no stores are currently selected
          if (userDoc?.storeNumber && sortedStores.includes(userDoc.storeNumber) && selectedStores.length === 0) {
            setSelectedStores([userDoc.storeNumber]);
          }
          
          setWeeks(
            Array.from(weekMap.values()).sort((a, b) => {
              const wa = parseInt(a.match(/Week (\d+)/)?.[1] || "0", 10);
              const wb = parseInt(b.match(/Week (\d+)/)?.[1] || "0", 10);
              return wa - wb;
            })
          );
          setAreas(Array.from(areaSet).sort());
        }
      } finally {
        if (mounted) setLogsLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [active, db]);

  // Derived filtered options
  const filteredAreas = useMemo(() => {
    if (!selectedStores.length && !selectedWeek.length) return areas;
    let filtered = logs;
    if (selectedStores.length) filtered = filtered.filter(l => selectedStores.includes(String(l.store)));
    if (selectedWeek.length) {
      const week0 = new Date(2025, 1, 1);
      filtered = filtered.filter(l => {
        let ts = l.ts;
        let d = null;
        if (ts?.toDate) d = ts.toDate();
        else if (ts?.seconds) d = new Date(ts.seconds * 1000);
        else if (typeof ts === "string" || typeof ts === "number") d = new Date(ts);
        if (!d || isNaN(d)) return false;
        const diffDays = Math.floor((d - week0) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return false;
        const weekNum = Math.floor(diffDays / 7) + 1;
        const weekStart = new Date(week0.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
        const label = `Week ${weekNum} (${weekStart.toLocaleDateString(undefined,{month:"short",day:"numeric"})}–${weekEnd.toLocaleDateString(undefined,{month:"short",day:"numeric"})})`;
        return selectedWeek.includes(label);
      });
    }
    return Array.from(new Set(filtered.map(l => l.area))).sort();
  }, [areas, logs, selectedStores, selectedWeek]);

  const filteredWeeks = useMemo(() => {
    if (!selectedStores.length && !selectedAreas.length) return weeks;
    let filtered = logs;
    if (selectedStores.length) filtered = filtered.filter(l => selectedStores.includes(String(l.store)));
    if (selectedAreas.length) filtered = filtered.filter(l => selectedAreas.includes(l.area));

    const week0 = new Date(2025, 1, 1);
    const weekMap = new Map();
    filtered.forEach(l => {
      let ts = l.ts;
      let d = null;
      if (ts?.toDate) d = ts.toDate();
      else if (ts?.seconds) d = new Date(ts.seconds * 1000);
      else if (typeof ts === "string" || typeof ts === "number") d = new Date(ts);
      if (!d || isNaN(d)) return;
      const diffDays = Math.floor((d - week0) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return;
      const weekNum = Math.floor(diffDays / 7) + 1;
      const weekStart = new Date(week0.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
      const label = `Week ${weekNum} (${weekStart.toLocaleDateString(undefined,{month:"short",day:"numeric"})}–${weekEnd.toLocaleDateString(undefined,{month:"short",day:"numeric"})})`;
      weekMap.set(weekNum, label);
    });
    return Array.from(weekMap.values()).sort((a, b) => {
      const wa = parseInt(a.match(/Week (\d+)/)?.[1] || "0", 10);
      const wb = parseInt(b.match(/Week (\d+)/)?.[1] || "0", 10);
      return wa - wb;
    });
  }, [weeks, logs, selectedStores, selectedAreas]);

  // Keep selections valid when options shrink
  useEffect(() => {
    setSelectedAreas(prev => prev.filter(a => filteredAreas.includes(a)));
  }, [filteredAreas]);
  useEffect(() => {
    setSelectedWeek(prev => prev.filter(w => filteredWeeks.includes(w)));
  }, [filteredWeeks]);

  // Auto-select first store
  useEffect(() => {
    if (stores.length > 0) {
      setSelectedStores(prev => {
        if (!prev.length || prev.some(s => !stores.includes(s))) return [stores[0]];
        return prev;
      });
    }
  }, [stores]);

  // Build filtered logs for InsightsAI
  const filteredLogs = useMemo(() => {
    if (!logs?.length) return [];
    const week0 = new Date(2025, 1, 1);
    const labelForTs = (ts) => {
      let d = null;
      if (ts?.toDate) d = ts.toDate();
      else if (ts?.seconds) d = new Date(ts.seconds * 1000);
      else if (typeof ts === "string" || typeof ts === "number") d = new Date(ts);
      if (!d || isNaN(d)) return null;
      const diffDays = Math.floor((d - week0) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return null;
      const weekNum = Math.floor(diffDays / 7) + 1;
      const weekStart = new Date(week0.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
      return `Week ${weekNum} (${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}–${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })})`;
    };
    return logs.filter((l) => {
      // Non-admin users can only see data from their own store
      if (!isAdmin && userDoc?.storeNumber && String(l.store) !== userDoc.storeNumber) {
        return false;
      }
      
      if (selectedStores.length && !selectedStores.includes(String(l.store))) return false;
      if (selectedAreas.length && !selectedAreas.includes(l.area)) return false;
      if (selectedWeek.length) {
        const label = labelForTs(l.ts);
        if (!label || !selectedWeek.includes(label)) return false;
      }
      return true;
    });
  }, [logs, selectedStores, selectedAreas, selectedWeek, isAdmin, userDoc?.storeNumber]);

  // Gate for unapproved users
  if (userDoc && userDoc.approved === false && !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-primary">
        <div className="max-w-md w-full bg-secondary rounded-2xl shadow p-8 text-center">
          <div className="text-2xl font-bold mb-2 text-primary">Welcome!</div>
          <div className="text-secondary mb-4">
            Please wait while your account is activated.
            <br />
            You will receive access once approved by an administrator.
          </div>
        </div>
      </div>
    );
  }

  // Select-All helpers (must be AFTER filtered memos)
  const allAreasVisible = filteredAreas;
  const allWeeksVisible = filteredWeeks;
  const allAreasChecked = allAreasVisible.length > 0 && selectedAreas.length === allAreasVisible.length;
  const allWeeksChecked = allWeeksVisible.length > 0 && selectedWeek.length === allWeeksVisible.length;
  const toggleAllAreas = () => {
    setSelectedAreas(prev => prev.length === allAreasVisible.length ? [] : [...allAreasVisible]);
  };
  const toggleAllWeeks = () => {
    setSelectedWeek(prev => prev.length === allWeeksVisible.length ? [] : [...allWeeksVisible]);
  };

  return (
    <div className="min-h-screen bg-primary">
      <header className="sticky top-0 z-10 backdrop-blur bg-primary/90 border-b border-themed">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center justify-center">
                <QRLockIcon className="h-8 w-8 sm:h-9 sm:w-9 text-blue-600" />
              </div>
              <div>
                <div className="text-base sm:text-lg font-semibold text-primary">QRcallbox</div>
                <div className="text-xs text-muted hidden sm:block">Real-time assistance via QR</div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="text-right">
                <div className="text-xs sm:text-sm text-secondary truncate max-w-24 sm:max-w-none">
                  {user.displayName?.split(' ')[0] || user.email?.split('@')[0]}
                </div>
                <div className="text-xs text-muted hidden sm:block">
                  {user.displayName ? user.email?.split('@')[0] : ''}
                </div>
              </div>
              <button
                onClick={onSignOut}
                className="text-xs px-2 py-1 rounded border border-themed bg-secondary hover:bg-tertiary text-primary"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-3 sm:space-y-4">
        <Card>
          <CardBody className="flex items-center justify-between gap-4 flex-wrap">
            <Tabs tabs={tabs} current={active} onChange={setActive} />
          </CardBody>
        </Card>

        {active === "Setup" && (
          <Card>
            <CardHeader title="Store Implementation Setup" subtitle="Follow these steps to implement QRcallbox in your store" />
            <CardBody>
              <Setup onNavigate={(tab, subView) => {
                setActive(tab);
                if (tab === "Settings" && subView) {
                  setCurrentSettingsView(subView);
                }
              }} />
            </CardBody>
          </Card>
        )}

        {active === "Dashboard" && (
          <Card>
            <CardHeader 
              title={`Dashboard - ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
              subtitle="Live activity overview with area analytics" 
            />
            <CardBody>
              <DashboardContainer userDoc={userDoc} isAdmin={isAdmin} db={db} />
            </CardBody>
          </Card>
        )}

        {active === "Insights" && (
          <Card>
            {/* Replace old subtitle with InsightsAI below */}
            <CardHeader title="Insights" subtitle={null} />
            <CardBody>
              <div className="flex flex-col md:flex-row gap-3 sm:gap-4 mb-4 sm:mb-6 relative">
                {/* Stores (scroll ~5 items) */}
                <div className="flex-1">
                  <label className="block text-sm font-medium text-primary mb-1">Select Store(s)</label>
                  <button
                    type="button"
                    className="rounded border border-themed px-2 py-1 text-left w-full bg-secondary text-primary hover:bg-tertiary mb-1"
                    onClick={() => setShowStores(v => !v)}
                  >
                    {selectedStores.length ? `${selectedStores.length} selected` : "Choose store(s)"}
                  </button>
                  {showStores && (
                    <div
                      className="flex flex-col gap-1 w-full sm:min-w-[180px] border border-themed rounded bg-secondary shadow p-2 z-20 absolute max-h-48 sm:max-h-40 overflow-y-auto"
                      onMouseLeave={() => setShowStores(false)}
                    >
                      {stores.length === 0 && <div className="text-muted">No stores found</div>}
                      {stores.map((store) => (
                        <label key={store} className="flex items-center gap-2 cursor-pointer select-none text-primary">
                          <input
                            type="checkbox"
                            className="form-checkbox rounded h-4 w-4 text-indigo-600 border-themed bg-primary focus:ring-indigo-500"
                            checked={selectedStores.includes(store)}
                            onChange={() =>
                              setSelectedStores(prev =>
                                prev.includes(store) ? prev.filter(s => s !== store) : [...prev, store]
                              )
                            }
                          />
                          <span>{store}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Areas (scroll, Select All) */}
                <div className="flex-1">
                  <label className="block text-sm font-medium text-primary mb-1">Select Area(s)</label>
                  <button
                    type="button"
                    className="rounded border border-themed px-2 py-1 text-left w-full bg-secondary text-primary hover:bg-tertiary mb-1"
                    onClick={() => setShowAreas(v => !v)}
                  >
                    {selectedAreas.length ? `${selectedAreas.length} selected` : "Choose area(s)"}
                  </button>
                  {showAreas && (
                    <div
                      className="flex flex-col gap-1 w-full sm:min-w-[180px] border border-themed rounded bg-secondary shadow p-2 z-20 absolute max-h-48 sm:max-h-40 overflow-y-auto"
                      onMouseLeave={() => setShowAreas(false)}
                    >
                      <label className="flex items-center gap-2 cursor-pointer select-none sticky top-0 bg-secondary py-1 border-b border-themed text-primary">
                        <input
                          type="checkbox"
                          className="form-checkbox rounded h-4 w-4 text-indigo-600 border-themed bg-primary focus:ring-indigo-500"
                          checked={allAreasChecked}
                          onChange={toggleAllAreas}
                        />
                        <span className="font-medium">Select All</span>
                      </label>

                      {filteredAreas.length === 0 && <div className="text-muted">No areas found</div>}
                      {filteredAreas.map((area) => (
                        <label key={area} className="flex items-center gap-2 cursor-pointer select-none text-primary">
                          <input
                            type="checkbox"
                            className="form-checkbox rounded h-4 w-4 text-indigo-600 border-themed bg-primary focus:ring-indigo-500"
                            checked={selectedAreas.includes(area)}
                            onChange={() =>
                              setSelectedAreas(prev =>
                                prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
                              )
                            }
                          />
                          <span>{area}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Weeks (scroll, Select All) */}
                <div className="flex-1">
                  <label className="block text-sm font-medium text-primary mb-1">Select Week(s)</label>
                  <button
                    type="button"
                    className="rounded border border-themed px-2 py-1 text-left w-full bg-secondary text-primary hover:bg-tertiary mb-1"
                    onClick={() => setShowWeeks(v => !v)}
                  >
                    {selectedWeek.length ? `${selectedWeek.length} selected` : "Choose week(s)"}
                  </button>
                  {showWeeks && (
                    <div
                      className="flex flex-col gap-1 w-full sm:min-w-[220px] border border-themed rounded bg-secondary shadow p-2 z-20 absolute max-h-48 sm:max-h-40 overflow-y-auto"
                      onMouseLeave={() => setShowWeeks(false)}
                    >
                      <label className="flex items-center gap-2 cursor-pointer select-none sticky top-0 bg-secondary py-1 border-b border-themed text-primary">
                        <input
                          type="checkbox"
                          className="form-checkbox rounded h-4 w-4 text-indigo-600 border-themed bg-primary focus:ring-indigo-500"
                          checked={allWeeksChecked}
                          onChange={toggleAllWeeks}
                        />
                        <span className="font-medium">Select All</span>
                      </label>

                      {filteredWeeks.length === 0 && <div className="text-muted">No weeks found</div>}
                      {filteredWeeks.map((week) => (
                        <label key={week} className="flex items-center gap-2 cursor-pointer select-none text-primary">
                          <input
                            type="checkbox"
                            className="form-checkbox rounded h-4 w-4 text-indigo-600 border-themed bg-primary focus:ring-indigo-500"
                            checked={selectedWeek.includes(week)}
                            onChange={() =>
                              setSelectedWeek(prev =>
                                prev.includes(week) ? prev.filter(w => w !== week) : [...prev, week]
                              )
                            }
                          />
                          <span>{week}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* --- Ask Insights AI (replaces old "Analytics and trends" text) --- */}
              <InsightsAI
                logs={filteredLogs}
              />

              {/* Heatmap below (tooltips: add title attr inside Heatmap tiles if not already) */}
              <div className="mt-6">
              {logsLoading ? (
                <div className="flex items-center justify-center py-12 text-muted">Loading data…</div>
              ) : (
                <Heatmap
                  logs={filteredLogs}
                  selectedStores={selectedStores}
                  selectedWeek={selectedWeek}
                  weeks={weeks}
                  selectedAreas={selectedAreas}
                />
              )}
              </div>
            </CardBody>
          </Card>
        )}

        {active === "Generate QR" && (
          <Card>
            <CardHeader title="Generate QR" subtitle="Create a new QR poster" />
            <CardBody>
              <GenerateQR />
            </CardBody>
          </Card>
        )}

        {active === "Settings" && (
          <Card>
            <CardHeader title="Settings" subtitle="Manage your account and support tickets" />
            <CardBody>
              {/* Settings Navigation */}
              <div className="mb-6">
                <div className="flex gap-2 border-b border-themed">
                  {["Account", "My Tickets", "Integrations"].map((view) => (
                    <button
                      key={view}
                      onClick={() => setCurrentSettingsView(view.toLowerCase().replace(" ", "_"))}
                      className={`px-4 py-2 text-sm transition-colors border-b-2 ${
                        currentSettingsView === view.toLowerCase().replace(" ", "_")
                          ? "border-indigo-500 text-primary"
                          : "border-transparent text-secondary hover:text-primary"
                      }`}
                    >
                      {view}
                    </button>
                  ))}
                </div>
              </div>

              {/* Settings Content */}
              {currentSettingsView === "account" && (
                <Settings user={user} />
              )}

              {currentSettingsView === "my_tickets" && (
                <MyTickets onCreateTicket={() => setShowContactUs(true)} />
              )}

              {currentSettingsView === "integrations" && (
                <div className="space-y-8">
                  {/* GroupMe setup */}
                  <GroupMeSetup />

                  {/* Workvivo setup - temporarily disabled */}
                  {/* <WorkvivoSetup /> */}
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {active === "Admin" && isAdmin && (
          <AdminPanel currentAdminView={currentAdminView} setCurrentAdminView={setCurrentAdminView} db={db} />
        )}
      </main>
      
      {/* Contact Us Link - Always visible at bottom */}
      <footer className="p-4 border-t border-themed bg-secondary/50">
        <div className="text-center">
          <button
            onClick={() => setShowContactUs(true)}
            className="text-sm text-indigo-400 hover:text-indigo-300 underline"
          >
            📧 Contact Support
          </button>
          <span className="text-xs text-muted ml-2">
            Need help? Have suggestions? Report bugs? We're here to help!
          </span>
        </div>
      </footer>

      {/* Contact Us Modal */}
      {showContactUs && (
        <ContactUs onClose={() => setShowContactUs(false)} />
      )}
    </div>
  );
}

// -----------------------------
// 🏁 Landing Page (Sign in / Register)
// -----------------------------
function Landing() {
  const [mode, setMode] = useState("signin");
  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-6">
      <div className="absolute inset-x-0 top-0 p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center">
            <QRLockIcon className="h-9 w-9 text-blue-600" />
          </div>
          <div className="text-lg font-semibold text-primary">QRcallbox</div>
        </div>
        <div className="text-sm text-secondary hidden md:block">Scan • Notify • Assist</div>
      </div>
      <div className="w-full max-w-5xl mx-auto">
        {/* Feature Flow */}
        <div className="text-center mb-12 px-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8 mb-8">
            <div className="flex flex-col items-center gap-3 opacity-75 max-w-xs">
              <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                <span className="text-xl">📱</span>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-muted mb-1">SCAN</div>
                <div className="text-xs text-muted/70">Customers scan QR codes for instant help requests</div>
              </div>
            </div>
            <div className="text-muted text-lg hidden md:block">→</div>
            <div className="flex flex-col items-center gap-3 opacity-75 max-w-xs">
              <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                <span className="text-xl">🔔</span>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-muted mb-1">NOTIFY</div>
                <div className="text-xs text-muted/70">Staff receive real-time alerts with location details</div>
              </div>
            </div>
            <div className="text-muted text-lg hidden md:block">→</div>
            <div className="flex flex-col items-center gap-3 opacity-75 max-w-xs">
              <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                <span className="text-xl">🤝</span>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-muted mb-1">ASSIST</div>
                <div className="text-xs text-muted/70">Provide immediate help and track response times</div>
              </div>
            </div>
          </div>
          
          {/* Key Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs opacity-60 max-w-2xl mx-auto">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-blue-400 text-lg">📊</span>
              <div>
                <div className="font-medium text-muted mb-1">Heatmap Analytics</div>
                <div className="text-muted/70">Visualize help request patterns across locations</div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-blue-400 text-lg">⚡</span>
              <div>
                <div className="font-medium text-muted mb-1">Response Tracking</div>
                <div className="text-muted/70">Monitor team performance and response metrics</div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-blue-400 text-lg">🧠</span>
              <div>
                <div className="font-medium text-muted mb-1">Smart Insights</div>
                <div className="text-muted/70">Get AI-powered recommendations to improve service</div>
              </div>
            </div>
          </div>
        </div>

        {/* Centered Sign-in Form */}
        <div className="flex justify-center">
          {mode === "signin" ? (
            <SignInForm onSwitch={() => setMode("register")} />
          ) : (
            <RegisterForm onSwitch={() => setMode("signin")} />
          )}
        </div>
      </div>
      <footer className="absolute bottom-0 inset-x-0 p-6 text-center text-xs text-muted">
        © {new Date().getFullYear()} QRcallbox.com
      </footer>
    </div>
  );
}

// -----------------------------
// App Root
// -----------------------------
function AppInner() {
  const { auth, db } = useFirebase();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTerms, setShowTerms] = useState(false);
  const [userDoc, setUserDoc] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setLoading(false);
    });
    return () => unsub();
  }, [auth]);

  // Check if user needs to accept Terms of Service
  useEffect(() => {
    if (!user?.uid) {
      setShowTerms(false);
      setUserDoc(null);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const { getDoc, doc } = await import("firebase/firestore");
        const userDocRef = doc(db, "users", user.uid);
        const snap = await getDoc(userDocRef);
        
        if (mounted) {
          const userData = snap.exists() ? snap.data() : null;
          setUserDoc(userData);
          
          // Show Terms of Service if user hasn't accepted current version
          const needsToAcceptTerms = !userData?.termsAccepted || userData?.termsVersion !== "2.1.0";
          setShowTerms(needsToAcceptTerms);
        }
      } catch (error) {
        console.error("Error checking ToS status:", error);
        if (mounted) {
          setShowTerms(true); // Default to showing terms if we can't check
        }
      }
    })();
    
    return () => { mounted = false; };
  }, [user, db]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="animate-pulse text-muted">Loading…</div>
      </div>
    );
  }

  if (!user) return <Landing />;

  const handleTermsAccept = () => {
    setShowTerms(false);
    // Refresh user data
    if (user?.uid) {
      (async () => {
        try {
          const { getDoc, doc } = await import("firebase/firestore");
          const snap = await getDoc(doc(db, "users", user.uid));
          setUserDoc(snap.exists() ? snap.data() : null);
        } catch (error) {
          console.error("Error refreshing user data:", error);
        }
      })();
    }
  };

  const handleTermsDecline = async () => {
    await signOut(auth);
  };

  return (
    <>
      <Shell user={user} onSignOut={() => signOut(auth)} />
      {showTerms && (
        <TermsOfService 
          user={user}
          onAccept={handleTermsAccept}
          onDecline={handleTermsDecline}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AppInner />
      </ErrorBoundary>
    </ThemeProvider>
  );
}

// -----------------------------
// 🧪 Helpers
// -----------------------------
function validatePassword(pw) {
  // at least 8 chars, at least one letter and one number
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(pw);
}
function mapAuthError(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use")) return "Email already in use.";
  if (code.includes("invalid-email")) return "Invalid email address.";
  if (code.includes("weak-password")) return "Password is too weak.";
  if (code.includes("wrong-password")) return "Incorrect password.";
  if (code.includes("user-not-found")) return "No account found for this email.";
  if (code.includes("too-many-requests")) return "Too many attempts. Try again later.";
  return err?.message || "Something went wrong.";
}


// ===== NEW DASHBOARD COMPONENTS (Dec 2025) =====

// Dashboard data cache to reduce Firestore reads
const dashboardCache = {
  scans: null,
  scansTimestamp: null,
  logs: null,
  logsTimestamp: null,
  TTL: 30000, // 30 second cache TTL
  
  isScansValid() {
    return this.scans && this.scansTimestamp && (Date.now() - this.scansTimestamp < this.TTL);
  },
  
  isLogsValid() {
    return this.logs && this.logsTimestamp && (Date.now() - this.logsTimestamp < this.TTL);
  },
  
  setScans(scans) {
    this.scans = scans;
    this.scansTimestamp = Date.now();
  },
  
  setLogs(logs) {
    this.logs = logs;
    this.logsTimestamp = Date.now();
  },
  
  getScans() {
    return this.isScansValid() ? this.scans : null;
  },
  
  getLogs() {
    return this.isLogsValid() ? this.logs : null;
  },
  
  clear() {
    this.scans = null;
    this.scansTimestamp = null;
    this.logs = null;
    this.logsTimestamp = null;
  }
};

// Shared function to fetch scans with caching
async function fetchScansWithCache(db, forceRefresh = false) {
  // Return cached data if valid and not forcing refresh
  const cached = dashboardCache.getScans();
  if (cached && !forceRefresh) {
    return cached;
  }
  
  const { getDocs, collection } = await import("firebase/firestore");
  const scansSnap = await getDocs(collection(db, "scans"));
  const scans = scansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  dashboardCache.setScans(scans);
  return scans;
}

// Preload Insights logs data in background
async function preloadInsightsData(db) {
  // Skip if already cached
  if (dashboardCache.isLogsValid()) return;
  
  try {
    const { getDocs, collection } = await import("firebase/firestore");
    const logsSnap = await getDocs(collection(db, "logs"));
    const logs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    dashboardCache.setLogs(logs);
    console.log("Preloaded Insights data:", logs.length, "logs");
  } catch (error) {
    console.error("Error preloading Insights data:", error);
  }
}


// Shared time period options
const TIME_PERIODS = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This Week' },
  { value: 'monthly', label: 'This Month' },
  { value: 'quarterly', label: 'This Quarter' },
  { value: 'yearly', label: 'This Year' }
];

// Helper function to get date range for time period
function getDateRangeForPeriod(period) {
  const now = new Date();
  let startDate;
  
  switch (period) {
    case 'daily':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'weekly':
      const dayOfWeek = now.getDay();
      startDate = new Date(now.getTime() - (dayOfWeek * 24 * 60 * 60 * 1000));
      startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      break;
    case 'monthly':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'quarterly':
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      break;
    case 'yearly':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  
  return { startDate, endDate: now };
}

// Helper to filter scans by user's stores
function filterScansByUserStores(scans, userDoc, isAdmin) {
  if (isAdmin || !userDoc) return scans;
  
  const accessibleStores = userDoc.allowedStores || (userDoc.storeNumber ? [userDoc.storeNumber] : []);
  const normalizedAccessible = accessibleStores.map(store => {
    const storeStr = String(store);
    return storeStr.replace(/^0+/, '') || '0';
  });
  
  return scans.filter(scan => {
    if (!scan.storeNumber) return false;
    const normalizedScanStore = String(scan.storeNumber).replace(/^0+/, '') || '0';
    return normalizedAccessible.includes(normalizedScanStore);
  });
}

// Area Scans Component - Shows all areas with scan counts
const AreaScans = React.memo(function AreaScans({ db, userDoc, isAdmin, timePeriod, selectedStores = [], onAreaClick }) {
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    
    let mounted = true;
    
    async function fetchAreaScans() {
      setLoading(true);
      try {
        const { startDate } = getDateRangeForPeriod(timePeriod);
        
        // Use cached scan data
        let scans = await fetchScansWithCache(db);
        
        // Filter by selected stores
        if (selectedStores.length > 0) {
          const normalizedSelected = selectedStores.map(store => String(store).replace(/^0+/, '') || '0');
          scans = scans.filter(scan => {
            if (!scan.storeNumber) return false;
            const normalizedScanStore = String(scan.storeNumber).replace(/^0+/, '') || '0';
            return normalizedSelected.includes(normalizedScanStore);
          });
        }
        
        // Filter by time period
        scans = scans.filter(scan => {
          if (!scan.timestamp) return false;
          const scanTime = scan.timestamp.toDate ? scan.timestamp.toDate() : new Date(scan.timestamp);
          return scanTime >= startDate;
        });
        
        // Aggregate by area
        const areaStats = {};
        scans.forEach(scan => {
          const area = (scan.areaDescription || scan.area || 'Unknown').trim();
          if (!areaStats[area]) {
            areaStats[area] = { name: area, totalScans: 0, acceptedScans: 0, scans: [] };
          }
          areaStats[area].totalScans++;
          areaStats[area].scans.push(scan);
          if (scan.claimedBy || scan.claimedByName) {
            areaStats[area].acceptedScans++;
          }
        });
        
        // Sort by total scans descending
        const sortedAreas = Object.values(areaStats).sort((a, b) => b.totalScans - a.totalScans);
        
        if (mounted) {
          setAreas(sortedAreas);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching area scans:", error);
        if (mounted) setLoading(false);
      }
    }
    
    fetchAreaScans();
    return () => { mounted = false; };
  }, [db, timePeriod, selectedStores]);

  return (
    <div className="rounded-xl border border-themed bg-tertiary p-4 h-full">
      <h3 className="text-lg font-semibold text-primary mb-3">Area Scans</h3>
      {loading ? (
        <div className="text-muted text-sm">Loading...</div>
      ) : areas.length === 0 ? (
        <div className="text-muted text-sm">No scans for this period</div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {areas.map((area, idx) => (
            <div
              key={area.name}
              onClick={() => onAreaClick && onAreaClick(area)}
              className="flex justify-between items-center p-2 rounded-lg bg-secondary hover:bg-primary cursor-pointer transition-colors border border-transparent hover:border-themed"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted w-5">{idx + 1}.</span>
                <span className="text-sm text-primary font-medium truncate max-w-[150px]">{area.name}</span>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-muted">{area.totalScans} scans</span>
                <span className="text-green-500">{area.acceptedScans} claimed</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// Live Scan Feed Component - Polls every 25 seconds
const LiveScanFeed = React.memo(function LiveScanFeed({ db, userDoc, isAdmin, selectedStores = [] }) {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchScans = useCallback(async () => {
    try {
      const { getDocs, collection, query, orderBy, limit } = await import("firebase/firestore");
      
      const q = query(collection(db, "scans"), orderBy("timestamp", "desc"), limit(50));
      const scansSnap = await getDocs(q);
      let recentScans = scansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Filter by selected stores
      if (selectedStores.length > 0) {
        const normalizedSelected = selectedStores.map(store => String(store).replace(/^0+/, '') || '0');
        recentScans = recentScans.filter(scan => {
          if (!scan.storeNumber) return false;
          const normalizedScanStore = String(scan.storeNumber).replace(/^0+/, '') || '0';
          return normalizedSelected.includes(normalizedScanStore);
        });
      }
      
      // Take top 20 after filtering
      recentScans = recentScans.slice(0, 20);
      
      setScans(recentScans);
      setLastUpdate(new Date());
      setLoading(false);
    } catch (error) {
      console.error("Error fetching live scans:", error);
      setLoading(false);
    }
  }, [db, selectedStores]);

  useEffect(() => {
    fetchScans();
    
    // Poll every 25 seconds
    const interval = setInterval(fetchScans, 25000);
    return () => clearInterval(interval);
  }, [fetchScans]);

  const getTimeAgo = (timestamp) => {
    if (!timestamp) return '';
    const time = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = Date.now() - time.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="rounded-xl border border-themed bg-tertiary p-4 h-full">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-primary">Live Feed</h3>
        <span className="text-xs text-muted">
          {lastUpdate ? `Updated ${getTimeAgo({ toDate: () => lastUpdate })}` : ''}
        </span>
      </div>
      {loading ? (
        <div className="text-muted text-sm">Loading...</div>
      ) : scans.length === 0 ? (
        <div className="text-muted text-sm">No recent scans</div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {scans.map((scan) => (
            <div
              key={scan.id}
              className={`p-2 rounded-lg border ${scan.claimedBy ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-secondary border-themed'}`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-primary truncate">
                    {scan.areaDescription || scan.area || 'Unknown Area'}
                  </div>
                  <div className="text-xs text-muted">
                    Store {scan.storeNumber} • {getTimeAgo(scan.timestamp)}
                  </div>
                </div>
                <div className="ml-2">
                  {scan.claimedBy ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300">
                      Claimed
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-300">
                      Pending
                    </span>
                  )}
                </div>
              </div>
              {scan.claimedByName && (
                <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                  → {scan.claimedByName}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// Area Details Modal - Shows detailed metrics for a selected area
const AreaDetailsModal = React.memo(function AreaDetailsModal({ area, timePeriod, onClose }) {
  if (!area) return null;

  const scans = area.scans || [];
  
  // Calculate response time metrics
  const respondedScans = scans.filter(s => s.claimedAt && s.timestamp);
  const responseTimes = respondedScans.map(s => {
    const start = s.timestamp.toDate ? s.timestamp.toDate() : new Date(s.timestamp);
    const end = s.claimedAt.toDate ? s.claimedAt.toDate() : new Date(s.claimedAt);
    return (end - start) / 60000; // minutes
  });
  
  const avgResponseTime = responseTimes.length > 0 
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) 
    : 0;
  const fastestResponse = responseTimes.length > 0 ? Math.round(Math.min(...responseTimes)) : 0;
  const slowestResponse = responseTimes.length > 0 ? Math.round(Math.max(...responseTimes)) : 0;
  
  // Top responders for this area
  const responderCounts = {};
  respondedScans.forEach(s => {
    const name = s.claimedByName || 'Unknown';
    responderCounts[name] = (responderCounts[name] || 0) + 1;
  });
  const topResponders = Object.entries(responderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Scans by hour
  const hourCounts = {};
  scans.forEach(s => {
    if (!s.timestamp) return;
    const time = s.timestamp.toDate ? s.timestamp.toDate() : new Date(s.timestamp);
    const hour = time.getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
  
  // Scans by day of week
  const dayCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  scans.forEach(s => {
    if (!s.timestamp) return;
    const time = s.timestamp.toDate ? s.timestamp.toDate() : new Date(s.timestamp);
    dayCounts[time.getDay()]++;
  });
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const busiestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-primary rounded-xl border border-themed max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-bold text-primary">{area.name}</h2>
              <p className="text-sm text-muted">{TIME_PERIODS.find(t => t.value === timePeriod)?.label || 'Today'}</p>
            </div>
            <button onClick={onClose} className="text-muted hover:text-primary text-2xl leading-none">&times;</button>
          </div>
          
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-secondary rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-primary">{area.totalScans}</div>
              <div className="text-xs text-muted">Total Scans</div>
            </div>
            <div className="bg-secondary rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-500">{area.acceptedScans}</div>
              <div className="text-xs text-muted">Claimed</div>
            </div>
            <div className="bg-secondary rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-primary">
                {area.totalScans > 0 ? Math.round((area.acceptedScans / area.totalScans) * 100) : 0}%
              </div>
              <div className="text-xs text-muted">Claim Rate</div>
            </div>
          </div>
          
          {/* Response Time Metrics */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-primary mb-2">Response Times</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-tertiary rounded-lg p-2">
                <div className="text-lg font-semibold text-primary">{avgResponseTime}m</div>
                <div className="text-xs text-muted">Average</div>
              </div>
              <div className="bg-tertiary rounded-lg p-2">
                <div className="text-lg font-semibold text-green-500">{fastestResponse}m</div>
                <div className="text-xs text-muted">Fastest</div>
              </div>
              <div className="bg-tertiary rounded-lg p-2">
                <div className="text-lg font-semibold text-orange-500">{slowestResponse}m</div>
                <div className="text-xs text-muted">Slowest</div>
              </div>
            </div>
          </div>
          
          {/* Top Responders */}
          {topResponders.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-primary mb-2">Top Responders</h3>
              <div className="space-y-1">
                {topResponders.map(([name, count], idx) => (
                  <div key={name} className="flex justify-between items-center bg-tertiary rounded p-2">
                    <span className="text-sm text-primary">{idx + 1}. {name}</span>
                    <span className="text-sm text-muted">{count} claims</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Time-based Insights */}
          <div>
            <h3 className="text-sm font-semibold text-primary mb-2">Activity Patterns</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-tertiary rounded-lg p-3">
                <div className="text-sm text-muted">Peak Hour</div>
                <div className="text-lg font-semibold text-primary">
                  {peakHour ? `${peakHour[0]}:00 (${peakHour[1]} scans)` : 'N/A'}
                </div>
              </div>
              <div className="bg-tertiary rounded-lg p-3">
                <div className="text-sm text-muted">Busiest Day</div>
                <div className="text-lg font-semibold text-primary">
                  {busiestDay ? `${dayNames[busiestDay[0]]} (${busiestDay[1]} scans)` : 'N/A'}
                </div>
              </div>
            </div>
            
            {/* Day of week breakdown */}
            <div className="mt-3 flex justify-between">
              {dayNames.map((day, idx) => (
                <div key={day} className="text-center">
                  <div className="text-xs text-muted">{day}</div>
                  <div className="text-sm font-medium text-primary">{dayCounts[idx]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// Enhanced Dashboard Container with shared time selector
const DashboardContainer = React.memo(function DashboardContainer({ userDoc, isAdmin, db }) {
  const [timePeriod, setTimePeriod] = useState('daily');
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedStores, setSelectedStores] = useState([]);
  const [availableStores, setAvailableStores] = useState([]);
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  
  // Initialize stores - default to user's home store
  useEffect(() => {
    if (!userDoc && !isAdmin) return;
    
    // Get available stores for this user
    let stores = [];
    if (isAdmin) {
      // Admin can see all stores - we'll populate from data
      stores = [];
    } else if (userDoc) {
      stores = userDoc.allowedStores || (userDoc.storeNumber ? [userDoc.storeNumber] : []);
    }
    setAvailableStores(stores);
    
    // Default to home store
    if (userDoc?.storeNumber && selectedStores.length === 0) {
      setSelectedStores([String(userDoc.storeNumber)]);
    }
  }, [userDoc, isAdmin]);
  
  // Preload Insights data in background when Dashboard loads
  useEffect(() => {
    preloadInsightsData(db);
  }, [db]);
  
  // For admin, populate available stores from scan data
  useEffect(() => {
    if (!isAdmin) return;
    
    async function loadStores() {
      const scans = await fetchScansWithCache(db);
      const storeSet = new Set();
      scans.forEach(s => {
        if (s.storeNumber) storeSet.add(String(s.storeNumber));
      });
      const storeList = Array.from(storeSet).sort((a, b) => Number(a) - Number(b));
      setAvailableStores(storeList);
      if (selectedStores.length === 0 && storeList.length > 0) {
        setSelectedStores([storeList[0]]);
      }
    }
    loadStores();
  }, [db, isAdmin]);

  const toggleStore = (store) => {
    setSelectedStores(prev => 
      prev.includes(store) 
        ? prev.filter(s => s !== store)
        : [...prev, store]
    );
  };

  return (
    <div className="space-y-6">
      {/* Shared Selectors Row */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-lg font-semibold text-primary">Dashboard</h2>
        <div className="flex gap-2 items-center">
          {/* Store Selector */}
          <div className="relative">
            <button
              onClick={() => setShowStoreDropdown(!showStoreDropdown)}
              className="px-3 py-1.5 text-sm border border-themed bg-secondary rounded-lg text-primary min-w-[120px] text-left"
            >
              {selectedStores.length === 0 ? 'All Stores' : 
               selectedStores.length === 1 ? `Store ${selectedStores[0]}` : 
               `${selectedStores.length} Stores`}
            </button>
            {showStoreDropdown && (
              <div 
                className="absolute right-0 top-full mt-1 bg-primary border border-themed rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto min-w-[150px]"
                onMouseLeave={() => setShowStoreDropdown(false)}
              >
                {availableStores.length === 0 ? (
                  <div className="p-2 text-sm text-muted">No stores available</div>
                ) : (
                  availableStores.map(store => (
                    <label key={store} className="flex items-center gap-2 p-2 hover:bg-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedStores.includes(store)}
                        onChange={() => toggleStore(store)}
                        className="rounded"
                      />
                      <span className="text-sm text-primary">Store {store}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
          
          {/* Time Period Selector */}
          <select
            value={timePeriod}
            onChange={(e) => setTimePeriod(e.target.value)}
            className="px-3 py-1.5 text-sm border border-themed bg-secondary rounded-lg text-primary"
          >
            {TIME_PERIODS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>
      
      {/* Quick Stats */}
      <Dashboard userDoc={userDoc} isAdmin={isAdmin} selectedStores={selectedStores} />
      
      {/* Live Feed - Full Width */}
      <LiveScanFeed db={db} userDoc={userDoc} isAdmin={isAdmin} selectedStores={selectedStores} />
      
      {/* Two Column Layout: Top Responders | Area Scans */}
      <div className="grid md:grid-cols-2 gap-4">
        <TopResponders db={db} userDoc={userDoc} isAdmin={isAdmin} timePeriod={timePeriod} selectedStores={selectedStores} />
        <AreaScans db={db} userDoc={userDoc} isAdmin={isAdmin} timePeriod={timePeriod} selectedStores={selectedStores} onAreaClick={setSelectedArea} />
      </div>
      
      {/* Area Details Modal */}
      {selectedArea && (
        <AreaDetailsModal area={selectedArea} timePeriod={timePeriod} onClose={() => setSelectedArea(null)} />
      )}
    </div>
  );
});

// ===== END NEW DASHBOARD COMPONENTS =====
