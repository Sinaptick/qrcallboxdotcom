// Store Hierarchy Configuration
// BU (Business Unit) > Region > Market > Store

export const storeHierarchy = {
  // Business Units
  BU1: {
    name: "Business Unit 1",
    regions: {
      Region1: {
        name: "Region 1",
        markets: {
          120: {
            name: "Market 120",
            stores: [658, 756, 1215, 669, 2988, 5151, 5173, 1458, 1089, 3660]
          },
          121: {
            name: "Market 121",
            stores: [100, 200, 300, 400, 500]
          },
          122: {
            name: "Market 122",
            stores: [600, 700, 800, 900]
          }
        }
      },
      Region2: {
        name: "Region 2",
        markets: {
          200: {
            name: "Market 200",
            stores: [1000, 1100, 1200, 1300]
          },
          201: {
            name: "Market 201",
            stores: [1400, 1500, 1600, 1700]
          }
        }
      }
    }
  },
  BU2: {
    name: "Business Unit 2",
    regions: {
      Region3: {
        name: "Region 3",
        markets: {
          300: {
            name: "Market 300",
            stores: [2000, 2100, 2200, 2300]
          },
          301: {
            name: "Market 301",
            stores: [2400, 2500, 2600, 2700]
          }
        }
      },
      Region4: {
        name: "Region 4",
        markets: {
          400: {
            name: "Market 400",
            stores: [3000, 3100, 3200, 3300]
          },
          401: {
            name: "Market 401",
            stores: [3400, 3500, 3600, 3700]
          }
        }
      }
    }
  }
};

// Helper functions to work with hierarchy

export function getStoresForBU(buId) {
  const bu = storeHierarchy[buId];
  if (!bu) return [];
  
  const stores = [];
  Object.values(bu.regions).forEach(region => {
    Object.values(region.markets).forEach(market => {
      stores.push(...market.stores);
    });
  });
  
  return stores;
}

export function getStoresForRegion(buId, regionId) {
  const bu = storeHierarchy[buId];
  if (!bu || !bu.regions[regionId]) return [];
  
  const stores = [];
  Object.values(bu.regions[regionId].markets).forEach(market => {
    stores.push(...market.stores);
  });
  
  return stores;
}

export function getStoresForMarket(marketNumber) {
  const stores = [];
  
  // Search through all BUs and regions to find the market
  Object.values(storeHierarchy).forEach(bu => {
    Object.values(bu.regions).forEach(region => {
      if (region.markets[marketNumber]) {
        stores.push(...region.markets[marketNumber].stores);
      }
    });
  });
  
  return stores;
}

export function getAllStoresForSelection(selectionType, selectionValue) {
  const stores = [];
  
  switch (selectionType) {
    case 'store':
      // Direct store selection
      stores.push(parseInt(selectionValue));
      break;
      
    case 'market':
      // Get all stores for the market
      stores.push(...getStoresForMarket(selectionValue));
      break;
      
    case 'region':
      // Parse region selection (format: "BU1:Region1")
      const [buId, regionId] = selectionValue.split(':');
      if (buId && regionId) {
        stores.push(...getStoresForRegion(buId, regionId));
      }
      break;
      
    case 'bu':
      // Get all stores for the BU
      stores.push(...getStoresForBU(selectionValue));
      break;
      
    default:
      break;
  }
  
  return stores.map(s => String(s));
}

export function getSelectionDisplayName(selectionType, selectionValue) {
  switch (selectionType) {
    case 'store':
      return `Store ${selectionValue}`;
      
    case 'market':
      // Find market name
      for (const bu of Object.values(storeHierarchy)) {
        for (const region of Object.values(bu.regions)) {
          if (region.markets[selectionValue]) {
            return region.markets[selectionValue].name;
          }
        }
      }
      return `Market ${selectionValue}`;
      
    case 'region':
      const [buId, regionId] = selectionValue.split(':');
      if (storeHierarchy[buId]?.regions[regionId]) {
        return storeHierarchy[buId].regions[regionId].name;
      }
      return `Region ${selectionValue}`;
      
    case 'bu':
      if (storeHierarchy[selectionValue]) {
        return storeHierarchy[selectionValue].name;
      }
      return `BU ${selectionValue}`;
      
    default:
      return selectionValue;
  }
}

export function getBUOptions() {
  return Object.entries(storeHierarchy).map(([id, bu]) => ({
    value: id,
    label: bu.name
  }));
}

export function getRegionOptions() {
  const options = [];
  Object.entries(storeHierarchy).forEach(([buId, bu]) => {
    Object.entries(bu.regions).forEach(([regionId, region]) => {
      options.push({
        value: `${buId}:${regionId}`,
        label: `${bu.name} - ${region.name}`
      });
    });
  });
  return options;
}

export function getMarketOptions() {
  const options = [];
  Object.values(storeHierarchy).forEach(bu => {
    Object.values(bu.regions).forEach(region => {
      Object.entries(region.markets).forEach(([marketId, market]) => {
        options.push({
          value: marketId,
          label: market.name
        });
      });
    });
  });
  return options;
}

export function validateStoreAccess(userStores, requestedStore) {
  // Check if the requested store is in the user's allowed stores list
  return userStores.includes(String(requestedStore));
}