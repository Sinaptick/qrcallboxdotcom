import React, { useState, useEffect, useCallback } from "react";
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc, orderBy, query } from "firebase/firestore";
import { db } from "../../config/firebase.config.js";

/**
 * DepartmentManager Component
 * Manages predefined QR location departments (e.g., Electronics, Beauty, etc.)
 */
const DepartmentManager = React.memo(function DepartmentManager() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  const loadLocations = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "qr_locations"), orderBy("order", "asc"));
      const snap = await getDocs(q);
      const locs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLocations(locs);
    } catch (error) {
      console.error("Error loading locations:", error);
      setMessage({ type: "error", text: "Failed to load: " + error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newId.trim() || !newName.trim()) return;

    const id = newId.toLowerCase().replace(/[^a-z0-9]/g, "_");
    
    if (locations.find(l => l.id === id)) {
      setMessage({ type: "error", text: "Location ID already exists" });
      return;
    }

    setSaving(true);
    try {
      const maxOrder = locations.reduce((max, l) => Math.max(max, l.order || 0), 0);
      await setDoc(doc(db, "qr_locations", id), {
        name: newName.trim(),
        order: maxOrder + 1,
        active: true,
        createdAt: new Date()
      });
      setNewId("");
      setNewName("");
      setMessage({ type: "success", text: "Added " + newName.trim() });
      loadLocations();
    } catch (error) {
      setMessage({ type: "error", text: "Failed to add: " + error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id) => {
    if (!editName.trim()) return;
    
    setSaving(true);
    try {
      await updateDoc(doc(db, "qr_locations", id), { name: editName.trim() });
      setEditingId(null);
      setEditName("");
      setMessage({ type: "success", text: "Updated successfully" });
      loadLocations();
    } catch (error) {
      setMessage({ type: "error", text: "Failed to update: " + error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (loc) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, "qr_locations", loc.id), { active: !loc.active });
      loadLocations();
    } catch (error) {
      setMessage({ type: "error", text: "Failed to toggle: " + error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm("Delete " + name + "? This cannot be undone.")) return;
    
    setSaving(true);
    try {
      await deleteDoc(doc(db, "qr_locations", id));
      setMessage({ type: "success", text: "Deleted " + name });
      loadLocations();
    } catch (error) {
      setMessage({ type: "error", text: "Failed to delete: " + error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleReorder = async (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= locations.length) return;

    setSaving(true);
    try {
      const loc1 = locations[index];
      const loc2 = locations[newIndex];
      await updateDoc(doc(db, "qr_locations", loc1.id), { order: loc2.order });
      await updateDoc(doc(db, "qr_locations", loc2.id), { order: loc1.order });
      loadLocations();
    } catch (error) {
      setMessage({ type: "error", text: "Failed to reorder: " + error.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-muted">Loading departments...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-secondary mb-4">
        Manage the predefined department/location list for QR codes. These standardized names ensure consistent reporting across all stores.
      </div>

      {message && (
        <div className={"p-3 rounded-lg text-sm " + (message.type === "error" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300")}>
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-2 opacity-70 hover:opacity-100">x</button>
        </div>
      )}

      <div className="bg-secondary rounded-xl p-4 border border-themed">
        <h4 className="text-md font-semibold mb-3 text-primary">Add New Department</h4>
        <form onSubmit={handleAdd} className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="ID (e.g., electronics)"
            value={newId}
            onChange={(e) => setNewId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            className="px-3 py-2 border border-themed rounded-lg bg-primary text-primary w-40"
            disabled={saving}
          />
          <input
            type="text"
            placeholder="Display Name (e.g., Electronics)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="px-3 py-2 border border-themed rounded-lg bg-primary text-primary flex-1 min-w-[200px]"
            disabled={saving}
          />
          <button
            type="submit"
            disabled={saving || !newId.trim() || !newName.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Adding..." : "Add"}
          </button>
        </form>
      </div>

      <div className="bg-secondary rounded-xl p-4 border border-themed">
        <h4 className="text-md font-semibold mb-3 text-primary">
          Departments ({locations.length})
        </h4>
        
        <div className="space-y-2">
          {locations.map((loc, index) => (
            <div
              key={loc.id}
              className={"flex items-center gap-3 p-3 rounded-lg border " + (loc.active ? "bg-primary border-themed" : "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 opacity-60")}
            >
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleReorder(index, -1)}
                  disabled={index === 0 || saving}
                  className="text-xs px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleReorder(index, 1)}
                  disabled={index === locations.length - 1 || saving}
                  className="text-xs px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-30"
                >
                  ▼
                </button>
              </div>

              <div className="flex-1">
                {editingId === loc.id ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="px-2 py-1 border border-themed rounded bg-primary text-primary flex-1"
                      autoFocus
                    />
                    <button onClick={() => handleUpdate(loc.id)} disabled={saving} className="px-2 py-1 bg-green-600 text-white rounded text-sm">Save</button>
                    <button onClick={() => { setEditingId(null); setEditName(""); }} className="px-2 py-1 bg-gray-500 text-white rounded text-sm">Cancel</button>
                  </div>
                ) : (
                  <div>
                    <span className="font-semibold text-primary">{loc.name}</span>
                    <span className="ml-2 text-xs text-muted font-mono">({loc.id})</span>
                  </div>
                )}
              </div>

              {editingId !== loc.id && (
                <div className="flex gap-2">
                  <button onClick={() => { setEditingId(loc.id); setEditName(loc.name); }} disabled={saving} className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50">Edit</button>
                  <button onClick={() => handleToggleActive(loc)} disabled={saving} className={"px-2 py-1 text-xs rounded " + (loc.active ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300" : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300")}>{loc.active ? "Disable" : "Enable"}</button>
                  <button onClick={() => handleDelete(loc.id, loc.name)} disabled={saving} className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50">Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-muted">
        <p><strong>Note:</strong> Changes here affect all stores. The location ID is used internally for reporting.</p>
        <p className="mt-1">Future: Add job code restrictions to limit notifications by department.</p>
      </div>
    </div>
  );
});

export default DepartmentManager;
