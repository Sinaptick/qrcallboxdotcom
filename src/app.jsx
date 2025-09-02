// --- Imports (keep at very top) ---
import React, { useEffect, useMemo, useState } from "react";
import Heatmap from "./Heatmap.jsx";
import * as QR from "qrcode";
import { mint } from "./lib/api.js";
import PosterWithQR from "./PosterWithQR.jsx";
import UnapprovedUsersList from "./UnapprovedUsersList.jsx";
import InsightsAI from "./InsightsAI.jsx";
import GroupMeSetup from "./GroupMeSetup.jsx";
// import WorkvivoSetup from "./WorkvivoSetup.jsx"; // Temporarily disabled
import ContactUs from "./ContactUs.jsx";
import TicketQueue from "./TicketQueue.jsx";
import MyTickets from "./MyTickets.jsx";
import Setup from "./Setup.jsx";
import BlockedIPsManager from "./BlockedIPsManager.jsx";
import Button from "./Button.jsx"; // must export default Button in Button.jsx
import { Card, CardHeader, CardBody } from "./components/shared/Card.jsx";
import { Input } from "./components/shared/FormField.jsx";
import { Tabs } from "./components/ui/Tabs.jsx";
import FilterControls from "./components/dashboard/FilterControls.jsx";
import TabContent from "./components/dashboard/TabContent.jsx";
import { useInsightsData } from "./hooks/useInsightsData.js";
import { ThemeProvider, useTheme } from "./ThemeContext.jsx";
import QRLockIcon from "./QRLockIcon.jsx";
import TermsOfService from "./TermsOfService.jsx";

// New modular imports
import { useFirebase } from "./hooks/useFirebase.js";
import ErrorBoundary from "./components/shared/ErrorBoundary.jsx";
import LandingPage from "./components/layout/LandingPage.jsx";
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
import {
  storeHierarchy,
  getAllStoresForSelection,
  getSelectionDisplayName,
  getBUOptions,
  getRegionOptions,
  getMarketOptions,
  validateStoreAccess
} from "./storeHierarchy.js";

// ErrorBoundary now imported from components/shared/ErrorBoundary.jsx

// Firebase configuration now in config/firebase.config.js
// useFirebase hook now in hooks/useFirebase.js

// -----------------------------
// 🧱 UI Primitives (Tailwind)
// -----------------------------
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
const GenerateQR = React.memo(function GenerateQR({ userDoc, isAdmin }) {
  const { auth } = useFirebase();
  const [store, setStore] = useState(userDoc?.storeNumber ? String(userDoc.storeNumber) : "");

  // Update store when userDoc changes
  useEffect(() => {
    if (!isAdmin && userDoc) {
      // Market+ level users can only use their home store
      if (userDoc?.selectionType !== 'store' && userDoc?.homeStore) {
        setStore(String(userDoc.homeStore));
      }
      // Store-level users with multiple stores can choose
      else if (userDoc?.selectionType === 'store' && userDoc?.allowedStores && userDoc.allowedStores.length > 1) {
        setStore(""); // Let them choose
      }
      // Single store users auto-set
      else if (userDoc?.storeNumber) {
        setStore(String(userDoc.storeNumber));
      }
    }
  }, [userDoc, isAdmin]);
  const [area, setArea] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const posterRef = React.useRef();

  const ready = /^\d{3,6}$/.test(String(store || "").trim()) && !!area.trim() && !error && !busy;

  function validate() {
    setError("");
    const s = String(store || "").trim();
    const a = area.trim();
    if (!s) return setError(isAdmin ? "Please enter Store number." : "Store number not configured in your profile.");
    if (!a) return setError("Please enter Area.");
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
      
      // Get authentication token
      const authToken = await auth.currentUser?.getIdToken();
      if (!authToken) {
        throw new Error("Authentication required");
      }
      
      // Ensure store is only numeric digits
      const rawStore = String(store || "").trim();
      const numericStore = rawStore.replace(/[^0-9]/g, ''); // Strip any non-numeric characters
      
      if (!numericStore || !/^\d{3,6}$/.test(numericStore)) {
        throw new Error(`Invalid store number: "${rawStore}" -> "${numericStore}"`);
      }
      
      const data = await mint(numericStore, area.trim(), authToken);
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
          {isAdmin ? (
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
          ) : (userDoc?.allowedStores && userDoc.allowedStores.length > 1 && userDoc?.selectionType === 'store') || userDoc?.homeStore ? (
            <label className="block">
              <span className="text-sm text-primary">Store number</span>
              <select
                className="mt-1 w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2
                           focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={store}
                onChange={(e) => setStore(e.target.value)}
              >
                <option value="">Select store...</option>
                {/* Only show all allowed stores if user has store-level access */}
                {userDoc?.selectionType === 'store' && userDoc?.allowedStores?.map(storeNum => (
                  <option key={storeNum} value={storeNum}>Store {storeNum}</option>
                ))}
                {/* Always show home store for market+ level users */}
                {userDoc?.homeStore && (userDoc?.selectionType !== 'store' || !userDoc?.allowedStores?.includes(userDoc.homeStore)) && (
                  <option value={userDoc.homeStore}>Store {userDoc.homeStore} (Home Store)</option>
                )}
              </select>
            </label>
          ) : (
            <div className="block">
              <span className="text-sm text-primary">Store number</span>
              <div className="mt-1 w-full rounded-xl border border-themed bg-tertiary text-primary px-3 py-2">
                {store || "Not set"}
              </div>
            </div>
          )}

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
          <PosterWithQR ref={posterRef} qrDataUrl={qrDataUrl} storeNumber={store} area={area} />
        ) : (
          <div className="w-48 h-48 sm:w-64 sm:h-64 grid place-items-center text-muted border border-themed rounded-xl">
            QR preview
          </div>
        )}
      </div>
    </div>
  );
});

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
    homeStore: "",
    jobTitle: "",
    phone: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [selectionType, setSelectionType] = useState(""); // 'store', 'market', 'region', 'bu'
  const [selectionValue, setSelectionValue] = useState("");
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
    
    // Validate selection
    if (!selectionType) return setError("Please select a level (Store, Market, Region, or BU).");
    if (!selectionValue) return setError("Please enter or select a value.");
    
    // Get allowed stores based on selection
    const allowedStores = getAllStoresForSelection(selectionType, selectionValue);
    if (allowedStores.length === 0) {
      return setError("Invalid selection. No stores found for the given input.");
    }
    
    try {
      setLoading(true);
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await updateProfile(cred.user, { displayName: `${form.firstName} ${form.lastName}`.trim() });
      await setDoc(doc(getFirestore(), "users", cred.user.uid), {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        storeNumber: allowedStores[0], // Default to first store in the list
        homeStore: (form.homeStore || "").trim() || allowedStores[0], // Legacy store for QR generation
        allowedStores: allowedStores, // Array of all accessible stores
        selectionType: selectionType,
        selectionValue: selectionValue,
        selectionDisplay: getSelectionDisplayName(selectionType, selectionValue),
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
          
          {/* Store/Market/Region/BU Selection */}
          <div className="sm:col-span-2">
            <label className="block">
              <span className="text-sm font-medium text-primary">Access Level</span>
              <select
                className="mt-1 w-full rounded-xl border-themed bg-primary text-primary focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 border px-3 py-2"
                value={selectionType}
                onChange={(e) => {
                  setSelectionType(e.target.value);
                  setSelectionValue("");
                }}
                required
              >
                <option value="">Select level...</option>
                <option value="store">Store</option>
                <option value="market">Market</option>
                <option value="region">Region</option>
                <option value="bu">Business Unit (BU)</option>
              </select>
            </label>
          </div>
          
          {/* Dynamic input based on selection type */}
          {selectionType && (
            <div className="sm:col-span-2">
              <label className="block">
                <span className="text-sm font-medium text-primary">
                  {selectionType === 'store' && 'Store Number'}
                  {selectionType === 'market' && 'Market'}
                  {selectionType === 'region' && 'Region'}
                  {selectionType === 'bu' && 'Business Unit'}
                </span>
                {selectionType === 'store' ? (
                  <input
                    className="mt-1 w-full rounded-xl border-themed bg-primary text-primary focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 border px-3 py-2"
                    type="text"
                    placeholder="Enter store number (e.g., 1458)"
                    value={selectionValue}
                    onChange={(e) => setSelectionValue(e.target.value)}
                    required
                  />
                ) : selectionType === 'market' ? (
                  <select
                    className="mt-1 w-full rounded-xl border-themed bg-primary text-primary focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 border px-3 py-2"
                    value={selectionValue}
                    onChange={(e) => setSelectionValue(e.target.value)}
                    required
                  >
                    <option value="">Select market...</option>
                    {getMarketOptions().map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : selectionType === 'region' ? (
                  <select
                    className="mt-1 w-full rounded-xl border-themed bg-primary text-primary focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 border px-3 py-2"
                    value={selectionValue}
                    onChange={(e) => setSelectionValue(e.target.value)}
                    required
                  >
                    <option value="">Select region...</option>
                    {getRegionOptions().map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : selectionType === 'bu' ? (
                  <select
                    className="mt-1 w-full rounded-xl border-themed bg-primary text-primary focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 border px-3 py-2"
                    value={selectionValue}
                    onChange={(e) => setSelectionValue(e.target.value)}
                    required
                  >
                    <option value="">Select BU...</option>
                    {getBUOptions().map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : null}
              </label>
              {selectionValue && (
                <div className="mt-2 text-xs text-muted">
                  This will give you access to {getAllStoresForSelection(selectionType, selectionValue).length} store(s)
                </div>
              )}
            </div>
          )}
          
          <Input label="Home Store (Legacy)" value={form.homeStore} onChange={updateField("homeStore")} placeholder="Enter your primary store number" />
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
const Settings = React.memo(function Settings({ user }) {
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
});

const Dashboard = React.memo(function Dashboard({ userDoc, isAdmin }) {
  console.log("Dashboard: Component called with props:", { userDoc, isAdmin });
  const { db } = useFirebase();
  const [stats, setStats] = useState({
    uniqueAreas: 0,
    totalRequests: 0,
    avgResponseTime: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Don't run if we're waiting for userDoc to load (unless admin)
    if (!isAdmin && !userDoc) {
      console.log("Dashboard: Waiting for userDoc to load");
      return;
    }
    
    let mounted = true;
    
    async function fetchDashboardStats() {
      try {
        console.log("Dashboard: fetchDashboardStats called", { userDoc, isAdmin });
        const { getDocs, collection, query, where, Timestamp } = await import("firebase/firestore");
        
        // Get start and end of today
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        
        // Convert to Firestore Timestamps
        const startTimestamp = Timestamp.fromDate(startOfDay);
        const endTimestamp = Timestamp.fromDate(endOfDay);
        
        // Query logs for today
        const q = query(
          collection(db, "logs"),
          where("ts", ">=", startTimestamp),
          where("ts", "<", endTimestamp)
        );
        
        const querySnapshot = await getDocs(q);
        let todayLogs = querySnapshot.docs.map(doc => doc.data());
        
        // Filter logs by user's accessible stores (same logic as insights)
        console.log("Dashboard: Before filtering - total logs:", todayLogs.length);
        if (!isAdmin && userDoc) {
          const accessibleStores = userDoc.allowedStores || (userDoc.storeNumber ? [userDoc.storeNumber] : []);
          console.log("Dashboard: User accessible stores:", accessibleStores);
          console.log("Dashboard: Sample log stores:", todayLogs.slice(0, 3).map(log => log.store));
          todayLogs = todayLogs.filter(log => 
            accessibleStores.some(store => String(log.store) === String(store))
          );
          console.log("Dashboard: After filtering - remaining logs:", todayLogs.length);
        } else {
          console.log("Dashboard: Admin user or no userDoc - showing all logs");
        }
        
        if (!mounted) return;
        
        // Calculate unique areas scanned today
        const uniqueAreas = new Set(todayLogs.map(log => log.area?.toLowerCase()?.trim()).filter(Boolean)).size;
        
        // Total requests today
        const totalRequests = todayLogs.length;
        
        // Calculate average response time for business hours only (6:00 AM - 10:59 PM)
        const respondedLogs = todayLogs.filter(log => {
          if (!log.respondedAt || !log.ts) return false;
          
          // Check if response was within business hours (6:00 AM - 10:59 PM)
          const responseTime = log.respondedAt.toDate ? log.respondedAt.toDate() : new Date(log.respondedAt);
          const hour = responseTime.getHours();
          return hour >= 6 && hour <= 22; // 6:00 AM (6) through 10:59 PM (22)
        });
        
        let avgResponseTime = 0;
        
        if (respondedLogs.length > 0) {
          const totalResponseTime = respondedLogs.reduce((sum, log) => {
            const requestTime = log.ts.toDate ? log.ts.toDate() : new Date(log.ts);
            const responseTime = log.respondedAt.toDate ? log.respondedAt.toDate() : new Date(log.respondedAt);
            const diff = responseTime - requestTime;
            return sum + (diff / 60000); // Convert to minutes
          }, 0);
          avgResponseTime = Math.round(totalResponseTime / respondedLogs.length);
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
  }, [db, isAdmin, userDoc?.allowedStores, userDoc?.storeNumber]);

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
const TopResponders = React.memo(function TopResponders({ db }) {
  const [responders, setResponders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timePeriod, setTimePeriod] = useState('weekly');

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
            // Rolling 7 days (last 7 days from now)
            startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            break;
          case 'monthly':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'alltime':
            startDate = new Date(2020, 0, 1); // Far back date
            break;
          default:
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }
        
        // Query responded logs within time period and business hours
        const q = query(
          collection(db, "logs"),
          where("respondedAt", "!=", null),
          orderBy("respondedAt", "desc")
        );
        
        const snap = await getDocs(q);
        const logs = snap.docs.map(d => d.data());
        console.log('TopResponders: Found', logs.length, 'logs with responses');
        console.log('TopResponders: Time period:', timePeriod, 'Start date:', startDate);
        
        // Filter to time period and business hours (6 AM - 10:59 PM)
        const filteredLogs = logs.filter(log => {
          const responseTime = log.respondedAt.toDate ? log.respondedAt.toDate() : new Date(log.respondedAt);
          const hour = responseTime.getHours();
          
          // Filter by business hours
          if (hour < 6 || hour > 22) return false;
          
          // Filter by time period
          if (timePeriod !== 'alltime' && responseTime < startDate) return false;
          
          return true;
        });
        
        console.log('TopResponders: After filtering:', filteredLogs.length, 'logs');
        
        // Aggregate data by responder name
        const responderStats = {};
        
        filteredLogs.forEach(log => {
          const name = log.responderName;
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
          
          const responseTimeSeconds = log.responseTimeSeconds || 0;
          responderStats[name].totalResponses++;
          responderStats[name].totalResponseTime += responseTimeSeconds;
          responderStats[name].fastestResponse = Math.min(responderStats[name].fastestResponse, responseTimeSeconds);
          responderStats[name].slowestResponse = Math.max(responderStats[name].slowestResponse, responseTimeSeconds);
        });
        
        // Calculate averages and sort by total responses
        const sortedResponders = Object.values(responderStats)
          .map(responder => ({
            ...responder,
            avgResponseTime: Math.round(responder.totalResponseTime / responder.totalResponses / 60), // Convert to minutes
            fastestResponseMin: Math.round(responder.fastestResponse / 60),
            slowestResponseMin: Math.round(responder.slowestResponse / 60)
          }))
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
  }, [db, timePeriod]);

  const getRankEmoji = (index) => {
    const emojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    return emojis[index] || `${index + 1}️⃣`;
  };

  const getPeriodLabel = () => {
    switch (timePeriod) {
      case 'daily': return 'Today';
      case 'weekly': return 'Last 7 days';  
      case 'monthly': return 'This Month';
      case 'alltime': return 'All Time';
      default: return 'Today';
    }
  };

  return (
    <div className="rounded-xl border border-themed bg-tertiary p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-primary">📊 Top Responders</h3>
        <select 
          value={timePeriod}
          onChange={(e) => setTimePeriod(e.target.value)}
          className="px-3 py-1 text-sm border border-themed bg-secondary rounded"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Last 7 days</option>
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

// Data Cleanup Tool for admins
function DataCleanupTool({ db }) {
  const { auth } = useFirebase();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchCriteria, setSearchCriteria] = useState({
    searchType: 'area',
    searchValue: '',
    store: '',
    dateRange: 'all'
  });
  const [searchResults, setSearchResults] = useState([]);
  const [selectedLogs, setSelectedLogs] = useState(new Set());
  const [searching, setSearching] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState({ total: 0, selected: 0 });

  // Check if current user is admin
  useEffect(() => {
    async function checkAdminStatus() {
      if (!auth.currentUser) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const { getDoc, doc } = await import("firebase/firestore");
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        const isUserAdmin = userDoc.exists() && userDoc.data().email === 'sinaptick@gmail.com';
        setIsAdmin(isUserAdmin);
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    }

    checkAdminStatus();
  }, [auth.currentUser, db]);

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted">Checking permissions...</div>
      </div>
    );
  }

  // Show access denied for non-admin users
  if (!isAdmin) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <div className="text-red-700 text-lg font-semibold mb-2">🚫 Access Denied</div>
        <div className="text-red-600 text-sm">
          The Data Cleanup Tool is restricted to administrators only.
          <br />
          Contact your system administrator if you need access to this feature.
        </div>
      </div>
    );
  }

  const handleSearch = async () => {
    // Allow searching by store only (no area required)
    if (!searchCriteria.searchValue.trim() && !searchCriteria.store.trim()) {
      setMessage('Please enter a search value or select a store');
      return;
    }

    setSearching(true);
    setMessage('');
    setSelectedLogs(new Set());

    try {
      const { getDocs, collection, query, where, orderBy, limit } = await import("firebase/firestore");
      
      let q = collection(db, "logs");
      
      // Build query based on search criteria
      let whereConditions = [];
      let needsClientFiltering = false;
      
      // Add store filter if specified
      if (searchCriteria.store.trim()) {
        whereConditions.push(where("store", "==", searchCriteria.store.trim()));
      }
      
      // Add search criteria
      if (searchCriteria.searchValue.trim()) {
        if (searchCriteria.searchType === 'area') {
          whereConditions.push(where("area", "==", searchCriteria.searchValue.trim()));
        } else if (searchCriteria.searchType === 'store' && !searchCriteria.store.trim()) {
          whereConditions.push(where("store", "==", searchCriteria.searchValue.trim()));
        } else if (searchCriteria.searchType === 'partial_area') {
          needsClientFiltering = true;
        }
      }
      
      // Build the query
      if (whereConditions.length > 0) {
        q = query(q, ...whereConditions, orderBy("ts", "desc"), limit(1000));
      } else {
        q = query(q, orderBy("ts", "desc"), limit(1000));
      }
      
      const snapshot = await getDocs(q);
      let results = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().ts?.toDate?.() || new Date(doc.data().ts || 0)
      }));
      
      // Client-side filtering for partial matches
      if (needsClientFiltering && searchCriteria.searchType === 'partial_area') {
        const searchTerm = searchCriteria.searchValue.toLowerCase();
        results = results.filter(log => 
          log.area?.toLowerCase().includes(searchTerm)
        );
      }
      
      // Date range filtering
      if (searchCriteria.dateRange !== 'all') {
        const now = new Date();
        let cutoffDate;
        
        switch (searchCriteria.dateRange) {
          case '7days':
            cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30days':
            cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case '90days':
            cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          default:
            cutoffDate = new Date(0);
        }
        
        results = results.filter(log => log.timestamp >= cutoffDate);
      }
      
      // Sort by timestamp descending
      results.sort((a, b) => b.timestamp - a.timestamp);
      
      setSearchResults(results);
      setStats({ total: results.length, selected: 0 });
      
      if (results.length === 0) {
        setMessage('No logs found matching the search criteria');
      } else {
        setMessage(`Found ${results.length} log entries`);
      }
      
    } catch (error) {
      console.error('Search error:', error);
      setMessage('Error searching logs: ' + (error.message || error));
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedLogs.size === searchResults.length) {
      setSelectedLogs(new Set());
      setStats(prev => ({ ...prev, selected: 0 }));
    } else {
      const allIds = new Set(searchResults.map(log => log.id));
      setSelectedLogs(allIds);
      setStats(prev => ({ ...prev, selected: searchResults.length }));
    }
  };

  const handleSelectLog = (logId) => {
    const newSelected = new Set(selectedLogs);
    if (newSelected.has(logId)) {
      newSelected.delete(logId);
    } else {
      newSelected.add(logId);
    }
    setSelectedLogs(newSelected);
    setStats(prev => ({ ...prev, selected: newSelected.size }));
  };

  const handleDeleteSelected = async () => {
    if (selectedLogs.size === 0) {
      setMessage('No logs selected for deletion');
      return;
    }

    const confirmMessage = `Are you sure you want to delete ${selectedLogs.size} log entries? This action cannot be undone.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setDeleting(true);
    setMessage('');

    try {
      const { deleteDoc, doc } = await import("firebase/firestore");
      
      // Delete in batches to avoid overwhelming Firestore
      const selectedIds = Array.from(selectedLogs);
      const batchSize = 50;
      let deletedCount = 0;
      
      for (let i = 0; i < selectedIds.length; i += batchSize) {
        const batch = selectedIds.slice(i, i + batchSize);
        await Promise.all(batch.map(id => deleteDoc(doc(db, "logs", id))));
        deletedCount += batch.length;
        
        // Update progress
        setMessage(`Deleting logs: ${deletedCount}/${selectedIds.length}`);
      }
      
      // Remove deleted items from search results
      const remainingResults = searchResults.filter(log => !selectedLogs.has(log.id));
      setSearchResults(remainingResults);
      setSelectedLogs(new Set());
      setStats({ total: remainingResults.length, selected: 0 });
      
      setMessage(`Successfully deleted ${deletedCount} log entries`);
      
    } catch (error) {
      console.error('Delete error:', error);
      setMessage('Error deleting logs: ' + (error.message || error));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
        <div className="text-amber-800 text-sm">
          <div className="font-semibold mb-1">🔧 Admin Data Cleanup Tool</div>
          Use this tool to search for and delete erroneous QR scan logs (e.g., test entries, spam, etc.).
          <span className="text-red-600 block mt-1">⚠️ Deleted logs cannot be recovered. Use with caution.</span>
        </div>
      </div>

      {/* Search Criteria */}
      <div className="bg-secondary rounded-xl p-4 border border-themed">
        <h3 className="text-lg font-semibold text-primary mb-3">Search Criteria</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Search Type</label>
            <select
              className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2"
              value={searchCriteria.searchType}
              onChange={(e) => setSearchCriteria(prev => ({ ...prev, searchType: e.target.value }))}
            >
              <option value="area">Exact Area Match</option>
              <option value="partial_area">Partial Area Match</option>
              <option value="store">Store Number</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-primary mb-1">
              {searchCriteria.searchType === 'store' ? 'Store Number' : 'Area Name'}
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2"
              placeholder={searchCriteria.searchType === 'store' ? 'e.g., 1458' : 'e.g., test, Test Area'}
              value={searchCriteria.searchValue}
              onChange={(e) => setSearchCriteria(prev => ({ ...prev, searchValue: e.target.value }))}
            />
          </div>
          
          {searchCriteria.searchType !== 'store' && (
            <div>
              <label className="block text-sm font-medium text-primary mb-1">Filter by Store (Optional)</label>
              <input
                type="text"
                className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2"
                placeholder="e.g., 1458"
                value={searchCriteria.store}
                onChange={(e) => setSearchCriteria(prev => ({ ...prev, store: e.target.value }))}
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Date Range</label>
            <select
              className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2"
              value={searchCriteria.dateRange}
              onChange={(e) => setSearchCriteria(prev => ({ ...prev, dateRange: e.target.value }))}
            >
              <option value="all">All Time</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="90days">Last 90 Days</option>
            </select>
          </div>
        </div>
        
        <div className="mt-4 flex gap-2">
          <Button onClick={handleSearch} disabled={searching}>
            {searching ? 'Searching...' : 'Search Logs'}
          </Button>
          
          {searchResults.length > 0 && (
            <Button 
              onClick={handleDeleteSelected} 
              disabled={deleting || selectedLogs.size === 0}
              className="bg-red-500 hover:bg-red-600"
            >
              {deleting ? `Deleting... (${selectedLogs.size})` : `Delete Selected (${selectedLogs.size})`}
            </Button>
          )}
        </div>
        
        {message && (
          <div className={`mt-3 text-sm p-2 rounded ${message.includes('Error') || message.includes('⚠️') ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>
            {message}
          </div>
        )}
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <div className="bg-secondary rounded-xl p-4 border border-themed">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-primary">Search Results ({stats.total} found, {stats.selected} selected)</h3>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={selectedLogs.size === searchResults.length && searchResults.length > 0}
                onChange={handleSelectAll}
              />
              Select All
            </label>
          </div>
          
          <div className="max-h-96 overflow-y-auto space-y-2">
            {searchResults.map((log) => (
              <div key={log.id} className="flex items-start gap-3 p-3 bg-tertiary rounded border border-themed">
                <input
                  type="checkbox"
                  className="mt-1 rounded"
                  checked={selectedLogs.has(log.id)}
                  onChange={() => handleSelectLog(log.id)}
                />
                <div className="flex-1 text-sm">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div>
                      <span className="font-medium text-primary">Store:</span>
                      <span className="ml-1 text-primary">{log.store || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-primary">Area:</span>
                      <span className="ml-1 text-primary">{log.area || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-primary">Date:</span>
                      <span className="ml-1 text-primary">{log.timestamp.toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span className="font-medium text-primary">Time:</span>
                      <span className="ml-1 text-primary">{log.timestamp.toLocaleTimeString()}</span>
                    </div>
                  </div>
                  {log.responderName && (
                    <div className="mt-1">
                      <span className="font-medium text-primary">Responder:</span>
                      <span className="ml-1 text-primary">{log.responderName}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// Enhanced Admin User Management System
function GroupMeDataDisplay({ userId, isAdmin }) {
  const [groupmeData, setGroupmeData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const { auth } = useFirebase();
  const user = auth?.currentUser;

  const fetchGroupMeData = async () => {
    if (!userId || !user) return;
    
    setLoading(true);
    setError("");
    
    try {
      const token = await user.getIdToken();
      // Try direct function URL if rewrite fails (fallback for deployment issues)
      const baseUrl = window.location.hostname === 'localhost' 
        ? '/api/groupme/admin-user-data'
        : 'https://us-central1-qrwebaccdb.cloudfunctions.net/groupmeAdminUserData';
      
      const response = await fetch(`${baseUrl}?firebase_uid=${encodeURIComponent(userId)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setGroupmeData(data);
      } else if (response.status === 404) {
        setGroupmeData({ groupme_data: { tokens: [], bots: [], recent_webhook_activity: [], summary: { total_tokens: 0, total_bots: 0, stores_with_bots: [], recent_activity_count: 0 } } });
      } else {
        const errorText = await response.text();
        setError(`Failed to fetch GroupMe data: ${errorText}`);
      }
    } catch (err) {
      setError(`Error fetching GroupMe data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded && !groupmeData) {
      fetchGroupMeData();
    }
  }, [expanded, userId]);

  if (!userId) return null;

  return (
    <div className="border border-gray-600 rounded-lg p-4 bg-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-lg font-medium text-white flex items-center gap-2">
          <span className="text-green-400">📱</span>
          GroupMe Integration Data
        </h4>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-blue-400 hover:text-blue-300 text-sm"
        >
          {expanded ? "Hide" : "Show"} Details
        </button>
      </div>

      {expanded && (
        <div className="space-y-4">
          {loading && (
            <div className="text-center py-4">
              <div className="text-gray-400">Loading GroupMe data...</div>
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-3">
              <div className="text-red-400 text-sm">{error}</div>
            </div>
          )}

          {groupmeData && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                <div className="bg-gray-700 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-blue-400">{groupmeData.groupme_data.summary.total_tokens}</div>
                  <div className="text-xs text-gray-400">Tokens</div>
                </div>
                <div className="bg-gray-700 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-green-400">{groupmeData.groupme_data.summary.total_bots}</div>
                  <div className="text-xs text-gray-400">Bots</div>
                </div>
                <div className="bg-gray-700 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-purple-400">{groupmeData.groupme_data.summary.stores_with_bots.length}</div>
                  <div className="text-xs text-gray-400">Stores</div>
                </div>
                <div className="bg-gray-700 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-orange-400">{groupmeData.groupme_data.summary.recent_activity_count}</div>
                  <div className="text-xs text-gray-400">Webhooks</div>
                </div>
                <div className="bg-gray-700 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-cyan-400">{groupmeData.groupme_data.summary.successful_posts || 0}</div>
                  <div className="text-xs text-gray-400">Sent</div>
                </div>
                <div className="bg-gray-700 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-red-400">{groupmeData.groupme_data.summary.failed_posts || 0}</div>
                  <div className="text-xs text-gray-400">Failed</div>
                </div>
              </div>

              {/* Connected Stores */}
              {groupmeData.groupme_data.summary.stores_with_bots.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-gray-300 mb-2">Connected Stores:</h5>
                  <div className="flex flex-wrap gap-2">
                    {groupmeData.groupme_data.summary.stores_with_bots.map(store => (
                      <span key={store} className="px-2 py-1 bg-blue-600 text-white text-xs rounded">
                        Store {store}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* GroupMe Accounts */}
              {groupmeData.groupme_data.tokens.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-gray-300 mb-2">GroupMe Accounts ({groupmeData.groupme_data.tokens.length}):</h5>
                  <div className="space-y-2">
                    {groupmeData.groupme_data.tokens.map(token => (
                      <div key={token.groupme_user_id} className="bg-gray-700 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-white">
                              ID: {token.groupme_user_id}
                              {token.user_name && <span className="text-gray-400 ml-2">({token.user_name})</span>}
                            </div>
                            <div className="text-xs text-gray-400">
                              Connected: {token.created_at ? new Date(token.created_at.seconds * 1000).toLocaleDateString() : 'Unknown'}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${token.has_token ? 'bg-green-400' : 'bg-red-400'}`}></span>
                            <span className="text-xs text-gray-400">{token.has_token ? 'Active' : 'No Token'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bots */}
              {groupmeData.groupme_data.bots.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-gray-300 mb-2">Active Bots ({groupmeData.groupme_data.bots.length}):</h5>
                  <div className="space-y-2">
                    {groupmeData.groupme_data.bots.map(bot => (
                      <div key={bot.bot_id} className="bg-gray-700 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-white">{bot.name}</div>
                            <div className="text-xs text-gray-400">
                              Store: {bot.store || 'Unknown'} | Group: {bot.group_id}
                            </div>
                            <div className="text-xs text-gray-500">
                              Bot ID: {bot.bot_id}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {bot.synced && <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Synced</span>}
                            <span className="text-xs text-gray-400">
                              {bot.created_at ? new Date(bot.created_at.seconds * 1000).toLocaleDateString() : 'Unknown'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Bot Posts */}
              {groupmeData.groupme_data.recent_bot_posts && groupmeData.groupme_data.recent_bot_posts.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-gray-300 mb-2">Recent Bot Posts ({groupmeData.groupme_data.recent_bot_posts.length}):</h5>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {groupmeData.groupme_data.recent_bot_posts.map((post, index) => (
                      <div key={index} className="text-xs text-gray-400 bg-gray-700 rounded p-2">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${post.success ? 'bg-green-400' : 'bg-red-400'}`}></span>
                            Store {post.store} - {post.area}
                          </span>
                          <span>{post.timestamp ? new Date(post.timestamp.seconds * 1000).toLocaleString() : 'Unknown'}</span>
                        </div>
                        <div className="text-gray-500 mt-1 truncate">{post.message}</div>
                        <div className="text-gray-600">Group: {post.group_id} | Status: {post.response_status}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Activity */}
              {groupmeData.groupme_data.recent_webhook_activity.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-gray-300 mb-2">Recent Webhook Activity ({groupmeData.groupme_data.recent_webhook_activity.length}):</h5>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {groupmeData.groupme_data.recent_webhook_activity.map((activity, index) => (
                      <div key={index} className="text-xs text-gray-400 bg-gray-700 rounded p-2">
                        <div className="flex items-center justify-between">
                          <span>{activity.sender_name} - {activity.message_type}</span>
                          <span>{activity.timestamp ? new Date(activity.timestamp.seconds * 1000).toLocaleString() : 'Unknown'}</span>
                        </div>
                        <div className="text-gray-500">
                          Group: {activity.group_id}
                          {activity.text_preview && <span> | "{activity.text_preview.substring(0, 30)}..."</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Data Message */}
              {groupmeData.groupme_data.summary.total_tokens === 0 && groupmeData.groupme_data.summary.total_bots === 0 && (
                <div className="text-center py-6 text-gray-400">
                  <div className="text-4xl mb-2">📱</div>
                  <div>No GroupMe integration data found</div>
                  <div className="text-sm text-gray-500">This user hasn't connected any GroupMe accounts</div>
                </div>
              )}

              {/* Refresh Button */}
              <div className="flex justify-end">
                <button
                  onClick={fetchGroupMeData}
                  disabled={loading}
                  className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded"
                >
                  {loading ? "Refreshing..." : "Refresh Data"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UserManagement({ db }) {
  const [searchType, setSearchType] = useState("email");
  const [searchValue, setSearchValue] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const searchTypes = [
    { value: "email", label: "Email Address" },
    { value: "name", label: "Name (First/Last)" },
    { value: "store", label: "Store Number" },
    { value: "market", label: "Market Number" },
    { value: "region", label: "Region Number" }
  ];

  async function handleSearch(e) {
    e.preventDefault();
    setError("");
    setResults([]);
    if (!searchValue.trim()) return setError("Enter a search value.");
    
    setLoading(true);
    try {
      const { getDocs, collection, query, where, orderBy } = await import("firebase/firestore");
      let q;
      
      switch (searchType) {
        case "email":
          q = query(collection(db, "users"), where("email", "==", searchValue.trim().toLowerCase()));
          break;
        case "name":
          // Search by first name or last name (case insensitive)
          const searchTerm = searchValue.trim().toLowerCase();
          q = query(collection(db, "users"), orderBy("firstName"));
          break;
        case "store":
          // Find users with access to this store
          const storeNum = parseInt(searchValue.trim());
          if (isNaN(storeNum)) {
            setError("Store number must be a valid number.");
            setLoading(false);
            return;
          }
          q = query(collection(db, "users"));
          break;
        case "market":
          const marketNum = parseInt(searchValue.trim());
          if (isNaN(marketNum)) {
            setError("Market number must be a valid number.");
            setLoading(false);
            return;
          }
          q = query(collection(db, "users"), where("selectionType", "==", "market"), where("selectionValue", "==", marketNum));
          break;
        case "region":
          const regionNum = parseInt(searchValue.trim());
          if (isNaN(regionNum)) {
            setError("Region number must be a valid number.");
            setLoading(false);
            return;
          }
          q = query(collection(db, "users"), where("selectionType", "==", "region"), where("selectionValue", "==", regionNum));
          break;
        default:
          q = query(collection(db, "users"));
      }
      
      const snap = await getDocs(q);
      let foundUsers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Client-side filtering for complex searches
      if (searchType === "name") {
        const searchTerm = searchValue.trim().toLowerCase();
        foundUsers = foundUsers.filter(user => 
          user.firstName?.toLowerCase().includes(searchTerm) || 
          user.lastName?.toLowerCase().includes(searchTerm)
        );
      } else if (searchType === "store") {
        const storeStr = searchValue.trim();
        const storeNum = parseInt(storeStr);
        foundUsers = foundUsers.filter(user => {
          // Check if user has access to this store
          if (user.allowedStores && Array.isArray(user.allowedStores)) {
            // Check both string and number versions since data might be inconsistent
            return user.allowedStores.includes(storeNum) || 
                   user.allowedStores.includes(storeStr) ||
                   user.allowedStores.some(s => String(s) === storeStr);
          }
          // Check homeStore field (might be string or number)
          if (user.homeStore) {
            return String(user.homeStore) === storeStr;
          }
          // Fallback to old storeNumber field (might be string or number)
          if (user.storeNumber) {
            return String(user.storeNumber) === storeStr;
          }
          // Check store field as well
          if (user.store) {
            return String(user.store) === storeStr;
          }
          return false;
        });
      }
      
      if (foundUsers.length === 0) {
        setError(`No users found for ${searchTypes.find(t => t.value === searchType)?.label}: "${searchValue}"`);
      } else {
        setResults(foundUsers);
      }
    } catch (err) {
      console.error("Search error:", err);
      setError("Error searching: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  }

  function startEdit(user) {
    setEditingUser(user);
    setEditForm({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email || "",
      phone: user.phone || "",
      jobTitle: user.jobTitle || "",
      storeNumber: user.storeNumber || "",
      homeStore: user.homeStore || "",
      selectionType: user.selectionType || "store",
      selectionValue: user.selectionValue || "",
      approved: user.approved || false,
      emailVerified: user.emailVerified || false
    });
  }

  async function saveUser() {
    if (!editingUser) return;
    
    setSaving(true);
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const userRef = doc(db, "users", editingUser.id);
      
      // Calculate allowedStores based on selection
      let allowedStores = [];
      if (editForm.selectionType === "store" && editForm.selectionValue) {
        allowedStores = [parseInt(editForm.selectionValue)];
      } else if (editForm.selectionType === "market" && editForm.selectionValue) {
        // Get stores for this market from storeHierarchy
        const { getAllStoresForSelection } = await import("./storeHierarchy.js");
        allowedStores = getAllStoresForSelection("market", editForm.selectionValue);
      } else if (editForm.selectionType === "region" && editForm.selectionValue) {
        const { getAllStoresForSelection } = await import("./storeHierarchy.js");
        allowedStores = getAllStoresForSelection("region", editForm.selectionValue);
      } else if (editForm.selectionType === "bu" && editForm.selectionValue) {
        const { getAllStoresForSelection } = await import("./storeHierarchy.js");
        allowedStores = getAllStoresForSelection("bu", editForm.selectionValue);
      }

      const updateData = {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        email: editForm.email.toLowerCase(),
        phone: editForm.phone,
        jobTitle: editForm.jobTitle,
        storeNumber: parseInt(editForm.storeNumber) || null,
        homeStore: (editForm.homeStore || "").trim() || null,
        selectionType: editForm.selectionType,
        selectionValue: editForm.selectionValue,
        allowedStores,
        approved: editForm.approved,
        emailVerified: editForm.emailVerified
      };

      await updateDoc(userRef, updateData);
      
      // Update local results
      setResults(results.map(user => 
        user.id === editingUser.id 
          ? { ...user, ...updateData }
          : user
      ));
      
      setEditingUser(null);
      setEditForm({});
    } catch (err) {
      console.error("Save error:", err);
      setError("Error saving user: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-secondary rounded-xl p-6 border border-themed">
        <h3 className="text-lg font-semibold text-primary mb-4">User Management</h3>
        
        {/* Search Form */}
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-primary mb-2">Search By:</label>
              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
                className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm"
              >
                {searchTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-primary mb-2">Search Value:</label>
              <input
                type="text"
                className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm"
                placeholder={`Enter ${searchTypes.find(t => t.value === searchType)?.label.toLowerCase()}`}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                required
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Searching..." : "Search Users"}
              </Button>
            </div>
          </div>
        </form>

        {error && <div className="text-sm text-red-600 mt-4 p-3 bg-red-50 rounded-xl">{error}</div>}
      </div>

      {/* Search Results */}
      {results.length > 0 && (
        <div className="bg-secondary rounded-xl p-6 border border-themed">
          <h4 className="text-md font-semibold text-primary mb-4">
            Found {results.length} user{results.length !== 1 ? 's' : ''}
          </h4>
          
          <div className="space-y-4">
            {results.map(user => (
              <div key={user.id} className="bg-tertiary rounded-xl border border-themed p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                  <div>
                    <strong className="text-primary">Name:</strong>
                    <div>{user.firstName} {user.lastName}</div>
                  </div>
                  <div>
                    <strong className="text-primary">Email:</strong>
                    <div className="font-mono text-xs">{user.email}</div>
                  </div>
                  <div>
                    <strong className="text-primary">Access:</strong>
                    <div>{user.selectionType}: {user.selectionValue || user.storeNumber}</div>
                  </div>
                  <div>
                    <strong className="text-primary">Job Title:</strong>
                    <div>{user.jobTitle || "Not specified"}</div>
                  </div>
                  <div>
                    <strong className="text-primary">Status:</strong>
                    <div className="space-x-2">
                      <span className={user.approved ? "text-green-600" : "text-red-600"}>
                        {user.approved ? "✅ Approved" : "❌ Pending"}
                      </span>
                      <span className={user.emailVerified ? "text-green-600" : "text-yellow-600"}>
                        {user.emailVerified ? "📧 Verified" : "📧 Unverified"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <strong className="text-primary">Stores:</strong>
                    <div className="text-xs">
                      {user.allowedStores && user.allowedStores.length > 0 
                        ? user.allowedStores.join(", ")
                        : user.storeNumber || "None"
                      }
                    </div>
                  </div>
                  {user.homeStore && (
                    <div>
                      <strong className="text-primary">Home Store:</strong>
                      <div className="text-xs">{user.homeStore}</div>
                    </div>
                  )}
                </div>
                
                {/* GroupMe Integration Status */}
                <GroupMeDataDisplay userId={user.id} />
                
                <div className="mt-4 flex justify-end">
                  <Button 
                    onClick={() => startEdit(user)}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2"
                  >
                    Edit User
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-secondary rounded-xl p-6 border border-themed max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-primary mb-4">
              Edit User: {editingUser.firstName} {editingUser.lastName}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-primary mb-1">First Name:</label>
                <input
                  type="text"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({...editForm, firstName: e.target.value})}
                  className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Last Name:</label>
                <input
                  type="text"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({...editForm, lastName: e.target.value})}
                  className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Email:</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                  className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Phone:</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                  className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Job Title:</label>
                <input
                  type="text"
                  value={editForm.jobTitle}
                  onChange={(e) => setEditForm({...editForm, jobTitle: e.target.value})}
                  className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Access Level:</label>
                <select
                  value={editForm.selectionType}
                  onChange={(e) => setEditForm({...editForm, selectionType: e.target.value})}
                  className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm"
                >
                  <option value="store">Store</option>
                  <option value="market">Market</option>
                  <option value="region">Region</option>
                  <option value="bu">Business Unit</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-1">
                  {editForm.selectionType.charAt(0).toUpperCase() + editForm.selectionType.slice(1)} Number:
                </label>
                <input
                  type="number"
                  value={editForm.selectionValue}
                  onChange={(e) => setEditForm({...editForm, selectionValue: e.target.value})}
                  className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Legacy Store Number:</label>
                <input
                  type="number"
                  value={editForm.storeNumber}
                  onChange={(e) => setEditForm({...editForm, storeNumber: e.target.value})}
                  className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm"
                  placeholder="For backward compatibility"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Home Store:</label>
                <input
                  type="number"
                  value={editForm.homeStore}
                  onChange={(e) => setEditForm({...editForm, homeStore: e.target.value})}
                  className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm"
                  placeholder="Store for QR code generation"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="approved"
                  checked={editForm.approved}
                  onChange={(e) => setEditForm({...editForm, approved: e.target.checked})}
                  className="rounded"
                />
                <label htmlFor="approved" className="text-sm text-primary">Account Approved</label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="emailVerified"
                  checked={editForm.emailVerified}
                  onChange={(e) => setEditForm({...editForm, emailVerified: e.target.checked})}
                  className="rounded"
                />
                <label htmlFor="emailVerified" className="text-sm text-primary">Email Verified</label>
              </div>
            </div>

            {/* GroupMe Data in Edit Modal */}
            <div className="mb-6">
              <GroupMeDataDisplay userId={editingUser.id} />
            </div>

            <div className="flex justify-end space-x-3">
              <Button
                onClick={() => {setEditingUser(null); setEditForm({});}}
                className="bg-gray-500 hover:bg-gray-600 text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={saveUser}
                disabled={saving}
                className="bg-green-500 hover:bg-green-600 text-white"
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Shell({ user, onSignOut }) {
  const { db } = useFirebase();
  const isAdmin = user?.email === "sinaptick@gmail.com";
  const [active, setActive] = useState("Dashboard");
  const [showContactUs, setShowContactUs] = useState(false);
  const [currentAdminView, setCurrentAdminView] = useState("overview");
  const [currentSettingsView, setCurrentSettingsView] = useState("account");

  // Approval gate
  const [userDoc, setUserDoc] = useState(null);
  
  // Determine available tabs based on user permissions
  const getAvailableTabs = () => {
    let baseTabs = ["Dashboard", "Insights"];
    
    // Only show Generate QR for single-store users or admins
    if (isAdmin || (userDoc && (!userDoc.allowedStores || userDoc.allowedStores.length === 1))) {
      baseTabs.push("Generate QR");
    }
    
    baseTabs.push("Settings");
    
    if (isAdmin) {
      baseTabs.push("Admin");
    }
    
    baseTabs.push("Setup");
    return baseTabs;
  };
  
  const tabs = getAvailableTabs();
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

  // Insights data using custom hook
  const insightsData = useInsightsData(active, db, userDoc);



  // Build filtered logs for InsightsAI (apply additional user permissions on top of hook data)
  const filteredLogs = useMemo(() => {
    if (!insightsData.filteredLogs?.length) return [];
    return insightsData.filteredLogs.filter((l) => {
      // Non-admin users can only see data from their accessible stores
      if (!isAdmin && userDoc) {
        const accessibleStores = userDoc.allowedStores || (userDoc.storeNumber ? [userDoc.storeNumber] : []);
        if (!accessibleStores.some(store => String(l.store) === String(store))) {
          return false;
        }
      }
      return true;
    });
  }, [insightsData.filteredLogs, isAdmin, userDoc?.storeNumber, userDoc?.allowedStores]);

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

        <TabContent
          active={active}
          user={user}
          isAdmin={isAdmin}
          userDoc={userDoc}
          db={db}
          showContactUs={showContactUs}
          setShowContactUs={setShowContactUs}
          currentSettingsView={currentSettingsView}
          setCurrentSettingsView={setCurrentSettingsView}
          currentAdminView={currentAdminView}
          setCurrentAdminView={setCurrentAdminView}
          insightsData={insightsData}
          filteredLogs={filteredLogs}
          setActive={setActive}
        />
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
// Landing component moved to components/layout/LandingPage.jsx

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

  if (!user) return <LandingPage />;

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

// Export components for use in other files
export { Dashboard, TopResponders, GenerateQR, Settings };

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