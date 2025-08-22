import React, { useEffect, useState } from "react";
import Button from "./Button.jsx";

export default function UnapprovedUsersList({ db }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editUser, setEditUser] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [deleteUser, setDeleteUser] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const { getDocs, collection, query, where } = await import("firebase/firestore");
        const q = query(collection(db, "users"), where("approved", "==", false));
        const snap = await getDocs(q);
        if (mounted) setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        if (mounted) setError("Error loading users: " + (err.message || err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [db]);

  async function handleApprove(uid) {
    try {
      const { updateDoc, doc } = await import("firebase/firestore");
      await updateDoc(doc(db, "users", uid), { approved: true });
      setUsers(users => users.filter(u => u.id !== uid));
    } catch (err) {
      alert("Error approving user: " + (err.message || err));
    }
  }

  function handleEdit(user) {
    setEditUser(user);
    setEditFields({ ...user });
  }

  function handleEditField(k, v) {
    setEditFields(f => ({ ...f, [k]: v }));
  }

  async function handleSaveEdit() {
    try {
      const { updateDoc, doc } = await import("firebase/firestore");
      const { id, ...fields } = editFields;
      await updateDoc(doc(db, "users", editUser.id), fields);
      setUsers(users => users.map(u => u.id === editUser.id ? { ...fields, id: editUser.id } : u));
      setEditUser(null);
    } catch (err) {
      alert("Error saving: " + (err.message || err));
    }
  }

  async function handleDelete(uid) {
    try {
      const { deleteDoc, doc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "users", uid));
      setUsers(users => users.filter(u => u.id !== uid));
      setDeleteUser(null);
      setDeleteConfirm("");
    } catch (err) {
      alert("Error deleting: " + (err.message || err));
    }
  }

  if (loading) return <div className="mb-4 text-sm text-muted">Loading unapproved users…</div>;
  if (error) return <div className="mb-4 text-sm text-red-600">{error}</div>;
  if (!users.length) return <div className="mb-4 text-sm text-muted">No unapproved users.</div>;

  return (
    <div className="mb-6">
      <div className="font-semibold mb-2 text-primary">Unapproved Users</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border border-themed rounded-xl bg-secondary">
          <thead>
            <tr className="bg-tertiary">
              <th className="p-2 text-primary">Email</th>
              <th className="p-2 text-primary">Name</th>
              <th className="p-2 text-primary">Store</th>
              <th className="p-2 text-primary">Job</th>
              <th className="p-2 text-primary">Phone</th>
              <th className="p-2 text-primary">Email Verified</th>
              <th className="p-2 text-primary">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-themed">
                <td className="p-2 font-mono text-primary">{u.email}</td>
                <td className="p-2 text-primary">{u.firstName} {u.lastName}</td>
                <td className="p-2 text-primary">{u.storeNumber}</td>
                <td className="p-2 text-primary">{u.jobTitle}</td>
                <td className="p-2 text-primary">{u.phone}</td>
                <td className="p-2 text-primary">{u.emailVerified ? "Yes" : "No"}</td>
                <td className="p-2 flex gap-2">
                  <Button onClick={() => handleApprove(u.id)} type="button">Approve</Button>
                  <Button onClick={() => handleEdit(u)} type="button">Edit</Button>
                  <Button onClick={() => setDeleteUser(u)} type="button" className="bg-red-500 hover:bg-red-600">Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-secondary rounded-xl p-6 shadow-xl max-w-md w-full border border-themed">
            <div className="font-semibold mb-2 text-primary">Edit User</div>
            <div className="space-y-2">
              {Object.entries(editFields).map(([k, v]) => (
                k !== "id" && (
                  <div key={k}>
                    <label className="block text-xs font-medium text-secondary mb-1">{k}</label>
                    <input
                      className="w-full rounded border border-themed bg-primary text-primary px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      value={v ?? ""}
                      onChange={e => handleEditField(k, e.target.value)}
                    />
                  </div>
                )
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleSaveEdit} type="button">Save</Button>
              <Button onClick={() => setEditUser(null)} type="button" className="bg-tertiary text-primary hover:bg-secondary">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteUser && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-secondary rounded-xl p-6 shadow-xl max-w-md w-full border border-themed">
            <div className="font-semibold mb-2 text-red-700">Delete User</div>
            <div className="mb-3 text-primary">Type <span className="font-mono bg-tertiary px-1 rounded">DELETE</span> to confirm deletion of <span className="font-mono">{deleteUser.email}</span>.</div>
            <input
              className="w-full rounded border border-themed bg-primary text-primary px-2 py-1 text-sm mb-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="Type DELETE to confirm"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => handleDelete(deleteUser.id)}
                type="button"
                disabled={deleteConfirm !== "DELETE"}
                className="bg-red-500 hover:bg-red-600"
              >Delete</Button>
              <Button onClick={() => { setDeleteUser(null); setDeleteConfirm(""); }} type="button" className="bg-tertiary text-primary hover:bg-secondary">Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
