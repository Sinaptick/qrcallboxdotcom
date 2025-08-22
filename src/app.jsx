// --- Imports (keep at very top) ---
import React, { useEffect, useMemo, useState } from "react";
import Heatmap from "./Heatmap.jsx";
import * as QR from "qrcode";
import { mint } from "./lib/api.js";
import PosterWithQR from "./PosterWithQR.jsx";
import { initializeApp, getApps } from "firebase/app";
import UnapprovedUsersList from "./UnapprovedUsersList.jsx";
import InsightsAI from "./InsightsAI.jsx";
import GroupMeSetup from "./GroupMeSetup.jsx";
import Button from "./Button.jsx"; // must export default Button in Button.jsx
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
// 🔧 Firebase Setup
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
    <div className={`bg-white rounded-2xl shadow-sm ring-1 ring-black/5 ${className}`}>
      {children}
    </div>
  );
}
function CardHeader({ title, subtitle }) {
  return (
    <div className="p-6 border-b border-gray-100">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {subtitle ? <p className="text-sm text-gray-500 mt-1">{subtitle}</p> : null}
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
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        className="mt-1 w-full rounded-xl border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 border px-3 py-2"
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
    <div className="flex gap-2 flex-wrap">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-3 py-1.5 text-sm rounded-xl border ${
            current === t
              ? "bg-indigo-50 text-indigo-700 border-indigo-200"
              : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
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
      const shortUrl = `https://qrcallbox.com/s?t=${encodeURIComponent(data.token)}`;
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
      <div className="bg-white rounded-2xl border p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm text-gray-700">Store number</span>
            <input
              className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2
                         placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none
                         focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. 1458"
              value={store}
              onChange={(e) => setStore(e.target.value)}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-sm text-gray-700">Area</span>
            <input
              className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2
                         placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none
                         focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Electronics"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
          </label>
        </div>

        {error && <div className="mt-3 text-sm text-red-600">{error}</div>}

        <div className="mt-3 flex gap-2">
          <Button onClick={generate} disabled={!ready}>
            {busy ? "Generating…" : "Generate QR"}
          </Button>

          <button
            onClick={downloadPng}
            disabled={!qrDataUrl}
            className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold
                       bg-gray-100 text-gray-900 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            Download PNG
          </button>

          {qrDataUrl && (
            <Button onClick={handlePrintPoster}>Print</Button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border p-6 grid place-items-center">
        {qrDataUrl ? (
          <PosterWithQR ref={posterRef} qrDataUrl={qrDataUrl} />
        ) : (
          <div className="w-64 h-64 grid place-items-center text-gray-400 border rounded-xl">
            QR preview
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------
// 🔐 Auth Views
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
              <div className="text-gray-700 mb-4">{error}</div>
            </div>
          ) : (
            <div className="mb-3 text-sm text-red-600 whitespace-pre-line">{error}</div>
          ))}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required autoComplete="email" />
          <Input label="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required autoComplete="current-password" />
          <div className="flex items-center justify-between">
            <Button type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
            <button type="button" onClick={onSwitch} className="text-sm text-indigo-700 hover:underline">
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
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="First name" value={form.firstName} onChange={updateField("firstName")} required autoComplete="given-name" />
          <Input label="Last name" value={form.lastName} onChange={updateField("lastName")} required autoComplete="family-name" />
          <Input label="Store number" value={form.storeNumber} onChange={updateField("storeNumber")} required />
          <Input label="Job title" value={form.jobTitle} onChange={updateField("jobTitle")} required />
          <Input label="Phone number" value={form.phone} onChange={updateField("phone")} required autoComplete="tel" />
          <Input label="Email address" type="email" value={form.email} onChange={updateField("email")} required autoComplete="email" />
          <Input label="Password" type="password" value={form.password} onChange={updateField("password")} required autoComplete="new-password" />
          <Input label="Confirm password" type="password" value={form.confirm} onChange={updateField("confirm")} required autoComplete="new-password" />

          <div className="md:col-span-2 space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${passwordOk ? "bg-emerald-500" : "bg-gray-300"}`} />
              <span>At least 8 chars, with a letter and a number</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${passwordsMatch ? "bg-emerald-500" : "bg-gray-300"}`} />
              <span>Passwords match</span>
            </div>
          </div>

          <div className="md:col-span-2 flex items-center justify-between mt-2">
            <Button type="submit" disabled={loading}>{loading ? "Creating…" : "Create account"}</Button>
            <button type="button" onClick={onSwitch} className="text-sm text-indigo-700 hover:underline">Have an account? Sign in</button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

// -----------------------------
// 🧭 App Shell w/ Tabs (single definition)
// -----------------------------
function Settings({ user, onSignOut }) {
  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-600">
        Signed in as <span className="font-medium">{user.displayName || user.email}</span>
      </div>
      <Button onClick={onSignOut}>Sign out</Button>
    </div>
  );
}

function Dashboard() {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="rounded-xl border p-4">
        <div className="text-sm text-gray-500">Active scanners</div>
        <div className="mt-2 text-2xl font-semibold">—</div>
      </div>
      <div className="rounded-xl border p-4">
        <div className="text-sm text-gray-500">Requests today</div>
        <div className="mt-2 text-2xl font-semibold">—</div>
      </div>
      <div className="rounded-xl border p-4">
        <div className="text-sm text-gray-500">Avg. response time</div>
        <div className="mt-2 text-2xl font-semibold">—</div>
      </div>
    </div>
  );
}

// 👮 Admin user search (standalone)
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
    <div className="bg-gray-50 rounded-xl p-4 border max-w-lg">
      <form onSubmit={handleSearch} className="flex gap-2 mb-2">
        <input
          type="email"
          className="flex-1 rounded-xl border px-3 py-2 text-sm"
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
        <div className="text-sm bg-white rounded-xl border p-3">
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
    ? ["Dashboard", "Insights", "Generate QR", "Settings", "Admin"]
    : ["Dashboard", "Insights", "Generate QR", "Settings"];
  const [active, setActive] = useState("Dashboard");

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
        const { getDocs, collection } = await import("firebase/firestore");
        const logsSnap = await getDocs(collection(db, "logs"));
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
          setStores(Array.from(storeSet).sort());
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
      if (selectedStores.length && !selectedStores.includes(String(l.store))) return false;
      if (selectedAreas.length && !selectedAreas.includes(l.area)) return false;
      if (selectedWeek.length) {
        const label = labelForTs(l.ts);
        if (!label || !selectedWeek.includes(label)) return false;
      }
      return true;
    });
  }, [logs, selectedStores, selectedAreas, selectedWeek]);

  // Gate for unapproved users
  if (userDoc && userDoc.approved === false && !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-2xl shadow p-8 text-center">
          <div className="text-2xl font-bold mb-2">Welcome!</div>
          <div className="text-gray-700 mb-4">
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
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/90 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-600" />
            <div>
              <div className="text-lg font-semibold">QRcallbox</div>
              <div className="text-xs text-gray-500">Real-time assistance via QR</div>
            </div>
          </div>
          <div className="text-sm text-gray-600 hidden md:block">{user.displayName || user.email}</div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <Card>
          <CardBody className="flex items-center justify-between gap-4 flex-wrap">
            <Tabs tabs={tabs} current={active} onChange={setActive} />
          </CardBody>
        </Card>

        {active === "Dashboard" && (
          <Card>
            <CardHeader title="Dashboard" subtitle="Overview of live assistance activity" />
            <CardBody>
              <Dashboard />
            </CardBody>
          </Card>
        )}

        {active === "Insights" && (
          <Card>
            {/* Replace old subtitle with InsightsAI below */}
            <CardHeader title="Insights" subtitle={null} />
            <CardBody>
              <div className="flex flex-col md:flex-row gap-4 mb-6 relative">
                {/* Stores (scroll ~5 items) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Store(s)</label>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-left w-full bg-white hover:bg-gray-50 mb-1"
                    onClick={() => setShowStores(v => !v)}
                  >
                    {selectedStores.length ? `${selectedStores.length} selected` : "Choose store(s)"}
                  </button>
                  {showStores && (
                    <div
                      className="flex flex-col gap-1 min-w-[180px] border rounded bg-white shadow p-2 z-10 absolute max-h-40 overflow-y-auto"
                      onMouseLeave={() => setShowStores(false)}
                    >
                      {stores.length === 0 && <div className="text-gray-400">No stores found</div>}
                      {stores.map((store) => (
                        <label key={store} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="form-checkbox rounded h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Area(s)</label>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-left w-full bg-white hover:bg-gray-50 mb-1"
                    onClick={() => setShowAreas(v => !v)}
                  >
                    {selectedAreas.length ? `${selectedAreas.length} selected` : "Choose area(s)"}
                  </button>
                  {showAreas && (
                    <div
                      className="flex flex-col gap-1 min-w-[180px] border rounded bg-white shadow p-2 z-10 absolute max-h-40 overflow-y-auto"
                      onMouseLeave={() => setShowAreas(false)}
                    >
                      <label className="flex items-center gap-2 cursor-pointer select-none sticky top-0 bg-white py-1 border-b">
                        <input
                          type="checkbox"
                          className="form-checkbox rounded h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                          checked={allAreasChecked}
                          onChange={toggleAllAreas}
                        />
                        <span className="font-medium">Select All</span>
                      </label>

                      {filteredAreas.length === 0 && <div className="text-gray-400">No areas found</div>}
                      {filteredAreas.map((area) => (
                        <label key={area} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="form-checkbox rounded h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Week(s)</label>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-left w-full bg-white hover:bg-gray-50 mb-1"
                    onClick={() => setShowWeeks(v => !v)}
                  >
                    {selectedWeek.length ? `${selectedWeek.length} selected` : "Choose week(s)"}
                  </button>
                  {showWeeks && (
                    <div
                      className="flex flex-col gap-1 min-w-[220px] border rounded bg-white shadow p-2 z-10 absolute max-h-40 overflow-y-auto"
                      onMouseLeave={() => setShowWeeks(false)}
                    >
                      <label className="flex items-center gap-2 cursor-pointer select-none sticky top-0 bg-white py-1 border-b">
                        <input
                          type="checkbox"
                          className="form-checkbox rounded h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                          checked={allWeeksChecked}
                          onChange={toggleAllWeeks}
                        />
                        <span className="font-medium">Select All</span>
                      </label>

                      {filteredWeeks.length === 0 && <div className="text-gray-400">No weeks found</div>}
                      {filteredWeeks.map((week) => (
                        <label key={week} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="form-checkbox rounded h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
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
                selectedStores={selectedStores}
                selectedAreas={selectedAreas}
                selectedWeek={selectedWeek}
              />

              {/* Heatmap below (tooltips: add title attr inside Heatmap tiles if not already) */}
              {logsLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400">Loading data…</div>
              ) : (
                <Heatmap
                  logs={filteredLogs}
                  selectedStores={selectedStores}
                  selectedWeek={selectedWeek}
                  weeks={weeks}
                  selectedAreas={selectedAreas}
                />
              )}
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
            <CardHeader title="Settings" subtitle="Manage your account" />
            <CardBody>
              <Settings user={user} onSignOut={onSignOut} />

              {/* GroupMe setup */}
              <div className="mt-8">
                <GroupMeSetup />
              </div>
            </CardBody>
          </Card>
        )}

        {active === "Admin" && isAdmin && (
          <Card>
            <CardHeader title="Admin" subtitle="Admin tools and controls" />
            <CardBody>
              <div className="text-sm text-gray-600 mb-4">
                Welcome, admin user <span className="font-mono">sinaptick@gmail.com</span>.
              </div>
              <UnapprovedUsersList db={db} />
              <UserStatusSearch db={db} />
            </CardBody>
          </Card>
        )}
      </main>
    </div>
  );
}

// -----------------------------
// 🏁 Landing Page (Sign in / Register)
// -----------------------------
function Landing() {
  const [mode, setMode] = useState("signin");
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center p-6">
      <div className="absolute inset-x-0 top-0 p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-indigo-600" />
          <div className="text-lg font-semibold">QRcallbox</div>
        </div>
        <div className="text-sm text-gray-600 hidden md:block">Scan • Notify • Assist</div>
      </div>
      {mode === "signin" ? (
        <SignInForm onSwitch={() => setMode("register")} />
      ) : (
        <RegisterForm onSwitch={() => setMode("signin")} />
      )}
      <footer className="absolute bottom-0 inset-x-0 p-6 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} QRcallbox.com
      </footer>
    </div>
  );
}

// -----------------------------
// 🔄 App Root
// -----------------------------
function AppInner() {
  const { auth } = useFirebase();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setLoading(false);
    });
    return () => unsub();
  }, [auth]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="animate-pulse text-gray-500">Loading…</div>
      </div>
    );
  }

  if (!user) return <Landing />;

  return <Shell user={user} onSignOut={() => signOut(auth)} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
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