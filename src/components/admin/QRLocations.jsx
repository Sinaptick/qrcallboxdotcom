import React, { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, where, deleteDoc, doc, writeBatch } from "firebase/firestore";
import { db, auth } from "../../config/firebase.config.js";

/**
 * QRLocations Component
 * Manages QR code locations/areas for each store
 * Allows viewing all areas and deleting test/erroneous data
 */
const QRLocations = React.memo(function QRLocations() {
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [areas, setAreas] = useState([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(null);
  const [message, setMessage] = useState(null);

  // Load all unique stores from scans and qr_tokens
  const loadStores = useCallback(async () => {
    setLoading(true);
    try {
      const storeSet = new Set();

      // Get stores from scans collection
      const scansSnap = await getDocs(collection(db, "scans"));
      scansSnap.forEach((doc) => {
        const data = doc.data();
        if (data.storeNumber) {
          storeSet.add(String(data.storeNumber));
        }
      });

      // Get stores from qr_tokens collection
      const tokensSnap = await getDocs(collection(db, "qr_tokens"));
      tokensSnap.forEach((doc) => {
        const data = doc.data();
        if (data.store) {
          storeSet.add(String(data.store));
        }
      });

      // Get stores from logs collection
      const logsSnap = await getDocs(collection(db, "logs"));
      logsSnap.forEach((doc) => {
        const data = doc.data();
        if (data.store) {
          storeSet.add(String(data.store));
        }
      });

      const sortedStores = Array.from(storeSet).sort((a, b) => Number(a) - Number(b));
      setStores(sortedStores);
    } catch (error) {
      console.error("Error loading stores:", error);
      setMessage({ type: "error", text: `Failed to load stores: ${error.message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  // Load areas for selected store
  const loadAreas = useCallback(async (storeNumber) => {
    if (!storeNumber) {
      setAreas([]);
      return;
    }

    setAreasLoading(true);
    setMessage(null);

    try {
      const areaData = new Map(); // area -> { scans: count, tokens: count, logs: count, scanIds: [], tokenIds: [], logIds: [] }

      // Get areas from scans collection
      const scansSnap = await getDocs(collection(db, "scans"));
      scansSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const docStore = String(data.storeNumber || "");
        if (docStore === storeNumber) {
          const area = data.areaDescription || data.area || "Unknown";
          if (!areaData.has(area)) {
            areaData.set(area, { scans: 0, tokens: 0, logs: 0, scanIds: [], tokenIds: [], logIds: [] });
          }
          const entry = areaData.get(area);
          entry.scans++;
          entry.scanIds.push(docSnap.id);
        }
      });

      // Get areas from qr_tokens collection
      const tokensSnap = await getDocs(collection(db, "qr_tokens"));
      tokensSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const docStore = String(data.store || "");
        if (docStore === storeNumber) {
          const area = data.area || "Unknown";
          if (!areaData.has(area)) {
            areaData.set(area, { scans: 0, tokens: 0, logs: 0, scanIds: [], tokenIds: [], logIds: [] });
          }
          const entry = areaData.get(area);
          entry.tokens++;
          entry.tokenIds.push(docSnap.id);
        }
      });

      // Get areas from logs collection
      const logsSnap = await getDocs(collection(db, "logs"));
      logsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const docStore = String(data.store || "");
        if (docStore === storeNumber) {
          const area = data.area || "Unknown";
          if (!areaData.has(area)) {
            areaData.set(area, { scans: 0, tokens: 0, logs: 0, scanIds: [], tokenIds: [], logIds: [] });
          }
          const entry = areaData.get(area);
          entry.logs++;
          entry.logIds.push(docSnap.id);
        }
      });

      // Convert to array and sort
      const areasArray = Array.from(areaData.entries())
        .map(([name, data]) => ({
          name,
          ...data,
          total: data.scans + data.tokens + data.logs,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setAreas(areasArray);
    } catch (error) {
      console.error("Error loading areas:", error);
      setMessage({ type: "error", text: `Failed to load areas: ${error.message}` });
    } finally {
      setAreasLoading(false);
    }
  }, []);

  // Delete all data for a specific area in a store
  const deleteAreaData = useCallback(async (area) => {
    const confirmMsg = `Are you sure you want to delete ALL data for "${area.name}" in store ${selectedStore}?\n\nThis will delete:\n- ${area.scans} scan records\n- ${area.tokens} QR tokens\n- ${area.logs} log entries\n\nThis action cannot be undone!`;

    if (!confirm(confirmMsg)) {
      return;
    }

    // Double confirm for safety
    const doubleConfirm = prompt(`Type "DELETE ${area.name}" to confirm deletion:`);
    if (doubleConfirm !== `DELETE ${area.name}`) {
      setMessage({ type: "info", text: "Deletion cancelled - confirmation text did not match." });
      return;
    }

    setDeleteLoading(area.name);
    setMessage(null);

    try {
      let deletedCount = 0;

      // Delete in batches (Firestore limit is 500 per batch)
      const batchSize = 400;

      // Delete scans
      for (let i = 0; i < area.scanIds.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = area.scanIds.slice(i, i + batchSize);
        chunk.forEach((id) => {
          batch.delete(doc(db, "scans", id));
        });
        await batch.commit();
        deletedCount += chunk.length;
      }

      // Delete tokens
      for (let i = 0; i < area.tokenIds.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = area.tokenIds.slice(i, i + batchSize);
        chunk.forEach((id) => {
          batch.delete(doc(db, "qr_tokens", id));
        });
        await batch.commit();
        deletedCount += chunk.length;
      }

      // Delete logs
      for (let i = 0; i < area.logIds.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = area.logIds.slice(i, i + batchSize);
        chunk.forEach((id) => {
          batch.delete(doc(db, "logs", id));
        });
        await batch.commit();
        deletedCount += chunk.length;
      }

      setMessage({
        type: "success",
        text: `Successfully deleted ${deletedCount} records for "${area.name}" in store ${selectedStore}.`,
      });

      // Reload areas
      await loadAreas(selectedStore);
    } catch (error) {
      console.error("Error deleting area data:", error);
      setMessage({ type: "error", text: `Failed to delete data: ${error.message}` });
    } finally {
      setDeleteLoading(null);
    }
  }, [selectedStore, loadAreas]);

  // Load stores on mount
  useEffect(() => {
    loadStores();
  }, [loadStores]);

  // Load areas when store changes
  useEffect(() => {
    loadAreas(selectedStore);
  }, [selectedStore, loadAreas]);

  return (
    <div className="space-y-6">
      <div className="text-sm text-secondary mb-4">
        View and manage QR code locations (areas) for each store. Use this tool to clean up erroneous test data.
      </div>

      {/* Store Selector */}
      <div className="bg-secondary rounded-xl p-4 border border-themed">
        <h4 className="text-md font-semibold mb-3 text-primary">Select Store</h4>
        <div className="flex gap-3 items-center">
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            disabled={loading}
            className="px-4 py-2 border border-themed rounded-lg bg-primary text-primary min-w-[200px]"
          >
            <option value="">-- Select a store --</option>
            {stores.map((store) => (
              <option key={store} value={store}>
                Store {store}
              </option>
            ))}
          </select>
          <button
            onClick={loadStores}
            disabled={loading}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Loading..." : "Refresh Stores"}
          </button>
        </div>
      </div>

      {/* Message Display */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === "error"
              ? "bg-red-100 text-red-800 border border-red-300"
              : message.type === "success"
              ? "bg-green-100 text-green-800 border border-green-300"
              : "bg-blue-100 text-blue-800 border border-blue-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Areas List */}
      {selectedStore && (
        <div className="bg-secondary rounded-xl p-4 border border-themed">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-md font-semibold text-primary">
              QR Locations for Store {selectedStore}
            </h4>
            <button
              onClick={() => loadAreas(selectedStore)}
              disabled={areasLoading}
              className="px-3 py-1 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {areasLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {areasLoading ? (
            <div className="text-center py-8 text-secondary">Loading areas...</div>
          ) : areas.length === 0 ? (
            <div className="text-center py-8 text-secondary">
              No QR locations found for this store.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-themed text-left">
                    <th className="px-3 py-2 text-primary font-semibold">Area Name</th>
                    <th className="px-3 py-2 text-primary font-semibold text-center">Scans</th>
                    <th className="px-3 py-2 text-primary font-semibold text-center">QR Tokens</th>
                    <th className="px-3 py-2 text-primary font-semibold text-center">Logs</th>
                    <th className="px-3 py-2 text-primary font-semibold text-center">Total</th>
                    <th className="px-3 py-2 text-primary font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {areas.map((area) => (
                    <tr key={area.name} className="border-b border-themed hover:bg-primary/50">
                      <td className="px-3 py-3 text-primary font-medium">{area.name}</td>
                      <td className="px-3 py-3 text-secondary text-center">{area.scans}</td>
                      <td className="px-3 py-3 text-secondary text-center">{area.tokens}</td>
                      <td className="px-3 py-3 text-secondary text-center">{area.logs}</td>
                      <td className="px-3 py-3 text-primary text-center font-semibold">{area.total}</td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => deleteAreaData(area)}
                          disabled={deleteLoading === area.name}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {deleteLoading === area.name ? "Deleting..." : "Delete All"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-primary/30">
                    <td className="px-3 py-2 text-primary font-semibold">Total</td>
                    <td className="px-3 py-2 text-primary text-center font-semibold">
                      {areas.reduce((sum, a) => sum + a.scans, 0)}
                    </td>
                    <td className="px-3 py-2 text-primary text-center font-semibold">
                      {areas.reduce((sum, a) => sum + a.tokens, 0)}
                    </td>
                    <td className="px-3 py-2 text-primary text-center font-semibold">
                      {areas.reduce((sum, a) => sum + a.logs, 0)}
                    </td>
                    <td className="px-3 py-2 text-primary text-center font-semibold">
                      {areas.reduce((sum, a) => sum + a.total, 0)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Help Section */}
      <div className="bg-secondary rounded-xl p-4 border border-themed">
        <h4 className="text-md font-semibold mb-3 text-primary">About This Tool</h4>
        <div className="text-sm text-secondary space-y-2">
          <p>
            <strong>Scans:</strong> Customer QR code scan events stored in the database.
          </p>
          <p>
            <strong>QR Tokens:</strong> Generated QR codes assigned to specific areas.
          </p>
          <p>
            <strong>Logs:</strong> Activity logs and analytics data for each area.
          </p>
          <p className="text-red-600 mt-4">
            <strong>Warning:</strong> Deleting data is permanent and cannot be undone. Only delete test/erroneous data.
          </p>
        </div>
      </div>
    </div>
  );
});

export default QRLocations;
