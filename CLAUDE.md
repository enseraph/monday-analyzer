# MONday Reservation Analyzer

## Project
React dashboard (single JSX file) for JHAT/MONday Group hotel reservation data.
- **Repo**: https://github.com/enseraph/monday-analyzer
- **Live**: https://enseraph.github.io/monday-analyzer/
- **Main file**: `src/App.jsx` (~800 lines)
- **Stack**: Vite + React + Recharts + react-grid-layout
- **Data source**: Google Sheets CSV (auto-fetched on load), manual CSV upload as fallback

## Google Sheet
- Published CSV URL: `https://docs.google.com/spreadsheets/d/e/2PACX-1vQ_G18beGfHLBfeWlS9biwDrt73kQhC0i8RLvIPkybgCejNffzMnsBp7AfmrrS8suD69dQxCyTWEOzh/pub?gid=0&single=true&output=csv`
- Data is CP932/Shift-JIS encoded YYB reservation export from TL-Lincoln

## Key Architecture
- i18n: EN/JA bilingual, `T.en`/`T.ja` objects, `tl()` translator
- Theme: dark/light mode via `TH` palette object, persisted to localStorage
- Grid: 12-column react-grid-layout (Looker Studio style), layouts in localStorage
- Tabs: Daily Report, Overview, KvK, Country Overview, Segments, Booking, Revenue, Rooms, Facilities, Raw Data
- `processRow()` parses each CSV row into a reservation object
- `agg` useMemo computes all aggregations from `filtered` data
- `kvk` useMemo computes Kanto vs Kansai breakdowns
- `dailyRpt` useMemo computes daily report data (booking date based, includes cancellations)
- `GEO_REGION()` maps countries to geographic areas (Japan, Asia, North America, Europe, etc.)
- `shortFac()` truncates facility names for chart labels

## CSV Columns Available
施設名(0), 状態(1), 予約番号(2), 予約受付日時(3), 宿泊日チェックイン(4), チェックアウト日(5), キャンセル料(11), 泊数(12), 宿泊プラン(13), 予約方法(17), 部屋タイプ(18), 大人1人数(22), 大人2人数(24), 子供1-9人数, 宿泊料金合計(43), 割引(53), クーポン名(56), クーポン割引(57), 予約料金合計(62), 都道府県(70), 国番号(73), 言語(91), 販売チャネル(94), ランク名(95)

## Deploy
- GitHub Pages via Actions workflow (`.github/workflows/deploy.yml`)
- Push to `master` → auto-build → auto-deploy
- `gh` CLI at `~/bin/gh`
- Git config: user=en.seraph, email=en.seraph@users.noreply.github.com

## Version
Current: 1.15 (increment by 0.01)
APP_VERSION constant at top of App.jsx, also clears localStorage layouts on change.
