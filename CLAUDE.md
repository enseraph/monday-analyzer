# MONday Reservation Analyzer

## Project
React dashboard (single JSX file) for JHAT/MONday Group hotel reservation data.
- **Repo**: https://github.com/enseraph/monday-analyzer
- **Live (auth-protected, Cloudflare)**: https://monday-analyzer.jhat.workers.dev/
- **GitHub Pages**: unpublished (repo Settings → Pages → Unpublish site). `.github/workflows/deploy.yml` can be deleted to stop future Actions runs.
- **Main file**: `src/App.jsx` (~2100 lines)
- **Stack**: Vite + React + Recharts + react-grid-layout + html-to-image
- **Data source**: Google Sheets CSV (auto-fetched on load), manual CSV upload as fallback

## Auth (Cloudflare)
- Cloudflare Workers deploys via `wrangler.jsonc` (assets in `dist/`, SPA mode)
- Cloudflare Access protects the Workers URL — Google IdP + email allowlist policy
- Team domain: `jhat-pd.cloudflareaccess.com`
- Workers subdomain: `jhat` (changed from default `c-katsuse`)
- Auto-deploys on git push via wrangler (independent of GitHub Pages)

## Planned: Ads-extended version (not yet implemented)
A second deployment (`monday-analyzer-ads`) will include Google Ads / Meta Ads metrics (cost, ROAS, CAC, etc.) on top of everything in the base version.

**Approach**: build-time feature flag via Vite env var. Single repo, single branch, no merging.
- `const ADS = import.meta.env.VITE_ADS_ENABLED === 'true'` at top of `App.jsx`
- `.env.base` (`VITE_ADS_ENABLED=false`) and `.env.ads` (`VITE_ADS_ENABLED=true`)
- Ads-only code lives in `src/ads/` (adsData.js, adsMetrics.js, adsTab.jsx, adsCharts.jsx)
- `App.jsx` has thin `if (ADS)` / `ADS && ...` / `...(ADS ? [...] : [])` bridges only
- Vite inlines the env constant → dead-code elimination strips all ads branches from base build (verify: `grep -i roas dist/assets/*.js` returns nothing)
- Two wrangler configs: `wrangler.base.toml` (worker: `monday-analyzer`) and `wrangler.ads.toml` (worker: `monday-analyzer-ads`)
- package.json scripts: `build:base`, `build:ads`, `deploy:base`, `deploy:ads`, `deploy:all`
- Workflow: shared fix → edit once, `deploy:all`. Ads-only change → edit `src/ads/`, `deploy:ads`. Each version deploys independently.
- Guardrail: after any `App.jsx` edit, run `npm run build:base && npm run build:ads` before pushing.
- NOT YET SCAFFOLDED — user will signal when to implement.

## Google Sheet
- Published CSV URL: `https://docs.google.com/spreadsheets/d/e/2PACX-1vQ_G18beGfHLBfeWlS9biwDrt73kQhC0i8RLvIPkybgCejNffzMnsBp7AfmrrS8suD69dQxCyTWEOzh/pub?gid=0&single=true&output=csv`
- Data is CP932/Shift-JIS encoded YYB reservation export from TL-Lincoln
- Populated by n8n workflow (yoyakuban)
- Data covers May 2024 onward

## Key Architecture
- **Two data sources**: YYB (reservation rows, `allData`, `processRow()`) + TL Lincoln (B-series per-reservation rows, `tlData`, `parseTLRow()`). Both are per-reservation now — structurally similar.
- **TL schema (v1.70)**: 24 columns — `date, facility, facility_group, status, channel_code, channel_name, channel_bucket, booking_id, notification_id, guest_name, guest_name_kana, email, checkin, checkout, nights, rooms, guests, adults_male, adults_female, children, plan_name, plan_code, revenue, revenue_other`. `parseTLRow()` produces YYB-compatible derived aliases (`region`, `hotelType`, `brand`, `segment`, `segmentDetailed`, `leadTime`, `checkinDow`, `checkoutDow`, `totalRev=revenue+revenue_other`, `isCancelled=status==='取消'`, `isModified=status==='変更'`, `country` populated later via `applyTLEmailCountry`).
- **TL multi-year fetch**: `TL_GSHEET_CSV_URLS = { "2026": ... }` object — add new years as they're published. Fetches in parallel, concats. Per-year localStorage cache keys (`monday_tl_csv_cache_2026`, etc.).
- **TL same-day cancel detection**: `applyTLSameDayCancel()` runs at parse time; builds `Set<"date|facility|booking_id">` from 取消 rows and stamps matching 予約 rows with `sameDayCancelled = true`. Used by the Net status filter default.
- **TL country inference**: `applyTLEmailCountry()` cross-references TL `email` against YYB email→country map (runs in a useEffect once both datasets are loaded). Returns `{coverage, rowsWithCountry, totalRows}` stored in `tlCoverage` state and displayed in the source banner.
- **TL status filter** (`fTlStatus`): `net` (default, = 予約 not-same-day-cancelled + 変更 rows) / `all` / `cancelled` / `modified`. 変更 is a quiet filter — no prominent UI besides the dropdown.
- **TL filter bar additions**: channel_bucket (existing), **channel_name** (full OTA granularity — Booking.com, Klook, Rakuten, etc.), **status toggle**, **plan_code**.
- ⚠ **Date parsing gotcha (v1.61 fix)**: `new Date("YYYY-MM-DD")` is UTC midnight in JS, but `new Date("YYYY-MM-DDT00:00:00")` is local midnight. Mixing these breaks date-equality filters in non-UTC timezones. TL filter uses `new Date(fDF+"T00:00:00")` to match `parseTLRow`'s local-midnight row dates. Don't strip the `T00:00:00`.
- **TL data is ex-tax** (n8n divides by 1.1 at parse). YYB also ex-tax. UI labels TL revenue as "売上 (税抜)" / "Revenue (ex-tax)" explicitly.
- **Sectioned tab strip**: Tabs split into YYB and TL sections via `src` field on each TAB entry. Section chips (`YYB` / `TL`) + vertical divider + per-section accent color (gold / teal) on active tab underline. `SOURCE_COLORS` constant. **YYB side: 15 tabs. TL side: 15 tabs** — `tl-channel`, `tl-daily`, `tl-revenue`, `tl-segments`, `tl-member`, `tl-overview`, `tl-los`, `tl-booking`, `tl-compare`, `tl-pace`, `tl-facilities`, `tl-kvk`, `tl-markets`, `tl-cancellations`, `tl-data`.
- **YYB capabilities NOT ported to TL** (missing source fields): Rooms tab (no room_type string in TL), Device chart (no device field), Membership Rank (no rank field), Cancel Fee (no fee field). RevPAR tab not ported because it depends on facility room inventory which works identically for both sources but wasn't prioritized.
- **Source banner**: always-on bar above filter row, dot + label, color matches active section. Reads `isTlTab = activeTabSrc === "tl"`.
- **Morphing filter bar**: When `isTlTab`, hides YYB-only filters (status, hotel type, brand, region, country, segment, geo, DOW, date type, month mode) and shows TL-only filter (channel bucket multiselect). Property filter is shown in both modes but `uTlFac` is sourced from `tlData` on TL tabs. Date From/To carries over.
- **CSV cache**: 5-min localStorage cache (`monday_csv_cache`) for instant warm starts
- **Email-based intl override**: `applyEmailIntlOverride()` runs after parse — any email seen on a non-Japan reservation has ALL its rows reclassified to its top intl country (fixes intl guests booking via JP interface)
- **Tab-gated reports**: YYB: `dailyRpt`/`compareRpt`/`paceRpt`/`cancelRpt`/`losRpt`/`revparRpt`/`memberRpt`/`kvk`/`tRows`. TL: `tlFiltered` (gates on `tab.startsWith("tl-")`), `tlAllStatusFiltered`, `tlChannelRpt`, `tlRevenueRpt`, `tlSegmentsRpt`, `tlDailyRpt`, `tlMemberRpt`, `tlOverviewRpt`, `tlLosRpt`, `tlBookingRpt`, `tlCompareRpt`, `tlPaceRpt`, `tlFacilitiesRpt`, `tlKvkRpt`, `tlMarketsRpt`, `tlCancelRpt`, `tlTRows`. All start with `if(tab!=="<id>")return null;` and include `tab` in deps. Filter changes recompute only the visible report. ⚠ When adding a new report memo, MUST gate it AND add `tab` to its deps array. v1.58 fix: each new memo's deps array MUST include `tab` (sed-based bulk edits in v1.57 missed `memberRpt` because its deps shape didn't match the regex).
- **`insights` useMemo deleted** — was computed but never read. Don't reintroduce unless actually rendered.
- **i18n**: EN/JA bilingual, `T.en`/`T.ja` objects, `tl()` translator (also handles Overall/Japanese/Couple variants)
- **Theme**: dark/light mode via `TH` palette object, persisted to localStorage
- **Timezone**: selectable via dropdown (JST/EST/PST/UTC/etc.), `tzFmt()` helper with cached `Intl.DateTimeFormat` instance + result Map for performance. Persisted to localStorage.
- **Grid**: 12-column react-grid-layout (Looker Studio style), layouts in localStorage per tab. All tabs use DraggableGrid except where noted.
- **Lock layout**: Global lock toggle (🔒/🔓 button on every tab), persisted to localStorage. Sets `static:true` on each grid item to disable drag/resize.
- **Mobile**: `isMobile` state (window.innerWidth < 768), 2-col grids → 1-col, rotated chart labels, compact padding
- `DraggableGrid` component (extracted top-level, NOT inline) wraps chart grids. Filters children to valid elements, syncs layout keys, respects `locked` prop.
- `processRow()` parses each CSV row; fields: facility, country, checkin, checkout, bookingDate, totalRev, nights, planName, planType, couponName, salesChannel, checkinMonth, isCancelled, cancelFee, segment, segmentDetailed, region, hotelType, brand, device, roomSimple, rank, leadTime, adults, kids, partySize, male, female, email, guestName
- `agg` useMemo computes all aggregations from `filtered` data
- `kvk` useMemo computes Kanto vs Kansai breakdowns
- `dailyRpt` useMemo computes daily report data (booking date based, includes ALL data)
- `compareRpt` useMemo for Compare tab (must be defined BEFORE insights — TDZ)
- `paceRpt` useMemo for Pace tab (before insights)
- `cancelRpt` useMemo for Cancellations tab (before insights)
- `losRpt` useMemo for LOS tab (before insights)
- `revparRpt` useMemo for hidden RevPAR tab (before insights)
- `memberRpt` useMemo for Member tab (before insights, computes repeat rates, window analysis, facility breakdown)
- `insights` useMemo computes dynamic bilingual insight text (currently disabled in UI but still computed)
- `GEO_REGION()` maps countries to geographic areas
- `shortFac()` truncates facility names for chart labels
- `CC` component has two render paths: grid mode (compact, flex, buttons in title bar) and non-grid mode (fixed height, buttons below)
- `SortTbl` component: reusable sortable table with click-to-sort headers (▼/▲), numeric-aware sorting, built-in Excel export button
- `EB` component: chart export buttons (📷 image, 📋 table image, 📊 Excel)
- `dlChart()` uses `html-to-image` library (toPng) — captures the rendered DOM with all CSS, no manual SVG cloning
- `dlTable()` renders table data to canvas (white bg, headers, alt rows)
- `expCSV()` and `expXLS()` for CSV and Excel exports
- Filter bar: sticky with collapse/expand, `overflow:visible` to prevent dropdown clipping
- `ROOM_INVENTORY` constant: hardcoded room counts for 32 facilities (used by hidden RevPAR tab)

## Tabs
1. **Daily Report** — date range picker (booking date), KPIs, country/region tables, YoY charts (sorted desc, Europe aggregate), ADR chart, 直販比率, 施設別/プラン別/クーポン/キャンセル sections (single-date sections share own picker). Half-width layout.
2. **Compare** — Two date range pickers (Period A blue, Period B gold), quick presets (This Month vs Last, This Week vs Last, This Year vs Last — all use equivalent partial periods), KPI delta cards, country/segment/facility comparison tables, YoY-style bar charts. Respects all global filters except date range.
3. **Pace** — Cumulative booking line chart (bold gold = current month, palette colors = past 5 months), KPI cards (so far, last month at same point, projected month-end), summary table. Toggle between count/revenue.
4. **Overview** — monthly bars, segment pie, top markets (incl Japan), DOW, daily rev/res charts, monthly revenue
5. **Kanto vs Kansai** — regional comparisons in unified DraggableGrid (markets, segments by region, LOS by seg×region, DOW radars, device, revenue by seg×region, rooms by region, rank by region)
6. **Country Overview** — market count/rev bars, LOS/lead by country, segment mix, membership rank by country, Country Summary Table
7. **Segments** — Simple/Detailed toggle (4 vs 10 categories), breakdown bars, seg by month/country/lead/ADR. Detailed mode adds: Couple (1M+1F), Duo (Male/Female), Family (1/2/3+ children), Group (All Male/Female/Mixed)
8. **Booking Patterns** — DOW, monthly trend, device pie, monthly DOW comparison line charts (CI + CO)
9. **Member** — Repeat guest analysis: KPI cards, overview pie, JP vs Intl, repeaters/first-timers by country (stack% + count), repeat rate by rank/segment/facility, repeat window analysis (tightest gap + 1st→2nd return), Top 50 repeater detail table with name. Window analysis uses ALL data (ignores date filters).
10. **LOS** — Stay length histogram stacked by segment, avg LOS by segment/country, detail table
11. **Revenue** — by market, monthly, market×month stacked, daily, by DOW, by DOW × month
12. **Cancellations** — Monthly trend (Composed: bars + rate line), by country/segment/facility, detail table. Ignores Status filter.
13. **(Hidden) RevPAR** — Commented out in TABS array. Code preserved.
14. **Room Types** — distribution chart + sortable table
15. **Facilities** — per-facility charts + Kanto/Kansai + Hotel/Apart comparisons + sortable Facility Performance table
16. **Raw Data** — paginated sortable table with CSV export

## Daily Report Sections
- **Date range** (drFrom/drTo): country table, region table, YoY charts (revenue + count), ADR bar chart, 直販比率 stacked bar, クーポン (summary + detail)
- **Single date** (drSingle, defaults to yesterday): 施設別 (Hotel/Apart/Direct tables by check-in month), プラン別 (Total/Hotel/Apart by plan type with revenue share), キャンセル (facility + country with check-in month breakdown)
- Plan type classification: 返金不可 (non-refundable keywords), 学生 (student keywords), その他 (everything else)
- Facility type for plan tables: Hotel (contains 'hotel'/'イチホテル'/'premium hotel'), Apart (everything else)
- All sections include cancellation data — never filtered out

## Global Filters
Status (default: All), Hotel Type, Brand, Region (Kanto/Kansai), Country, Segment, Property, Geo Area, Day of Week, Date Type (default: Booking Date), From/To dates, Month Axis (default: By Booking Month). Reset restores defaults.

## Saved View Presets
- "Save View" button + name input in filter bar — saves current filter combo to localStorage as named preset
- Preset buttons appear in the filter bar; click to load
- Active preset highlighted green with ✓
- Stored in `monday_presets` localStorage key (NOT cleared by version bumps)
- Reset button clears active preset

## CSV Columns Available
施設名(0), 状態(1), 予約番号(2), 予約受付日時(3), 宿泊日チェックイン(4), チェックアウト日(5), キャンセル料(11), 泊数(12), 宿泊プラン(13), プラン区分(14), 予約方法(17), 部屋タイプ(18), 大人1人数(22), 大人2人数(24), 子供1-9人数, 宿泊料金合計(43), 割引(53), クーポン名(56), クーポン割引(57), 予約料金合計(62), 氏名(63), メールアドレス(65), 都道府県(70), 国番号(73), 言語(91), 販売チャネル(94), ランク名(95)

## Deploy
- **GitHub Pages**: via Actions workflow (`.github/workflows/deploy.yml`), pushes to `master` auto-build/deploy
- **Cloudflare Workers**: via `wrangler.jsonc` config, auto-deploys on git push (separate pipeline from GH Pages)
- `gh` CLI at `~/bin/gh`
- Git config: user=en.seraph, email=en.seraph@users.noreply.github.com

## Version
Current: 1.81

Recent changes:
- v1.81: TL filter bar gained Region / Segment / DOW / Date Type / Month Mode (shared with YYB, same carry-over philosophy as date range). New `tlGetM(r)` helper switches month groupings between booking month (`r.dateStr`) and stay month (`r.checkinStr`). All TL aggregation memos updated to respect `monthMode` in deps. `tlPaceRpt` deliberately stays on reception date (cumulative pace is semantically reception-based).
- v1.80: TL Pace chart x-axis fix — flat chartData keyed by day 1-31 instead of per-Line data which caused recharts to concatenate categories.
- v1.79: All TL tables converted to `SortTbl` (column sort, xlsx export, draggable title via `rgl-drag` class on title). TL Raw Data left as inline table because of pagination.
- v1.78: YYB ADR room-nights fix — `processRow` now parses `部屋数` (room count) into `r.rooms`. All YYB ADR/RevPAR memos use `rev/(nights*rooms)` instead of `rev/nights`. Multi-room group bookings were inflating hotel ADR by ~7%. TL brand + hotel type filters + Japan always pinned in TL ADR country list.

**YYB rooms parsing**: `processRow` now reads `部屋数` column and stores as `r.rooms` (default 1). All YYB ADR calculations now use `nights × rooms` room-nights denominator, matching TL. Fixed a ~7% overstatement in hotel ADR caused by ~5% of bookings being multi-room group reservations.

**LAYOUT_SCHEMA_VERSION** constant (separate from APP_VERSION) — bump ONLY when tab IDs or grid keys change, NOT on every minor version. App-version bumps no longer clear saved custom layouts.

**Shared filter state between YYB and TL** (carry over when switching sections):
- Date range (`fDF`/`fDTo`)
- Date type (`fDT`) — TL only honors `booking`/`checkin`
- Month mode (`monthMode`) — TL uses `tlGetM(r)` helper
- Region (`fR`), Segment (`fS`), DOW (`fDOW`), Property (`fP`)
- Hotel type, brand are separate per-section (`fHType`/`fBrands` for YYB, `fTlHotelType`/`fTlBrand` for TL)
- TL-only: `fChannelBucket`, `fTlChannelName`, `fTlStatus` (Net/All/Cancelled/Modified)
- YYB-only: `fCancel` (cancellation status), `fGeo` (geographic region)

**ADR formula** (both YYB and TL since v1.78): `Σ revenue / Σ (nights × rooms)`. Using `rev/nights` is wrong for multi-room group bookings. YYB rows store `rooms` from the `部屋数` column (default 1 if missing); TL rows use the `rooms` field directly.
APP_VERSION constant at top of App.jsx, also clears localStorage layouts on version change.
`DATA_LAG_DAYS=1` constant near top — single source of truth for "latest available data = today - N". Used by Compare tab presets.

## Important Patterns
- **Timezone**: All date-to-string conversions go through `tzFmt()` which uses cached `Intl.DateTimeFormat` + result `Map`. NEVER use `toISOString()` for date display (UTC shift). NEVER create `new Intl.DateTimeFormat` in a loop.
- **Grid children**: NEVER conditionally render `<div key="...">` — always render the wrapper, put conditional content inside: `<div key="x">{condition&&<CC.../>}</div>`
- **Temporal Dead Zone**: Any new `xxxRpt` useMemo MUST be defined BEFORE the `insights` useMemo since `insights` references them all in its return object.
- **Version bump**: Auto-clears stale localStorage layouts via `loadLayouts()` check
- **Pie charts**: `outerRadius="65%"` with custom label renderer to avoid clipping
- **Export buttons**: In title bar (top-right), not bottom of card
- **Filter bar**: Uses `overflow:visible` to prevent dropdown clipping (overrides S.card overflow:hidden)
- **Performance**: `getM()` calls `tzFmt()` per row during aggregation — must stay cached
- **Facility name normalization**: processRow normalizes 舞浜ビュー encoding variants and strips `（旧：...）` suffixes
- **Date Type respect**: Daily/DOW charts use `getDateField(r)` helper to use selected `fDT` (booking/check-in/checkout)
- **Lock layout**: Sets per-item `static:true` (not just grid-level) for reliable disable

## Daily/DOW Charts Date Type Awareness
These charts respect the global Date Type filter via `getDateField()` helper:
- `dailyD` (overview daily charts + revenue daily)
- `revDowD` and `revDowMonthD` (revenue by DOW)
- `revparRpt` daily trend
NOT respected by: `dowD` (always uses checkinDow/checkoutDow — semantically correct)

## Planned Features (Status)
1. ~~**Date comparison mode**~~ — DONE (Compare tab)
2. ~~**Pace report**~~ — DONE (Pace tab)
3. ~~**Cancellation rate tracker**~~ — DONE (Cancellations tab)
4. ~~**Length of stay distribution**~~ — DONE (LOS tab)
5. ~~**RevPAN + RevPAR**~~ — DONE but HIDDEN (only direct sales data, RevPAR not meaningful)
6. ~~**Saved view presets**~~ — DONE
7. ~~**Dashboard PDF export**~~ — DONE (browser print + print.css)
8. **Annotation system** — Not started (click data points to add notes, stored in localStorage)
9. **Multi-sheet support** — Not started (load from multiple Google Sheet tabs)
