#!/usr/bin/env python
"""
YYB CSV Dedup Tool — one-time cleanup for the Yoyakuban Google Sheet.

Fetches the current YYB published CSV, identifies duplicate rows by
  (施設名, 予約番号, 予約受付日時), and outputs:
  - yyb_clean.csv                 — deduped version (import this back to replace the sheet)
  - yyb_duplicates_report.csv     — rows that were removed, with original row number
  - yyb_dedup_summary.txt         — by-date breakdown of duplicates (helps root-cause)

Usage:
  python dedup-yyb.py

Background (2026-04-15 investigation):
  Found that 2026-04-03 in the source sheet had 164 rows for 82 unique
  reservations — every reservation duplicated exactly 2×. Whole-sheet scan
  showed 163 duplicates out of 55,131 rows, concentrated on specific dates.
  Root cause is upstream (n8n workflow double-writing). This script cleans
  current state without touching the pipeline.
"""

import urllib.request
import csv
import io
import sys
from collections import Counter, defaultdict
from pathlib import Path

URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ_G18beGfHLBfeWlS9biwDrt73kQhC0i8RLvIPkybgCejNffzMnsBp7AfmrrS8suD69dQxCyTWEOzh/pub?gid=0&single=true&output=csv"

def main():
    out_dir = Path(__file__).parent
    print(f"Fetching YYB CSV from: {URL[:80]}...")
    req = urllib.request.Request(URL, headers={"User-Agent":"Mozilla/5.0"})
    data = urllib.request.urlopen(req).read()
    print(f"  Downloaded: {len(data):,} bytes")

    # Try UTF-8 first; fall back to Shift-JIS if header isn't found
    try:
        text = data.decode("utf-8")
        if "施設名" not in text: raise ValueError
        encoding = "utf-8"
    except:
        text = data.decode("shift-jis", errors="replace")
        encoding = "shift-jis"
    print(f"  Encoding: {encoding}")

    rows = list(csv.reader(io.StringIO(text)))
    header = rows[0]
    print(f"  Total rows (incl header): {len(rows):,}")
    print(f"  Columns: {len(header)}")

    try:
        idx_facility = header.index("施設名")
        idx_reservation = header.index("予約番号")
        idx_booking = header.index("予約受付日時")
    except ValueError as e:
        print(f"ERROR: missing required column: {e}")
        sys.exit(1)

    seen = {}
    deduped_rows = [header]
    duplicate_rows = [header + ["_duplicate_of_source_row"]]
    dup_count = 0
    dup_by_date = defaultdict(int)
    dup_by_facility = Counter()

    for source_row_no, row in enumerate(rows[1:], start=2):  # source_row_no matches sheet row (header=1)
        if len(row) <= max(idx_facility, idx_reservation, idx_booking):
            deduped_rows.append(row)
            continue
        key = (row[idx_facility], row[idx_reservation], row[idx_booking])
        if key in seen:
            duplicate_rows.append(row + [str(seen[key])])
            dup_count += 1
            date_part = row[idx_booking][:10] if row[idx_booking] else "unknown"
            dup_by_date[date_part] += 1
            dup_by_facility[row[idx_facility]] += 1
        else:
            seen[key] = source_row_no
            deduped_rows.append(row)

    # Output files
    clean_path = out_dir / "yyb_clean.csv"
    dup_path = out_dir / "yyb_duplicates_report.csv"
    summary_path = out_dir / "yyb_dedup_summary.txt"

    with open(clean_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(deduped_rows)
    with open(dup_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(duplicate_rows)

    lines = []
    lines.append("YYB Sheet Dedup Summary")
    lines.append("=" * 60)
    lines.append(f"Source rows (excl header): {len(rows)-1:,}")
    lines.append(f"Unique rows: {len(deduped_rows)-1:,}")
    lines.append(f"Duplicates removed: {dup_count:,}")
    lines.append(f"Duplication rate: {(dup_count / max(1, len(rows)-1)) * 100:.2f}%")
    lines.append("")
    lines.append("Duplicates by booking date (top 20):")
    lines.append("-" * 60)
    for date, n in sorted(dup_by_date.items(), key=lambda x: -x[1])[:20]:
        lines.append(f"  {date}: {n:,} duplicate rows")
    lines.append("")
    lines.append("Duplicates by facility (top 20):")
    lines.append("-" * 60)
    for fac, n in dup_by_facility.most_common(20):
        lines.append(f"  {n:4,} | {fac}")
    lines.append("")
    lines.append("Next steps:")
    lines.append("  1. Review yyb_duplicates_report.csv to verify the dedup is correct")
    lines.append("  2. Replace the Google Sheet contents with yyb_clean.csv")
    lines.append("     (Sheet → File → Import → Replace spreadsheet)")
    lines.append("  3. Investigate n8n workflow for root cause of duplication")
    lines.append("     (focus on the dates with highest duplicate counts)")

    with open(summary_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print()
    print("\n".join(lines))
    print()
    print(f"Files written:")
    print(f"  {clean_path}")
    print(f"  {dup_path}")
    print(f"  {summary_path}")

if __name__ == "__main__":
    main()
