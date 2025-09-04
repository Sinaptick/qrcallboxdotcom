import React, { useState, useEffect } from "react";
import Button from "../../Button.jsx";

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

export default PendingChangesList;