// ─── Maintenance constants for monday-analyzer ───
// Edit this file when new facilities launch or existing ones are renamed/deprecated.
//
// Keys in ROOM_INVENTORY and FACILITY_OPENING_DATES MUST exactly match the
// facility name string as it appears in the source CSV (施設名 column after
// the normalization in processRow, which trims "（旧：...）" suffixes and
// consolidates 舞浜ビュー variants to 舞浜ビューⅠ).
//
// See jhat-overview.md for the full facility list and opening-date context.

// ─── Facility name aliases (applied in processRow after normalization) ───
// Merges physically-identical facilities that appear under multiple names in the data
// (e.g., rebrands where both old and new names appear in the same CSV).
// Key = variant name seen in data; Value = canonical name (what the rest of the tool uses).
export const FACILITY_ALIASES={
  // GRAND MONday 浅草 rebranded from MONday Apart Premium 浅草 (both names appear in YYB data)
  "MONday Apart Premium 浅草":"GRAND MONday 浅草",
  // Premium MONday 浅草 Ⅰ (opens 2026-06-01) was previously named "ONE" in brand-strategy deck;
  // canonical in data is the Roman numeral Ⅰ. Alias handles either variant.
  "Premium MONday 浅草 ONE":"Premium MONday 浅草 Ⅰ",
  "MONday Premium 浅草 ONE":"Premium MONday 浅草 Ⅰ",
  "MONday Premium 浅草 Ⅰ":"Premium MONday 浅草 Ⅰ",
};

// ─── Room inventory per facility (used for RevPAR / occupancy calcs) ───
// Add new facilities here when they launch. Keys must match post-alias facility names.
export const ROOM_INVENTORY={
  "hotel MONday Premium 豊洲":263,"hotel MONday 東京西葛西":129,"hotel MONday Premium 上野御徒町":124,
  "hotel MONday 浅草":115,"イチホテル上野新御徒町":108,"イチホテル浅草橋":103,"hotel MONday 羽田空港":102,
  "イチホテル東京八丁堀":102,"hotel MONday 京都丸太町":100,"hotel MONday 秋葉原浅草橋":94,
  "hotel MONday 京都烏丸二条":92,"Premium hotel MONday 舞浜ビューⅠ":57,
  "MONday Apart Premium 上野":71,"MONday Apart Premium 日本橋":56,"MONday Apart Premium 上野御徒町":50,
  "GRAND MONday 銀座":45,"Premium Apart MONday 銀座EAST":43,"MONday Apart Premium 京都駅":41,
  "MONday Apart Premium 銀座新富町":40,"MONday Apart 上野新御徒町":36,"Premium Apart MONday 京都五条":36,
  "MONday Apart Premium 大阪難波WEST":28,"MONday Apart Premium 秋葉原浅草橋ステーション":27,
  "MONday Apart Premium 秋葉原":27,"MONday Apart 浅草橋秋葉原":27,"MONday Apart 日本橋人形町":26,
  "GRAND MONday 浅草":25,"MONday Apart 浜松町大門":22,"MONday Apart Premium 京都駅鴨川":22,
  "Premium Apart MONday 浜松町ステーション":9,"MONday Apart Premium 浜松町":27,"TABI上野":35,
  "GRAND MONday 上野御徒町":50,
  "Premium MONday 浅草 Ⅰ":26,
  "GRAND MONday Resort 東京ベイ舞浜":140,
};
export const TOTAL_ROOMS=Object.values(ROOM_INVENTORY).reduce((a,b)=>a+b,0);

// ─── Facility opening dates (ISO "YYYY-MM-DD") — from 250430JHAT Property List.xlsx ───
// Add new facilities here when they launch. Keys must match ROOM_INVENTORY keys exactly.
export const FACILITY_OPENING_DATES={
  "hotel MONday Premium 豊洲":"2018-10-27",
  "hotel MONday 東京西葛西":"2019-02-05",
  "hotel MONday 羽田空港":"2020-04-01",
  "イチホテル上野新御徒町":"2020-04-01",
  "イチホテル浅草橋":"2020-04-01",
  "hotel MONday 浅草":"2020-07-04",
  "イチホテル東京八丁堀":"2020-07-18",
  "hotel MONday 秋葉原浅草橋":"2020-07-20",
  "hotel MONday Premium 上野御徒町":"2020-07-21",
  "hotel MONday 京都烏丸二条":"2020-07-23",
  "hotel MONday 京都丸太町":"2021-10-17",
  "MONday Apart 上野新御徒町":"2020-08-04",
  "MONday Apart 浜松町大門":"2020-08-05",
  "MONday Apart Premium 浜松町":"2020-08-19",
  "MONday Apart 日本橋人形町":"2020-09-01",
  "MONday Apart Premium 秋葉原":"2020-11-14",
  "MONday Apart Premium 秋葉原浅草橋ステーション":"2020-11-13",
  "MONday Apart Premium 日本橋":"2021-04-16",
  "MONday Apart Premium 銀座新富町":"2021-04-23",
  "MONday Apart Premium 上野":"2021-08-05",
  "MONday Apart Premium 上野御徒町":"2021-10-12",
  "MONday Apart 浅草橋秋葉原":"2021-12-10",
  "MONday Apart Premium 京都駅":"2021-12-18",
  "GRAND MONday 浅草":"2024-06-28",
  "MONday Apart Premium 京都駅鴨川":"2024-11-28",
  "MONday Apart Premium 大阪難波WEST":"2024-12-20",
  "Premium Apart MONday 銀座EAST":"2025-04-25",
  "GRAND MONday 銀座":"2025-04-28",
  "Premium Apart MONday 京都五条":"2025-05-20",
  "Premium hotel MONday 舞浜ビューⅠ":"2025-12-05",
  "TABI上野":"2026-04-10",
  "GRAND MONday 上野御徒町":"2026-05-01",
  "Premium Apart MONday 浜松町ステーション":"2026-03-27",
  "Premium MONday 浅草 Ⅰ":"2026-06-01",
  "GRAND MONday Resort 東京ベイ舞浜":"2026-07-18",
};

// ─── Cohort cutoff — Maihama View I opening date ───
// Facilities opened on/after this date are "New" in the age filter/view.
export const NEW_HOTEL_CUTOFF="2025-12-05";
export const isNewFacility=f=>{const d=FACILITY_OPENING_DATES[f];return d?d>=NEW_HOTEL_CUTOFF:false};
// Facilities with meaningful YYB pre-open data (YYB coverage starts 2024-05)
export const FACILITIES_WITH_PREOPEN_DATA=Object.keys(FACILITY_OPENING_DATES).filter(f=>FACILITY_OPENING_DATES[f]>="2024-01-01").sort((a,b)=>FACILITY_OPENING_DATES[b].localeCompare(FACILITY_OPENING_DATES[a]));

// ─── Hotel Opening tab settings ───
export const PRE_OPEN_RAMP_DAYS=100; // days of pre-opening booking ramp to show
export const COHORT_DAYS=180;        // days of post-opening cohort curve to show
