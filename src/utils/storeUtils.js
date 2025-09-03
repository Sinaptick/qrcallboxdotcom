/**
 * Store utility functions for normalizing and comparing store numbers
 * Handles cases where users input stores with leading zeros (00669, 05173)
 * but bot names and system data use normalized versions (669, 5173)
 */

/**
 * Normalize a store number by removing leading zeros and converting to string
 * @param {string|number} store - The store number to normalize
 * @returns {string} - Normalized store number as string
 */
export function normalizeStore(store) {
  if (store === null || store === undefined || store === '') {
    return '';
  }
  
  // Convert to string and remove leading zeros
  const storeStr = String(store);
  const normalized = storeStr.replace(/^0+/, '') || '0'; // Keep at least one digit
  
  return normalized;
}

/**
 * Compare two store numbers after normalizing both
 * @param {string|number} store1 - First store number
 * @param {string|number} store2 - Second store number  
 * @returns {boolean} - True if stores are equal after normalization
 */
export function storesEqual(store1, store2) {
  return normalizeStore(store1) === normalizeStore(store2);
}

/**
 * Check if a store exists in an array of stores (normalizing all values)
 * @param {string|number} targetStore - Store to search for
 * @param {Array<string|number>} storeArray - Array of stores to search in
 * @returns {boolean} - True if store exists in array
 */
export function storeInArray(targetStore, storeArray) {
  if (!Array.isArray(storeArray)) return false;
  
  const normalizedTarget = normalizeStore(targetStore);
  return storeArray.some(store => normalizeStore(store) === normalizedTarget);
}

/**
 * Normalize an array of store numbers
 * @param {Array<string|number>} stores - Array of store numbers
 * @returns {Array<string>} - Array of normalized store numbers
 */
export function normalizeStoreArray(stores) {
  if (!Array.isArray(stores)) return [];
  
  return stores.map(store => normalizeStore(store));
}

/**
 * Get user's accessible stores with normalization
 * @param {Object} userDoc - User document from Firestore
 * @returns {Array<string>} - Array of normalized accessible store numbers
 */
export function getUserAccessibleStores(userDoc) {
  if (!userDoc) return [];
  
  // Get stores from allowedStores or fallback to storeNumber
  const stores = userDoc.allowedStores || 
                (userDoc.storeNumber ? [userDoc.storeNumber] : []);
  
  return normalizeStoreArray(stores);
}

/**
 * Filter logs by accessible stores with normalization
 * @param {Array} logs - Array of log entries
 * @param {Array<string|number>} accessibleStores - User's accessible stores
 * @returns {Array} - Filtered logs
 */
export function filterLogsByStores(logs, accessibleStores) {
  if (!Array.isArray(logs) || !Array.isArray(accessibleStores)) return logs;
  
  const normalizedAccessible = normalizeStoreArray(accessibleStores);
  
  return logs.filter(log => {
    if (!log.store) return false;
    return storeInArray(log.store, normalizedAccessible);
  });
}

// Export all functions as named exports for convenient importing