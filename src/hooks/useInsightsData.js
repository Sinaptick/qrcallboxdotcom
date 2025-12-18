import { useState, useEffect, useMemo } from "react";

/**
 * Custom hook for managing insights data loading and filtering
 * Extracted from Shell component to reduce complexity and improve reusability
 */
export function useInsightsData(active, db, user = null) {
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  
  const [stores, setStores] = useState([]);
  const [selectedStores, setSelectedStores] = useState([]);
  const [showStores, setShowStores] = useState(false);
  
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState([]);
  const [showWeeks, setShowWeeks] = useState(false);
  
  const [areas, setAreas] = useState([]);
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [showAreas, setShowAreas] = useState(false);

  // Load logs + build options when Insights tab is active
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
          } catch (err) {
            console.warn("Error parsing timestamp:", ts, err);
          }
        });

        if (mounted) {
          console.log("Setting logs data:", { logsCount: logsArr.length, storesCount: storeSet.size });
          setLogs(logsArr);
          
          // Build sorted options
          const storeOptions = Array.from(storeSet).sort((a, b) => Number(a) - Number(b));
          setStores(storeOptions);
          
          const weekOptions = Array.from(weekMap.entries()).sort(([a], [b]) => b - a).map(([, label]) => label);
          setWeeks(weekOptions);
          
          const areaOptions = Array.from(areaSet).filter(Boolean).sort();
          setAreas(areaOptions);
          
          // Set defaults only if nothing is selected yet
          let defaultStores = [];
          setSelectedStores(prev => {
            if (prev.length > 0) {
              defaultStores = prev;
              return prev; // Don't override existing selection
            }

            // Default to user's home store or current store
            let defaultStore = null;
            if (user?.homeStore) {
              defaultStore = String(user.homeStore);
            } else if (user?.storeNumber) {
              defaultStore = String(user.storeNumber);
            }
            
            console.log('Insights: User home store:', user?.homeStore, 'Store number:', user?.storeNumber, 'Default:', defaultStore);
            console.log('Insights: Available stores:', storeOptions);

            // Check if default store exists in available options
            if (defaultStore && storeOptions.includes(defaultStore)) {
              defaultStores = [defaultStore];
              console.log('Insights: Setting default store to:', defaultStore);
              return [defaultStore];
            }

            // Fallback to empty selection
            console.log('Insights: No matching default store found');
            return [];
          });

          // Default to current week (most recent week)
          setSelectedWeek(prev => {
            if (prev.length > 0) return prev; // Don't override existing selection
            console.log('Insights: Setting default week to:', weekOptions[0]);
            return weekOptions.length > 0 ? [weekOptions[0]] : [];
          });

          // Default to ALL areas for the selected store(s)
          setSelectedAreas(prev => {
            if (prev.length > 0) return prev; // Don't override existing selection

            // Select all areas that exist for the default store(s)
            if (defaultStores.length > 0) {
              const relevantLogs = logsArr.filter(log => {
                if (!log.store) return false;
                const normalizedLogStore = String(log.store).replace(/^0+/, '') || '0';
                const normalizedSelectedStores = defaultStores.map(store => {
                  return String(store).replace(/^0+/, '') || '0';
                });
                return normalizedSelectedStores.includes(normalizedLogStore);
              });
              const relevantAreas = new Set(relevantLogs.map(log => log.area).filter(Boolean));
              const storeAreas = areaOptions.filter(area => relevantAreas.has(area));
              console.log('Insights: Defaulting to all areas for store:', defaultStores, 'Areas:', storeAreas);
              return storeAreas; // Select ALL areas for the store
            }

            // If no store selected, select all areas
            console.log('Insights: No default store, selecting all areas:', areaOptions);
            return areaOptions;
          });
        }
      } catch (err) {
        console.error("Error loading insights data:", err);
        if (mounted) {
          setLogs([]);
          setStores([]);
          setWeeks([]);
          setAreas([]);
        }
      } finally {
        if (mounted) {
          setLogsLoading(false);
        }
      }
    })();
    
    return () => { mounted = false; };
  }, [active, db, user?.homeStore, user?.storeNumber]);

  // Filtered data based on selections
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Store filter (normalize for comparison to handle leading zeros)
      if (selectedStores.length > 0) {
        if (!log.store) return false;
        const normalizedLogStore = String(log.store).replace(/^0+/, '') || '0';
        const normalizedSelectedStores = selectedStores.map(store => {
          return String(store).replace(/^0+/, '') || '0';
        });
        if (!normalizedSelectedStores.includes(normalizedLogStore)) {
          return false;
        }
      }
      
      // Area filter
      if (selectedAreas.length > 0 && !selectedAreas.includes(log.area)) {
        return false;
      }
      
      // Week filter logic
      if (selectedWeek.length > 0) {
        let ts = log?.ts;
        let dateObj = null;
        try {
          if (ts && typeof ts.toDate === "function") dateObj = ts.toDate();
          else if (ts && ts.seconds) dateObj = new Date(ts.seconds * 1000);
          else if (typeof ts === "string" || typeof ts === "number") dateObj = new Date(ts);
          
          if (dateObj && !isNaN(dateObj)) {
            const week0 = new Date(2025, 1, 1);
            const diffDays = Math.floor((dateObj - week0) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0) {
              const weekNum = Math.floor(diffDays / 7) + 1;
              const weekStart = new Date(week0.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000);
              const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
              const label = `Week ${weekNum} (${weekStart.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}–${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })})`;
              
              if (!selectedWeek.includes(label)) {
                return false;
              }
            }
          }
        } catch (err) {
          return false;
        }
      }
      
      return true;
    });
  }, [logs, selectedStores, selectedAreas, selectedWeek]);

  // Helper computed values for FilterControls
  const filteredAreas = useMemo(() => {
    if (selectedStores.length === 0) return areas;
    
    const relevantLogs = logs.filter(log => {
      if (!log.store) return false;
      const normalizedLogStore = String(log.store).replace(/^0+/, '') || '0';
      const normalizedSelectedStores = selectedStores.map(store => {
        return String(store).replace(/^0+/, '') || '0';
      });
      return normalizedSelectedStores.includes(normalizedLogStore);
    });
    const relevantAreas = new Set(relevantLogs.map(log => log.area).filter(Boolean));
    return areas.filter(area => relevantAreas.has(area));
  }, [areas, logs, selectedStores]);

  const filteredWeeks = useMemo(() => {
    if (selectedStores.length === 0 && selectedAreas.length === 0) return weeks;
    
    const relevantLogs = logs.filter(log => {
      // Store filter with normalization
      if (selectedStores.length > 0) {
        if (!log.store) return false;
        const normalizedLogStore = String(log.store).replace(/^0+/, '') || '0';
        const normalizedSelectedStores = selectedStores.map(store => {
          return String(store).replace(/^0+/, '') || '0';
        });
        if (!normalizedSelectedStores.includes(normalizedLogStore)) return false;
      }
      if (selectedAreas.length > 0 && !selectedAreas.includes(log.area)) return false;
      return true;
    });
    
    const relevantWeekLabels = new Set();
    const week0 = new Date(2025, 1, 1);
    
    relevantLogs.forEach(log => {
      let ts = log?.ts;
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
            relevantWeekLabels.add(label);
          }
        }
      } catch (err) {
        // ignore parsing errors
      }
    });
    
    return weeks.filter(week => relevantWeekLabels.has(week));
  }, [weeks, logs, selectedStores, selectedAreas]);

  // Helper functions for "Select All" functionality
  const allAreasChecked = selectedAreas.length === filteredAreas.length && filteredAreas.length > 0;
  const allWeeksChecked = selectedWeek.length === filteredWeeks.length && filteredWeeks.length > 0;

  const toggleAllAreas = () => {
    if (allAreasChecked) {
      setSelectedAreas([]);
    } else {
      setSelectedAreas([...filteredAreas]);
    }
  };

  const toggleAllWeeks = () => {
    if (allWeeksChecked) {
      setSelectedWeek([]);
    } else {
      setSelectedWeek([...filteredWeeks]);
    }
  };

  return {
    // Data state
    logs,
    logsLoading,
    filteredLogs,
    
    // Store filters
    stores,
    selectedStores,
    setSelectedStores,
    showStores,
    setShowStores,
    
    // Area filters
    areas,
    filteredAreas,
    selectedAreas,
    setSelectedAreas,
    showAreas,
    setShowAreas,
    allAreasChecked,
    toggleAllAreas,
    
    // Week filters
    weeks,
    filteredWeeks,
    selectedWeek,
    setSelectedWeek,
    showWeeks,
    setShowWeeks,
    allWeeksChecked,
    toggleAllWeeks,
  };
}