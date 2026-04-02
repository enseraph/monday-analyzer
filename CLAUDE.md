# MONday Reservation Analyzer

## Project
React dashboard (single JSX file) for JHAT/MONday Group hotel reservation data.
- **Repo**: https://github.com/enseraph/monday-analyzer
- **Live**: https://enseraph.github.io/monday-analyzer/
- **Main file**: `src/App.jsx` (~1100 lines)
- **Stack**: Vite + React + Recharts + react-grid-layout
- **Data source**: Google Sheets CSV (auto-fetched on load), manual CSV upload as fallback

## Google Sheet
- Published CSV URL: `https://docs.google.com/spreadsheets/d/e/2PACX-1vQ_G18beGfHLBfeWlS9biwDrt73kQhC0i8RLvIPkybgCejNffzMnsBp7AfmrrS8suD69dQxCyTWEOzh/pub?gid=0&single=true&output=csv`
- Data is CP932/Shift-JIS encoded YYB reservation export from TL-Lincoln
- Populated by n8n workflow (yoyakuban)

## Key Architecture
- i18n: EN/JA bilingual, `T.en`/`T.ja` objects, `tl()` translator
- Theme: dark/light mode via `TH` palette object, persisted to localStorage
- Grid: 12-column react-grid-layout (Looker Studio style), layouts in localStorage per tab
- `DraggableGrid` component (extracted top-level, NOT inline) wraps chart grids
- KvK tab excluded from grid layout (uses section-based `<div style={G}>`)
- `processRow()` parses each CSV row; key fields include: facility, country, checkin, bookingDate, totalRev, nights, planName, planType, couponName, salesChannel, checkinMonth, isCancelled, cancelFee
- `agg` useMemo computes all aggregations from `filtered` data
- `kvk` useMemo computes Kanto vs Kansai breakdowns
- `dailyRpt` useMemo computes daily report data (booking date based, includes ALL data including cancellations)
- `GEO_REGION()` maps countries to geographic areas
- `shortFac()` truncates facility names for chart labels
- `CC` component has two render paths: grid mode (compact, flex) and non-grid mode (fixed height)

## Tabs
1. **Daily Report** — date range picker (booking date), KPIs, country/region tables, YoY charts, ADR chart, 直販比率, 施設別/プラン別/クーポン/キャンセル (single-date sections with own picker)
2. **Overview** — monthly bars, segment pie, top markets, DOW, daily charts
3. **Kanto vs Kansai** — 7 sections with regional comparisons (NOT grid-managed)
4. **Country Overview** — market charts, LOS/lead by country, segment mix
5. **Segments** — breakdown + moved charts from KvK (seg by month, country%, lead, ADR)
6. **Booking Patterns** — DOW, monthly trend, device
7. **Revenue** — by market, monthly, market×month stacked, daily
8. **Room Types** — distribution + table
9. **Facilities** — per-facility charts + Kanto/Kansai + Hotel/Apart comparisons + table
10. **Raw Data** — paginated sortable table

## Daily Report Sections
- **Date range** (drFrom/drTo): country table, region table, YoY charts (revenue + count), ADR bar chart, 直販比率 stacked bar
- **Single date** (drSingle): 施設別 (Hotel/Apart/Direct tables by check-in month), プラン別 (Total/Hotel/Apart by plan type), キャンセル (facility + country with check-in month breakdown)
- **Date range**: クーポンデータ (summary + detail)
- Plan types: 返金不可 (non-refundable), 学生 (student), その他 (other)
- All sections include cancellation data (no isCancelled filter)

## CSV Columns Available
施設名(0), 状態(1), 予約番号(2), 予約受付日時(3), 宿泊日チェックイン(4), チェックアウト日(5), キャンセル料(11), 泊数(12), 宿泊プラン(13), プラン区分(14), 予約方法(17), 部屋タイプ(18), 大人1人数(22), 大人2人数(24), 子供1-9人数, 宿泊料金合計(43), 割引(53), クーポン名(56), クーポン割引(57), 予約料金合計(62), 都道府県(70), 国番号(73), 言語(91), 販売チャネル(94), ランク名(95)

## Deploy
- GitHub Pages via Actions workflow (`.github/workflows/deploy.yml`)
- Push to `master` → auto-build → auto-deploy
- `gh` CLI at `~/bin/gh`
- Git config: user=en.seraph, email=en.seraph@users.noreply.github.com

## Version
Current: 1.17 (increment by 0.01)
APP_VERSION constant at top of App.jsx, also clears localStorage layouts on change.

## Important Patterns
- Date comparisons use LOCAL dates (getFullYear/getMonth/getDate), NOT toISOString() which converts to UTC and shifts JST dates
- react-grid-layout children must NEVER be conditionally rendered — always render `<div key="...">` wrapper, put conditional inside
- Version bump auto-clears stale localStorage layouts
- Pie charts use `outerRadius="65%"` with custom label renderer to avoid clipping
- Export buttons go in title bar (top-right), not bottom of card
