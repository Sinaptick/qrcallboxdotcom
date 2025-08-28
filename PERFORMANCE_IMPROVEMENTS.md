# QRCall Performance Improvement Plan

## 📊 Current Codebase Analysis

### File Sizes & Issues Summary
- **app.jsx**: 3,158 lines - CRITICAL monolith component
- **GroupMeSetup.jsx**: 898 lines - Performance bottlenecks 
- **Heatmap.jsx**: 672 lines - Rendering optimization needed
- **TicketQueue.jsx**: 595 lines - State management chaos

---

## 🚨 PHASE 1: Critical Quick Wins (Week 1)

### Priority 1: app.jsx Improvements
**Status: 🔴 NOT STARTED**

#### 1.1 Extract UI Primitives (2 hours) → 25% bundle reduction
- [ ] Move Card, CardHeader, CardBody (lines 58-127) to `components/ui/Card.jsx`
- [ ] Move Input, Button components to `components/ui/FormControls.jsx`
- [ ] Move Tabs component to `components/ui/Tabs.jsx`
- [ ] Update imports across app

#### 1.2 Add React.memo to Large Components (1 hour) → 60% fewer re-renders
- [ ] Wrap GenerateQR component with React.memo
- [ ] Wrap Settings component (258 lines) with React.memo
- [ ] Wrap Dashboard component with React.memo
- [ ] Wrap TopResponders component with React.memo

#### 1.3 Dynamic Admin Imports (2 hours) → 40-50% faster initial load
- [ ] Convert UserManagement to lazy import (lines 1913-2371)
- [ ] Convert admin tools to lazy imports
- [ ] Add Suspense boundaries
- [ ] Split admin bundle from main app

### Priority 2: GroupMeSetup.jsx Critical Fixes
**Status: 🔴 NOT STARTED**

#### 2.1 Fix Memory Leak (30 minutes) → Prevent crashes
- [ ] Add proper OAuth event listener cleanup
- [ ] Use useRef to track message handler
- [ ] Add cleanup in useEffect return

#### 2.2 Concurrent API Calls (2 hours) → 60% faster loading
- [ ] Replace sequential fetchGroups/fetchExistingBots calls
- [ ] Implement Promise.allSettled pattern
- [ ] Add proper loading states

#### 2.3 Optimize Re-renders (1 hour) → 50% fewer updates
- [ ] Add useCallback to addDebug function
- [ ] Memoize group processing logic
- [ ] Prevent unnecessary state updates

### Priority 3: Heatmap.jsx Optimizations
**Status: 🔴 NOT STARTED**

#### 3.1 Matrix Calculation Optimization (1 hour) → 40% fewer calculations
- [ ] Fix useMemo dependencies in matrix calculation
- [ ] Add dependency: `[filtered.length, hours.length, dayLabels.length]`
- [ ] Memoize color calculations

#### 3.2 PDF Export Performance (2 hours) → 60-80% faster exports
- [ ] Extract styling logic to CSS classes
- [ ] Use CSS variables for colors instead of JS calculations
- [ ] Optimize DOM manipulation in exportToPDF

### Priority 4: TicketQueue.jsx State Management
**Status: 🔴 NOT STARTED**

#### 4.1 Implement Optimistic Updates (3 hours) → 70% reduction in loading states
- [ ] Replace loadTickets() calls after actions
- [ ] Implement optimistic ticket updates
- [ ] Add rollback on API failure

#### 4.2 Efficient Ticket Lookup (1 hour) → O(1) vs O(n) performance
- [ ] Replace array operations in lookupTicket
- [ ] Implement Map-based ticket storage
- [ ] Update ticket operations to use Map

---

## ⚡ PHASE 2: Structural Improvements (Week 2)

### Shell Component Refactoring (app.jsx)
**Status: 🔴 NOT STARTED**

#### 2.1 Split Monster Component (6 hours)
- [ ] Extract `AppShell` (header, navigation)
- [ ] Extract `FilterControls` (store/area/week selection)
- [ ] Extract `TabContent` (route-specific content)
- [ ] Extract `AdminPanel` (admin-specific functionality)

#### 2.2 Create Custom Hooks (4 hours)
- [ ] `useUserPermissions` hook
- [ ] `useFilteredData` hook for logs processing
- [ ] `useUserData` hook for user loading

### GroupMeSetup Component Split
**Status: 🔴 NOT STARTED**

#### 2.3 Component Extraction (6 hours)
- [ ] `GroupMeConnection` (OAuth flow)
- [ ] `GroupMeGroupSelector` (group selection)
- [ ] `GroupMeBotManager` (bot CRUD operations)
- [ ] `GroupMeAdminPanel` (admin features)
- [ ] `GroupMeDebugPanel` (troubleshooting)

### TicketQueue State Refactoring
**Status: 🔴 NOT STARTED**

#### 2.4 useReducer Implementation (4 hours)
- [ ] Replace 10+ useState hooks with useReducer
- [ ] Create ticketReducer function
- [ ] Implement predictable state transitions

---

## 🔧 PHASE 3: Advanced Optimizations (Week 3)

### Performance Enhancements
**Status: 🔴 NOT STARTED**

#### 3.1 Advanced Memoization (3 hours)
- [ ] Add useCallback to all event handlers in Shell
- [ ] Memoize expensive computations across components
- [ ] Implement React.useMemo for filtered data

#### 3.2 Bundle Optimization (4 hours)
- [ ] Implement code splitting for routes
- [ ] Dynamic imports for heavy dependencies (QR library)
- [ ] Split Firebase imports by feature

#### 3.3 Error Boundaries & Loading States (2 hours)
- [ ] Add error boundaries around major components
- [ ] Implement skeleton loading states
- [ ] Add proper error recovery mechanisms

---

## 📈 Expected Performance Impact

### Phase 1 Results:
- **Bundle Size**: 25-30% reduction
- **Initial Load**: 40-50% faster
- **Runtime Performance**: 60-70% fewer re-renders
- **Memory Usage**: 30-40% reduction (fixed leaks)

### Phase 2 Results:
- **Development Speed**: 3x faster feature development
- **Code Maintainability**: 70% improvement
- **Test Coverage**: Possible with smaller components

### Phase 3 Results:
- **Error Recovery**: 90% fewer crashes
- **User Experience**: Consistent loading states
- **Production Stability**: Significantly improved

---

## 🚀 Implementation Status

### Week 1 Targets:
- [ ] UI Primitives Extraction
- [ ] React.memo Implementation  
- [ ] GroupMe Memory Leak Fix
- [ ] Concurrent API Calls
- [ ] Heatmap Matrix Optimization

### Week 2 Targets:
- [ ] Shell Component Split
- [ ] GroupMe Component Split
- [ ] TicketQueue useReducer
- [ ] Custom Hooks Creation

### Week 3 Targets:
- [ ] Advanced Memoization
- [ ] Bundle Optimization
- [ ] Error Boundaries

---

## 📝 Notes & Considerations

### Technical Debt Priority:
1. **app.jsx Shell component** - Blocking all other development
2. **Memory leaks in GroupMe** - Causing production issues
3. **State management chaos** - Making bugs hard to track

### Risk Assessment:
- **Low Risk**: UI primitive extraction, memoization
- **Medium Risk**: Component splitting, state refactoring
- **High Risk**: Bundle splitting, advanced optimizations

### Testing Strategy:
- Test each phase incrementally
- Maintain feature parity during refactoring
- Performance benchmarking before/after each change

---

*Last Updated: [Current Date]*
*Current Phase: Phase 1 - Critical Quick Wins*