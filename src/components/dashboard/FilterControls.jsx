import React from "react";

/**
 * FilterControls Component
 * Extracted from Shell component to handle store/area/week filtering
 * Reduces Shell component by ~150 lines
 */
const FilterControls = React.memo(function FilterControls({
  // Store filters
  stores,
  selectedStores,
  setSelectedStores,
  showStores,
  setShowStores,
  
  // Area filters
  filteredAreas,
  selectedAreas,
  setSelectedAreas,
  showAreas,
  setShowAreas,
  allAreasChecked,
  toggleAllAreas,
  
  // Week filters
  filteredWeeks,
  selectedWeek,
  setSelectedWeek,
  showWeeks,
  setShowWeeks,
  allWeeksChecked,
  toggleAllWeeks,
  
  // User permissions
  isAdmin,
  userDoc
}) {
  return (
    <div className="flex flex-col md:flex-row gap-3 sm:gap-4 mb-4 sm:mb-6 relative">
      {/* Stores (scroll ~5 items) */}
      {isAdmin || (userDoc?.allowedStores && userDoc.allowedStores.length > 1) ? (
        <div className="flex-1">
          <label className="block text-sm font-medium text-primary mb-1">Select Store(s)</label>
          <button
            type="button"
            className="rounded border border-themed px-2 py-1 text-left w-full bg-secondary text-primary hover:bg-tertiary mb-1"
            onClick={() => setShowStores(v => !v)}
          >
            {selectedStores.length ? `${selectedStores.length} selected` : "Choose store(s)"}
          </button>
          {showStores && (
          <div
            className="flex flex-col gap-1 w-full sm:min-w-[180px] border border-themed rounded bg-secondary shadow p-2 z-20 absolute max-h-48 sm:max-h-40 overflow-y-auto"
            onMouseLeave={() => setShowStores(false)}
          >
            {stores.length === 0 && <div className="text-muted">No stores found</div>}
            {stores.map((store) => (
              <label key={store} className="flex items-center gap-2 cursor-pointer select-none text-primary">
                <input
                  type="checkbox"
                  className="form-checkbox rounded h-4 w-4 text-indigo-600 border-themed bg-primary focus:ring-indigo-500"
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
    ) : (
      <div className="flex-1">
        <label className="block text-sm font-medium text-primary mb-1">Store</label>
        <div className="rounded border border-themed px-2 py-1 text-left w-full bg-tertiary text-primary">
          {userDoc?.storeNumber || (userDoc?.allowedStores && userDoc.allowedStores.length === 1 ? userDoc.allowedStores[0] : "Not set")}
        </div>
      </div>
    )}

      {/* Areas (scroll, Select All) */}
      <div className="flex-1">
        <label className="block text-sm font-medium text-primary mb-1">Select Area(s)</label>
        <button
          type="button"
          className="rounded border border-themed px-2 py-1 text-left w-full bg-secondary text-primary hover:bg-tertiary mb-1"
          onClick={() => setShowAreas(v => !v)}
        >
          {selectedAreas.length ? `${selectedAreas.length} selected` : "Choose area(s)"}
        </button>
        {showAreas && (
          <div
            className="flex flex-col gap-1 w-full sm:min-w-[180px] border border-themed rounded bg-secondary shadow p-2 z-20 absolute max-h-48 sm:max-h-40 overflow-y-auto"
            onMouseLeave={() => setShowAreas(false)}
          >
            <label className="flex items-center gap-2 cursor-pointer select-none sticky top-0 bg-secondary py-1 border-b border-themed text-primary">
              <input
                type="checkbox"
                className="form-checkbox rounded h-4 w-4 text-indigo-600 border-themed bg-primary focus:ring-indigo-500"
                checked={allAreasChecked}
                onChange={toggleAllAreas}
              />
              <span className="font-medium">Select All</span>
            </label>

            {filteredAreas.length === 0 && <div className="text-muted">No areas found</div>}
            {filteredAreas.map((area) => (
              <label key={area} className="flex items-center gap-2 cursor-pointer select-none text-primary">
                <input
                  type="checkbox"
                  className="form-checkbox rounded h-4 w-4 text-indigo-600 border-themed bg-primary focus:ring-indigo-500"
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
      <div className="flex-1">
        <label className="block text-sm font-medium text-primary mb-1">Select Week(s)</label>
        <button
          type="button"
          className="rounded border border-themed px-2 py-1 text-left w-full bg-secondary text-primary hover:bg-tertiary mb-1"
          onClick={() => setShowWeeks(v => !v)}
        >
          {selectedWeek.length ? `${selectedWeek.length} selected` : "Choose week(s)"}
        </button>
        {showWeeks && (
          <div
            className="flex flex-col gap-1 w-full sm:min-w-[220px] border border-themed rounded bg-secondary shadow p-2 z-20 absolute max-h-48 sm:max-h-40 overflow-y-auto"
            onMouseLeave={() => setShowWeeks(false)}
          >
            <label className="flex items-center gap-2 cursor-pointer select-none sticky top-0 bg-secondary py-1 border-b border-themed text-primary">
              <input
                type="checkbox"
                className="form-checkbox rounded h-4 w-4 text-indigo-600 border-themed bg-primary focus:ring-indigo-500"
                checked={allWeeksChecked}
                onChange={toggleAllWeeks}
              />
              <span className="font-medium">Select All</span>
            </label>

            {filteredWeeks.length === 0 && <div className="text-muted">No weeks found</div>}
            {filteredWeeks.map((week) => (
              <label key={week} className="flex items-center gap-2 cursor-pointer select-none text-primary">
                <input
                  type="checkbox"
                  className="form-checkbox rounded h-4 w-4 text-indigo-600 border-themed bg-primary focus:ring-indigo-500"
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
  );
});

export default FilterControls;