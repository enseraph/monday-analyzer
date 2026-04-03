# MONday Reservation Analyzer

## Project
React dashboard (single JSX file) for JHAT/MONday Group hotel reservation data.
- **Repo**: https://github.com/enseraph/monday-analyzer
- **Live**: https://enseraph.github.io/monday-analyzer/
- **Main file**: `src/App.jsx` (~1200 lines)
- **Stack**: Vite + React + Recharts + react-grid-layout
- **Data source**: Google Sheets CSV (auto-fetched on load), manual CSV upload as fallback

## Google Sheet
- Published CSV URL: `https://docs.google.com/spreadsheets/d/e/2PACX-1vQ_G18beGfHLBfeWlS9biwDrt73kQhC0i8RLvIPkybgCejNffzMnsBp7AfmrrS8suD69dQxCyTWEOzh/pub?gid=0&single=true&output=csv`
- Data is CP932/Shift-JIS encoded YYB reservation export from TL-Lincoln
- Populated by n8n workflow (yoyakuban)
- Data covers January 2025 onward

## Key Architecture
- **i18n**: EN/JA bilingual, `T.en`/`T.ja` objects, `tl()` translator
- **Theme**: dark/light mode via `TH` palette object, persisted to localStorage
- **Timezone**: selectable via dropdown (JST, EST, PST, UTC, etc.), `tzFmt()` helper with cached `Intl.DateTimeFormat` instance + result Map for performance. Persisted to localStorage.
- **Grid**: 12-column react-grid-layout (Looker Studio style), layouts in localStorage per tab. All tabs including KvK use DraggableGrid.
- **Mobile**: `isMobile` state (window.innerWidth < 768), 2-col grids → 1-col, rotated chart labels, compact padding
- `DraggableGrid` component (extracted top-level, NOT inline) wraps chart grids. Filters children to valid elements, syncs layout keys.
- `processRow()` parses each CSV row; fields: facility, country, checkin, checkout, bookingDate, totalRev, nights, planName, planType, couponName, salesChannel, checkinMonth, isCancelled, cancelFee, segment, region, hotelType, brand, device, roomSimple, rank, leadTime, adults, kids, partySize
- `agg` useMemo computes all aggregations from `filtered` data
- `kvk` useMemo computes Kanto vs Kansai breakdowns
- `dailyRpt` useMemo computes daily report data (booking date based, includes ALL data including cancellations)
- `insights` useMemo computes dynamic bilingual insight text for each tab
- `GEO_REGION()` maps countries to geographic areas (Japan, Asia, North America, Europe, Oceania, South America, Africa, Unknown)
- `shortFac()` truncates facility names for chart labels (hotel MONday→H, MAP, PAM, MA, etc.)
- `CC` component has two render paths: grid mode (compact, flex, buttons in title bar) and non-grid mode (fixed height, buttons below)
- `SortTbl` component: reusable sortable table with click-to-sort headers (▼/▲), numeric-aware sorting
- Filter bar: sticky with collapse/expand, `overflow:visible` to prevent dropdown clipping

## Tabs
1. **Daily Report** — date range picker (booking date), KPIs, country/region tables, YoY charts (sorted desc, Europe aggregate), ADR chart, 直販比率, 施設別/プラン別/クーポン/キャンセル (single-date sections with own picker). Half-width layout. "予約番入れ込みデータ" disclaimer.
2. **Overview** — monthly bars, segment pie, top markets (including Japan), DOW, daily rev/res charts, monthly revenue
3. **Kanto vs Kansai** — regional comparisons in unified DraggableGrid (markets, segments by region, LOS by seg×region, DOW radars, device, revenue by seg×region, rooms by region, rank by region)
4. **Country Overview** — market count/rev bars, LOS/lead by country, segment mix, membership rank by country (moved from KvK), Country Summary Table
5. **Segments** — breakdown + charts moved from KvK (seg by month, country%, lead by seg/month, ADR by seg)
6. **Booking Patterns** — DOW, monthly trend, device
7. **Revenue** — by market, monthly, market×month stacked, daily
8. **Room Types** — distribution chart + sortable table
9. **Facilities** — per-facility charts + Kanto/Kansai + Hotel/Apart comparisons + sortable Facility Performance table
10. **Raw Data** — paginated sortable table with CSV export

## Daily Report Sections
- **Date range** (drFrom/drTo): country table, region table, YoY charts (revenue + count), ADR bar chart, 直販比率 stacked bar
- **Single date** (drSingle, defaults to yesterday): 施設別 (Hotel/Apart/Direct tables by check-in month), プラン別 (Total/Hotel/Apart by plan type with revenue share), キャンセル (facility + country with check-in month breakdown)
- **Date range**: クーポンデータ (summary + detail tables)
- Plan type classification: 返金不可 (non-refundable keywords), 学生 (student keywords), その他 (everything else)
- Facility type for plan tables: Hotel (contains 'hotel'/'イチホテル'/'premium hotel'), Apart (everything else)
- All sections include cancellation data — never filtered out

## Global Filters
Status (default: All), Hotel Type, Brand, Region (Kanto/Kansai), Country, Segment, Property, Geo Area, Date Type (default: Booking Date), From/To dates, Month Axis (default: By Booking Month). Reset restores these defaults.

## CSV Columns Available
施設名(0), 状態(1), 予約番号(2), 予約受付日時(3), 宿泊日チェックイン(4), チェックアウト日(5), キャンセル料(11), 泊数(12), 宿泊プラン(13), プラン区分(14), 予約方法(17), 部屋タイプ(18), 大人1人数(22), 大人2人数(24), 子供1-9人数, 宿泊料金合計(43), 割引(53), クーポン名(56), クーポン割引(57), 予約料金合計(62), 都道府県(70), 国番号(73), 言語(91), 販売チャネル(94), ランク名(95)

## Deploy
- GitHub Pages via Actions workflow (`.github/workflows/deploy.yml`)
- Push to `master` → auto-build → auto-deploy
- `gh` CLI at `~/bin/gh`
- Git config: user=en.seraph, email=en.seraph@users.noreply.github.com

## Version
Current: 1.24 (increment by 0.01)
APP_VERSION constant at top of App.jsx, also clears localStorage layouts on version change.

## Important Patterns
- **Timezone**: All date-to-string conversions go through `tzFmt()` which uses cached `Intl.DateTimeFormat` + result `Map`. NEVER use `toISOString()` for date display (UTC shift). NEVER create `new Intl.DateTimeFormat` in a loop.
- **Grid children**: NEVER conditionally render `<div key="...">` — always render the wrapper, put conditional content inside: `<div key="x">{condition&&<CC.../>}</div>`
- **Version bump**: Auto-clears stale localStorage layouts via `loadLayouts()` check
- **Pie charts**: `outerRadius="65%"` with custom label renderer to avoid clipping
- **Export buttons**: In title bar (top-right), not bottom of card
- **Filter bar**: Uses `overflow:visible` to prevent dropdown clipping (overrides S.card overflow:hidden)
- **Performance**: `getM()` calls `tzFmt()` per row during aggregation — must stay cached
- **舞浜ビュー normalization**: processRow normalizes garbled encoding variants to 舞浜ビューⅠ

## Planned Features (User-Approved)
1. **Date comparison mode** — Pick any two arbitrary date ranges for side-by-side comparison (not just YoY)
2. **Pace report** — Cumulative bookings by day-of-month, current month vs previous months ("are we on pace?")
3. **Cancellation rate tracker** — Cancellation rate time series by country, facility, segment
4. **Length of stay distribution** — Histogram (1-night, 2-night, 3-night...) by segment and country
5. **RevPAN + RevPAR** — Revenue per available night and revenue per available room (requires room inventory data)
6. **Saved view presets** — Save filter combinations as named presets, switch with one click (localStorage)
7. **Dashboard PDF export** — "Download as PDF" button capturing current tab as formatted report
8. **Annotation system** — Click data points to add notes (e.g., "Golden Week spike"), stored in localStorage
9. **Multi-sheet support** — Load from multiple Google Sheet tabs and merge (future, when data grows)
