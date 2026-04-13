# Future Improvements

Deferred items from the v1.90–1.91 deep audit. All are safe to implement individually.

## Redundancy / Maintainability

### 1. Deduplicate filter functions (#12, #30)
The same "apply all global filters" function is copy-pasted 7 times — 3 in YYB memos (`compareRpt`, `paceRpt`, `cancelRpt`) and 4 in TL memos (`tlDailyRpt`, `tlCompareRpt`, `tlPaceRpt`, `tlCancelRpt`). Extract a shared `applyYybFilters()` and `applyTlFilters()` via `useCallback`, with a flag to skip the status/cancel filter for cancellation tabs. This is the highest-priority maintainability fix — adding a new filter requires updating all 7 locations or some tabs silently ignore it.

### 2. TL Cancellations tab filter chain (#37)
`tlCancelRpt` re-applies every filter from raw `tlData` instead of reusing the pre-filtered `tlFiltered` array (because it needs to include cancelled rows that the default "net" status filter excludes). Create a `tlBaseFiltered` memo that applies everything except the status filter, then derive both `tlFiltered` and `tlCancelRpt` from it.

### 3. Extract getDateStr helper (#16)
`compareRpt` and `paceRpt` each define an identical `getDateStr` function inline. Extract once as a shared helper or `useCallback`.

## Performance

### 4. Compare tab single-pass date bucketing (#14)
`compareRpt` scans `base` twice — once for Period A rows, once for Period B. A single loop could bucket rows into A, B, or neither. Low real-world impact (dataset is small) but trivially fixable.

### 5. KvK room breakdown single-pass (#15)
The `kvk` memo's `roomSeg` and `allRoomTypes` computations loop through `filtered` once per segment (4 passes). Could pre-build a `Map<segment, Map<roomSimple, count>>` in one pass.

### 6. Daily report IIFE extraction (#38)
The bottom half of the Daily Report (facility/plan/cancel tables for a single date) is computed inside a large IIFE in JSX that re-runs on every render. Should be wrapped in a `useMemo` gated on `tab==="daily"` with deps `[drSingle, allData, tz]`. The inline `FacTable` component definition inside the IIFE also gets a new identity each render, defeating React reconciliation — it should be extracted to a stable component.

## Component Architecture (larger refactor)

### 7. Extract SortTbl / CC / EB from render body (#32, #33)
`SortTbl`, `CC`, `EB`, and `LT` are defined inside the App component's render body. Each parent re-render creates new component identities, causing React to unmount/remount all instances (destroying sort state in SortTbl, triggering chart re-renders in CC). Extracting them to module-level components requires passing `S`, `TH`, `t`, `tl`, `trFn` as props or via React Context. This is the biggest remaining performance win but also the largest refactor.
