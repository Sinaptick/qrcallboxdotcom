import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Card, CardHeader, CardBody } from "../shared/Card.jsx";
import { Input } from "../shared/FormField.jsx";
import Button from "../../Button.jsx";
import { useFirebase } from "../../hooks/useFirebase.js";
import { validatePassword, mapAuthError } from "../../config/constants.js";
import {
  getAllStoresForSelection,
  getSelectionDisplayName,
  getBUOptions,
  getRegionOptions,
  getMarketOptions,
} from "../../storeHierarchy.js";

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
  const [selectionType, setSelectionType] = useState("");
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
    
    if (!selectionType) return setError("Please select a level (Store, Market, Region, or BU).");
    if (!selectionValue) return setError("Please enter or select a value.");
    
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
        storeNumber: allowedStores[0],
        homeStore: (form.homeStore || "").trim() || allowedStores[0],
        allowedStores: allowedStores,
        selectionType: selectionType,
        selectionValue: selectionValue,
        selectionDisplay: getSelectionDisplayName(selectionType, selectionValue),
        jobTitle: form.jobTitle.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        createdAt: serverTimestamp(),
        emailVerified: cred.user.emailVerified || false,
        approved: true,
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
            <Button type="submit" disabled={loading}>{loading ? "Creating…" : "Create Account"}</Button>
            <button type="button" onClick={onSwitch} className="text-sm text-indigo-400 hover:text-indigo-300 hover:underline">Have an account? Sign in</button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

export default RegisterForm;