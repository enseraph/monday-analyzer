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
Current: 2.17

Recent changes:
- v2.17: **Country / Property "+ Other" is now an independent toggle + fixes bucketing on new Country Overview charts.**
  1. **Root cause of the "stuck + Other" bug**: the three country-view buttons (Aggregate / Per country / + Other) were a single mutually-exclusive radio group. With 1 country selected, Aggregate and Per country were both greyed out (their threshold was `fC.length<2`), so there was no button the user could click to switch away from "+ Other" — it looked stuck.
  2. **Root cause of the "per-country-instead-of-aggregated" bug on ch-mrev-time / ch-mcnt-time**: those two charts (added in v2.16) used their own `mktTimeRpt` memo which always computed top-8-by-revenue + "Other" regardless of the country filter or view mode. Pressing "+ Other" had no effect on them.
  3. **State restructure**: `countryViewMode` no longer has a `"perCountryWithOther"` enum value — it's now just `"aggregate"|"perCountry"`. New independent boolean state `countryWithOther` (same for `propertyWithOther`). The "+ Other" button is now a true on/off toggle (`setCountryWithOther(v=>!v)`), orthogonal to the aggregate/per-country choice.
  4. **Four valid combinations** now rendered correctly:
     - aggregate + !withOther → no split (country filter restricts data)
     - aggregate + withOther → 2 series: "Selected" (combined) vs "Other" (uses country's name if exactly 1 selected)
     - perCountry + !withOther → N series, one per selected country (needs fC.length≥2)
     - perCountry + withOther → N selected series + Other bucket
  5. **`perCountrySeries` rewritten** to handle the new 4-case logic. New `SELECTED_KEY="__selected__"` label for the multi-select-aggregated bucket. Same changes mirrored for `perPropertySeries`.
  6. **`mktTimeRpt` rewritten** to respect `countryWithOther` + `fC` + `countryViewMode`. Fallback to top-8 behavior when no selection or withOther off.
  7. **Filter bar UI**: Aggregate button is now always enabled (it's the default/fallback state, no reason to grey it out). Per country stays `<2` gated. "+ Other" is `<1` gated and toggles on/off.
  8. **Auto-clear**: `useEffect` watches `fC` and `fP` — if either is emptied, the corresponding withOther toggle auto-clears to avoid stale-state UX.
  9. **Reset button** now also clears both viewMode states and both withOther flags.
- v2.16.1: **Country "+ Other" works with a single selected country.** Previously all three country-view buttons shared `fC.length<2` as the disabled threshold, so "+ Other" couldn't be activated with one country selected. Lowered the threshold for "+ Other" only (perCountry stays at 2+, since splitting into a single series is meaningless). Three call sites updated: button disabled condition (line ~3516), `perCountrySeries` useMemo gate (line ~1403), and `skipCountryFilter` flag (line ~1151). Mirrors the existing property-view threshold.
- v2.16: **Country Overview tab — layout gap fix + two new time-series stacked-bar charts.**
  1. **Root cause of the big gap below Country Summary Table**: `ch-msc` (Segment Mix by Country) and `ch-rkc` (Membership Rank by Country) both read from the `kvk` useMemo, which was gated on `tab==="kvk"` only — so on the markets tab `kvk` was `null` and the two bottom cards rendered as empty space, reserving ~700px of height but showing nothing. Fixed by expanding the gate to `tab==="kvk"||tab==="markets"`. Also changed `ch-rkc` from half-width `[0,16,6,4]` → full-width `[0,26,12,4]` as part of the reflow.
  2. **New chart `ch-mrev-time`** — Total Revenue by Country, stacked bar, monthly/daily toggle. Top 8 countries by revenue + "Other" bucket. Uses PALETTE colors + warm taupe (#78716c) for Other (same convention as "+ Other" view mode).
  3. **New chart `ch-mcnt-time`** — Total Reservations by Country, same structure but count instead of revenue.
  4. **New `mktTimeRpt` useMemo** — single-pass computation gated on `tab==="markets"` that builds all four series (monthly rev, daily rev, monthly count, daily count) broken down by country. Respects all global filters. Uses `getM()` for month grouping (respects `monthMode`) and `getDateField()` for daily grouping (respects `fDT`).
  5. **`CC` component gained an optional `extra` prop** — renders in the title bar between title and EB export buttons. Used for the day/month toggles. Wrapped in `onMouseDown={e=>e.stopPropagation()}` so clicking the toggle doesn't start a grid-drag.
  6. New state: `mktRevGrp`, `mktCntGrp` (each "day"|"month", default "month"). New i18n keys: `t.mktRevByCountryTime`, `t.mktCountByCountryTime`. LAYOUT_SCHEMA_VERSION bumped to 10 (clears cached markets layouts).
- v2.15: **Hotel Opening tab — ramp window tightened, revenue ramp added, cohort to stacked bar, channel mix removed.**
  1. `PRE_OPEN_RAMP_DAYS` reduced from 180 → 100. Pre-opening booking ramp X-axis now spans -100d → 0 (the -180→-100 window had near-zero data for most facilities and stretched the chart).
  2. **New chart `op-ramp-rev`** — pre-opening cumulative revenue per facility, mirrors the existing count ramp. New `rampRevRows` series in `openingRpt`. New i18n key `t.openingRampRev`.
  3. **`op-cohort` switched from LineChart to BarChart with stacked bars per facility** (`<Bar key={f} stackId="a" .../>`). Easier to read total daily revenue at a glance with multiple facilities selected. Data shape unchanged.
  4. **Removed `op-channel`** (Post-open weekly channel mix). Dropped the channelWeekly/topChannels/channelRows computation block from `openingRpt` and the corresponding JSX/layout entry. Country mix retained.
  5. Default layout reflows: ramps occupy 6×5 each side-by-side at the top, cohort full-width below, then split + ADR side-by-side, country full-width. LAYOUT_SCHEMA_VERSION bumped to 9 (clears cached opening layouts).
- v2.14: **"+ Other" view modes for country and property.**
  1. `countryViewMode` now supports a third value `"perCountryWithOther"`. Button label: `+ Other`. When active, selected countries render as individual stacks + an aggregated "Other" bucket for every non-selected country. The country filter's semantics shift from "restrict data" to "group by" — `filtered` memo no longer excludes non-selected countries when this mode is on.
  2. New `propertyViewMode` state (`aggregate` | `perProperty` | `perPropertyWithOther`) with its own 3-button toggle in the filter bar (next to the Property multiselect). Mirrors the country toggle behavior. When a mode is active with specific properties selected, compatible charts split by property. In "+ Other" mode, non-selected properties aggregate into "Other".
  3. New `perPropertySeries` useMemo mirrors `perCountrySeries` — single-pass computation of monthly/daily/DOW count+rev series broken down by facility. Returns null unless property view mode is active and ≥1 property selected.
  4. **Priority order** in chart rendering: **property > age > country > default**. If multiple view modes are active simultaneously, the most specific (property) wins on each chart. All 8 YYB charts that support country view now also support property view.
  5. **"Other" bucket color:** `#78716c` (warm taupe). Deliberately distinct from existing palette, Compare A/B (blue/gold), Age (green/slate). The "Other" key is internally `__other__` to avoid any collision with real facility or country names; rendered as translated label "Other" / "その他" via new `t.otherLabel`.
  6. Helper functions: `seriesLabel(k)`, `seriesFacLabel(k)`, `seriesColor(k, i)` centralize the "Other"-aware label and color resolution.
- v2.13: **Added Premium MONday 浅草 Ⅰ.** New facility appeared in YYB data (2 advance bookings). Rooms: 26. Opening: 2026-05-01. Source: Excel 250430JHAT Property List, row 50 (codename 西浅草ノース). Added alias `"Premium MONday 浅草 ONE" → "Premium MONday 浅草 Ⅰ"` since brand-strategy deck previously used "ONE" while data uses the Roman numeral Ⅰ. Later added `"MONday Premium 浅草 ONE"` and `"MONday Premium 浅草 Ⅰ"` aliases for the reversed word-order variant that appeared in data.
- v2.12: **TL-side facility normalization.** Discovered TL data has `"Premium hotel MONday 舞浜ビュー Ⅰ"` (with a literal space between ビュー and Ⅰ) — different from the YYB variant that gets normalized in `processRow`. TL's `parseTLRow` previously didn't apply any name normalization, so the garbled/spaced variants flowed through unchanged and caused the unclassified banner to flag Maihama View I as missing from both maps.
  1. Extracted the name-normalization logic (`舞浜ビュー` consolidation + `（旧：...）` stripping) into a new `normalizeFacility(f)` helper in `src/shared.js`.
  2. Applied it in `parseTLRow` (runs in both the worker and main-thread-fallback TL paths) — so TL data now gets the same facility-name consolidation as YYB.
  3. `FACILITY_ALIASES` is also applied post-worker (main thread) for both TL paths since the worker can't import from `constants.js`.
  4. App.jsx's `processRow` now calls `normalizeFacility()` instead of having the same regex inline — single source of truth for the normalization rules.
- v2.11: **Facility name fixes + FACILITY_ALIASES map.**
  1. Fixed `MONday Apart 銀座新富町` → `MONday Apart Premium 銀座新富町` in ROOM_INVENTORY and FACILITY_OPENING_DATES (actual data has "Premium"; my v2.04 entry was wrong).
  2. Added `Premium Apart MONday 浜松町ステーション` opening date: 2026-03-27.
  3. Added `FACILITY_ALIASES` map in `src/constants.js` for merging renamed facilities. Applied in processRow after the existing normalization steps. Currently contains `"MONday Apart Premium 浅草" → "GRAND MONday 浅草"` (rebrand; both names appear in YYB data). The canonical name is now "GRAND MONday 浅草" — brand auto-classifies as "GRAND MONday", old+new data aggregates together.
  4. Renamed constants.js entries from old "MONday Apart Premium 浅草" to canonical "GRAND MONday 浅草" (25 rooms, 2024-06-28 opening).
- v2.10: **Hotel classification hardening.**
  1. **Expanded `KANSAI_KW`** in `src/shared.js`. Was 6 specific area keywords (京都丸太町, 京都烏丸二条, 京都駅, 京都駅鴨川, 京都五条, 大阪難波). Now 5 broader geographic keywords (京都, 大阪, 難波, 心斎橋, 河原町) that cover all existing Kansai facilities + the visible pipeline (京都河原町, 大阪難波中, 心斎橋, etc.). Any future Kyoto or Osaka hotel with a recognizable place name will auto-classify correctly.
  2. **New file `src/constants.js`** — maintenance constants for new-facility updates. Currently contains `ROOM_INVENTORY`, `TOTAL_ROOMS`, `FACILITY_OPENING_DATES`, `NEW_HOTEL_CUTOFF`, `isNewFacility`, `FACILITIES_WITH_PREOPEN_DATA`, `PRE_OPEN_RAMP_DAYS`, `COHORT_DAYS`. When a new hotel launches, this is the single file to edit. App.jsx now imports from `./constants.js`.
  3. **Unclassified facilities banner** — surfaces when the data contains any facility name that isn't in `ROOM_INVENTORY` or `FACILITY_OPENING_DATES`. Shows above the filter bar with: the warning label, the missing facility names (comma-separated, monospace), and a hint pointing to `src/constants.js`. Dismissible per-session. Gives operators visible signal when the maps are stale. Logic: `unclassifiedFacs` useMemo scans `uP ∪ uTlFac` against both maps, flags missing entries. State `unclassifiedDismissed` hides the banner until next page load.
  4. Regions: facility classification remains automatic from name matching (getRegion / getBrand / getHotelType in shared.js), but now with wider Kansai coverage. New brands like Good MONday or post-rebrand Premium MONday still fall back to "hotel MONday" via getBrand — update `src/shared.js` if a new brand launches.
- v2.09: **Defensive dedup at parse time + cleanup script.**
  1. New `dedupYybRows(rows, headers)` helper at module scope. Builds a `Set` keyed by `(施設名, 予約番号, 予約受付日時)` and filters out any row whose key has already been seen. Fail-open: if the dedup key columns are missing, all rows pass through unchanged.
  2. Wired into both YYB data paths — `fetchYYB` (Google Sheet CSV fetch, including cached reads) and `handleFiles` (manual CSV upload). When duplicates are skipped, a `console.info` log fires and the file-list pill shows "— N duplicates skipped" so operators have visibility.
  3. **Root cause discovered** on 2026-04-15: the source YYB Google Sheet had 163 duplicate rows across 2 dates — 82 on 2026-04-03 and 81 on 2026-04-05. Every reservation on those days was double-written (exactly 2× multiplier), inflating revenue/reservation counts by 2× for those days. Almost certainly caused by the n8n Yoyakuban workflow running twice on both dates. v2.09 protects the tool from silently inflating numbers even if the upstream pipeline hiccups again.
  4. **One-time cleanup script** added at `scripts/dedup-yyb.py`. Fetches the public YYB CSV, outputs three files:
     - `yyb_clean.csv` — deduped CSV (import-replace the Google Sheet contents with this)
     - `yyb_duplicates_report.csv` — rows that would be removed, with original sheet-row numbers for auditing
     - `yyb_dedup_summary.txt` — duplication stats by date and by facility
  5. Operator flow: (a) run `python dedup-yyb.py` to generate cleanup files, (b) review the report, (c) import-replace the Google Sheet with the clean CSV, (d) investigate n8n logs for 2026-04-03 and 2026-04-05 to find the root cause.
- v2.08: **Hotel Opening tab (🆕) — pre-open vs post-open cohort analysis.**
  1. New YYB-side tab (sidebar icon 🆕) placed after Facilities. Dedicated to analyzing new-facility launches — pre-opening booking ramp, days-since-opening cohort curves, pre-open vs post-open split, and post-opening performance trends.
  2. **Facility picker** (top of tab, independent of global `fP` multiselect): All `FACILITY_OPENING_DATES` entries shown as toggle pills; 2024+ openings selected by default. Quick-select buttons: "Select all (2024+)" / "Only new (post-Maihama)" / "Clear". Legacy (pre-2024) facilities greyed out since YYB data only covers 2024-05+ and they'd show empty pre-open history. No cap on how many facilities can be selected (per user).
  3. **KPIs (5):** Pre-open bookings (count), Pre-open revenue, Avg pre-open lead time (days), Avg Week-1 occupancy, Avg Month-1 ADR — all aggregated across selected facilities.
  4. **Charts (6):**
     - *Pre-opening ramp* — cumulative booking curve, X=-180d→0, one line per facility. Shows when pre-launch marketing kicked in.
     - *Days-since-opening cohort* — headline chart. X=0→180d post-open, Y=daily revenue. Normalizes across opening dates so multiple new hotels compare on identical ramp axes.
     - *Pre-open vs Post-open split* — horizontal stacked bars per facility. Pre-open=purple, Post-open=green.
     - *Post-open weekly ADR* — W0→W26. Line per facility. Shows rate stabilization/growth.
     - *Post-open weekly channel mix* — stacked bars, aggregated across selected facilities. Top 6 channels by volume + "Other".
     - *Post-open weekly country mix* — stacked bars, aggregated. Top 8 countries + "Other".
  5. **Summary table** — sortable, one row per selected facility. Columns: Opening date, Days open, First booking, Pre-open count/revenue/lead/%, Week-1 occupancy, Month-1 occupancy/ADR, YTD revenue. CSV export. Color-coded: green if pre-open% ≥ 30%, red if Week-1 occupancy < 40%, gold in between.
  6. **Helpers added:** `getDaysBetween(iso1, iso2)`, `FACILITIES_WITH_PREOPEN_DATA` (32 → 10 facilities with 2024+ opening). Constants: `PRE_OPEN_RAMP_DAYS=180`, `COHORT_DAYS=180`.
  7. **`openingRpt` useMemo** — single-pass computation of all 6 chart series + KPIs + summary rows. Applies all global filters EXCEPT the facility multiselect (tab has its own picker) and date range (tab uses days-relative axes). Gated on `tab==="opening"`.
  8. **Facilities tab performance table** gained an "Opening" column showing each facility's opening date (or "—" for unknown). CSV export includes it.
  9. LAYOUT_SCHEMA_VERSION bumped to 8. New grid keys: `op-ramp`, `op-cohort`, `op-split`, `op-adr`, `op-channel`, `op-country`.
- v2.07: **Compact filter bar.** Added `Sc` (compact S) memoized style variant used only inside the global filter bar. Reduces font 12px→10px, button padding 6×14→4×10, border-radius 6→5, label font 10→8, select/input padding 5×8→3×6. All MS multiselects, DateRangePicker, and button groups inside the filter bar now receive `Sc` via the `S` prop. Rest of the app keeps the original `S` sizing untouched. Saves ~25-30% vertical space on the filter bar (down from ~160px to ~120px depending on wrap).
- v2.06: **Global facility-age filter + age view toggle.**
  1. Two new global controls in the filter bar (visible on all YYB + TL tabs):
     - **Facility age** [All | New only | Old only] — restricts data site-wide (Option A). Plugged into every filter chain: `filtered` (YYB), `compareRpt`/`paceRpt`/`cancelRpt` applyFilters, YYB single-day block, `tlFilteredBoth`, `tlCompareRpt`/`tlPaceRpt`/`tlCancelRpt` apply, TL single-day block.
     - **Age view** [Aggregate | New vs Old] — visual split on compatible charts (Option B). When active, rebuilds charts as New/Old stacked bars.
  2. Both toggles are **automatically disabled** when specific facilities are selected in the `fP` multiselect — since a facility selection overrides the age cohort concept. Tooltip hint: "Specific facilities selected — age toggles disabled." Hint under the labels when enabled: "Applied to all facilities; selecting specific facilities overrides."
  3. Colors for New/Old: **green (#34d399) = New**, **slate (#64748b) = Old**. Deliberately distinct from the Compare tab's A=blue/B=gold scheme to avoid confusion.
  4. Age view affects **~15 charts** — YYB (8): Overview Monthly Res/Rev + Daily Res/Rev, Revenue Monthly/Daily Rev + Rev by DOW, Booking DOW. TL (7): TL Overview Monthly Res/Rev + DOW, TL Revenue Monthly/Daily Rev + DOW, TL Booking DOW.
  5. Priority order in compatible YYB charts: **Age view > Per-country view > Aggregate default**. So if both toggles are active, age view wins. On TL charts, age view is the only split available.
  6. The pre-existing Facilities-tab `facViewMode` toggle (v2.04) remains — it's scoped to the Facilities tab's 4 time-series charts only. If both the local Facilities toggle and the global age view are active, the local toggle's setting controls those 4 charts while the global setting controls all others.
  7. New constants: `NEW_COHORT_COLOR`, `OLD_COHORT_COLOR` at module scope; `facAgeSeries` (YYB) and `tlAgeSeries` (TL) useMemos.
- v2.05: **Per-country view toggle in global filter bar.**
  1. Added `countryViewMode` state ("aggregate" | "perCountry") and a toggle control in the global filter bar, immediately after the Country multiselect. Labels: "Aggregate" (default) / "Per country". Disabled (greyed out) when fewer than 2 countries are selected.
  2. When active, compatible charts rebuild as per-country stacked series (one color per selected country, sorted by reservation volume). All countries in the selection are shown (not capped) — per user preference, since typical selections stay small. Uses golden-angle HSL color extension past PALETTE length (same as facilities) to keep series visually distinct.
  3. `perCountrySeries` useMemo computes monthly/daily count+rev and DOW count+rev breakdowns in a single pass over `filtered`. Memo returns `null` when mode is "aggregate" or fewer than 2 countries selected — charts fall through to their original aggregated data shape.
  4. **Charts updated** (YYB-side, 8 charts): Overview — Monthly Res, Monthly Rev, Daily Res, Daily Rev; Revenue — Monthly Rev, Daily Rev, Revenue by DOW; Booking — Check-in/Checkout DOW (replaces the dual checkin/checkout bars with per-country stacks when active).
  5. Charts that are already country-centric (Top Markets, Rev by Country, Country Summary, Rev by Market × Month) are intentionally unchanged — the toggle does nothing on them. KPI cards, pie charts, tables, and segment/facility breakdowns are also unchanged.
  6. Legends auto-display when per-country mode is active; names are run through `tl()` so JP mode shows Japanese country names.
- v2.04: **Facility opening dates + New-vs-Old grouping toggle.**
  1. Added `FACILITY_OPENING_DATES` constant (32 entries) sourced from `250430JHAT Property List.xlsx` 施設一覧 sheet. Keys match canonical names from `ROOM_INVENTORY`. Mapped renamed facilities (e.g., Apart 日本橋水天宮前 → MONday Apart 日本橋人形町; 京橋VPO → GRAND MONday 銀座).
  2. Added `NEW_HOTEL_CUTOFF = "2025-12-05"` (Premium hotel MONday 舞浜ビューⅠ opening) and `isNewFacility(f)` helper. Facilities with missing opening dates default to "Old".
  3. Added **view mode toggle** on the Facilities tab: "All facilities" (default, shows every facility stacked with unique colors) vs "New vs Old" (collapses into 2 colored segments — gold = New, blue = Old). Toggle button row appears above the DraggableGrid with a hint showing the cutoff date.
  4. `facTimeRpt` now computes both `*Count`/`*Rev` (full per-facility) and `*CountNvO`/`*RevNvO` (aggregated into New/Old buckets) in a single pass. Rendered chart switches based on `facViewMode` state.
  5. **`jhat-overview.md` updated** (at project-root level) with a full Facility Opening Dates section (in-operation + pipeline tables) and documentation of the New-vs-Old cutoff rationale.
- v2.03: **Facilities time-series charts include ALL facilities.** Removed the top-10 cap on the Facilities tab daily/monthly charts — now all facilities present in the filtered range are stacked. Added `facColor(i)` helper that uses `PALETTE` for the first 15 facilities then golden-angle HSL (`hue = i * 137.508 mod 360`) for the rest, giving every facility a visually distinct color even with 30+ in the stack. Stack order is by total reservations descending so the highest-volume facility is at the bottom of the bar.
- v2.02: **Facilities daily charts → stacked bars.** Daily Reservations by Facility and Daily Revenue by Facility switched from overlaid line charts to stacked bar charts to match the monthly versions and improve visibility (10 overlapping lines were hard to read; stacked bars show per-facility contribution clearly).
- v2.01: **Compare daily charts → line, Facilities tab time-series.**
  1. Compare tab's "Daily Revenue (A vs B)" and "Daily Reservations (A vs B)" switched from grouped bars to overlaid line charts (better for sparse multi-day data). Monthly comparison charts kept as bars.
  2. **Facilities tab gains 4 new charts** (top 10 facilities by reservation count in current filtered range):
     - Daily Reservations by Facility — overlaid line chart
     - Daily Revenue by Facility — overlaid line chart
     - Monthly Reservations by Facility — stacked bar chart
     - Monthly Revenue by Facility — stacked bar chart
  3. New `facTimeRpt` useMemo gated on `tab==="facilities"` builds all 4 series in a single pass over `filtered`. Respects the global date range filter (uses `filtered`, not `allData`). Each series stores facility names as data keys; `shortFac()` is applied to the legend label only so the full facility name remains the canonical lookup key.
  4. LAYOUT_SCHEMA_VERSION bumped to 7 (new grid keys: `fac-daily-count`, `fac-daily-rev`, `fac-monthly-count`, `fac-monthly-rev`).
- v2.00: **Compare tab gains daily + monthly time-series charts.** Four new charts added below the existing comparison tables:
  1. **Daily Revenue (A vs B)** — grouped bars, Period A in blue + Period B in gold per day index
  2. **Daily Reservations (A vs B)** — same layout, count instead of revenue
  3. **Monthly Revenue (A vs B)** — bars per month index
  4. **Monthly Reservations (A vs B)** — bars per month index, count
  - Periods are aligned by day-index ("D1, D2, ...") and month-index ("M1, M2, ...") so unequal-length ranges still overlay cleanly. Days/months with no bookings are filled with zeros so the X-axis represents calendar progression, not booking density.
  - Custom tooltip (`CmpTip`) shows both calendar dates ("A: Apr 5 / B: Mar 5") so users can verify which actual dates are being compared at each index.
  - LAYOUT_SCHEMA_VERSION bumped to 6 (new grid keys: `cmp-daily-rev`, `cmp-daily-count`, `cmp-monthly-rev`, `cmp-monthly-count`).
- v1.99: **Date picker made significantly smaller.** Outer max-height reduced to `min(360px, calc(100vh - 40px))` (was 420px+). Month cells tightened to 10px font with 3px vertical padding. Preset sidebar trimmed to 110px min-width with 10px font. Inputs compacted (dropped the "Start"/"End" labels — inputs are self-explanatory with the button label above). Month list min-height reduced to 140px so it fits on shorter viewports.
- v1.98: **Date picker viewport-aware sizing.** Picker now caps its total height at `calc(100vh - 120px)` so Apply/Cancel buttons are always visible. The month list scroller is flex-grow inside the picker frame — takes available space but shrinks when the viewport is short. Preset sidebar, input row, and footer all have `flexShrink: 0` to stay fixed; only the month list scroller flexes. Prevents the bottom of the picker from being cut off on smaller screens.
- v1.97: **Date picker redesigned as vertical scrollable month list.** Matches Google Ads/GA4 pattern more faithfully: 72 months (current year ±3) rendered in a vertically scrollable container. Native browser scroll handles wheel events; `overscroll-behavior: contain` + `overflow-y: auto` on the scroller prevents page-scroll chaining. When the picker opens or a preset is clicked, the target month auto-scrolls into view. ◀/▶ buttons shift the scroll position by ±1 month (calculated from the currently top-most visible month via offset refs). Removed the dual-month side-by-side layout and the custom `onWheel` handler.
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
