# MONday Reservation Analyzer

## Project
React dashboard (single JSX file) for JHAT/MONday Group hotel reservation data.
- **Repo**: https://github.com/enseraph/monday-analyzer
- **Live (auth-protected, Cloudflare)**: https://monday-analyzer.jhat.workers.dev/
- **GitHub Pages**: unpublished (repo Settings → Pages → Unpublish site). `.github/workflows/deploy.yml` can be deleted to stop future Actions runs.
- **Main file**: `src/App.jsx` (~3700 lines), `src/shared.js` (shared helpers)
- **Stack**: Vite + React + Recharts + react-grid-layout + html-to-image
- **Data source**: Google Sheets CSV (auto-fetched on load), manual CSV upload as fallback

## Auth (Cloudflare)
- Cloudflare Workers deploys via `wrangler.jsonc` (assets in `dist/`, SPA mode)
- Cloudflare Access protects the Workers URL — Google IdP + email allowlist policy
- Team domain: `jhat-pd.cloudflareaccess.com`
- Workers subdomain: `jhat` (changed from default `c-katsuse`)
- Auto-deploys on git push via wrangler (independent of GitHub Pages)

## Ads Dashboard (separate tool)
The ads/marketing analytics dashboard is a **separate repo and tool** (`monday-ads`), NOT a feature-flag branch of this project. Decision made to keep this reservation dashboard lean and avoid a 4000+ line monolith.
- **Repo**: `monday-ads` (sibling to `monday-analyzer`)
- **Cloudflare Worker backend**: `monday-ads-api` — proxies Google Ads API, Meta Marketing API, GA4 Data API via OAuth tokens in Workers KV
- **Data sources**: Google Ads (Search + PMax + Demand Gen), Meta Ads (traffic/conversions), GA4 (conversion attribution), plus Google Sheets reservation CSV (same URLs as this tool) for country-level spend-vs-revenue cross-analysis
- **Shared design**: copies TH/S/DraggableGrid/CC/EB/SortTbl/i18n patterns from this tool (copy-paste, not shared package)
- **Claude Code skill**: `~/.claude/skills/ads-analyst/SKILL.md` — AI ad specialist for strategic analysis
- **Previous approach (SUPERSEDED)**: build-time feature flag with `VITE_ADS_ENABLED` env var was planned but abandoned in favor of full separation

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
- ⚠ **Date parsing gotcha (v1.61 fix, extended v1.90)**: `new Date("YYYY-MM-DD")` is UTC midnight in JS, but `new Date("YYYY-MM-DDT00:00:00")` is local midnight. Mixing these breaks date-equality filters in non-UTC timezones. **ALL date filter `from`/`to` parsing MUST use `new Date(str+"T00:00:00")`** — this applies to the main `filtered` memo, `cancelRpt`, TL filter memos, and any future filter code. v1.90 fixed the YYB `filtered` and `cancelRpt` memos which were using bare `new Date(fDF)` (UTC midnight), causing bookings on April 12 at 23:00+ JST to appear as April 13 data.
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
Current: 1.96

Recent changes:
- v1.96: **Date picker scroll-to-navigate.** Mouse wheel over the calendar area advances/retreats one month per scroll tick (throttled at 180ms). Prev/Next arrow buttons still work. Prevents page scroll while scrolling within the calendar.
- v1.95: **Google Ads / GA4 style date range picker.** New `DateRangePicker` component replaces the From/To inputs in the global filter bar. Features:
  - **Preset sidebar**: Today, Yesterday, Last 7 / 14 / 28 days, This month, Last month, This year, Last year, Custom (localized EN/JA).
  - **Dual-month calendar view** on desktop, single-month on mobile. Click a start date, then an end date; hover preview shows the range before the second click commits.
  - **Apply-on-confirm**: draft state only commits to `fDF`/`fDTo` when Apply is clicked. Cancel or click-outside discards the draft. Prevents expensive recomputes mid-selection.
  - **Start/End date inputs** at top of picker for keyboard entry.
  - **Today highlighted** with gold border; selected range in gold background with solid-gold edges for start/end.
  - **Button shows formatted range**: "Apr 1, 2026 — Apr 14, 2026" in EN or "2026/4/1 — 2026/4/14" in JA.
  - Daily Report, Compare tab, and TL Compare tab keep their existing inline date inputs (not replaced in this pass — Compare tabs have dual-range UX with quick presets already).
  - Component is module-level (not re-created per render) and themed via `theme` prop.
- v1.94: **Single-day section respects global filters.** Both YYB and TL single-day breakdowns now apply all global filters (region, country, segment, property, brand, hotel type, geo, DOW, channel, etc.) EXCEPT the date range filter (which is overridden by `drSingle`) and the status/cancel filter (which would hide the cancel subsection's data). This is a deliberate exception to the status filter — without it, the cancel subsection would be empty whenever `fCancel` is "confirmed" or `fTlStatus` is "net" (the default).
- v1.93: **TL daily report single-day section + YYB single-day i18n fix.**
  1. Extracted the YYB daily report's single-day breakdown (施設別 Hotel/Apart/Direct tables + cancellation tables) into a reusable `SingleDayBreakdown` component defined inside App. It takes `getCheckinMonth`, `getHotelBucket`, `isDirect`, `isCancelled`, and `includePlanTables` as props so both YYB and TL can use it with their different row shapes.
  2. Added the same single-day section to the TL Daily Report tab, below the existing KPIs/tables. Includes 施設別 (Hotel/Apart/Direct) + cancellation breakdown (by facility, by country). Uses `r.dateStr` for reception date filtering, `r.checkinStr.slice(0,7)` for check-in month, `r.hotelType` for hotel/apart split, `r.channelBucket==="direct"` for direct bucket, and `r.isCancelled || r.sameDayCancelled` for cancellations. Revenue uses `r.totalRev` with a "税抜" suffix in column headers (matching the rest of the TL UI). Does NOT include plan tables (TL plan data is structured differently — deferred).
  3. **YYB single-day section i18n fixed.** Previously the 施設別 / 売上 / 件数 / 以降 / 直販 / 売上シェア / 返金不可 / 学生 / その他 / "Grand total" labels were hardcoded in Japanese regardless of language setting. Now:
     - Month columns: "4月"/"5月" in JA, "Apr"/"May" in EN (uses `EN_MONTHS_SHORT` constant).
     - "以降" → `t.drAfterLabel` ("After" / "以降")
     - "件数" → `t.drCount` ("Res" / "件数")
     - "売上" → `t.drRevenue` ("Revenue" / "売上")
     - "売上シェア" → `t.drRevShare` ("Rev Share" / "売上シェア")
     - "直販" → `t.drDirect` ("Direct" / "直販")
     - "Grand total" → `t.drGrandTotal` ("Grand total" / "合計")
     - Plan type names (返金不可/学生/その他) translated via `tl()` which now includes `_PlanNR`/`_PlanStudent`/`_PlanOther` keys
     - Country names translated via `tl()` in the cancel-by-country table
  4. The `drSingle` state is shared between YYB and TL daily tabs (date picker remembers the selection when switching).
- v1.92: **MS dropdown search + i18n country names.**
  1. `MS` (MultiSelect) component gains a `displayFn` prop and a search input. Country, segment, geo area, and DOW dropdowns now show translated names in JP mode via `displayFn={tl}`. Search matches against both raw and translated values.
  2. Search auto-focuses on dropdown open, shows "No matches" when filter returns nothing.
- v1.91: **Remaining audit fixes (27 items).**
  1. **MS dropdown themed** — MultiSelect dropdown now receives `theme` prop and uses themed colors instead of hardcoded dark-mode values. Works correctly in both dark and light modes. Unused module-level `CT` component deleted (was shadowed by the inner themed version).
  2. **Worker handler `{once:true}`** — TL worker `addEventListener` calls now use `{once:true}` to prevent stale handler accumulation on rapid `fetchTL` calls.
  3. **DOW filter in compare/pace/cancel** — `fDOW` filter now applied in `compareRpt`, `paceRpt`, and `cancelRpt` `applyFilters` functions (was silently ignored). Added to all three dependency arrays.
  4. **Repeat window denominator fix** — `tightestTable` and `firstSecondTable` totals now only count guests with 2+ bookings, matching the "Repeat Window Analysis" title. Pre-v1.91 included single-bookers in the denominator.
  5. **TH + S memoized** — `TH` (theme palette) wrapped in `useMemo([dk])`, `S` (style object) wrapped in `useMemo([TH,isMobile,dk])`. Prevents all child components from receiving new style object references on every render.
  6. **O(M*N) month scans eliminated** — `revMktMo`, `kvk.mktMo`, `kvk.segMo`, and `segDetailedExtras.segMo` now pre-build a `Map<month, row[]>` in one pass and do direct lookups instead of `filtered.filter(r=>getM(r)===m)` per month.
  7. **TL filter Sets** — `tlDailyRpt` converts `fP`, `fChannelBucket`, `fTlChannelName`, `fTlBrand`, `fS`, `fDOW` to `Set` before the filter loop (was using `.includes()` on 180k rows).
  8. **DOW array hoisted** — All 5 `const DOW=["Mon"..."Sun"]` declarations inside useMemo blocks replaced with `const DOW=DOW_SHORT` (module-scope constant).
  9. **tlSegmentsRpt accumulators** — Replaced array push + `avg()` with sum+count accumulators for nights and lead time computation.
  10. **mktDByRev** — Revenue-sorted mktD array computed once in a `useMemo`, replacing 3 inline `[...mktD].sort()` copies in JSX.
  11. **Device pie single computation** — Device distribution data computed once, referenced in both `CC` data prop and `PieChart`.
  12. **Pace delta variable** — Extracted repeated pace delta expression into `const paceDelta`.
  13. **channelNameList top20** — Pre-sliced in `tlChannelRpt` return, replacing 3 inline `.slice(0,20)` calls.
  14. **i18n: `drNote`** — "※数字は8:40以降に確定" now uses `t.drNote` (EN: "Numbers finalized after 8:40").
  15. **TL Raw Data export** — Added CSV export button to TL raw data tab (was missing, YYB had one).
  16. **Tick renderer dedup** — Created `TlTickV9` and `TlTickV9R` components, replacing ~10 identical anonymous tick renderer functions.
  17. **Comment fix** — `{/* ROOMS */}` corrected to `{/* ADR */}`.
- v1.90: **Deep audit cleanup + shared module + date filter fix.**
  1. **`src/shared.js` module** — extracted `getRegion`, `getBrand`, `getSegment`, `getSegmentDetailed`, `parseTLRow`, `applyTLSameDayCancel`, `KANSAI_KW`, `DOW_FULL`, `DOW_SHORT`, `TL_REQUIRED_COLS`, `pctChg` into a single shared module imported by both App.jsx and tlWorker.js. Eliminates code duplication and sync risk between the two files. ⚠ The v1.83 warning about keeping worker helpers in sync is now obsolete — both import from shared.js.
  2. **Date filter UTC bug fixed** — `new Date(fDF)` (date-only string) parsed as UTC midnight, but `bookingDate` from datetime strings parsed as local time. Bookings on April 12 at 23:00+ JST appeared as April 13 data. Fixed by using `new Date(fDF+"T00:00:00")` (local midnight) in both `filtered` and `cancelRpt` memos. This is the same fix pattern documented in CLAUDE.md for TL date parsing (v1.61 fix).
  3. **Bug fixes**: blob URL leak in `expCSV`/`expXLS` (now revoked after 5s), YYB cache write try-catch for QuotaExceededError, removed dead `month`/`bookMonth` fields using forbidden `toISOString()`, removed spurious `monthMode` dep from `losRpt`, removed dead `kvk.scale` computation, `tlCompareRpt.totalCount` now excludes cancelled rows (was counting cancellations in the total but excluding from breakdowns), removed premature `setLastFetchTs` calls.
  4. **Performance**: child column indices cached in `processRow` (was O(9×cols) per row), `getPlanType` hoisted to module scope, `tzCache` Map capped at 200k entries, pace cumulative chart O(n) (was O(n²)), RevPAR totals derived from `byFac` (not re-scanned), RevPAR min/max dates O(n) (was O(n log n) sort).
  5. **Redundancy**: removed unused `CHILD_COLS` constant, `pctChg` extracted to shared module (was duplicated in compareRpt and tlCompareRpt return objects), removed `localDate2` duplicate, removed `getMonth` trivial wrapper.
  6. **i18n**: Google Fonts `<link>` moved to `index.html` (was duplicated in JSX body), added `metricLabel` i18n key (was hardcoded "Metric:"), added i18n keys for TL chart titles (en + ja).
- v1.88: Added "Total Revenue by Country" horizontal bar chart to YYB Overview tab and YYB Revenue tab (top 15 countries sorted by total rev). `mktD` now carries `rev` field. Layout schema bumped to 4 (new grid keys `ch-rev-country`, `ch-rev-country-r`).
- v1.87: Country classification cleanup. `International (EN)` renamed to `EN (no country)` — honest label for English-speaking guests whose country signal was missing (pre-2024 reservations didn't require country). `COUNTRY_MAP` massively expanded with English variants (USA/U.S.A./America/米国), UK variants (Britain/GB/England/英国), Japanese katakana country names, and common aliases. Chinese-language fallback now resolves to Taiwan instead of Taiwan/HK (ZH) — mainland China captured by added prefecture mappings (北京/上海/广州/etc.), HK by +852 phone, rest is statistically Taiwan. `GEO_REGION` classifies `EN (no country)` as Unknown not Asia. Mobile sidebar toggle moved to app root (position:fixed + zIndex:1000) for reliable scroll stickiness. Mobile layouts always default to locked on session start.
- v1.86: Removed `Taiwan/HK (ZH)` bucket. Added mainland China city/province entries to COUNTRY_MAP.
- v1.85: Sidebar polish — themed scrollbar (6px, gold, transparent track via grid.css `.monday-sidebar`), light-mode-aware sidebar colors (`TH.sidebarBg/sidebarBorder/sidebarHover`), collapsed section labels always visible.  Header trimmed: removed reservation-count sub-line and file-info pill. Updated data coverage disclaimer to "予約番 data covers May 2024 forward, TL-Lincoln data covers Jan 2025 forward."
- v1.84: **Left sidebar navigation** replaces the horizontal tab strip. All 30 tabs visible at once without scrolling, grouped by data source (YYB in gold, TL in teal). Collapsible to a 48px icon rail via the `☰` button at the top; state persisted in localStorage (`rgl_sidebar_collapsed`). Each tab has an emoji icon in its `TABS` entry (`i` field). Active tab is highlighted with a left-border accent in the section color + tinted background. On mobile (isMobile), the sidebar becomes an overlay drawer — starts collapsed, expands over the content, auto-collapses on tab click. A fixed `☰` button at the top-left opens the drawer. The source banner stays above the filter bar with its color-dot indicator. Main content wrapper changed from `<div style={S.inner}>` at root to a flex container `<div style={{display:flex,minHeight:100vh}}>` with sidebar + `<div style={{flex:1,minWidth:0}}>` holding the original inner. Everything inside (header, filters, KPIs, tab content, source banner) is unchanged — only the tab-navigation chrome moved.
- v1.83: **Performance + shareable URL state**.
  1. **Web Worker for TL parse** — `src/tlWorker.js` runs Papa.parse + parseTLRow + applyTLSameDayCancel off the main thread. Eliminates the 2-4 second UI freeze on cold load of the ~180k-row TL dataset. Worker is bundled separately via Vite's `?worker` import suffix (23.74 KB chunk). Lazy-initialized on first fetch, reused across refreshes, terminated on unmount. Includes a main-thread fallback path if worker initialization fails. As of v1.90, both App.jsx and tlWorker.js import shared helpers from `src/shared.js` — no more manual sync needed.
  2. **URL state for shareable views** — tab + all filter state (YYB + TL) now serialize to query params and restore on load. Uses `window.history.replaceState` to avoid history pollution. Only non-default values written to keep URLs short. Short param names used (`fCB` for channel bucket, `fCN` for channel name, `fTS` for TL status, `fTB` for TL brand, `fTH` for TL hotel type, `mm` for month mode). Read once at module load into `INITIAL_URL_STATE` and passed into `useState` initializers. A single useEffect writes on any filter change. Shareable link format example: `?tab=tl-adr&fDF=2026-03-01&fDTo=2026-03-31&fCB=ota&fTS=net`.
- v1.82: **Audit-driven correctness fixes** to calculation methodology.
  1. **KvK DOW chart Kansai scaling removed** — pre-v1.82 multiplied Kansai DOW counts by `Math.round(kantoJapan/kansaiJapan)` to "scale up" Kansai for visual comparison; this was misleading. Now both regions display **% share within their own region** (each region's daily counts sum to 100%). Chart titles updated. The `kvk.scale` field is no longer used by these charts.
  2. **YYB RevPAR `totalDays` always uses check-in span** regardless of `fDT`. Pre-v1.82, with `fDT=booking`, the denominator was the booking-date span but the numerator counted nights spread across many future check-in months → occupancy could exceed 100%.
  3. **YYB RevPAR monthly grouping always by stay month** regardless of `monthMode`. Same root cause as #2: physical occupancy must be measured against stay periods, not booking periods.
  4. **YYB Segments tab "ADR by Segment" switched to revenue-weighted formula** (`Σrev / Σ(nights×rooms)`). Pre-v1.82 used unweighted simple-average of per-row ADRs, which is the "macro" definition; the rest of the tool uses the industry-standard "micro" (revenue-weighted) definition. Affects `agg.segADR`, `segDetailedExtras.segADR`, and KvK `adrSeg`. Storage shape changed from `array of per-row ADRs` to `{rev, rn}` accumulator.
  5. **`agg.intlPct` no longer counts Unknown country as international.** Was: `country !== "Japan"`. Now: `country !== "Japan" && country !== "Unknown"`. International % KPI on the header now only counts confirmed international rows.
  6. **TL ADR uses `r.revenue` only, not `r.totalRev`** (which is `revenue + revenue_other`). `revenue_other` covers meals/options/programs and shouldn't be in the room-rate calculation. Applied to `tlAdrRpt`, `tlRevenueRpt` (per-month and per-facility ADR), and `tlDailyRpt` (ADR KPI). Revenue display totals still use `totalRev` — only ADR denominators changed.
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

**ADR revenue source** (v1.82+):
- **YYB**: uses `r.totalRev` = `予約料金合計` (ex-tax). YYB doesn't separate room from ancillary charges in this column.
- **TL**: uses `r.revenue` ONLY (not `r.totalRev` = `revenue + revenue_other`). `revenue_other` covers meals, options, programs and should not inflate room rate. Revenue display tabs still use `totalRev`.

**RevPAR / occupancy**: must always be measured by check-in date / stay month. Pre-v1.82 used `fDT` and `monthMode`-dependent grouping which broke when those were set to "booking". Hardcoded to check-in regardless.

**International % KPI** (`agg.intlPct`): only counts rows where `country !== "Japan" && country !== "Unknown"`. Pre-v1.82 lumped Unknown with International.

**KvK DOW comparison**: shows **% share within each region**, not raw counts. Each region's daily counts sum to 100%. Pre-v1.82 multiplied Kansai counts by a scaling factor which was misleading.

**Segment ADR formula**: revenue-weighted (`Σrev / Σ(nights×rooms)`), not unweighted simple average. Storage in `agg.segADR` is `{[seg]: {rev, rn}}` accumulator, not `{[seg]: [adr1, adr2, ...]}` array. v1.82 fix.

**TL parsing runs in a Web Worker** (v1.83). `src/tlWorker.js` imports shared helpers from `src/shared.js` (v1.90 — previously contained duplicated copies). Main thread posts `{type:"parse", jobs:[{yr,text}]}`, worker responds with `{type:"result", rows, perYear, errors}`. If worker init fails, code falls back to main-thread parse. When adding new derived fields to `parseTLRow`, update `src/shared.js` — both App.jsx and tlWorker.js import from it.

**URL state sync** (v1.83). `readUrlState()` / `writeUrlState()` serialize filter + tab state to query params. Called once at module load (into `INITIAL_URL_STATE`) and on every filter state change. Uses `history.replaceState` — no back-button pollution. When adding a new filter state variable, extend both helpers AND the sync useEffect deps array.
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
