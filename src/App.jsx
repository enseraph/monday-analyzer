import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as Papa from "papaparse";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ComposedChart } from "recharts";
import { Responsive, useContainerWidth } from "react-grid-layout";
import { toPng } from "html-to-image";

const APP_VERSION="1.75";
// Data lag: source CSV trails real-time by N days (n8n workflow updates daily, so latest available date = today - 1)
const DATA_LAG_DAYS=1;
// Source color accents — used by sectioned tab strip, source banner, TL chart palette
const SOURCE_COLORS={yyb:"#c9a84c",tl:"#5eead4"};
// Channel bucket colors for TL tab
const CHANNEL_COLORS={direct:"#34d399",rta:"#5eead4",ota:"#4ea8de"};

// ─── Grid Layout Helpers ───
function loadLayouts(tabId){try{const v=localStorage.getItem("rgl_ver");if(v!==APP_VERSION){Object.keys(localStorage).filter(k=>k.startsWith("rgl_")).forEach(k=>localStorage.removeItem(k));localStorage.setItem("rgl_ver",APP_VERSION);return null}return JSON.parse(localStorage.getItem(`rgl_${tabId}`))||null}catch{return null}}
function saveLayouts(tabId,layouts){localStorage.setItem(`rgl_${tabId}`,JSON.stringify(layouts))}
function clearLayout(tabId){localStorage.removeItem(`rgl_${tabId}`)}
// 12-column grid (like Looker Studio) — items sized in 1/12 increments for free-form layout
function mkL(items){return{lg:items.map(([i,x,y,w,h])=>({i,x,y,w:w||6,h:h||3,minW:2,minH:2})),sm:items.map(([i,_x,_y,_w,h])=>({i,x:0,y:0,w:12,h:h||3,minW:4,minH:2}))}}
const DL={
  compare:mkL([["cmp-country",0,0,6,5],["cmp-rev",6,0,6,4],["cmp-segment",0,5,6,4],["cmp-count",6,4,6,4],["cmp-facility",0,9,12,4]]),
  overview:mkL([["ch-mo",0,0,6,3],["ch-sp",6,0,6,3],["ch-mk",0,3,6,3],["ch-dw",6,3,6,3],["ch-mo-rev",0,6,12,3],["ch-res-day",0,9,6,3],["ch-rev-day",6,9,6,3]]),
  markets:mkL([["ch-mf",0,0,6,4],["ch-mr",6,0,6,4],["ch-ml",0,4,6,4],["ch-mld",6,4,6,4],["ch-msc",0,8,12,4],["ch-rkc",0,12,6,4]]),
  segments:mkL([["ch-sb",0,0,6,3],["ch-sr",6,0,6,3],["ch-sl",0,3,6,3],["ch-slt",6,3,6,3],["sg-seg-mo",0,6,6,3],["sg-seg-co",6,6,6,4],["sg-ld-sg",0,9,6,3],["sg-ld-mo",6,10,6,3],["sg-adr",0,12,6,3]]),
  booking:mkL([["ch-bd",0,0,6,3],["ch-mdow",6,0,6,3],["ch-mdow2",0,3,6,3],["ch-bt",6,3,6,3],["ch-bv",0,6,6,3]]),
  member:mkL([["mb-overview",0,0,6,3],["mb-jpintl",6,0,6,3],["mb-cntry-stack",0,3,12,5],["mb-cntry-counts",0,8,12,5],["mb-rank",0,13,6,4],["mb-seg",6,13,6,3],["mb-fac",0,17,6,7],["mb-fac-tbl",6,17,6,7],["mb-tight-chart",0,24,6,5],["mb-tight-tbl",6,24,6,5],["mb-fs-chart",0,29,6,5],["mb-fs-tbl",6,29,6,5],["mb-detail",0,34,12,14]]),
  los:mkL([["los-hist",0,0,6,4],["los-seg",6,0,6,4],["los-country",0,4,6,5],["los-detail",6,4,6,4]]),
  revenue:mkL([["ch-rm",0,0,6,4],["ch-rv",6,0,6,3],["ch-rmm",0,4,6,3],["ch-drev",6,3,6,3],["ch-rdow",0,7,6,3],["ch-rdowm",6,7,6,3]]),
  rooms:mkL([["ch-rt",0,0,12,4]]),
  facilities:mkL([["fac-res",0,0,6,7],["fac-rev",6,0,6,7],["fac-intl",0,7,6,7],["fac-los",6,7,6,7],["fac-kvk",0,14,6,3],["fac-hva",6,14,6,3]]),
  pace:mkL([["pace-chart",0,0,12,5],["pace-summary",0,5,6,4]]),
  cancellations:mkL([["canc-trend",0,0,12,4],["canc-country",0,4,6,4],["canc-seg",6,4,6,3],["canc-fac",0,8,6,9],["canc-detail",6,7,6,7]]),
  revpar:mkL([["rp-trend",0,0,12,4],["rp-daily",0,4,12,4],["rp-fac",0,8,6,7],["rp-detail",6,8,6,7]]),
  kvk:mkL([["kk-mk-kt",0,0,6,4],["kk-mk-ks",6,0,6,4],["kk-mk-mo",0,4,12,4],["kk-sg-rg",0,8,6,3],["kk-los-co",0,11,6,4],["kk-los-sr",6,11,6,3],["kk-dw-ci",0,15,6,4],["kk-dw-co",6,15,6,4],["kk-dev",0,19,6,3],["kk-rev-sr",0,22,6,3],["kk-rev-co",6,22,6,4],["kk-rm-sg",0,26,6,4],["kk-rm-rg",6,26,6,4],["kk-rk-rg",0,30,6,3]]),
  "tl-channel":mkL([["tl-mix",0,0,12,4],["tl-direct-trend",0,4,12,4],["tl-fac-stack",0,8,12,7],["tl-fac-direct",0,15,6,5],["tl-canc-channel",6,15,6,4],["tl-channel-name",0,19,12,6],["tl-dow",0,25,12,4],["tl-matrix",0,29,12,8]]),
  "tl-revenue":mkL([["tlr-mo",0,0,12,4],["tlr-daily",0,4,12,4],["tlr-fac",0,8,12,7],["tlr-seg",0,15,6,4],["tlr-dow",6,15,6,4]]),
  "tl-segments":mkL([["tls-dist",0,0,6,4],["tls-rev",6,0,6,4],["tls-los",0,4,6,4],["tls-lead",6,4,6,4],["tls-fac",0,8,12,7]]),
  "tl-daily":mkL([]),
  "tl-member":mkL([["tlm-overview",0,0,6,3],["tlm-rank",6,0,6,4],["tlm-seg",0,3,6,3],["tlm-fac",6,4,6,6],["tlm-detail",0,6,6,10]]),
  "tl-overview":mkL([["tlo-mo",0,0,6,3],["tlo-mkt",6,0,6,3],["tlo-seg",0,3,6,3],["tlo-dow",6,3,6,3],["tlo-mo-rev",0,6,12,3]]),
  "tl-los":mkL([["tll-hist",0,0,6,4],["tll-seg",6,0,6,4],["tll-country",0,4,12,4]]),
  "tl-booking":mkL([["tlb-lead",0,0,6,3],["tlb-dow",6,0,6,3],["tlb-mdow",0,3,12,3]]),
  "tl-compare":mkL([["tlc-country",0,0,6,5],["tlc-rev",6,0,6,4],["tlc-seg",0,5,6,4],["tlc-count",6,4,6,4],["tlc-facility",0,9,12,4]]),
  "tl-pace":mkL([["tlp-chart",0,0,12,5],["tlp-summary",0,5,6,4]]),
  adr:mkL([["adr-fac",0,0,12,7],["adr-country",0,7,12,5],["adr-seg",0,12,6,4],["adr-region",6,12,6,4],["adr-mo",0,16,12,4]]),
  "tl-adr":mkL([["tla-fac",0,0,12,7],["tla-country",0,7,12,5],["tla-seg",0,12,6,4],["tla-channel",6,12,6,4],["tla-bucket",0,16,6,4],["tla-mo",6,16,6,4]]),
  "tl-facilities":mkL([["tlf-res",0,0,6,7],["tlf-rev",6,0,6,7],["tlf-direct",0,7,6,7],["tlf-los",6,7,6,7]]),
  "tl-kvk":mkL([["tlkv-mk-kt",0,0,6,4],["tlkv-mk-ks",6,0,6,4],["tlkv-mk-mo",0,4,12,4],["tlkv-sg-rg",0,8,6,3],["tlkv-los-co",0,11,6,4],["tlkv-los-sr",6,11,6,3],["tlkv-dw-ci",0,15,6,4],["tlkv-dw-co",6,15,6,4],["tlkv-rev-sr",0,19,6,3],["tlkv-rev-co",6,19,6,4]]),
  "tl-markets":mkL([["tlmk-country",0,0,12,5],["tlmk-rev",0,5,6,4],["tlmk-los",6,5,6,4],["tlmk-lead",0,9,12,4]]),
  "tl-cancellations":mkL([["tlcn-trend",0,0,12,4],["tlcn-country",0,4,6,4],["tlcn-seg",6,4,6,3],["tlcn-fac",0,8,6,9],["tlcn-detail",6,7,6,7]]),
};
const RGL_PROPS={breakpoints:{lg:900,sm:0},cols:{lg:12,sm:1},rowHeight:80,draggableHandle:".rgl-drag",margin:[10,10],containerPadding:[0,0],resizeHandles:["se","s","e"],compactType:"vertical",preventCollision:false};

function DraggableGrid({tabId,children,layoutVer,onReset,resetLabel,btnStyle,locked,onLockToggle,lockLabel}){
  const saved=loadLayouts(tabId);const layouts=saved||DL[tabId];const{containerRef,width}=useContainerWidth();
  const validChildren=Array.isArray(children)?children.flat().filter(c=>c&&c.key):children?[children]:[];
  const validKeys=new Set(validChildren.map(c=>c.key));
  const safeLayouts={};
  Object.entries(layouts).forEach(([bp,items])=>{safeLayouts[bp]=items.filter(item=>validKeys.has(item.i)).map(it=>locked?{...it,static:true,isDraggable:false,isResizable:false}:it)});
  const rglProps={...RGL_PROPS,isDraggable:!locked,isResizable:!locked,draggableHandle:locked?".__never__":".rgl-drag"};
  return(<div ref={containerRef} className={locked?"rgl-locked":""}><div style={{display:"flex",justifyContent:"flex-end",marginBottom:6,gap:6}}>{onLockToggle&&<button style={{...btnStyle,...(locked?{background:"rgba(52,211,153,0.15)",borderColor:"#34d399",color:"#34d399"}:{})}} onClick={onLockToggle}>{locked?"🔒 ":"🔓 "}{lockLabel}</button>}<button style={btnStyle} onClick={onReset}>{resetLabel}</button></div>{width>0&&validChildren.length>0&&<Responsive key={tabId+layoutVer+(locked?"-locked":"-unlocked")} width={width} {...rglProps} layouts={safeLayouts} onLayoutChange={(_,all)=>{if(!locked)saveLayouts(tabId,all)}}>{validChildren}</Responsive>}</div>);
}

// ─── Google Sheets Backend ───
const GSHEET_CSV_URL="https://docs.google.com/spreadsheets/d/e/2PACX-1vQ_G18beGfHLBfeWlS9biwDrt73kQhC0i8RLvIPkybgCejNffzMnsBp7AfmrrS8suD69dQxCyTWEOzh/pub?gid=0&single=true&output=csv";
// TL-Lincoln B-series per-reservation data (reception-date, ex-tax). Yearly tabs to stay under 10M cell limit.
// Add new years here as they're published.
const TL_GSHEET_CSV_URLS={
  "2025":"https://docs.google.com/spreadsheets/d/e/2PACX-1vTEfqhvFw_FGaGR0aRSZql3kNkefKXJbEX1MqPXuGH1eFZ_fFh0VAPti6dfE0VD2A4E-VX8XW5CrmH8/pub?gid=1182760421&single=true&output=csv",
  "2026":"https://docs.google.com/spreadsheets/d/e/2PACX-1vTEfqhvFw_FGaGR0aRSZql3kNkefKXJbEX1MqPXuGH1eFZ_fFh0VAPti6dfE0VD2A4E-VX8XW5CrmH8/pub?gid=207573208&single=true&output=csv",
};
// Parse a TL B-series per-reservation row → object with both native fields and YYB-compatible derived aliases
function parseTLRow(row,hIdx){
  const d=row[hIdx.date];if(!d)return null;
  const dt=new Date(d+"T00:00:00");if(isNaN(dt))return null;
  const facility=row[hIdx.facility]||"";
  const status=row[hIdx.status]||"";
  const checkinStr=row[hIdx.checkin]||"";
  const checkoutStr=row[hIdx.checkout]||"";
  let checkin=checkinStr?new Date(checkinStr+"T00:00:00"):null;
  let checkout=checkoutStr?new Date(checkoutStr+"T00:00:00"):null;
  if(checkin&&isNaN(checkin))checkin=null;
  if(checkout&&isNaN(checkout))checkout=null;
  const adults_male=parseInt(row[hIdx.adults_male])||0;
  const adults_female=parseInt(row[hIdx.adults_female])||0;
  const children=parseInt(row[hIdx.children])||0;
  const nights=parseInt(row[hIdx.nights])||0;
  const revenue=parseInt(row[hIdx.revenue])||0;
  const revenue_other=parseInt(row[hIdx.revenue_other])||0;
  const totalRev=revenue+revenue_other;
  const adults=adults_male+adults_female;
  // Lead time: receive date → checkin
  let leadTime=null;
  if(checkin){const c2=new Date(checkin);c2.setHours(0,0,0,0);const b=new Date(dt);b.setHours(0,0,0,0);leadTime=Math.max(0,Math.round((c2-b)/864e5))}
  return{
    // Native TL fields
    date:dt,dateStr:d,
    facility,
    facilityGroup:row[hIdx.facility_group]||"",
    status,
    channel_code:row[hIdx.channel_code]||"",
    channel_name:row[hIdx.channel_name]||"",
    channelBucket:(row[hIdx.channel_bucket]||"").toLowerCase(),
    booking_id:row[hIdx.booking_id]||"",
    notification_id:row[hIdx.notification_id]||"",
    guestName:row[hIdx.guest_name]||"",
    guestNameKana:row[hIdx.guest_name_kana]||"",
    email:(row[hIdx.email]||"").trim().toLowerCase(),
    checkin,checkout,
    checkinStr,checkoutStr,
    nights,
    rooms:parseInt(row[hIdx.rooms])||0,
    guests:parseInt(row[hIdx.guests])||0,
    adults_male,adults_female,children,
    planName:row[hIdx.plan_name]||"",
    planCode:row[hIdx.plan_code]||"",
    revenue,revenue_other,
    // YYB-compatible derived aliases (so YYB tab logic can be reused on TL rows)
    region:getRegion(facility),
    hotelType:(row[hIdx.facility_group]||"")==="hotel"?"Hotel":"Apart",
    brand:getBrand(facility),
    segment:getSegment(adults,children),
    segmentDetailed:getSegmentDetailed(adults_male,adults_female,children),
    leadTime,
    checkinDow:checkin?DOW_FULL[(checkin.getDay()+6)%7]:null,
    checkoutDow:checkout?DOW_FULL[(checkout.getDay()+6)%7]:null,
    bookingDate:dt, // TL's "receive date" maps to YYB's bookingDate
    partySize:adults+children,
    adults,
    kids:children,
    male:adults_male,
    female:adults_female,
    totalRev,
    isCancelled:status==="取消",
    isModified:status==="変更",
    sameDayCancelled:false, // enriched below in applyTLSameDayCancel
    country:null, // filled in by applyTLEmailCountry cross-ref
  };
}
const TL_REQUIRED_COLS=["date","facility","facility_group","status","channel_code","channel_name","channel_bucket","booking_id","email","checkin","checkout","nights","rooms","guests","adults_male","adults_female","children","plan_name","plan_code","revenue","revenue_other"];

// For each 予約 row, mark sameDayCancelled=true if a 取消 row exists with same (date,facility,booking_id) within the same dataset
function applyTLSameDayCancel(rows){
  const cancelKeys=new Set();
  for(let i=0;i<rows.length;i++){
    const r=rows[i];
    if(r.status==="取消"&&r.booking_id){cancelKeys.add(r.dateStr+"|"+r.facility+"|"+r.booking_id)}
  }
  for(let i=0;i<rows.length;i++){
    const r=rows[i];
    if(r.status==="予約"&&r.booking_id&&cancelKeys.has(r.dateStr+"|"+r.facility+"|"+r.booking_id)){r.sameDayCancelled=true}
  }
  return rows;
}

// Cross-reference TL emails against YYB email→country map to fill in country info (TL has no country field)
// Returns { coverage: 0..100, rowsWithCountry: int, totalRows: int }
function applyTLEmailCountry(tlRows,yybRows){
  const emailToCountry={};
  for(let i=0;i<yybRows.length;i++){
    const r=yybRows[i];
    if(r.email&&r.country&&r.country!=="Japan"&&r.country!=="Unknown"){
      // Track country frequency per email, take most common
      if(!emailToCountry[r.email])emailToCountry[r.email]={};
      emailToCountry[r.email][r.country]=(emailToCountry[r.email][r.country]||0)+1;
    }else if(r.email&&r.country==="Japan"){
      // Mark as Japan but only if not seen in intl bucket yet
      if(!emailToCountry[r.email])emailToCountry[r.email]={Japan:1};
      else if(emailToCountry[r.email].Japan!=null)emailToCountry[r.email].Japan++;
    }
  }
  // Reduce to top country per email
  const emailTop={};
  Object.entries(emailToCountry).forEach(([e,m])=>{
    // Prefer non-Japan if any exists (mirrors applyEmailIntlOverride priority)
    const entries=Object.entries(m);
    const intl=entries.filter(([c])=>c!=="Japan");
    if(intl.length)emailTop[e]=intl.sort((a,b)=>b[1]-a[1])[0][0];
    else if(m.Japan)emailTop[e]="Japan";
  });
  let rowsWithCountry=0;
  for(let i=0;i<tlRows.length;i++){
    const r=tlRows[i];
    if(r.email&&emailTop[r.email]){r.country=emailTop[r.email];rowsWithCountry++}
  }
  return{coverage:tlRows.length>0?+((rowsWithCountry/tlRows.length)*100).toFixed(1):0,rowsWithCountry,totalRows:tlRows.length};
}

// ─── i18n ───
const T = {
  en: {
    title:"MONday",titleAccent:"Reservation Analyzer",uploadTitle:"MONday Group",uploadAccent:"Reservation Analyzer",
    uploadDesc:"Upload YYB reservation CSVs to begin analysis. Multiple files will be merged.",
    dropHere:"Drop CSV files here or click to browse",dropSub:"Supports multiple files • CP932 / Shift-JIS / UTF-8 • YYB format",
    requiredCols:"Required columns",processing:"Processing files…",
    loadedFrom:(n,f)=>`${n} reservations from ${f} file${f!==1?"s":""}`,showing:n=>`Showing ${n} filtered`,
    addFiles:"+ Add Files",clearAll:"Clear All",reset:"Reset",refresh:"Refresh",refreshing:"Loading...",
    region:"Region",country:"Country",segment:"Segment",property:"Property",
    dateType:"Date Type",from:"From",to:"To",
    all:"All",allCountries:"All countries",allSegments:"All segments",allProperties:"All properties",
    checkin:"Check-in",checkout:"Check-out",bookingDate:"Booking Date",
    reservations:"Reservations",totalRevenue:"Total Revenue",avgRevRes:"Avg Rev/Res",
    avgLOS:"Avg LOS",avgLeadTime:"Avg Lead Time",intlPct:"International %",
    overview:"Overview",sourceMarkets:"Country Overview",segments:"Segments",
    bookingPatterns:"Booking Patterns",revenue:"Revenue",roomTypes:"Room Types",
    facilities:"Facilities",rawData:"Raw Data",kvk:"Kanto vs Kansai",
    resByMonth:"Reservations by Month",resBySeg:"Reservations by Segment",
    topMarkets:"Top Source Markets",checkinDOW:"Check-in / Check-out by Day of Week",
    allMarketsCount:"All Markets — Reservation Count",avgRevByMarket:"Avg Revenue per Reservation by Market",
    marketSummary:"Country Summary Table",
    segBreakdown:"Segment Breakdown",avgRevBySeg:"Avg Revenue / Res by Segment",
    avgLOSBySeg:"Avg LOS by Segment",avgLeadBySeg:"Avg Lead Time by Segment",
    ciCoDOW:"Check-in / Check-out by Day of Week",monthlyTrend:"Monthly Trend — Volume & Avg Rev",
    bookingDevice:"Booking Device",
    revByMarket:"Revenue by Market (Top 15)",monthlyRev:"Monthly Revenue",
    roomTypeDist:"Room Type Distribution",roomTypeTable:"Room Type Table",
    facilityPerf:"Facility Performance",
    rowsFiltered:n=>`${n} rows (filtered)`,
    exportCSV:"Export CSV",exportImg:"📷 Export",exportFiltered:"Export Filtered CSV",
    noData:"No data matches current filters.",
    prev:"← Prev",next:"Next →",pageOf:(p,t)=>`Page ${p} of ${t}`,clear:"Clear",
    thFacility:"Facility",thRegion:"Region",thCountry:"Country",thSegment:"Segment",
    thCheckin:"Check-in",thCheckout:"Check-out",thNights:"Nights",thLead:"Lead",
    thRev:"Rev (¥)",thRoom:"Room",thDevice:"Device",thRank:"Rank",thParty:"Party",
    thAvgRev:"Avg Rev/Res",thIntlPct:"Intl %",thAvgLOS:"Avg LOS",thTopSeg:"Top Segment",
    thCount:"Count",thShare:"Share",thTotalRev:"Total Rev",thAvgLeadTime:"Avg Lead",
    smartphone:"Smartphone",pc:"PC",tablet:"Tablet",
    checkInLabel:"Check-in",checkOutLabel:"Check-out",
    nu:"n",du:"d",ns:" nights",ds:" days",
    // KvK tab strings
    kvkTitle:"Kanto vs Kansai — Traveler Profile Comparison",
    kvkSub:"Side-by-side regional comparison across all dimensions",
    kvkKantoMarkets:"Kanto — Top Inbound Markets",kvkKansaiMarkets:"Kansai — Top Inbound Markets",
    kvkMarketMonthly:"Monthly Source Market Trend (Stacked)",
    kvkSegByRegion:"Segments by Region",kvkSegByMonth:"Segments by Month",
    kvkSegByCountry:"Segment Mix by Country (%)",
    kvkLOSByCountry:"Avg LOS by Country",kvkLOSBySegRegion:"Avg LOS by Segment × Region",
    kvkLeadBySeg:"Lead Time by Segment (Avg + Median)",kvkLeadByMonth:"Lead Time by Month",
    kvkDOWCheckin:"Check-in DOW — Kanto vs Kansai",kvkDOWCheckout:"Check-out DOW — Kanto vs Kansai",
    kvkDeviceByRegion:"Booking Device by Region",
    kvkADRBySeg:"ADR by Segment (¥/night)",kvkRevBySegRegion:"Avg Rev/Res by Segment × Region",
    kvkRevByCountry:"Avg Rev/Res by Country",
    kvkRoomBySeg:"Room Type by Segment",kvkRoomByRegion:"Room Type by Region",
    kvkRankByRegion:"Membership Rank by Region",kvkRankByCountry:"Membership Rank by Country",
    kanto:"Kanto",kansai:"Kansai",avg:"Average",median:"Median",
    kantoRes:"Kanto reservations",kansaiRes:"Kansai reservations",
    _Solo:"Solo",_Couple:"Couple",_Family:"Family",_Group:"Group",_Hotel:"Hotel",_Apart:"Apart",
    _NoRank:"No Rank",_Regular:"Regular",_Gold:"Gold",_Platinum:"Platinum",
    monthByStay:"By Stay Month",monthByBooking:"By Booking Month",monthModeLabel:"Month axis",
    statusFilter:"Status",statusConfirmed:"Confirmed",statusCancelled:"Cancelled",statusAll:"All",
    hotelType:"Type",hotelTypeHotel:"Hotel",hotelTypeApart:"Apart",brand:"Brand",allBrands:"All brands",
    revByDay:"Revenue by Day",resByDay:"Reservations by Day",dailyRev:"Daily Revenue",
    revByMarketMonth:"Revenue by Market by Month",
    avgLOSByCountry:"Avg LOS by Country",avgLeadByCountry:"Avg Lead Time by Country",segMixByCountry:"Segment Mix by Country",
    facResByFacility:"Reservations by Facility",facAvgRevByFacility:"Avg Revenue by Facility",facIntlByFacility:"International % by Facility",facLOSByFacility:"Avg LOS by Facility",facKvKCompare:"Kanto vs Kansai Comparison",facHvACompare:"Hotel vs Apart Comparison",
    sheetLoading:"Loading…",sheetLoaded:n=>`${n} reservations loaded from Google Sheets`,sheetError:"Could not load Google Sheets data. Upload a CSV manually.",orUpload:"Or upload a CSV manually",dataCoverage:"Data covers May 2024 onward.",timezone:"Timezone",
compare:"Compare",
cmpPeriodA:"Period A",cmpPeriodB:"Period B",
cmpPreset:"Quick Select",cmpCustom:"Custom",
cmpMonthVsMonth:"This Month vs Last Month",cmpWeekVsWeek:"This Week vs Last Week",cmpYearVsYear:"This Year vs Last Year",
cmpDelta:"Delta",cmpChange:"Change %",
cmpByCountry:"By Country",cmpBySegment:"By Segment",cmpByFacility:"By Facility",
cmpRevChart:"Revenue Comparison",cmpCountChart:"Reservation Comparison",
cmpNoData:"Select date ranges for both periods to compare.",
pace:"Pace",paceTitle:"Booking Pace",paceToggleRes:"Reservations",paceToggleRev:"Revenue",paceSummary:"Month-End Totals",paceSoFar:"So far",paceProjected:"Projected",paceNoData:"No data available for pace analysis.",
    cancellations:"Cancellations",cancelRate:"Cancellation Rate",cancelTrend:"Monthly Cancellation Trend",cancelByCountry:"Cancel Rate by Country",cancelBySeg:"Cancel Rate by Segment",cancelByFac:"Cancel Rate by Facility",cancelDetail:"Cancellation Detail",cancelTotal:"Total",cancelCancelled:"Cancelled",cancelRatePct:"Rate",cancelRevLost:"Rev Lost",cancelFeePct:"Fee Collected",
    losTab:"LOS",losTitle:"Length of Stay Distribution",losByNight:"Reservations by Nights",losBySeg:"LOS by Segment",losByCountry:"Avg LOS by Country",losDetail:"LOS Detail",losNights:"Nights",losAvgRev:"Avg Rev/Night",los7plus:"7+",
    revpar:"RevPAR",revparTitle:"Revenue Per Available Room",revparByFac:"RevPAR by Facility",revparTrend:"Monthly RevPAR Trend",revparOcc:"Occupancy",revparAvail:"Available",revparSold:"Sold",revparRate:"RevPAR",occRate:"Occ %",
    presets:"Presets",saveView:"Save View",presetName:"Preset name",presetSaved:"Saved!",presetDelete:"Delete",presetLoad:"Load",noPresets:"No saved presets",downloadPDF:"Download PDF",dowFilter:"Day of Week",allDOW:"All days",monthlyDOW:"Check-in/Check-out by Month",revByDOW:"Revenue by Day of Week",revByDOWMonth:"Revenue by DOW — Monthly",
memberTab:"Member",memberTitle:"Member & Repeat Analysis",memberDisclaimer:"Note: 予約番 data only goes back to May 2024. Guests who booked before this cutoff would be counted as first-timers unless they booked twice after May 2024.",
memberRepeatRate:"Repeat Rate",memberFirstTimer:"First-timer",memberRepeater:"Repeater",memberByCountryType:"Repeat Rate: Japanese vs Foreign",
memberByRank:"By Membership Rank",memberBySegment:"By Segment",memberDetail:"Repeat Guest Detail",
memberTotal:"Total Guests",memberRepeatCount:"Repeat Guests",memberAvgBookings:"Avg Bookings/Repeater",
memberJP:"Japanese",memberIntl:"International",memberName:"Name",memberByFac:"Repeat Rate by Facility",memberTightest:"Repeat Rate by Tightest Window",memberTightestSub:"Each guest counted once in their shortest repeat gap. Date filters do not apply.",memberFirstSecond:"Return Rate (1st → 2nd Stay)",memberFirstSecondSub:"Time between first and second stay. Date filters do not apply.",memberWindow:"Window",memberCountryStack:"Repeaters vs First-Timers by Country (% Stack)",memberCountryCounts:"Guest Counts by Country (Repeaters vs First-Timers)",
segBreakdownMode:"Breakdown",segSimple:"Simple",segDetailedLabel:"Detailed",
    // TL Channel Mix tab
    tlChannelMix:"Channel Mix",
    tlSourceLabel:"TL Lincoln (channel-level actuals, ex-tax)",
    yybSourceLabel:"YYB (reservation rows)",
    tlChannelBucket:"Channel",tlOTA:"OTA",tlRTA:"RTA",tlDirect:"Direct",
    tlChannelName:"OTA / Channel Name",tlPlanCode:"Plan Code",
    tlStatus:"Status",tlStatusNet:"Net",tlStatusAll:"All",tlStatusCancelled:"Cancelled",tlStatusModified:"Modified",
    tlCoverage:"Country coverage",tlCoverageNote:"via YYB email cross-reference",
    tlTopChannels:"Top Channels (full OTA breakdown)",tlTotalModifications:"Modifications",
    adrTab:"ADR",
    tlHintCancelStatus:"Note: Status filter ignored on this tab — cancel rate requires the full dataset (both confirmed and cancelled) to compute meaningful denominators.",
    tlHintDailyDate:"Note: Global date filter ignored on this tab — uses its own date picker above.",
    tlHintCompareDate:"Note: Global date filter ignored on this tab — uses its own Period A / Period B pickers below.",
    tlHintPaceStatus:"Note: Status filter ignored on this tab — pace analysis always uses confirmed bookings (excludes cancellations and modifications).",
    tlDailyReport:"Daily Report",tlRevenueTab:"Revenue",tlSegmentsTab:"Segments",tlMemberTab:"Member",
    tlOverviewTab:"Overview",tlLosTab:"LOS",tlBookingTab:"Booking Patterns",tlCompareTab:"Compare",
    tlPaceTab:"Pace",tlAdrTab:"ADR",tlFacilitiesTab:"Facilities",tlKvkTab:"Kanto vs Kansai",tlMarketsTab:"Markets",
    tlCancellationsTab:"Cancellations",tlDataTab:"Raw Data",
    tlTotalRevenue:"Total Revenue (ex-tax)",tlTotalBookings:"Total Bookings",tlTotalRoomNights:"Total Room-Nights",tlTotalCancellations:"Cancellations",
    tlDirectShare:"Direct Share %",
    tlChannelMixDaily:"Channel Mix — Daily",tlChannelMixMonthly:"Channel Mix — Monthly",
    tlDirectShareTrend:"Direct Share % Over Time",
    tlFacByChannel:"Facility × Channel (Revenue, ex-tax)",
    tlTopFacDirect:"Top Facilities by Direct Share %",
    tlCancByChannel:"Cancellation Rate by Channel",
    tlDOWByChannel:"Day-of-Week Pattern by Channel (Revenue)",
    tlMatrix:"Facility × Channel Matrix",
    tlNoData:"No TL data loaded yet. Check sheet publish URL or wait for backfill.",
    tlGroupByDay:"Day",tlGroupByMonth:"Month",tlMetricRev:"Revenue",tlMetricBookings:"Bookings",
    sourceBannerYYB:"DATA SOURCE: YYB (reservation-level)",
    sourceBannerTL:"DATA SOURCE: TL Lincoln (per-reservation, ex-tax)",
    resetLayout:"Reset Layout",lockLayout:"Lock",
    dailyReport:"Daily Report",
    drDate:"Booking Date",drFrom:"From",drTo:"To",drCountryTable:"By Country",drRegionTable:"By Region",
    drCountry:"Country",drRegion:"Region",drCount:"Res",drRevenue:"Revenue",drADR:"ADR",drShare:"Share",drGrandTotal:"Grand total",
    drRevYoY:"Revenue YoY",drCountYoY:"Reservation Count YoY",
    drCurrent:"Current",drPrevYear:"Previous Year",
    drNoData:"No reservations for this date.",
    drADRChart:"ADR",drDirectRatio:"直販比率",
    drByFacility:"施設別",drByPlan:"プラン別データ",drCouponData:"クーポンデータ",drCancelData:"キャンセルデータ",
    drHotel:"ホテル",drApart:"アパート",drTotal:"全体",drPlanType:"プランタイプ",
    drNonRefund:"返金不可",drStudent:"学生",drOther:"その他",
    drCheckinMonth:"Check-in Month",drRevShare:"Rev Share",
    drCouponName:"Coupon",drUsage:"Usage",drNoUse:"利用なし",
    drFacilityName:"Facility",drNights:"Nights",
    drSingleDate:"Single Day Date",drAfter:"以降",
    drCancelFacility:"Cancellation by Facility",drCancelCountry:"Cancellation by Country",drCancelCount:"Cancelled",drCancelFee:"Cancel Fee",
    drDisclaimer:"予約番入れ込みデータ",
    geoArea:"Geo Area",allGeoAreas:"All areas",
    darkMode:"Dark",lightMode:"Light",
  },
  ja: {
    title:"MONday",titleAccent:"予約分析ダッシュボード",uploadTitle:"MONday Group",uploadAccent:"予約分析ダッシュボード",
    uploadDesc:"YYB予約CSVをアップロードして分析を開始。複数ファイルの結合に対応。",
    dropHere:"CSVファイルをドロップまたはクリックして選択",dropSub:"複数ファイル対応 • CP932 / Shift-JIS / UTF-8 • YYB形式",
    requiredCols:"必須カラム",processing:"処理中…",
    loadedFrom:(n,f)=>`${f}ファイルから${n}件読込`,showing:n=>`フィルター後: ${n}件`,
    addFiles:"+ 追加",clearAll:"全消去",reset:"リセット",refresh:"更新",refreshing:"読込中...",
    region:"エリア",country:"国・地域",segment:"旅行者タイプ",property:"施設",
    dateType:"日付種別",from:"開始日",to:"終了日",
    all:"全て",allCountries:"全ての国",allSegments:"全タイプ",allProperties:"全施設",
    checkin:"チェックイン",checkout:"チェックアウト",bookingDate:"予約日",
    reservations:"予約件数",totalRevenue:"売上合計",avgRevRes:"平均単価/件",
    avgLOS:"平均泊数",avgLeadTime:"平均リードタイム",intlPct:"海外比率",
    overview:"概要",sourceMarkets:"国・地域概要",segments:"旅行者タイプ",
    bookingPatterns:"予約パターン",revenue:"売上",roomTypes:"部屋タイプ",
    facilities:"施設別",rawData:"元データ",kvk:"関東vs関西",
    resByMonth:"月別予約件数",resBySeg:"タイプ別予約",
    topMarkets:"主要送客元",checkinDOW:"曜日分布",
    allMarketsCount:"全市場 — 予約件数",avgRevByMarket:"市場別 平均単価",
    marketSummary:"国サマリー",
    segBreakdown:"タイプ内訳",avgRevBySeg:"タイプ別 平均単価",
    avgLOSBySeg:"タイプ別 平均泊数",avgLeadBySeg:"タイプ別 平均LT",
    ciCoDOW:"曜日分布",monthlyTrend:"月次トレンド",
    bookingDevice:"予約デバイス",
    revByMarket:"市場別売上（上位15）",monthlyRev:"月別売上",
    roomTypeDist:"部屋タイプ分布",roomTypeTable:"部屋タイプ一覧",
    facilityPerf:"施設別パフォーマンス",
    rowsFiltered:n=>`${n}件（フィルター後）`,
    exportCSV:"CSV出力",exportImg:"📷 出力",exportFiltered:"フィルター済CSV出力",
    noData:"該当データがありません。",
    prev:"← 前へ",next:"次へ →",pageOf:(p,t)=>`${p}/${t}`,clear:"クリア",
    thFacility:"施設",thRegion:"エリア",thCountry:"国",thSegment:"タイプ",
    thCheckin:"CI",thCheckout:"CO",thNights:"泊数",thLead:"LT",
    thRev:"売上(¥)",thRoom:"部屋",thDevice:"端末",thRank:"ランク",thParty:"人数",
    thAvgRev:"平均単価",thIntlPct:"海外%",thAvgLOS:"平均泊数",thTopSeg:"主タイプ",
    thCount:"件数",thShare:"割合",thTotalRev:"売上合計",thAvgLeadTime:"平均LT",
    smartphone:"スマホ",pc:"PC",tablet:"タブレット",
    checkInLabel:"チェックイン",checkOutLabel:"チェックアウト",
    nu:"泊",du:"日",ns:"泊",ds:"日",
    kvkTitle:"関東 vs 関西 — 旅行者プロファイル比較",
    kvkSub:"全指標における地域別サイドバイサイド比較",
    kvkKantoMarkets:"関東 — 主要インバウンド市場",kvkKansaiMarkets:"関西 — 主要インバウンド市場",
    kvkMarketMonthly:"月別送客元トレンド（積上）",
    kvkSegByRegion:"エリア別旅行者タイプ",kvkSegByMonth:"月別旅行者タイプ",
    kvkSegByCountry:"国別タイプ構成比（%）",
    kvkLOSByCountry:"国別 平均泊数",kvkLOSBySegRegion:"タイプ×エリア別 平均泊数",
    kvkLeadBySeg:"タイプ別リードタイム（平均+中央値）",kvkLeadByMonth:"月別リードタイム",
    kvkDOWCheckin:"CI曜日 — 関東vs関西",kvkDOWCheckout:"CO曜日 — 関東vs関西",
    kvkDeviceByRegion:"エリア別予約デバイス",
    kvkADRBySeg:"タイプ別ADR（¥/泊）",kvkRevBySegRegion:"タイプ×エリア別 平均単価",
    kvkRevByCountry:"国別 平均予約単価",
    kvkRoomBySeg:"タイプ別部屋タイプ",kvkRoomByRegion:"エリア別部屋タイプ",
    kvkRankByRegion:"エリア別会員ランク",kvkRankByCountry:"国別会員ランク",
    kanto:"関東",kansai:"関西",avg:"平均",median:"中央値",
    kantoRes:"関東予約",kansaiRes:"関西予約",
    _Solo:"ソロ",_Couple:"カップル",_Family:"ファミリー",_Group:"グループ",_Hotel:"ホテル",_Apart:"アパート",
    _NoRank:"ランクなし",_Regular:"レギュラー",_Gold:"ゴールド",_Platinum:"プラチナ",
    monthByStay:"宿泊月別",monthByBooking:"予約月別",monthModeLabel:"月軸",
    statusFilter:"ステータス",statusConfirmed:"確定",statusCancelled:"キャンセル",statusAll:"全て",
    hotelType:"タイプ",hotelTypeHotel:"ホテル",hotelTypeApart:"アパート",brand:"ブランド",allBrands:"全ブランド",
    revByDay:"日別売上",resByDay:"日別予約件数",dailyRev:"日別売上",
    revByMarketMonth:"月別市場別売上",
    avgLOSByCountry:"国別 平均泊数",avgLeadByCountry:"国別 平均LT",segMixByCountry:"国別タイプ構成",
    facResByFacility:"施設別予約件数",facAvgRevByFacility:"施設別平均単価",facIntlByFacility:"施設別海外比率",facLOSByFacility:"施設別平均泊数",facKvKCompare:"関東vs関西比較",facHvACompare:"ホテルvsアパート比較",
    sheetLoading:"読み込み中…",sheetLoaded:n=>`Google Sheetsから${n}件読込`,sheetError:"Google Sheetsの読み込みに失敗しました。CSVを手動でアップロードしてください。",orUpload:"またはCSVを手動でアップロード",dataCoverage:"データは2024年5月以降を対象としています。",timezone:"タイムゾーン",
compare:"比較",
cmpPeriodA:"期間A",cmpPeriodB:"期間B",
cmpPreset:"クイック選択",cmpCustom:"カスタム",
cmpMonthVsMonth:"今月 vs 先月",cmpWeekVsWeek:"今週 vs 先週",cmpYearVsYear:"今年 vs 昨年",
cmpDelta:"差分",cmpChange:"変化率",
cmpByCountry:"国別",cmpBySegment:"タイプ別",cmpByFacility:"施設別",
cmpRevChart:"売上比較",cmpCountChart:"予約数比較",
cmpNoData:"比較する2つの期間を選択してください。",
pace:"ペース",paceTitle:"予約ペース",paceToggleRes:"予約数",paceToggleRev:"売上",paceSummary:"月末合計",paceSoFar:"現時点",paceProjected:"予測",paceNoData:"ペース分析データがありません。",
    cancellations:"キャンセル",cancelRate:"キャンセル率",cancelTrend:"月別キャンセル推移",cancelByCountry:"国別キャンセル率",cancelBySeg:"タイプ別キャンセル率",cancelByFac:"施設別キャンセル率",cancelDetail:"キャンセル詳細",cancelTotal:"全体",cancelCancelled:"キャンセル数",cancelRatePct:"率",cancelRevLost:"失注売上",cancelFeePct:"徴収料",
    losTab:"泊数分布",losTitle:"泊数分布",losByNight:"泊数別予約数",losBySeg:"タイプ別泊数",losByCountry:"国別平均泊数",losDetail:"泊数詳細",losNights:"泊数",losAvgRev:"平均単価/泊",los7plus:"7+",
    revpar:"RevPAR",revparTitle:"客室あたり売上",revparByFac:"施設別RevPAR",revparTrend:"月別RevPAR推移",revparOcc:"稼働率",revparAvail:"販売可能",revparSold:"販売済",revparRate:"RevPAR",occRate:"稼働率",
    presets:"プリセット",saveView:"ビュー保存",presetName:"プリセット名",presetSaved:"保存済!",presetDelete:"削除",presetLoad:"読込",noPresets:"保存済プリセットなし",downloadPDF:"PDF出力",dowFilter:"曜日",allDOW:"全曜日",monthlyDOW:"月別チェックイン/チェックアウト",revByDOW:"曜日別売上",revByDOWMonth:"曜日別売上（月別）",
memberTab:"会員",memberTitle:"会員・リピート分析",memberDisclaimer:"注意: 予約番データは2024年5月以降のみ。この期間より前に予約した客は、2024年5月以降に2回以上予約しない限り初回客としてカウントされます。",
memberRepeatRate:"リピート率",memberFirstTimer:"初回",memberRepeater:"リピーター",memberByCountryType:"リピート率: 国内 vs 海外",
memberByRank:"会員ランク別",memberBySegment:"タイプ別",memberDetail:"リピーター詳細",
memberTotal:"ゲスト総数",memberRepeatCount:"リピーター数",memberAvgBookings:"平均予約数/リピーター",
memberJP:"国内",memberIntl:"海外",memberName:"氏名",memberByFac:"施設別リピート率",memberTightest:"最短リピート間隔別",memberTightestSub:"各ゲストは最短リピート間隔の枠で1回のみカウント。日付フィルターは適用されません。",memberFirstSecond:"リターン率（初回→2回目）",memberFirstSecondSub:"初回と2回目の宿泊間隔。日付フィルターは適用されません。",memberWindow:"期間",memberCountryStack:"国別リピーター/初回客（％積み上げ）",memberCountryCounts:"国別ゲスト数（リピーター/初回客）",
segBreakdownMode:"内訳",segSimple:"シンプル",segDetailedLabel:"詳細",
    // TL Channel Mix tab
    tlChannelMix:"チャネルミックス",
    tlSourceLabel:"TL Lincoln（チャネル別実績、税抜）",
    yybSourceLabel:"YYB（予約データ）",
    tlChannelBucket:"チャネル",tlOTA:"OTA",tlRTA:"RTA",tlDirect:"自社",
    tlChannelName:"OTA／販売先名",tlPlanCode:"プランコード",
    tlStatus:"状態",tlStatusNet:"純",tlStatusAll:"全て",tlStatusCancelled:"取消",tlStatusModified:"変更",
    tlCoverage:"国別カバー率",tlCoverageNote:"YYBメールクロス参照",
    tlTopChannels:"チャネル詳細（OTA別）",tlTotalModifications:"変更件数",
    adrTab:"ADR",
    tlHintCancelStatus:"注意: このタブではステータスフィルターは無効です — キャンセル率の分母には確定＋キャンセルの全データが必要です。",
    tlHintDailyDate:"注意: グローバル日付フィルターは無効 — 上の独自の日付ピッカーを使用します。",
    tlHintCompareDate:"注意: グローバル日付フィルターは無効 — 下の期間A / 期間Bピッカーを使用します。",
    tlHintPaceStatus:"注意: ステータスフィルターは無効 — ペース分析は常に確定予約を使用します（キャンセル・変更を除外）。",
    tlDailyReport:"日報",tlRevenueTab:"売上",tlSegmentsTab:"タイプ",tlMemberTab:"会員",
    tlOverviewTab:"概要",tlLosTab:"泊数",tlBookingTab:"予約パターン",tlCompareTab:"比較",
    tlPaceTab:"ペース",tlAdrTab:"ADR",tlFacilitiesTab:"施設",tlKvkTab:"関東 vs 関西",tlMarketsTab:"市場",
    tlCancellationsTab:"キャンセル",tlDataTab:"生データ",
    tlTotalRevenue:"売上合計（税抜）",tlTotalBookings:"予約件数",tlTotalRoomNights:"販売室数",tlTotalCancellations:"キャンセル数",
    tlDirectShare:"自社予約比率",
    tlChannelMixDaily:"チャネルミックス — 日別",tlChannelMixMonthly:"チャネルミックス — 月別",
    tlDirectShareTrend:"自社予約比率の推移",
    tlFacByChannel:"施設×チャネル（売上、税抜）",
    tlTopFacDirect:"自社予約比率トップ施設",
    tlCancByChannel:"チャネル別キャンセル率",
    tlDOWByChannel:"曜日別パターン（チャネル別売上）",
    tlMatrix:"施設×チャネル マトリクス",
    tlNoData:"TLデータがまだ読み込まれていません。",
    tlGroupByDay:"日",tlGroupByMonth:"月",tlMetricRev:"売上",tlMetricBookings:"予約数",
    sourceBannerYYB:"データソース: YYB（予約レベル）",
    sourceBannerTL:"データソース: TL Lincoln（予約別、税抜）",
    resetLayout:"レイアウトリセット",lockLayout:"ロック",
    dailyReport:"日次レポート",
    drDate:"予約日",drFrom:"開始日",drTo:"終了日",drCountryTable:"国籍別",drRegionTable:"地域別",
    drCountry:"国籍",drRegion:"地域",drCount:"件数",drRevenue:"売上",drADR:"ADR",drShare:"シェア",drGrandTotal:"合計",
    drRevYoY:"売上YoY",drCountYoY:"件数YoY",
    drCurrent:"当年",drPrevYear:"前年",
    drNoData:"この日付のデータはありません。",
    drADRChart:"ADR",drDirectRatio:"直販比率",
    drByFacility:"施設別",drByPlan:"プラン別データ",drCouponData:"クーポンデータ",drCancelData:"キャンセルデータ",
    drHotel:"ホテル",drApart:"アパート",drTotal:"全体",drPlanType:"プランタイプ",
    drNonRefund:"返金不可",drStudent:"学生",drOther:"その他",
    drCheckinMonth:"チェックイン月",drRevShare:"売上シェア",
    drCouponName:"クーポン",drUsage:"利用率",drNoUse:"利用なし",
    drFacilityName:"施設名",drNights:"泊数",
    drSingleDate:"単日日付",drAfter:"以降",
    drCancelFacility:"施設別キャンセル",drCancelCountry:"国別キャンセル",drCancelCount:"キャンセル数",drCancelFee:"キャンセル料",
    drDisclaimer:"予約番入れ込みデータ",
    geoArea:"地理エリア",allGeoAreas:"全エリア",
    darkMode:"ダーク",lightMode:"ライト",
  }
};

const HEADER_JP={country:"国",count:"件数",avgRev:"平均単価",avgLOS:"平均泊数",avgLead:"平均LT",segment:"タイプ",month:"月",day:"曜日",room:"部屋",device:"端末",region:"エリア",avg:"平均",median:"中央値",adr:"ADR",rev:"売上",n:"件数",name:"施設名",intlPct:"海外%",topSeg:"主タイプ",Kanto:"関東",Kansai:"関西",Hotel:"ホテル",Apart:"アパート",date:"日付",metric:"指標"};

// ─── CONSTANTS ───
const KANSAI_KW=["京都丸太町","京都烏丸二条","京都駅","京都駅鴨川","京都五条","大阪難波"];
const JP_PREFS=["東京都","大阪府","愛知県","兵庫県","北海道","静岡県","神奈川県","千葉県","埼玉県","宮城県","福岡県","京都府","新潟県","長野県","茨城県","群馬県","栃木県","三重県","奈良県","福島県","石川県","広島県","岐阜県","岡山県","富山県","和歌山県","大分県","鹿児島県","滋賀県","愛媛県","山口県","秋田県","山梨県","山形県","徳島県","鳥取県","長崎県","香川県","宮崎県","岩手県","熊本県","沖縄県","佐賀県","島根県","高知県","福井県","青森県"];
const PHONE_MAP={"+1":"United States","+81":"Japan","+886":"Taiwan","+61":"Australia","+852":"Hong Kong","+65":"Singapore","+82":"South Korea","+62":"Indonesia","+66":"Thailand","+60":"Malaysia","+44":"UK","+63":"Philippines","+33":"France","+86":"China","+64":"New Zealand","+91":"India","+49":"Germany","+34":"Spain","+52":"Mexico","+55":"Brazil","+39":"Italy","+353":"Ireland","+41":"Switzerland","+972":"Israel","+971":"UAE","+56":"Chile","+54":"Argentina","+31":"Netherlands","+45":"Denmark","+43":"Austria","+673":"Brunei","+358":"Finland","+48":"Poland","+47":"Norway","+375":"Belarus","+27":"South Africa","+7":"Russia","+32":"Belgium","+40":"Romania","+420":"Czech Republic","+372":"Estonia","+234":"Nigeria","+352":"Luxembourg","+598":"Uruguay","+84":"Vietnam","+46":"Sweden"};
const COUNTRY_MAP={"United States":"United States","Canada":"Canada","Taiwan":"Taiwan","Republic of China":"Taiwan","Australia":"Australia","Hong Kong":"Hong Kong","Singapore":"Singapore","Republic of Korea":"South Korea","Indonesia":"Indonesia","Thailand":"Thailand","Malaysia":"Malaysia","United Kingdom":"UK","Philippines":"Philippines","France":"France","China":"China","New Zealand":"New Zealand","India":"India","Spain":"Spain","Germany":"Germany","Brazil":"Brazil","Italy":"Italy","Ireland":"Ireland","Switzerland":"Switzerland","Israel":"Israel","United Arab Emirates":"UAE","Chile":"Chile","Argentina":"Argentina","Netherlands":"Netherlands","Denmark":"Denmark","Austria":"Austria","Brunei Darussalam":"Brunei","Finland":"Finland","Poland":"Poland","Norway":"Norway","Belarus":"Belarus","South Africa":"South Africa","Russian Federation":"Russia","Belgium":"Belgium","Romania":"Romania","Czech Republic":"Czech Republic","Estonia":"Estonia","Nigeria":"Nigeria","Luxembourg":"Luxembourg","Uruguay":"Uruguay","Viet Nam":"Vietnam","Sweden":"Sweden","Japan":"Japan","Other":"Other","その他":"Other","Mexico":"Mexico"};
const SEG_ORDER=["Solo","Couple","Family","Group"];
const SEG_COLORS={Solo:"#7ec8e3",Couple:"#c084fc",Family:"#f59e0b",Group:"#34d399"};
const SEG_ORDER_DETAILED=["Solo","Couple (1M+1F)","Duo (Male)","Duo (Female)","Family (1 child)","Family (2 children)","Family (3+ children)","Group (All Male)","Group (All Female)","Group (Mixed)"];
const SEG_COLORS_DETAILED={"Solo":"#7ec8e3","Couple (1M+1F)":"#c084fc","Duo (Male)":"#4ea8de","Duo (Female)":"#e07b54","Family (1 child)":"#fbbf24","Family (2 children)":"#f59e0b","Family (3+ children)":"#d97706","Group (All Male)":"#1d4ed8","Group (All Female)":"#be123c","Group (Mixed)":"#34d399"};
const DOW_FULL=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DOW_SHORT=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DOW_JA=["月","火","水","木","金","土","日"];
const PALETTE=["#4ea8de","#e07b54","#c084fc","#34d399","#f59e0b","#7ec8e3","#ef4444","#8b5cf6","#06b6d4","#f472b6","#a3e635","#fb923c","#64748b","#e879f9","#2dd4bf"];
const REQUIRED_COLS=["施設名","予約受付日時","宿泊日（チェックイン）","チェックアウト日","泊数","部屋タイプ","大人1(人数)","大人2(人数)","宿泊料金合計","予約料金合計","都道府県","国番号（ 連絡先（主） ）","言語","予約方法","ランク名"];
const CHILD_COLS=[26,28,30,32,34,36,38,40,42];
const RANK_ORDER=["No Rank","Regular","Gold","Platinum"];
const RANK_COLORS=["#64748b","#4ea8de","#c9a84c","#e07b54"];

const GEO_REGION=c=>{
  if(c==="Japan")return"Japan";
  if(["United States","Canada","Mexico"].includes(c))return"North America";
  if(["UK","France","Germany","Spain","Italy","Ireland","Switzerland","Netherlands","Denmark","Austria","Finland","Poland","Norway","Russia","Belgium","Sweden","Romania","Czech Republic","Estonia","Luxembourg"].includes(c))return"Europe";
  if(["Australia","New Zealand"].includes(c))return"Oceania";
  if(["Brazil","Chile","Argentina","Uruguay"].includes(c))return"South America";
  if(["South Africa","Nigeria"].includes(c))return"Africa";
  if(c==="Unknown"||c==="Other")return"Unknown";
  return"Asia";
};

const ROOM_INVENTORY={
  "hotel MONday Premium 豊洲":263,"hotel MONday 東京西葛西":129,"hotel MONday Premium 上野御徒町":124,
  "hotel MONday 浅草":115,"イチホテル上野新御徒町":108,"イチホテル浅草橋":103,"hotel MONday 羽田空港":102,
  "イチホテル東京八丁堀":102,"hotel MONday 京都丸太町":100,"hotel MONday 秋葉原浅草橋":94,
  "hotel MONday 京都烏丸二条":92,"Premium hotel MONday 舞浜ビューⅠ":57,
  "MONday Apart Premium 上野":71,"MONday Apart Premium 日本橋":56,"MONday Apart Premium 上野御徒町":50,
  "GRAND MONday 銀座":45,"Premium Apart MONday 銀座EAST":43,"MONday Apart Premium 京都駅":41,
  "MONday Apart 銀座新富町":40,"MONday Apart 上野新御徒町":36,"Premium Apart MONday 京都五条":36,
  "MONday Apart Premium 大阪難波WEST":28,"MONday Apart Premium 秋葉原浅草橋ステーション":27,
  "MONday Apart Premium 秋葉原":27,"MONday Apart 浅草橋秋葉原":27,"MONday Apart 日本橋人形町":26,
  "MONday Apart Premium 浅草":25,"MONday Apart 浜松町大門":22,"MONday Apart Premium 京都駅鴨川":22,
  "Premium Apart MONday 浜松町ステーション":9,"MONday Apart Premium 浜松町":27,"TABI上野":35,
  "GRAND MONday 上野御徒町":50,
};
const TOTAL_ROOMS=Object.values(ROOM_INVENTORY).reduce((a,b)=>a+b,0);

// ─── HELPERS ───
function getRegion(f){return KANSAI_KW.some(k=>f.includes(k))?"Kansai":"Kanto"}
function getHotelType(f){if(f.includes("Apart")||f.includes("TABI")||f.includes("GRAND"))return"Apart";return"Hotel"}
function getBrand(f){if(f.includes("イチホテル"))return"ICHI";if(f.includes("GRAND"))return"GRAND MONday";if(f.includes("TABI"))return"TABI";if(f.includes("Apart"))return"MONday Apart";return"hotel MONday"}
function getCountry(p,ph,l){if(p){if(JP_PREFS.includes(p))return"Japan";if(COUNTRY_MAP[p])return COUNTRY_MAP[p]}if(ph&&PHONE_MAP[ph])return PHONE_MAP[ph];if(l){if(l==="日本語")return"Japan";if(l==="英語")return"International (EN)";if(l.includes("中国語"))return"Taiwan/HK (ZH)";if(l==="韓国語")return"South Korea"}return"Unknown"}
function getSegment(a,k){const t=a+k;if(k>0)return"Family";if(t===1)return"Solo";if(t===2)return"Couple";if(t>=3)return"Group";return"Unknown"}
function getSegmentDetailed(male,female,kids){
  const adults=male+female;
  if(kids>0){
    if(kids===1)return"Family (1 child)";
    if(kids===2)return"Family (2 children)";
    return"Family (3+ children)";
  }
  if(adults===1)return"Solo";
  if(adults===2){
    if(male===1&&female===1)return"Couple (1M+1F)";
    if(male===2&&female===0)return"Duo (Male)";
    if(male===0&&female===2)return"Duo (Female)";
    return"Couple (1M+1F)";
  }
  if(adults>=3){
    if(male>0&&female===0)return"Group (All Male)";
    if(male===0&&female>0)return"Group (All Female)";
    return"Group (Mixed)";
  }
  return"Unknown";
}
function parseYen(v){if(!v)return 0;try{return parseInt(String(v).replace(/,/g,"").replace(/"/g,""))||0}catch{return 0}}
function simplifyRoom(r){if(!r)return"Other";if(r.includes("ファミリー"))return"Family Room";if(r.includes("スイート")||r.toLowerCase().includes("suite"))return"Suite";if(r.includes("ジャパニーズ")||r.includes("和"))return"Japanese Room";if(r.includes("デラックスツイン"))return"Dlx Twin";if(r.includes("デラックスダブル"))return"Dlx Double";if(r.includes("スタンダードツイン"))return"Std Twin";if(r.includes("スタンダードダブル"))return"Std Double";if(r.includes("スタンダードトリプル"))return"Std Triple";if(r.includes("コンパクトツイン"))return"Compact Twin";if(r.includes("コーナーツイン"))return"Corner Twin";if(r.includes("シングル"))return"Single";if(r.includes("ツイン"))return"Twin";if(r.includes("ダブル"))return"Double";if(r.includes("トリプル"))return"Triple";if(r.includes("おまかせ"))return"Room Assigned";if(r.includes("スタンダード"))return"Standard";return"Other"}
function fmtY(v){return v>=1e6?"¥"+(v/1e6).toFixed(1)+"M":v>=1000?"¥"+(v/1000).toFixed(0)+"K":"¥"+v}
function fmtN(v){return v!=null?v.toLocaleString():"—"}
const fmtDate=d=>{const[y,m,day]=d.split("-");const mn=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];return mn[parseInt(m)-1]+" "+parseInt(day)+", "+y};
function pct(n,d){return d>0?((n/d)*100).toFixed(1)+"%":"—"}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
function med(a){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2}

function shortFac(n){
  if(!n)return n;
  return n
    .replace(/^Premium hotel MONday\s*/,"PH ")
    .replace(/^hotel MONday Premium\s*/,"HP ")
    .replace(/^hotel MONday\s*/,"H ")
    .replace(/^GRAND MONday\s*/,"G ")
    .replace(/^MONday Apart Premium\s*/,"MAP ")
    .replace(/^Premium Apart MONday\s*/,"PAM ")
    .replace(/^MONday Apart\s*/,"MA ")
    .replace(/^イチホテル\s*/,"イチ ")
    .replace(/^TABI\s*/,"T ");
}

function processRow(row,headers){
  const hIdx=processRow._cache&&processRow._cache.h===headers?processRow._cache.idx:(()=>{const m={};headers.forEach((h,i)=>{m[h]=i});processRow._cache={h:headers,idx:m};return m})();
  const g=c=>{const i=hIdx[c];return i==null?"":(row[i]??"")};
  let facility=g("施設名");
  // Normalize facility name variants
  if(facility.includes("舞浜ビュー")&&!facility.includes("舞浜ビューⅠ"))facility=facility.replace(/舞浜ビュー.*$/,"舞浜ビューⅠ");
  if(facility.includes("（旧："))facility=facility.replace(/\s*（旧：.*）\s*$/,"");
  const a1=parseInt(g("大人1(人数)"))||0,a2=parseInt(g("大人2(人数)"))||0,adults=a1+a2;
  let kids=0;
  const childCountCols=["子供1(人数)","子供2(人数)","子供3(人数)","子供4(人数)","子供5(人数)","子供6(人数)","子供7(人数)","子供8(人数)","子供9(人数)"];
  for(const cc of childCountCols){const idx=headers.indexOf(cc);if(idx>=0)kids+=parseInt(row[idx]||"0")||0}
  let checkin=null,checkout=null,bookingDt=null;
  try{checkin=new Date(g("宿泊日（チェックイン）"));if(isNaN(checkin))checkin=null}catch{}
  try{checkout=new Date(g("チェックアウト日"));if(isNaN(checkout))checkout=null}catch{}
  try{bookingDt=new Date(g("予約受付日時"));if(isNaN(bookingDt))bookingDt=null}catch{}
  let leadTime=null;
  if(checkin&&bookingDt){const c2=new Date(checkin);c2.setHours(0,0,0,0);const b=new Date(bookingDt);b.setHours(0,0,0,0);leadTime=Math.max(0,Math.round((c2-b)/864e5))}
  const status=g("状態");
  const isCancelled=status==="キャンセル";
  const cancelFee=parseYen(g("キャンセル料"));
  const planName=g("宿泊プラン")||"";
  const couponName=g("クーポン名")||"";
  const salesChannel=g("販売チャネル")||"";
  const email=(g("メールアドレス")||"").trim().toLowerCase();
  const guestName=(g("氏名")||"").trim();
  const getPlanType=pn=>{const lw=pn.toLowerCase();if(lw.includes("学生限定")||lw.includes("学割プラン")||lw.includes("student")||lw.includes("gakuwari"))return"学生";if(lw.includes("返金不可")||lw.includes("non-refundable")||lw.includes("non refundable"))return"返金不可";return"その他"};
  const planType=getPlanType(planName);
  const checkinMonth=checkin?`${checkin.getFullYear()}-${String(checkin.getMonth()+1).padStart(2,"0")}`:null;
  return{facility,region:getRegion(facility),hotelType:getHotelType(facility),brand:getBrand(facility),country:getCountry(g("都道府県"),g("国番号（ 連絡先（主） ）"),g("言語")),segment:getSegment(adults,kids),checkin,checkout,bookingDate:bookingDt,month:checkin?checkin.toISOString().slice(0,7):null,bookMonth:bookingDt?bookingDt.toISOString().slice(0,7):null,checkinMonth,checkinDow:checkin?DOW_FULL[(checkin.getDay()+6)%7]:null,checkoutDow:checkout?DOW_FULL[(checkout.getDay()+6)%7]:null,leadTime,nights:parseInt(g("泊数"))||null,totalRev:parseYen(g("予約料金合計")),partySize:adults+kids,adults,kids,device:g("予約方法"),roomSimple:simplifyRoom(g("部屋タイプ")),rank:g("ランク名")||"No Rank",isCancelled,cancelFee,planName,planType,couponName,salesChannel,email,guestName,male:a1,female:a2,segmentDetailed:getSegmentDetailed(a1,a2,kids)}
}

function decodeBuffer(buf){
  const b=new Uint8Array(buf);
  try{const t=new TextDecoder("utf-8",{fatal:true}).decode(b);if(t.includes("施設名"))return{text:t,encoding:"UTF-8"}}catch{}
  try{const t=new TextDecoder("shift-jis",{fatal:false}).decode(b);if(t.includes("施設名"))return{text:t,encoding:"Shift-JIS"}}catch{}
  return{text:new TextDecoder("utf-8",{fatal:false}).decode(b),encoding:"UTF-8 (lossy)"}
}

function dlChart(id,fn,title){
  const el=document.getElementById(id);if(!el)return;
  // Find the actual chart container — could be the recharts wrapper
  const target=el.querySelector(".recharts-wrapper")||el;
  toPng(target,{
    backgroundColor:"#ffffff",
    pixelRatio:2,
    cacheBust:true,
    style:{background:"#ffffff"},
    filter:n=>{
      // Skip the tooltip element (it's positioned absolutely and can show stale state)
      if(n.classList&&(n.classList.contains("recharts-tooltip-wrapper")||n.classList.contains("recharts-tooltip-cursor")))return false;
      return true;
    }
  }).then(dataUrl=>{
    if(title){
      // Add a title bar above the chart by drawing both onto a new canvas
      const img=new Image();
      img.onload=()=>{
        const titleH=48;
        const cv=document.createElement("canvas");
        cv.width=img.width;
        cv.height=img.height+titleH*2;
        const ctx=cv.getContext("2d");
        ctx.fillStyle="#ffffff";
        ctx.fillRect(0,0,cv.width,cv.height);
        ctx.fillStyle="#1a1a2e";
        ctx.font="bold 28px 'DM Sans',sans-serif";
        ctx.fillText(title,24,titleH+16);
        ctx.drawImage(img,0,titleH*2);
        const a=document.createElement("a");
        a.download=fn+".png";
        a.href=cv.toDataURL("image/png");
        a.click();
      };
      img.src=dataUrl;
    }else{
      const a=document.createElement("a");
      a.download=fn+".png";
      a.href=dataUrl;
      a.click();
    }
  }).catch(err=>{console.error("Chart export failed:",err);alert("Chart export failed. See console for details.")});
}

function dlTable(data,title,fn,tr){if(!data||!data.length)return;const keys=Object.keys(data[0]);const tKey=k=>tr?tr(k):k;const tVal=v=>{if(v==null)return"";if(typeof v==="number")return v.toLocaleString();const s=String(v);return tr?tr(s):s};const pad=14,rowH=28,headH=36,titleH=44,font="12px 'DM Sans',sans-serif",headFont="bold 11px 'JetBrains Mono',monospace",titleFont="bold 14px 'DM Sans',sans-serif";const cv=document.createElement("canvas");const ctx=cv.getContext("2d");ctx.font=font;const colW=keys.map(k=>{const hdr=tKey(k).toUpperCase();ctx.font=headFont;let mx=ctx.measureText(hdr).width;ctx.font=font;data.forEach(r=>{const w=ctx.measureText(tVal(r[k])).width;if(w>mx)mx=w});return mx+pad*2});const totalW=colW.reduce((a,b)=>a+b,0)+2;const totalH=titleH+headH+data.length*rowH+2;cv.width=totalW*2;cv.height=totalH*2;ctx.scale(2,2);ctx.fillStyle="#ffffff";ctx.fillRect(0,0,totalW,totalH);ctx.fillStyle="#1a1a2e";ctx.font=titleFont;ctx.fillText(title,pad,titleH-14);ctx.fillStyle="#f0f0f4";ctx.fillRect(0,titleH,totalW,headH);ctx.fillStyle="#4a4a6a";ctx.font=headFont;let x=1;keys.forEach((k,i)=>{ctx.fillText(tKey(k).toUpperCase(),x+pad,titleH+headH-10);x+=colW[i]});data.forEach((row,ri)=>{const y=titleH+headH+ri*rowH;if(ri%2===0){ctx.fillStyle="#fafaff";ctx.fillRect(0,y,totalW,rowH)}ctx.fillStyle="#333";ctx.font=font;let x2=1;keys.forEach((k,i)=>{ctx.fillText(tVal(row[k]),x2+pad,y+rowH-8);x2+=colW[i]})});ctx.strokeStyle="#e0e0e8";ctx.lineWidth=0.5;let lx=1;keys.forEach((_,i)=>{lx+=colW[i];ctx.beginPath();ctx.moveTo(lx,titleH);ctx.lineTo(lx,totalH);ctx.stroke()});const a=document.createElement("a");a.download=fn+"_table.png";a.href=cv.toDataURL("image/png");a.click()}

// Email-based international override: if an email ever appears in a non-Japan reservation,
// reclassify ALL of that email's reservations to the most frequent non-Japan country it used.
function applyEmailIntlOverride(rows){
  const emailIntl={}; // email -> {country: count}
  rows.forEach(r=>{if(r.email&&r.country&&r.country!=="Japan"){if(!emailIntl[r.email])emailIntl[r.email]={};emailIntl[r.email][r.country]=(emailIntl[r.email][r.country]||0)+1}});
  const emailTop={};
  Object.entries(emailIntl).forEach(([e,m])=>{emailTop[e]=Object.entries(m).sort((a,b)=>b[1]-a[1])[0][0]});
  rows.forEach(r=>{if(r.email&&emailTop[r.email]&&r.country==="Japan")r.country=emailTop[r.email]});
  return rows;
}

function expCSV(rows,headers,fn){const csv=[headers.join(","),...rows.map(r=>headers.map(h=>{const v=r[h];if(v==null)return"";const s=String(v);return s.includes(",")||s.includes('"')||s.includes("\n")?'"'+s.replace(/"/g,'""')+'"':s}).join(","))].join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));a.download=fn;a.click()}

function expXLS(data,title,fn,tr){if(!data||!data.length)return;const keys=Object.keys(data[0]);const tKey=k=>tr?tr(k):k;const tVal=v=>{if(v==null)return"";if(typeof v==="number")return v;return tr?tr(String(v)):String(v)};const rows=data.map(r=>"<tr>"+keys.map(k=>"<td>"+tVal(r[k])+"</td>").join("")+"</tr>").join("");const html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:spreadsheet"><head><meta charset="utf-8"/></head><body><table><thead><tr>${keys.map(k=>"<th>"+tKey(k)+"</th>").join("")}</tr></thead><tbody>${rows}</tbody></table></body></html>`;const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+html],{type:"application/vnd.ms-excel;charset=utf-8"}));a.download=(fn||title||"export")+".xls";a.click()}

const CT=({active,payload,label,formatter})=>{if(!active||!payload?.length)return null;return(<div style={{background:"#1a3058",border:"1px solid #2a4a78",borderRadius:6,padding:"8px 12px",fontSize:12,color:"#f0ece4"}}><div style={{fontWeight:600,marginBottom:4,color:"#c9a84c"}}>{label}</div>{payload.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}><span style={{width:8,height:8,borderRadius:2,background:p.color,display:"inline-block"}}/><span>{p.name}: {formatter?formatter(p.value):typeof p.value==="number"?p.value.toLocaleString():p.value}</span></div>)}</div>)};

const MS=({options,selected,onChange,placeholder,maxShow=2,S,cl})=>{const[open,setOpen]=useState(false);const ref=useRef();useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false)};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h)},[]);const toggle=v=>onChange(selected.includes(v)?selected.filter(s=>s!==v):[...selected,v]);const label=selected.length===0?placeholder:selected.length<=maxShow?selected.join(", "):`${selected.length} ✓`;return(<div ref={ref} style={{position:"relative",display:"inline-block"}}><button style={{...S.btn,...(selected.length>0?S.ba:{}),minWidth:120,textAlign:"left",display:"flex",alignItems:"center",justifyContent:"space-between",gap:4}} onClick={()=>setOpen(!open)}><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}}>{label}</span><span style={{fontSize:8}}>▼</span></button>{open&&<div style={{position:"absolute",top:"100%",left:0,zIndex:100,background:"#142444",border:"1px solid #1e3150",borderRadius:6,marginTop:4,maxHeight:240,overflowY:"auto",minWidth:220,boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}><div style={{padding:"4px 8px",borderBottom:"1px solid #1e3150",display:"flex",justifyContent:"space-between"}}><button onClick={()=>onChange([])} style={{...S.btn,padding:"2px 8px",fontSize:10,border:"none"}}>{cl}</button><button onClick={()=>onChange([...options])} style={{...S.btn,padding:"2px 8px",fontSize:10,border:"none"}}>All</button></div>{options.map(o=><div key={o} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",cursor:"pointer",fontSize:12,color:selected.includes(o)?"#c9a84c":"#c8c3b8"}} onClick={()=>toggle(o)}><span style={{width:14,height:14,borderRadius:3,border:"1px solid "+(selected.includes(o)?"#c9a84c":"#1e3150"),background:selected.includes(o)?"rgba(201,168,76,0.2)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,flexShrink:0}}>{selected.includes(o)?"✓":""}</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o}</span></div>)}</div>}</div>)};

// ─── MAIN ───
export default function App(){
  const[lang,setLang]=useState("en");const[theme,setTheme]=useState(()=>localStorage.getItem("rgl_theme")||"dark");
  const defaultTz=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone}catch{return"Asia/Tokyo"}};
  const[tz,setTz]=useState(()=>localStorage.getItem("rgl_tz")||defaultTz());
  useEffect(()=>{localStorage.setItem("rgl_tz",tz)},[tz]);
  // Timezone-aware date formatter with caching for performance
  const tzCache=useRef({tz:null,fmt:null,map:new Map()});
  const tzFmt=useCallback((dt,fmt)=>{
    if(!dt)return null;
    // Reset cache if timezone changed
    if(tzCache.current.tz!==tz){tzCache.current={tz,fmt:null,map:new Map()}}
    // Cache key: timestamp + format
    const key=dt.getTime()+"|"+(fmt||"");
    const cached=tzCache.current.map.get(key);
    if(cached!==undefined)return cached;
    let result;
    try{
      if(!tzCache.current.fmt)tzCache.current.fmt=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"});
      const parts=tzCache.current.fmt.formatToParts(dt);
      const y=parts.find(p=>p.type==="year").value;const m=parts.find(p=>p.type==="month").value;const d=parts.find(p=>p.type==="day").value;
      result=fmt==="month"?`${y}-${m}`:`${y}-${m}-${d}`;
    }catch{
      const y2=dt.getFullYear(),m2=String(dt.getMonth()+1).padStart(2,"0"),d2=String(dt.getDate()).padStart(2,"0");
      result=fmt==="month"?`${y2}-${m2}`:`${y2}-${m2}-${d2}`;
    }
    tzCache.current.map.set(key,result);
    return result;
  },[tz]);
  const t=T[lang];const dL=lang==="ja"?DOW_JA:DOW_SHORT;
  // Translate data-level labels (region, segment, type, rank, country)
  const tl=v=>{const m={"Kanto":t.kanto,"Kansai":t.kansai,"Solo":t._Solo,"Couple":t._Couple,"Family":t._Family,"Group":t._Group,"Hotel":t._Hotel,"Apart":t._Apart,"No Rank":t._NoRank,"Regular":t._Regular,"Gold":t._Gold,"Platinum":t._Platinum};if(m[v])return m[v];if(lang==="ja"){const cm={"Couple (1M+1F)":"カップル(1M+1F)","Duo (Male)":"男性ペア","Duo (Female)":"女性ペア","Family (1 child)":"ファミリー(子1)","Family (2 children)":"ファミリー(子2)","Family (3+ children)":"ファミリー(子3+)","Group (All Male)":"グループ(全男性)","Group (All Female)":"グループ(全女性)","Group (Mixed)":"グループ(混合)","Overall":"全体","Japanese":"日本","Japan":"日本","United States":"アメリカ","Canada":"カナダ","Taiwan":"台湾","Australia":"オーストラリア","Hong Kong":"香港","Singapore":"シンガポール","South Korea":"韓国","Indonesia":"インドネシア","Thailand":"タイ","Malaysia":"マレーシア","UK":"英国","Philippines":"フィリピン","France":"フランス","China":"中国","New Zealand":"ニュージーランド","India":"インド","Germany":"ドイツ","Spain":"スペイン","Mexico":"メキシコ","Brazil":"ブラジル","Italy":"イタリア","Ireland":"アイルランド","Switzerland":"スイス","Israel":"イスラエル","UAE":"UAE","Chile":"チリ","Argentina":"アルゼンチン","Netherlands":"オランダ","Denmark":"デンマーク","Austria":"オーストリア","Brunei":"ブルネイ","Finland":"フィンランド","Poland":"ポーランド","Norway":"ノルウェー","Russia":"ロシア","Belgium":"ベルギー","Sweden":"スウェーデン","Vietnam":"ベトナム","Unknown":"不明","Other":"その他","International (EN)":"海外(英語)","Taiwan/HK (ZH)":"台湾/香港(中文)"};if(cm[v])return cm[v]}return v};
  const[isMobile,setIsMobile]=useState(()=>typeof window!=="undefined"&&window.innerWidth<768);
  useEffect(()=>{let raf=0;const h=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;const m=window.innerWidth<768;setIsMobile(p=>p===m?p:m)})};window.addEventListener("resize",h);return()=>{window.removeEventListener("resize",h);if(raf)cancelAnimationFrame(raf)}},[]);
  const[allData,setAllData]=useState([]);const[allH,setAllH]=useState([]);const[fL,setFL]=useState([]);const[errs,setErrs]=useState([]);const[proc,setProc]=useState(false);
  const[fR,setFR]=useState("All");const[fC,setFC]=useState([]);const[fDT,setFDT]=useState("booking");const[fDF,setFDF]=useState("");const[fDTo,setFDTo]=useState("");const[fS,setFS]=useState([]);const[fP,setFP]=useState([]);
  const[fCancel,setFCancel]=useState("all"); // "confirmed" | "cancelled" | "all"
  const[fHType,setFHType]=useState("All"); // "All" | "Hotel" | "Apart"
  const[fBrands,setFBrands]=useState([]);
const[fGeo,setFGeo]=useState([]);
const[segDetailed,setSegDetailed]=useState(false);
const[fDOW,setFDOW]=useState([]);
  const[tab,setTab]=useState("overview");const[tSort,setTSort]=useState({col:null,asc:true});const[tPage,setTPage]=useState(0);const PG=50;
  const[filtersOpen,setFiltersOpen]=useState(true);
const[presets,setPresets]=useState(()=>{try{return JSON.parse(localStorage.getItem("monday_presets"))||[]}catch{return[]}});
const[presetMsg,setPresetMsg]=useState("");
const[activePreset,setActivePreset]=useState(null);
const savePreset=name=>{
  if(!name.trim())return;
  const p={name:name.trim(),filters:{fCancel,fHType,fBrands,fR,fC,fS,fP,fGeo,fDT,fDF,fDTo,monthMode},saved:new Date().toISOString()};
  const updated=[...presets.filter(x=>x.name!==p.name),p];
  setPresets(updated);localStorage.setItem("monday_presets",JSON.stringify(updated));
  setPresetMsg(t.presetSaved);setTimeout(()=>setPresetMsg(""),2000);
};
const loadPreset=p=>{
  const f=p.filters;
  setFCancel(f.fCancel||"all");setFHType(f.fHType||"All");setFBrands(f.fBrands||[]);
  setFR(f.fR||"All");setFC(f.fC||[]);setFS(f.fS||[]);setFP(f.fP||[]);setFGeo(f.fGeo||[]);
  setFDT(f.fDT||"booking");setFDF(f.fDF||"");setFDTo(f.fDTo||"");setMonthMode(f.monthMode||"booking");
  setActivePreset(p.name);
};
const deletePreset=name=>{
  const updated=presets.filter(p=>p.name!==name);
  setPresets(updated);localStorage.setItem("monday_presets",JSON.stringify(updated));
};
  const[drFrom,setDrFrom]=useState("");const[drTo,setDrTo]=useState("");
const[cmpA,setCmpA]=useState({from:"",to:""});const[cmpB,setCmpB]=useState({from:"",to:""});
const[paceMetric,setPaceMetric]=useState("count");
const[drSingle,setDrSingle]=useState("");
  const[monthMode,setMonthMode]=useState("booking"); // "stay" or "booking"
  const getM=r=>monthMode==="stay"?tzFmt(r.checkin,"month"):tzFmt(r.bookingDate,"month");
  const[sheetStatus,setSheetStatus]=useState("idle"); // "idle"|"loading"|"done"|"error"
  const[tlData,setTlData]=useState([]);
  const[tlStatus,setTlStatus]=useState("idle"); // "idle"|"loading"|"done"|"error"
  const[fChannelBucket,setFChannelBucket]=useState([]); // ["ota","rta","direct"] subset
  const[fTlChannelName,setFTlChannelName]=useState([]); // full OTA-level filter
  const[fTlStatus,setFTlStatus]=useState("net"); // "net"|"all"|"cancelled"|"modified"
  const[tlGroupBy,setTlGroupBy]=useState("day"); // "day"|"month"
  const[tlMetric,setTlMetric]=useState("revenue"); // "revenue"|"bookings"
  const[tlCoverage,setTlCoverage]=useState(null); // {coverage,rowsWithCountry,totalRows}
  const[lastFetchTs,setLastFetchTs]=useState(null);

  // ─── Reusable YYB fetch ───
  const fetchYYB=useCallback((useCache=true)=>{
    setSheetStatus("loading");
    const CACHE_KEY="monday_csv_cache",CACHE_TTL=5*60*1000;
    const parseAndSet=(text,fromCache)=>{
      const res=Papa.parse(text,{header:false,skipEmptyLines:true});
      if(!res.data||res.data.length<2){setSheetStatus("error");return false}
      const h=res.data[0];
      const miss=REQUIRED_COLS.filter(c=>!h.includes(c));
      if(miss.length){setSheetStatus("error");return false}
      const rows=res.data.slice(1).filter(r=>r.length>=10&&r[0]);
      const processed=applyEmailIntlOverride(rows.map(r=>processRow(r,h)));
      setAllH(h);setAllData(processed);
      setFL([{name:"Google Sheets (live)"+(fromCache?" (cached)":""),rows:rows.length,encoding:"UTF-8"}]);
      setSheetStatus("done");
      return true;
    };
    if(useCache){try{const c=localStorage.getItem(CACHE_KEY);if(c){const{ts,text}=JSON.parse(c);if(Date.now()-ts<CACHE_TTL&&parseAndSet(text,true))return}}catch{}}
    fetch(GSHEET_CSV_URL)
      .then(r=>{if(!r.ok)throw new Error(r.status);return r.text()})
      .then(text=>{if(parseAndSet(text,false)){try{localStorage.setItem(CACHE_KEY,JSON.stringify({ts:Date.now(),text}))}catch{}}})
      .catch(()=>setSheetStatus("error"));
  },[]);

  // ─── Reusable TL fetch (multi-year, per-year defensive) ───
  const fetchTL=useCallback((useCache=true)=>{
    setTlStatus("loading");
    const CACHE_TTL=5*60*1000;
    const years=Object.keys(TL_GSHEET_CSV_URLS);
    const parseYear=(text,yr)=>{
      try{
        const res=Papa.parse(text,{header:false,skipEmptyLines:true});
        if(!res.data||res.data.length<2){console.warn(`[TL ${yr}] empty CSV`);return null}
        const h=res.data[0];
        const miss=TL_REQUIRED_COLS.filter(c=>!h.includes(c));
        if(miss.length){console.warn(`[TL ${yr}] missing cols:`,miss);return null}
        const hIdx={};h.forEach((c,i)=>{hIdx[c]=i});
        const rows=[];
        for(let i=1;i<res.data.length;i++){
          try{const row=parseTLRow(res.data[i],hIdx);if(row)rows.push(row)}
          catch(e){console.warn(`[TL ${yr}] row ${i} parse error:`,e.message)}
        }
        return rows;
      }catch(e){console.error(`[TL ${yr}] parse failed:`,e);return null}
    };
    const finalize=(rows)=>{
      applyTLSameDayCancel(rows);
      setTlData(rows);setTlStatus("done");
    };
    // Per-year independent fetch — one bad year doesn't kill the rest
    const fetchOneYear=(yr)=>{
      // Try cache first
      if(useCache){
        try{
          const c=localStorage.getItem("monday_tl_csv_cache_"+yr);
          if(c){
            const{ts,text}=JSON.parse(c);
            if(Date.now()-ts<CACHE_TTL){const parsed=parseYear(text,yr);if(parsed&&parsed.length)return Promise.resolve({yr,rows:parsed,fromCache:true})}
          }
        }catch(e){console.warn(`[TL ${yr}] cache read failed:`,e)}
      }
      return fetch(TL_GSHEET_CSV_URLS[yr])
        .then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.text()})
        .then(text=>{
          const parsed=parseYear(text,yr);
          if(parsed&&parsed.length){
            try{localStorage.setItem("monday_tl_csv_cache_"+yr,JSON.stringify({ts:Date.now(),text}))}catch(e){console.warn(`[TL ${yr}] cache write failed (likely quota):`,e.message)}
            return{yr,rows:parsed,fromCache:false};
          }
          return{yr,rows:[],fromCache:false};
        })
        .catch(e=>{console.error(`[TL ${yr}] fetch failed:`,e);return{yr,rows:[],error:e.message}});
    };
    Promise.all(years.map(fetchOneYear))
      .then(batch=>{
        const all=[];const errors=[];
        batch.forEach(b=>{if(b.rows.length){for(let i=0;i<b.rows.length;i++)all.push(b.rows[i])}if(b.error)errors.push(b.yr+": "+b.error)});
        if(!all.length){console.error("[TL] all years failed:",errors);setTlStatus("error");return}
        if(errors.length)console.warn("[TL] partial load (some years failed):",errors);
        console.log(`[TL] loaded ${all.length} rows across ${batch.filter(b=>b.rows.length).length}/${years.length} years`);
        finalize(all);
      });
  },[]);

  // Manual refresh: clear caches, refetch both, regardless of file uploads
  const refreshAllData=useCallback(()=>{
    try{
      localStorage.removeItem("monday_csv_cache");
      Object.keys(TL_GSHEET_CSV_URLS).forEach(yr=>localStorage.removeItem("monday_tl_csv_cache_"+yr));
      localStorage.removeItem("monday_tl_csv_cache"); // legacy v1 key
    }catch{}
    fetchYYB(false);
    fetchTL(false);
    setLastFetchTs(Date.now());
  },[fetchYYB,fetchTL]);

  // ─── Auto-fetch on mount ───
  useEffect(()=>{
    if(allData.length===0)fetchYYB(true);
    fetchTL(true);
    setLastFetchTs(Date.now());
  },[]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Enrich TL rows with country info once BOTH yyb + tl data are loaded ───
  useEffect(()=>{
    if(tlData.length&&allData.length){
      const cov=applyTLEmailCountry(tlData,allData);
      setTlCoverage(cov);
    }
  },[tlData,allData]);

  const handleFiles=useCallback(e=>{const files=Array.from(e.target?.files||e.dataTransfer?.files||[]);if(!files.length)return;setProc(true);setErrs([]);const errors=[];let nd=[...allData],bH=allH.length?allH:null,done=0;const nFL=[...fL];files.forEach(file=>{const r=new FileReader();r.onload=ev=>{const{text,encoding}=decodeBuffer(ev.target.result);const res=Papa.parse(text,{header:false,skipEmptyLines:true});if(!res.data||res.data.length<2){errors.push(`${file.name}: Empty`);done++;if(done===files.length){setErrs(errors);setProc(false)}return}const h=res.data[0];const miss=REQUIRED_COLS.filter(c=>!h.includes(c));if(miss.length){errors.push(`${file.name}: Missing — ${miss.slice(0,3).join(", ")}${miss.length>3?` (+${miss.length-3})`:""}`);done++;if(done===files.length){setErrs(errors);setProc(false)}return}if(!bH){bH=h;setAllH(h)}const rows=res.data.slice(1).filter(r=>r.length>=10&&r[0]);nd=[...nd,...rows.map(r=>processRow(r,h))];nFL.push({name:file.name,rows:rows.length,encoding});done++;if(done===files.length){setAllData(applyEmailIntlOverride(nd));setFL(nFL);setAllH(bH);setErrs(errors);setProc(false)}};r.readAsArrayBuffer(file)});},[allData,allH,fL]);

  const clearAll=()=>{setAllData([]);setAllH([]);setFL([]);setErrs([]);setFR("All");setFC([]);setFDF("");setFDTo("");setFS([]);setFP([]);setFCancel("all");setFHType("All");setFBrands([]);setFGeo([]);setFDOW([])};

  const filtered=useMemo(()=>{
    const fCSet=fC.length?new Set(fC):null,fSSet=fS.length?new Set(fS):null,fPSet=fP.length?new Set(fP):null,fBSet=fBrands.length?new Set(fBrands):null,fGSet=fGeo.length?new Set(fGeo):null,fDSet=fDOW.length?new Set(fDOW):null;
    const from=fDF?new Date(fDF):null,to=fDTo?new Date(fDTo+"T23:59:59"):null;
    const dateField=fDT==="checkin"?"checkin":fDT==="checkout"?"checkout":"bookingDate";
    const out=[];
    for(let i=0;i<allData.length;i++){const r=allData[i];
      if(fCancel==="confirmed"&&r.isCancelled)continue;
      if(fCancel==="cancelled"&&!r.isCancelled)continue;
      if(fHType!=="All"&&r.hotelType!==fHType)continue;
      if(fBSet&&!fBSet.has(r.brand))continue;
      if(fR!=="All"&&r.region!==fR)continue;
      if(fCSet&&!fCSet.has(r.country))continue;
      if(fSSet&&!fSSet.has(r.segment))continue;
      if(fPSet&&!fPSet.has(r.facility))continue;
      if(fGSet&&!fGSet.has(GEO_REGION(r.country)))continue;
      if(fDSet&&!fDSet.has(r.checkinDow))continue;
      if(from||to){const dt=r[dateField];if(!dt)continue;if(from&&dt<from)continue;if(to&&dt>to)continue}
      out.push(r);
    }
    return out;
  },[allData,fR,fC,fS,fP,fDT,fDF,fDTo,fCancel,fHType,fBrands,fGeo,fDOW]);

  const uTlFac=useMemo(()=>[...new Set(tlData.map(r=>r.facility))].sort(),[tlData]);
  const uTlChannelName=useMemo(()=>[...new Set(tlData.map(r=>r.channel_name).filter(Boolean))].sort(),[tlData]);
  const uC=useMemo(()=>[...new Set(allData.map(r=>r.country))].sort(),[allData]);
  const uP=useMemo(()=>[...new Set(allData.map(r=>r.facility))].sort(),[allData]);
  const uS=useMemo(()=>[...new Set(allData.map(r=>r.segment))].filter(s=>s!=="Unknown").sort(),[allData]);
  const uB=useMemo(()=>[...new Set(allData.map(r=>r.brand))].sort(),[allData]);
const uGeo=useMemo(()=>[...new Set(allData.map(r=>GEO_REGION(r.country)))].sort(),[allData]);
const uDOW=useMemo(()=>DOW_FULL,[]);

  // ─── AGGREGATIONS ───
  const agg=useMemo(()=>{
    if(!filtered.length)return null;const d=filtered,n=d.length;
    const byR={},byC={},byS={},byM={},byF={},byD={},byRm={};
    // For KvK: region×country, region×segment, region×month, region×segLOS, region×DOW, region×room, region×rank, region×device
    const rC={Kanto:{},Kansai:{}},rS={Kanto:{},Kansai:{}},rM={Kanto:{},Kansai:{}};
    const rSL={Kanto:{},Kansai:{}},rDow={Kanto:{},Kansai:{}},rRoom={Kanto:{},Kansai:{}},rRank={Kanto:{},Kansai:{}},rDev={Kanto:{},Kansai:{}};
    // country×segment for stacked % chart
    const cS={};
    // country LOS
    const cLOS={};
    // Lead by seg (avg+med)
    const segLead={};
    // Lead by month
    const mLead={};
    // ADR by seg
    const segADR={};
    // Rev by seg×region
    const rSR={Kanto:{},Kansai:{}};
    // Rank by country
    const rkC={};

    const init=()=>({n:0,rev:0,nights:[],lead:[]});
    d.forEach(r=>{
      // Core
      [byR,byC,byS].forEach((s,i)=>{const k=[r.region,r.country,r.segment][i];if(!s[k])s[k]=init();s[k].n++;s[k].rev+=r.totalRev;if(r.nights)s[k].nights.push(r.nights);if(r.leadTime!=null)s[k].lead.push(r.leadTime)});
      if(getM(r)){const mm=getM(r);if(!byM[mm])byM[mm]={n:0,rev:0};byM[mm].n++;byM[mm].rev+=r.totalRev}
      if(!byF[r.facility])byF[r.facility]={n:0,rev:0,intl:0,nights:[],region:r.region,segs:{}};byF[r.facility].n++;byF[r.facility].rev+=r.totalRev;if(r.country!=="Japan")byF[r.facility].intl++;if(r.nights)byF[r.facility].nights.push(r.nights);byF[r.facility].segs[r.segment]=(byF[r.facility].segs[r.segment]||0)+1;
      if(r.checkinDow){if(!byD[r.checkinDow])byD[r.checkinDow]={ci:0,co:0};byD[r.checkinDow].ci++}
      if(r.checkoutDow){if(!byD[r.checkoutDow])byD[r.checkoutDow]={ci:0,co:0};byD[r.checkoutDow].co++}
      if(!byRm[r.roomSimple])byRm[r.roomSimple]=0;byRm[r.roomSimple]++;

      // KvK region breakdowns
      const reg=r.region;
      rC[reg][r.country]=(rC[reg][r.country]||0)+1;
      rS[reg][r.segment]=(rS[reg][r.segment]||0)+1;
      if(getM(r)){rM[reg][getM(r)]=(rM[reg][getM(r)]||0)+1}
      if(!rSL[reg][r.segment])rSL[reg][r.segment]=[];if(r.nights)rSL[reg][r.segment].push(r.nights);
      if(r.checkinDow){rDow[reg][r.checkinDow+"_ci"]=(rDow[reg][r.checkinDow+"_ci"]||0)+1}
      if(r.checkoutDow){rDow[reg][r.checkoutDow+"_co"]=(rDow[reg][r.checkoutDow+"_co"]||0)+1}
      rRoom[reg][r.roomSimple]=(rRoom[reg][r.roomSimple]||0)+1;
      rRank[reg][r.rank]=(rRank[reg][r.rank]||0)+1;
      rDev[reg][r.device]=(rDev[reg][r.device]||0)+1;

      // Country×Segment
      if(!cS[r.country])cS[r.country]={};cS[r.country][r.segment]=(cS[r.country][r.segment]||0)+1;
      // Country LOS
      if(!cLOS[r.country])cLOS[r.country]=[];if(r.nights)cLOS[r.country].push(r.nights);
      // Lead by seg
      if(!segLead[r.segment])segLead[r.segment]=[];if(r.leadTime!=null)segLead[r.segment].push(r.leadTime);
      // Lead by month
      if(getM(r)){const mm=getM(r);if(!mLead[mm])mLead[mm]=[];if(r.leadTime!=null)mLead[mm].push(r.leadTime)}
      // ADR by seg
      if(r.nights&&r.nights>0&&r.totalRev>0){if(!segADR[r.segment])segADR[r.segment]=[];segADR[r.segment].push(r.totalRev/r.nights)}
      // Rev by seg×region
      if(!rSR[reg][r.segment])rSR[reg][r.segment]=[];rSR[reg][r.segment].push(r.totalRev);
      // Rank by country
      if(!rkC[r.country])rkC[r.country]={};rkC[r.country][r.rank]=(rkC[r.country][r.rank]||0)+1;
    });

    const totRev=d.reduce((a,r)=>a+r.totalRev,0);const intlN=d.filter(r=>r.country!=="Japan").length;
    return{n,totalRev:totRev,avgRev:n>0?totRev/n:0,avgNights:avg(d.filter(r=>r.nights).map(r=>r.nights)),avgLead:avg(d.filter(r=>r.leadTime!=null).map(r=>r.leadTime)),intlPct:n>0?(intlN/n)*100:0,byR,byC,byS,byM,byF,byD,byRm,rC,rS,rM,rSL,rDow,rRoom,rRank,rDev,cS,cLOS,segLead,mLead,segADR,rSR,rkC};
  },[filtered,monthMode,tz]);

  // ─── CHART DATA ───
  const mktD=useMemo(()=>!agg?[]:Object.entries(agg.byC).sort((a,b)=>b[1].n-a[1].n).slice(0,15).map(([c,v])=>({country:c,count:v.n,avgRev:Math.round(v.rev/v.n)})),[agg]);
  const segD=useMemo(()=>!agg?[]:SEG_ORDER.filter(s=>agg.byS[s]).map(s=>({segment:s,count:agg.byS[s].n,avgRev:Math.round(agg.byS[s].rev/agg.byS[s].n),avgLOS:+(avg(agg.byS[s].nights)).toFixed(2),avgLead:+(avg(agg.byS[s].lead)).toFixed(1)})),[agg]);
  // Detailed segment breakdown computed directly from filtered (not in agg)
  const segDetailedD=useMemo(()=>{
    if(!filtered.length)return[];
    const byS={};
    filtered.forEach(r=>{const s=r.segmentDetailed||"Unknown";if(!byS[s])byS[s]={count:0,rev:0,nights:[],lead:[]};byS[s].count++;byS[s].rev+=r.totalRev||0;if(r.nights)byS[s].nights.push(r.nights);if(r.leadTime!=null)byS[s].lead.push(r.leadTime)});
    return SEG_ORDER_DETAILED.filter(s=>byS[s]).map(s=>({segment:s,count:byS[s].count,avgRev:Math.round(byS[s].rev/byS[s].count),avgLOS:+(avg(byS[s].nights)).toFixed(2),avgLead:+(avg(byS[s].lead)).toFixed(1)}));
  },[filtered]);

  // Detailed versions of seg-by-month, seg-by-country, lead-by-seg, ADR-by-seg
  const segDetailedExtras=useMemo(()=>{
    if(!filtered.length)return{segMo:[],segCountry:[],leadSeg:[],adrSeg:[],activeSegs:[]};
    // Find active detailed segments (those with at least 1 booking)
    const activeSet=new Set();
    filtered.forEach(r=>{if(r.segmentDetailed)activeSet.add(r.segmentDetailed)});
    const activeSegs=SEG_ORDER_DETAILED.filter(s=>activeSet.has(s));

    // Seg by month (stacked)
    const monthsSet=new Set();filtered.forEach(r=>{const m=getM(r);if(m)monthsSet.add(m)});
    const months=[...monthsSet].sort();
    const segMo=months.map(m=>{const row={month:m};filtered.filter(r=>getM(r)===m).forEach(r=>{const s=r.segmentDetailed||"Unknown";row[s]=(row[s]||0)+1});return row});

    // Seg by country (% by top 12 countries)
    const byCountryCount={};filtered.forEach(r=>{byCountryCount[r.country]=(byCountryCount[r.country]||0)+1});
    const topCforSeg=Object.entries(byCountryCount).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([c])=>c);
    const cS={};filtered.forEach(r=>{if(!cS[r.country])cS[r.country]={};const s=r.segmentDetailed||"Unknown";cS[r.country][s]=(cS[r.country][s]||0)+1});
    const segCountry=topCforSeg.map(c=>{const segs=cS[c]||{};const tot=Object.values(segs).reduce((a,b)=>a+b,0);const row={country:c};activeSegs.forEach(s=>{row[s]=tot>0?Math.round(100*(segs[s]||0)/tot):0});return row});

    // Lead time by detailed segment (avg + median)
    const segLead={};filtered.forEach(r=>{if(r.leadTime==null)return;const s=r.segmentDetailed||"Unknown";if(!segLead[s])segLead[s]=[];segLead[s].push(r.leadTime)});
    const leadSeg=activeSegs.filter(s=>segLead[s]&&segLead[s].length).map(s=>({segment:s,avg:+avg(segLead[s]).toFixed(1),median:+med(segLead[s]).toFixed(1)}));

    // ADR by detailed segment
    const segADR={};filtered.forEach(r=>{if(!r.nights||r.nights<=0||!r.totalRev)return;const s=r.segmentDetailed||"Unknown";if(!segADR[s])segADR[s]=[];segADR[s].push(r.totalRev/r.nights)});
    const adrSeg=activeSegs.filter(s=>segADR[s]&&segADR[s].length).map(s=>({segment:s,adr:Math.round(avg(segADR[s]))}));

    return{segMo,segCountry,leadSeg,adrSeg,activeSegs};
  },[filtered,monthMode,tz]);
  const moD=useMemo(()=>!agg?[]:Object.entries(agg.byM).sort((a,b)=>a[0].localeCompare(b[0])).map(([m,v])=>({month:m,count:v.n,rev:v.rev,avgRev:Math.round(v.rev/v.n)})),[agg]);
  const dowD=useMemo(()=>!agg?[]:DOW_FULL.map((d,i)=>({day:dL[i],checkin:agg.byD[d]?.ci||0,checkout:agg.byD[d]?.co||0})),[agg,dL]);
  // Helper: get the selected date field for a reservation
  const getDateField=r=>fDT==="checkin"?r.checkin:fDT==="checkout"?r.checkout:r.bookingDate;
  const getDowField=r=>{const dt=getDateField(r);if(!dt)return null;return DOW_FULL[(dt.getDay()+6)%7]};
  // Revenue by DOW
  const revDowD=useMemo(()=>{
    if(!filtered.length)return[];
    const byDow={};
    filtered.forEach(r=>{const dow=getDowField(r);if(dow)byDow[dow]=(byDow[dow]||0)+(r.totalRev||0)});
    return DOW_FULL.map((d,i)=>({day:dL[i],rev:byDow[d]||0}));
  },[filtered,dL,fDT]);
  // Revenue by DOW by month (line chart: X=DOW, one line per month)
  const revDowMonthD=useMemo(()=>{
    if(!filtered.length)return{data:[],months:[]};
    const byMonthDow={};
    filtered.forEach(r=>{const m=getM(r);const dow=getDowField(r);if(!m||!dow)return;if(!byMonthDow[m])byMonthDow[m]={};byMonthDow[m][dow]=(byMonthDow[m][dow]||0)+(r.totalRev||0)});
    const months=Object.keys(byMonthDow).sort();
    const data=DOW_FULL.map((d,i)=>{const row={day:dL[i]};months.forEach(m=>{row[m]=byMonthDow[m]?.[d]||0});return row});
    return{data,months};
  },[filtered,monthMode,tz,dL,fDT]);
  const monthDowD=useMemo(()=>{
    if(!filtered.length)return{data:[],months:[],ciData:[],coData:[]};
    // Group by month × day-of-week
    const byMonthDow={};
    filtered.forEach(r=>{
      const m=getM(r);if(!m)return;
      if(!byMonthDow[m])byMonthDow[m]={};
      const ciDow=r.checkinDow;if(ciDow){byMonthDow[m][ciDow+"_ci"]=(byMonthDow[m][ciDow+"_ci"]||0)+1}
      const coDow=r.checkoutDow;if(coDow){byMonthDow[m][coDow+"_co"]=(byMonthDow[m][coDow+"_co"]||0)+1}
    });
    const months=Object.keys(byMonthDow).sort();
    // Check-in data: X=day of week, one line per month
    const ciData=DOW_FULL.map((d,i)=>{const row={day:dL[i]};months.forEach(m=>{row[m]=byMonthDow[m]?.[d+"_ci"]||0});return row});
    const coData=DOW_FULL.map((d,i)=>{const row={day:dL[i]};months.forEach(m=>{row[m]=byMonthDow[m]?.[d+"_co"]||0});return row});
    return{months,ciData,coData};
  },[filtered,monthMode,tz,dL]);
  const rmD=useMemo(()=>!agg?[]:Object.entries(agg.byRm).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([r,c])=>({room:r,count:c})),[agg]);
  const facD=useMemo(()=>!agg?[]:Object.entries(agg.byF).sort((a,b)=>b[1].n-a[1].n).map(([nm,f])=>({name:shortFac(nm),fullName:nm,region:f.region,n:f.n,avgRev:f.n>0?Math.round(f.rev/f.n):0,intlPct:f.n>0?+((f.intl/f.n)*100).toFixed(1):0,avgLOS:f.nights.length?+(avg(f.nights)).toFixed(1):0,topSeg:Object.entries(f.segs).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—"})),[agg]);

  // Daily aggregation
  const dailyD=useMemo(()=>{
    if(!filtered.length)return[];
    const byDate={};
    filtered.forEach(r=>{const dt=tzFmt(getDateField(r));if(!dt)return;if(!byDate[dt])byDate[dt]={date:dt,rev:0,count:0};byDate[dt].rev+=r.totalRev||0;byDate[dt].count++});
    return Object.values(byDate).sort((a,b)=>a.date.localeCompare(b.date));
  },[filtered,tz,fDT]);

  // Country LOS and Lead for Country Overview tab
  const mktLOS=useMemo(()=>!agg?[]:Object.entries(agg.byC).filter(([,v])=>v.nights.length>=5).sort((a,b)=>b[1].n-a[1].n).slice(0,15).map(([c,v])=>({country:c,avgLOS:+avg(v.nights).toFixed(2)})),[agg]);
  const mktLead=useMemo(()=>!agg?[]:Object.entries(agg.byC).filter(([,v])=>v.lead.length>=5).sort((a,b)=>b[1].n-a[1].n).slice(0,15).map(([c,v])=>({country:c,avgLead:+avg(v.lead).toFixed(1)})),[agg]);

  // Revenue by market by month (stacked)
  const revMktMo=useMemo(()=>{
    if(!filtered.length||!agg)return{data:[],countries:[]};
    const months=[...new Set(filtered.map(r=>getM(r)).filter(Boolean))].sort();
    const topN=Object.entries(agg.byC).sort((a,b)=>b[1].rev-a[1].rev).slice(0,8).map(([c])=>c);
    const data=months.map(m=>{const row={month:m};filtered.filter(r=>getM(r)===m).forEach(r=>{const c=topN.includes(r.country)?r.country:"Other";row[c]=(row[c]||0)+(r.totalRev||0)});return row});
    return{data,countries:[...topN,"Other"]};
  },[filtered,agg]);

  // Facility comparisons: Kanto vs Kansai, Hotel vs Apart
  const kvkFac=useMemo(()=>{
    if(!filtered.length)return[];
    const calc=fn=>{const d=filtered.filter(fn);return{n:d.length,avgRev:d.length?Math.round(d.reduce((a,r)=>a+(r.totalRev||0),0)/d.length):0,intlPct:d.length?+((d.filter(r=>r.country!=="Japan").length/d.length)*100).toFixed(1):0,avgLOS:d.length?+(avg(d.filter(r=>r.nights).map(r=>r.nights))).toFixed(2):0}};
    const k=calc(r=>r.region==="Kanto"),s=calc(r=>r.region==="Kansai");
    return[{metric:t.reservations,Kanto:k.n,Kansai:s.n},{metric:t.avgRevRes,Kanto:k.avgRev,Kansai:s.avgRev},{metric:t.intlPct,Kanto:k.intlPct,Kansai:s.intlPct},{metric:t.avgLOS,Kanto:k.avgLOS,Kansai:s.avgLOS}];
  },[filtered,t]);

  const hvaFac=useMemo(()=>{
    if(!filtered.length)return[];
    const calc=fn=>{const d=filtered.filter(fn);return{n:d.length,avgRev:d.length?Math.round(d.reduce((a,r)=>a+(r.totalRev||0),0)/d.length):0,intlPct:d.length?+((d.filter(r=>r.country!=="Japan").length/d.length)*100).toFixed(1):0,avgLOS:d.length?+(avg(d.filter(r=>r.nights).map(r=>r.nights))).toFixed(2):0}};
    const h=calc(r=>r.hotelType==="Hotel"),a2=calc(r=>r.hotelType==="Apart");
    return[{metric:t.reservations,Hotel:h.n,Apart:a2.n},{metric:t.avgRevRes,Hotel:h.avgRev,Apart:a2.avgRev},{metric:t.intlPct,Hotel:h.intlPct,Apart:a2.intlPct},{metric:t.avgLOS,Hotel:h.avgLOS,Apart:a2.avgLOS}];
  },[filtered,t]);

  // ─── KVK CHART DATA ───
  const kvk=useMemo(()=>{
    if(tab!=="kvk"||!agg)return null;
    // Market bars per region (excl Japan)
    const mkR=reg=>Object.entries(agg.rC[reg]||{}).filter(([c])=>c!=="Japan").sort((a,b)=>b[1]-a[1]).slice(0,10).map(([c,n])=>({country:c,count:n}));
    // Monthly stacked by top countries
    const months=Object.keys(agg.byM).sort();
    const topC=[...new Set(Object.entries(agg.byC).sort((a,b)=>b[1].n-a[1].n).slice(0,8).map(([c])=>c))];
    const mktMo=months.map(m=>{const row={month:m};filtered.filter(r=>getM(r)===m).forEach(r=>{const c=topC.includes(r.country)?r.country:"Other";row[c]=(row[c]||0)+1});return row});
    // Seg by region
    const segReg=SEG_ORDER.map(s=>({segment:s,Kanto:agg.rS.Kanto[s]||0,Kansai:agg.rS.Kansai[s]||0}));
    // Seg by month stacked
    const segMo=months.map(m=>{const row={month:m};filtered.filter(r=>getM(r)===m).forEach(r=>{row[r.segment]=(row[r.segment]||0)+1});return row});
    // Seg by country %
    const topCforSeg=Object.entries(agg.byC).sort((a,b)=>b[1].n-a[1].n).slice(0,12).map(([c])=>c);
    const segCountry=topCforSeg.map(c=>{const segs=agg.cS[c]||{};const tot=Object.values(segs).reduce((a,b)=>a+b,0);const row={country:c};SEG_ORDER.forEach(s=>{row[s]=tot>0?Math.round(100*(segs[s]||0)/tot):0});return row});
    // LOS by country
    const losC=Object.entries(agg.cLOS).filter(([,a])=>a.length>=5).sort((a,b)=>avg(b[1])-avg(a[1])).slice(0,15).map(([c,a])=>({country:c,avg:+avg(a).toFixed(2),n:a.length}));
    // LOS by seg×region
    const losSR=SEG_ORDER.map(s=>({segment:s,Kanto:agg.rSL.Kanto[s]?+avg(agg.rSL.Kanto[s]).toFixed(2):0,Kansai:agg.rSL.Kansai[s]?+avg(agg.rSL.Kansai[s]).toFixed(2):0}));
    // Lead by seg (avg+med)
    const leadSeg=SEG_ORDER.filter(s=>agg.segLead[s]).map(s=>({segment:s,avg:+avg(agg.segLead[s]).toFixed(1),median:+med(agg.segLead[s]).toFixed(1)}));
    // Lead by month
    const leadMo=months.map(m=>({month:m,avg:agg.mLead[m]?+avg(agg.mLead[m]).toFixed(1):0,median:agg.mLead[m]?+med(agg.mLead[m]).toFixed(1):0}));
    // DOW radar
    const dowCI=DOW_FULL.map((d,i)=>({day:dL[i],Kanto:agg.rDow.Kanto[d+"_ci"]||0,Kansai:(agg.rDow.Kansai[d+"_ci"]||0)*Math.round((agg.rC.Kanto?.Japan||1)/(agg.rC.Kansai?.Japan||1))}));
    const dowCO=DOW_FULL.map((d,i)=>({day:dL[i],Kanto:agg.rDow.Kanto[d+"_co"]||0,Kansai:(agg.rDow.Kansai[d+"_co"]||0)*Math.round((agg.rC.Kanto?.Japan||1)/(agg.rC.Kansai?.Japan||1))}));
    const kantoN=Object.values(agg.rC.Kanto).reduce((a,b)=>a+b,0);const kansaiN=Object.values(agg.rC.Kansai).reduce((a,b)=>a+b,0);
    const scale=kansaiN>0?Math.round(kantoN/kansaiN):1;
    // Device by region
    const devR=["スマートフォン","パソコン","タブレット"].map(d=>({device:d==="スマートフォン"?(lang==="ja"?"スマホ":"Smartphone"):d==="パソコン"?"PC":d==="タブレット"?(lang==="ja"?"タブレット":"Tablet"):"Other",Kanto:agg.rDev.Kanto[d]||0,Kansai:agg.rDev.Kansai[d]||0}));
    // ADR by seg
    const adrSeg=SEG_ORDER.filter(s=>agg.segADR[s]).map(s=>({segment:s,adr:Math.round(avg(agg.segADR[s]))}));
    // Rev by seg×region
    const revSR=SEG_ORDER.map(s=>({segment:s,Kanto:agg.rSR.Kanto[s]?Math.round(avg(agg.rSR.Kanto[s])):0,Kansai:agg.rSR.Kansai[s]?Math.round(avg(agg.rSR.Kansai[s])):0}));
    // Rev by country
    const revC=Object.entries(agg.byC).sort((a,b)=>b[1].n-a[1].n).slice(0,15).map(([c,v])=>({country:c,avgRev:Math.round(v.rev/v.n)}));
    // Room by seg
    const allRoomTypes=[...new Set(SEG_ORDER.flatMap(s=>Object.keys(Object.entries(filtered.reduce((a,r)=>{if(r.segment===s){a[r.roomSimple]=(a[r.roomSimple]||0)+1}return a},{})).sort((a,b)=>b[1]-a[1]).slice(0,8).reduce((o,[k,v])=>({...o,[k]:v}),{}))))];
    const roomSeg=SEG_ORDER.map(s=>{const row={segment:s};filtered.filter(r=>r.segment===s).forEach(r=>{row[r.roomSimple]=(row[r.roomSimple]||0)+1});return row});
    // Room by region
    const allRoomRegion=[...new Set(["Kanto","Kansai"].flatMap(reg=>Object.entries(agg.rRoom[reg]).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k])=>k)))];
    const roomReg=allRoomRegion.map(rm=>({room:rm,Kanto:agg.rRoom.Kanto[rm]||0,Kansai:agg.rRoom.Kansai[rm]||0}));
    // Rank by region
    const rankReg=["Kanto","Kansai"].map(reg=>{const row={region:reg};RANK_ORDER.forEach(rk=>{row[rk]=agg.rRank[reg][rk]||0});return row});
    // Rank by country (top 6)
    const topRkC=Object.entries(agg.byC).sort((a,b)=>b[1].n-a[1].n).slice(0,6).map(([c])=>c);
    const rankC=topRkC.map(c=>{const row={country:c};RANK_ORDER.forEach(rk=>{row[rk]=agg.rkC[c]?.[rk]||0});return row});

    return{mkKanto:mkR("Kanto"),mkKansai:mkR("Kansai"),mktMo,topC,segReg,segMo,segCountry,losC,losSR,leadSeg,leadMo,dowCI,dowCO,scale,devR,adrSeg,revSR,revC,roomSeg,allRoomTypes,roomReg,rankReg,rankC,kantoN,kansaiN};
  },[tab,agg,filtered,dL,lang,tz]);

  // ─── COMPARE TAB ───
  const compareRpt=useMemo(()=>{
    if(tab!=="compare"||!allData.length||!cmpA.from||!cmpB.from)return null;
    const applyFilters=d=>{
      if(fCancel==="confirmed")d=d.filter(r=>!r.isCancelled);
      else if(fCancel==="cancelled")d=d.filter(r=>r.isCancelled);
      if(fHType!=="All")d=d.filter(r=>r.hotelType===fHType);
      if(fBrands.length)d=d.filter(r=>fBrands.includes(r.brand));
      if(fR!=="All")d=d.filter(r=>r.region===fR);
      if(fC.length)d=d.filter(r=>fC.includes(r.country));
      if(fS.length)d=d.filter(r=>fS.includes(r.segment));
      if(fP.length)d=d.filter(r=>fP.includes(r.facility));
      if(fGeo.length)d=d.filter(r=>fGeo.includes(GEO_REGION(r.country)));
      return d;
    };
    const base=applyFilters([...allData]);
    const getDateStr=r=>{const dt=fDT==="checkin"?r.checkin:fDT==="checkout"?r.checkout:r.bookingDate;return tzFmt(dt)};
    const inRange=(r,from,to)=>{const d=getDateStr(r);if(!d)return false;return d>=from&&d<=(to||from)};
    const dataA=base.filter(r=>inRange(r,cmpA.from,cmpA.to||cmpA.from));
    const dataB=base.filter(r=>inRange(r,cmpB.from,cmpB.to||cmpB.from));
    if(!dataA.length&&!dataB.length)return{empty:true};
    const aggregate=data=>{
      let totalRev=0,totalNights=0;
      const byCountry={},bySegment={},byFacility={};
      data.forEach(r=>{
        const rev=r.totalRev||0;totalRev+=rev;totalNights+=r.nights||0;
        if(!byCountry[r.country])byCountry[r.country]={count:0,rev:0};byCountry[r.country].count++;byCountry[r.country].rev+=rev;
        if(!bySegment[r.segment])bySegment[r.segment]={count:0,rev:0};bySegment[r.segment].count++;bySegment[r.segment].rev+=rev;
        if(!byFacility[r.facility])byFacility[r.facility]={count:0,rev:0};byFacility[r.facility].count++;byFacility[r.facility].rev+=rev;
      });
      const adr=totalNights>0?Math.round(totalRev/totalNights):0;
      return{totalCount:data.length,totalRev,totalNights,adr,byCountry,bySegment,byFacility};
    };
    const a=aggregate(dataA),b=aggregate(dataB);
    const pctChg=(cur,prev)=>prev>0?((cur-prev)/prev*100).toFixed(1)+"%":(cur>0?"new":"0%");
    const allCountries=[...new Set([...Object.keys(a.byCountry),...Object.keys(b.byCountry)])];
    const countryRows=allCountries.map(c=>({country:c,countA:a.byCountry[c]?.count||0,revA:a.byCountry[c]?.rev||0,countB:b.byCountry[c]?.count||0,revB:b.byCountry[c]?.rev||0,countDelta:(a.byCountry[c]?.count||0)-(b.byCountry[c]?.count||0),revDelta:(a.byCountry[c]?.rev||0)-(b.byCountry[c]?.rev||0)})).sort((x,y)=>Math.abs(y.revDelta)-Math.abs(x.revDelta));
    const allSegs=[...new Set([...Object.keys(a.bySegment),...Object.keys(b.bySegment)])];
    const segRows=allSegs.map(s=>({segment:s,countA:a.bySegment[s]?.count||0,revA:a.bySegment[s]?.rev||0,countB:b.bySegment[s]?.count||0,revB:b.bySegment[s]?.rev||0,countDelta:(a.bySegment[s]?.count||0)-(b.bySegment[s]?.count||0),revDelta:(a.bySegment[s]?.rev||0)-(b.bySegment[s]?.rev||0)})).sort((x,y)=>Math.abs(y.revDelta)-Math.abs(x.revDelta));
    const allFacs=[...new Set([...Object.keys(a.byFacility),...Object.keys(b.byFacility)])];
    const facRows=allFacs.map(f=>({facility:f,name:shortFac(f),countA:a.byFacility[f]?.count||0,revA:a.byFacility[f]?.rev||0,countB:b.byFacility[f]?.count||0,revB:b.byFacility[f]?.rev||0,countDelta:(a.byFacility[f]?.count||0)-(b.byFacility[f]?.count||0),revDelta:(a.byFacility[f]?.rev||0)-(b.byFacility[f]?.rev||0)})).sort((x,y)=>Math.abs(y.revDelta)-Math.abs(x.revDelta));
    const topC=[...countryRows].sort((x,y)=>y.revA-x.revA).slice(0,10);
    const revChart=topC.map(c=>({country:c.country,A:c.revA,B:c.revB}));
    const countChart=[...countryRows].sort((x,y)=>y.countA-x.countA).slice(0,10).map(c=>({country:c.country,A:c.countA,B:c.countB}));
    const labelA=cmpA.from===cmpA.to||!cmpA.to?fmtDate(cmpA.from):`${fmtDate(cmpA.from)} – ${fmtDate(cmpA.to)}`;
    const labelB=cmpB.from===cmpB.to||!cmpB.to?fmtDate(cmpB.from):`${fmtDate(cmpB.from)} – ${fmtDate(cmpB.to)}`;
    return{a,b,pctChg,countryRows,segRows,facRows,revChart,countChart,labelA,labelB};
  },[tab,allData,cmpA,cmpB,fDT,fCancel,fHType,fBrands,fR,fC,fS,fP,fGeo,tz,tzFmt]);

  // ─── PACE REPORT ───
  const paceRpt=useMemo(()=>{
    if(tab!=="pace"||!allData.length)return null;
    // Apply global filters (same as Compare — all except date range)
    const applyFilters=d=>{
      if(fCancel==="confirmed")d=d.filter(r=>!r.isCancelled);
      else if(fCancel==="cancelled")d=d.filter(r=>r.isCancelled);
      if(fHType!=="All")d=d.filter(r=>r.hotelType===fHType);
      if(fBrands.length)d=d.filter(r=>fBrands.includes(r.brand));
      if(fR!=="All")d=d.filter(r=>r.region===fR);
      if(fC.length)d=d.filter(r=>fC.includes(r.country));
      if(fS.length)d=d.filter(r=>fS.includes(r.segment));
      if(fP.length)d=d.filter(r=>fP.includes(r.facility));
      if(fGeo.length)d=d.filter(r=>fGeo.includes(GEO_REGION(r.country)));
      return d;
    };
    const base=applyFilters([...allData]);
    const getDateStr=r=>{const dt=fDT==="checkin"?r.checkin:fDT==="checkout"?r.checkout:r.bookingDate;return tzFmt(dt)};

    // Current month + past 5 months
    const now=new Date();
    const months=[];
    for(let i=0;i<6;i++){
      const d=new Date(now.getFullYear(),now.getMonth()-i,1);
      months.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"));
    }
    const currentMonth=months[0];
    const todayDay=now.getDate();

    // Group data by month and day-of-month
    const monthData={};
    months.forEach(m=>{monthData[m]={}});
    base.forEach(r=>{
      const ds=getDateStr(r);if(!ds)return;
      const ym=ds.slice(0,7);
      const day=parseInt(ds.slice(8,10));
      if(!monthData[ym])return;
      if(!monthData[ym][day])monthData[ym][day]={count:0,rev:0};
      monthData[ym][day].count++;
      monthData[ym][day].rev+=r.totalRev||0;
    });

    // Build cumulative data for chart: [{day:1, "2026-04":X, "2026-03":Y, ...}, ...]
    const maxDay=31;
    const chartData=[];
    for(let day=1;day<=maxDay;day++){
      const row={day};
      months.forEach(m=>{
        let cumCount=0,cumRev=0;
        for(let d=1;d<=day;d++){
          if(monthData[m][d]){cumCount+=monthData[m][d].count;cumRev+=monthData[m][d].rev}
        }
        // For current month, only show up to today's day
        if(m===currentMonth&&day>todayDay){row[m]=null}
        else{row[m]=paceMetric==="count"?cumCount:cumRev}
      });
      // Skip rows where ALL months are 0 or null
      if(months.some(m=>row[m]>0))chartData.push(row);
      else if(day<=todayDay)chartData.push(row);
    }

    // Month-end totals for summary table
    const summaryRows=months.map(m=>{
      let totalCount=0,totalRev=0;
      Object.values(monthData[m]).forEach(v=>{totalCount+=v.count;totalRev+=v.rev});
      // For current month, also compute "at this point" for last month
      return{month:m,count:totalCount,rev:totalRev};
    });

    // Current month stats at today's day vs last month at same day
    const curAtDay={count:0,rev:0};
    for(let d=1;d<=todayDay;d++){if(monthData[currentMonth]?.[d]){curAtDay.count+=monthData[currentMonth][d].count;curAtDay.rev+=monthData[currentMonth][d].rev}}
    const lastMonth=months[1];
    const lastAtDay={count:0,rev:0};
    if(lastMonth)for(let d=1;d<=todayDay;d++){if(monthData[lastMonth]?.[d]){lastAtDay.count+=monthData[lastMonth][d].count;lastAtDay.rev+=monthData[lastMonth][d].rev}}

    // Projected month-end (linear extrapolation)
    const daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
    const projectedCount=todayDay>0?Math.round(curAtDay.count/todayDay*daysInMonth):0;
    const projectedRev=todayDay>0?Math.round(curAtDay.rev/todayDay*daysInMonth):0;

    return{months,currentMonth,todayDay,chartData,summaryRows,curAtDay,lastAtDay,projectedCount,projectedRev,daysInMonth};
  },[tab,allData,fDT,fCancel,fHType,fBrands,fR,fC,fS,fP,fGeo,tz,tzFmt,paceMetric]);

  // ─── CANCELLATION RATE TRACKER ───
  const cancelRpt=useMemo(()=>{
    if(tab!=="cancellations"||!allData.length)return null;
    // Apply all global filters EXCEPT fCancel (need both confirmed+cancelled)
    let base=[...allData];
    if(fHType!=="All")base=base.filter(r=>r.hotelType===fHType);
    if(fBrands.length)base=base.filter(r=>fBrands.includes(r.brand));
    if(fR!=="All")base=base.filter(r=>r.region===fR);
    if(fC.length)base=base.filter(r=>fC.includes(r.country));
    if(fS.length)base=base.filter(r=>fS.includes(r.segment));
    if(fP.length)base=base.filter(r=>fP.includes(r.facility));
    if(fGeo.length)base=base.filter(r=>fGeo.includes(GEO_REGION(r.country)));
    // Apply date range
    if(fDF||fDTo){const from=fDF?new Date(fDF):null,to=fDTo?new Date(fDTo+"T23:59:59"):null;base=base.filter(r=>{const dt=fDT==="checkin"?r.checkin:fDT==="checkout"?r.checkout:r.bookingDate;if(!dt)return false;if(from&&dt<from)return false;if(to&&dt>to)return false;return true})}
    if(!base.length)return{empty:true};

    const getMonth=r=>getM(r);
    const totalN=base.length;
    const cancelledN=base.filter(r=>r.isCancelled).length;
    const overallRate=totalN>0?+((cancelledN/totalN)*100).toFixed(1):0;
    const lostRev=base.filter(r=>r.isCancelled).reduce((a,r)=>a+(r.totalRev||0),0);
    const totalFee=base.filter(r=>r.isCancelled).reduce((a,r)=>a+(r.cancelFee||0),0);

    // Monthly trend
    const byMonth={};
    base.forEach(r=>{const m=getMonth(r);if(!m)return;if(!byMonth[m])byMonth[m]={total:0,cancelled:0,lostRev:0};byMonth[m].total++;if(r.isCancelled){byMonth[m].cancelled++;byMonth[m].lostRev+=r.totalRev||0}});
    const monthTrend=Object.entries(byMonth).sort((a,b)=>a[0].localeCompare(b[0])).map(([m,v])=>({month:m,total:v.total,cancelled:v.cancelled,rate:v.total>0?+((v.cancelled/v.total)*100).toFixed(1):0,lostRev:v.lostRev}));

    // By country (top 15 by total volume)
    const byCountry={};
    base.forEach(r=>{if(!byCountry[r.country])byCountry[r.country]={total:0,cancelled:0,lostRev:0,cancelFee:0};byCountry[r.country].total++;if(r.isCancelled){byCountry[r.country].cancelled++;byCountry[r.country].lostRev+=r.totalRev||0;byCountry[r.country].cancelFee+=r.cancelFee||0}});
    const countryRows=Object.entries(byCountry).sort((a,b)=>b[1].total-a[1].total).slice(0,15).map(([c,v])=>({country:c,total:v.total,cancelled:v.cancelled,rate:v.total>0?+((v.cancelled/v.total)*100).toFixed(1):0,lostRev:v.lostRev,cancelFee:v.cancelFee}));
    const countryByRate=[...countryRows].sort((a,b)=>b.rate-a.rate);

    // By segment
    const bySeg={};
    base.forEach(r=>{if(!bySeg[r.segment])bySeg[r.segment]={total:0,cancelled:0,lostRev:0};bySeg[r.segment].total++;if(r.isCancelled){bySeg[r.segment].cancelled++;bySeg[r.segment].lostRev+=r.totalRev||0}});
    const segRows=Object.entries(bySeg).sort((a,b)=>b[1].total-a[1].total).map(([s,v])=>({segment:s,total:v.total,cancelled:v.cancelled,rate:v.total>0?+((v.cancelled/v.total)*100).toFixed(1):0,lostRev:v.lostRev}));

    // By facility
    const byFac={};
    base.forEach(r=>{if(!byFac[r.facility])byFac[r.facility]={total:0,cancelled:0,lostRev:0,cancelFee:0};byFac[r.facility].total++;if(r.isCancelled){byFac[r.facility].cancelled++;byFac[r.facility].lostRev+=r.totalRev||0;byFac[r.facility].cancelFee+=r.cancelFee||0}});
    const facRows=Object.entries(byFac).sort((a,b)=>b[1].total-a[1].total).map(([f,v])=>({facility:f,name:shortFac(f),total:v.total,cancelled:v.cancelled,rate:v.total>0?+((v.cancelled/v.total)*100).toFixed(1):0,lostRev:v.lostRev,cancelFee:v.cancelFee}));
    const facByRate=[...facRows].sort((a,b)=>b.rate-a.rate);

    return{totalN,cancelledN,overallRate,lostRev,totalFee,monthTrend,countryRows,countryByRate,segRows,facRows,facByRate};
  },[tab,allData,fDT,fDF,fDTo,fHType,fBrands,fR,fC,fS,fP,fGeo,tz,tzFmt,monthMode]);

  // ─── LOS DISTRIBUTION ───
  const losRpt=useMemo(()=>{
    if(tab!=="los"||!filtered.length)return null;
    const withNights=filtered.filter(r=>r.nights&&r.nights>0);
    if(!withNights.length)return null;

    // Bucket into 1,2,3,4,5,6,7+ nights
    const buckets=[1,2,3,4,5,6,7];
    const bucketLabel=n=>n===7?"7+":String(n);
    const getBucket=n=>n>=7?7:n;

    // Main histogram: stacked by segment
    const histData=buckets.map(b=>{
      const label=bucketLabel(b);
      const row={nights:label};
      let total=0;
      SEG_ORDER.forEach(s=>{
        const count=withNights.filter(r=>getBucket(r.nights)===b&&r.segment===s).length;
        row[s]=count;total+=count;
      });
      row.total=total;
      return row;
    });

    // By segment: avg LOS per segment
    const segLOS=SEG_ORDER.map(s=>{
      const d=withNights.filter(r=>r.segment===s);
      return{segment:s,avgLOS:d.length?+(d.reduce((a,r)=>a+r.nights,0)/d.length).toFixed(2):0,count:d.length};
    }).filter(s=>s.count>0);

    // By country: avg LOS top 15
    const byC={};
    withNights.forEach(r=>{if(!byC[r.country])byC[r.country]={total:0,nights:0};byC[r.country].total++;byC[r.country].nights+=r.nights});
    const countryLOS=Object.entries(byC).sort((a,b)=>b[1].total-a[1].total).slice(0,15).map(([c,v])=>({country:c,avgLOS:+(v.nights/v.total).toFixed(2),count:v.total}));

    // Detail table: per bucket
    const detailRows=buckets.map(b=>{
      const rows=withNights.filter(r=>getBucket(r.nights)===b);
      const count=rows.length;
      const rev=rows.reduce((a,r)=>a+(r.totalRev||0),0);
      const totalNights=rows.reduce((a,r)=>a+r.nights,0);
      return{nights:bucketLabel(b),count,share:withNights.length>0?+((count/withNights.length)*100).toFixed(1):0,avgRevNight:totalNights>0?Math.round(rev/totalNights):0};
    });

    const overallAvg=+(withNights.reduce((a,r)=>a+r.nights,0)/withNights.length).toFixed(2);
    return{histData,segLOS,countryLOS,detailRows,overallAvg,totalWithNights:withNights.length};
  },[tab,filtered,monthMode]);

  // ─── REVPAR ───
  const revparRpt=useMemo(()=>{
    if(tab!=="revpar"||!filtered.length)return null;
    // Only include facilities with known room counts
    const withRooms=filtered.filter(r=>ROOM_INVENTORY[r.facility]);

    // Monthly trend: RevPAR, occupancy, ADR
    const byMonth={};
    withRooms.forEach(r=>{
      const m=getM(r);if(!m)return;
      if(!byMonth[m])byMonth[m]={rev:0,nightsSold:0,facilities:new Set()};
      byMonth[m].rev+=r.totalRev||0;
      byMonth[m].nightsSold+=r.nights||0;
      byMonth[m].facilities.add(r.facility);
    });
    // For each month, calculate available room-nights
    const monthTrend=Object.entries(byMonth).sort((a,b)=>a[0].localeCompare(b[0])).map(([m,v])=>{
      // Days in this month
      const[y2,m2]=m.split("-").map(Number);
      const daysInMonth=new Date(y2,m2,0).getDate();
      // Total rooms across all facilities that had bookings
      const avail=TOTAL_ROOMS*daysInMonth;
      const occ=avail>0?+((v.nightsSold/avail)*100).toFixed(1):0;
      const revpar=avail>0?Math.round(v.rev/avail):0;
      const adr=v.nightsSold>0?Math.round(v.rev/v.nightsSold):0;
      return{month:m,rev:v.rev,nightsSold:v.nightsSold,avail,occ,revpar,adr};
    });

    // By facility
    const byFac={};
    withRooms.forEach(r=>{
      if(!byFac[r.facility])byFac[r.facility]={rev:0,nightsSold:0};
      byFac[r.facility].rev+=r.totalRev||0;
      byFac[r.facility].nightsSold+=r.nights||0;
    });
    // Calculate total days in the filtered period
    const allDates=withRooms.map(r=>tzFmt(getDateField(r))).filter(Boolean).sort();
    const minDate=allDates.length?allDates[0]:null;
    const maxDate=allDates.length?allDates[allDates.length-1]:null;
    const totalDays=minDate&&maxDate?Math.max(1,Math.round((new Date(maxDate)-new Date(minDate))/864e5)+1):1;

    const facRows=Object.entries(byFac).map(([f,v])=>{
      const rooms=ROOM_INVENTORY[f]||0;
      const avail=rooms*totalDays;
      return{
        facility:f,name:shortFac(f),rooms,
        rev:v.rev,nightsSold:v.nightsSold,
        avail,
        occ:avail>0?+((v.nightsSold/avail)*100).toFixed(1):0,
        revpar:avail>0?Math.round(v.rev/avail):0,
        adr:v.nightsSold>0?Math.round(v.rev/v.nightsSold):0,
      };
    }).sort((a,b)=>b.revpar-a.revpar);

    // Overall
    const totalAvail=TOTAL_ROOMS*totalDays;
    const totalRev=withRooms.reduce((a,r)=>a+(r.totalRev||0),0);
    const totalNightsSold=withRooms.reduce((a,r)=>a+(r.nights||0),0);
    const overallRevpar=totalAvail>0?Math.round(totalRev/totalAvail):0;
    const overallOcc=totalAvail>0?+((totalNightsSold/totalAvail)*100).toFixed(1):0;
    const overallAdr=totalNightsSold>0?Math.round(totalRev/totalNightsSold):0;

    // Daily RevPAR trend
    const byDay={};
    withRooms.forEach(r=>{const d=tzFmt(getDateField(r));if(!d)return;if(!byDay[d])byDay[d]={rev:0,nightsSold:0};byDay[d].rev+=r.totalRev||0;byDay[d].nightsSold+=r.nights||0});
    const dailyTrend=Object.entries(byDay).sort((a,b)=>a[0].localeCompare(b[0])).map(([d,v])=>({date:d,revpar:TOTAL_ROOMS>0?Math.round(v.rev/TOTAL_ROOMS):0,occ:TOTAL_ROOMS>0?+((v.nightsSold/TOTAL_ROOMS)*100).toFixed(1):0}));

    return{monthTrend,dailyTrend,facRows,overallRevpar,overallOcc,overallAdr,totalRev,totalNightsSold,totalAvail,totalDays};
  },[tab,filtered,monthMode,tz,tzFmt]);

  // ─── YYB ADR ───
  // YYB has no rooms count per reservation; each row is one booking with totalRev for the whole stay and nights = stay length.
  // Empirically YYB reservations are predominantly single-room (reservations are per-party, not per-room), so ADR = rev / nights.
  const adrRpt=useMemo(()=>{
    if(tab!=="adr"||!filtered.length)return null;
    const byFac={},byCountry={},bySeg={},byRegion={Kanto:{rev:0,nights:0,count:0},Kansai:{rev:0,nights:0,count:0}},byMonth={};
    let totalRev=0,totalNights=0,totalCount=0;
    for(let i=0;i<filtered.length;i++){
      const r=filtered[i];
      const n=r.nights||0;if(n<=0)continue;
      const rev=r.totalRev||0;totalRev+=rev;totalNights+=n;totalCount++;
      if(!byFac[r.facility])byFac[r.facility]={facility:r.facility,name:shortFac(r.facility),rev:0,nights:0,count:0};
      byFac[r.facility].rev+=rev;byFac[r.facility].nights+=n;byFac[r.facility].count++;
      const c=r.country||"Unknown";
      if(!byCountry[c])byCountry[c]={country:c,rev:0,nights:0,count:0};
      byCountry[c].rev+=rev;byCountry[c].nights+=n;byCountry[c].count++;
      if(r.segment&&r.segment!=="Unknown"){
        if(!bySeg[r.segment])bySeg[r.segment]={segment:r.segment,rev:0,nights:0,count:0};
        bySeg[r.segment].rev+=rev;bySeg[r.segment].nights+=n;bySeg[r.segment].count++;
      }
      if(byRegion[r.region]){byRegion[r.region].rev+=rev;byRegion[r.region].nights+=n;byRegion[r.region].count++}
      const mKey=tzFmt(r.bookingDate,"month");
      if(mKey){
        if(!byMonth[mKey])byMonth[mKey]={month:mKey,rev:0,nights:0,count:0};
        byMonth[mKey].rev+=rev;byMonth[mKey].nights+=n;byMonth[mKey].count++;
      }
    }
    const computeAdr=v=>({...v,adr:v.nights>0?Math.round(v.rev/v.nights):0});
    const facRows=Object.values(byFac).map(computeAdr).sort((a,b)=>b.adr-a.adr);
    const countryRows=Object.values(byCountry).filter(v=>v.count>=5).map(computeAdr).sort((a,b)=>b.adr-a.adr).slice(0,15);
    const segRows=SEG_ORDER.filter(s=>bySeg[s]).map(s=>computeAdr(bySeg[s]));
    const regionRows=["Kanto","Kansai"].filter(r=>byRegion[r].count).map(r=>({region:r,...computeAdr(byRegion[r])}));
    const monthRows=Object.values(byMonth).sort((a,b)=>a.month.localeCompare(b.month)).map(computeAdr);
    const overallAdr=totalNights>0?Math.round(totalRev/totalNights):0;
    return{overallAdr,totalRev,totalNights,totalCount,facRows,countryRows,segRows,regionRows,monthRows};
  },[tab,filtered,tz,tzFmt]);

  // ─── MEMBER & REPEAT ANALYSIS ───
  const memberRpt=useMemo(()=>{
    if(tab!=="member"||!filtered.length)return null;
    const withEmail=filtered.filter(r=>r.email);
    if(!withEmail.length)return null;

    // Count bookings per email
    const emailCount={};
    withEmail.forEach(r=>{
      if(!emailCount[r.email])emailCount[r.email]={count:0,country:r.country,rank:r.rank,segment:r.segment,rev:0,guestName:r.guestName};
      emailCount[r.email].count++;
      emailCount[r.email].rev+=r.totalRev||0;
    });

    const totalGuests=Object.keys(emailCount).length;
    const repeaters=Object.values(emailCount).filter(v=>v.count>=2);
    const repeatCount=repeaters.length;
    const repeatRate=totalGuests>0?+((repeatCount/totalGuests)*100).toFixed(1):0;
    const avgBookings=repeatCount>0?+(repeaters.reduce((a,v)=>a+v.count,0)/repeatCount).toFixed(1):0;

    // Overview pie data
    const overviewPie=[
      {name:"first",value:totalGuests-repeatCount},
      {name:"repeat",value:repeatCount}
    ];

    // Japanese vs International repeat rate
    const jpEmails={};const intlEmails={};
    withEmail.forEach(r=>{
      const bucket=r.country==="Japan"?jpEmails:intlEmails;
      if(!bucket[r.email])bucket[r.email]=0;
      bucket[r.email]++;
    });
    const jpTotal=Object.keys(jpEmails).length;
    const jpRepeat=Object.values(jpEmails).filter(v=>v>=2).length;
    const intlTotal=Object.keys(intlEmails).length;
    const intlRepeat=Object.values(intlEmails).filter(v=>v>=2).length;
    const jpIntlData=[
      {type:"Japanese",total:jpTotal,repeat:jpRepeat,rate:jpTotal>0?+((jpRepeat/jpTotal)*100).toFixed(1):0},
      {type:"International",total:intlTotal,repeat:intlRepeat,rate:intlTotal>0?+((intlRepeat/intlTotal)*100).toFixed(1):0},
    ];

    // By membership rank
    const byRank={};
    Object.values(emailCount).forEach(v=>{
      const rk=v.rank||"No Rank";
      if(!byRank[rk])byRank[rk]={total:0,repeat:0};
      byRank[rk].total++;
      if(v.count>=2)byRank[rk].repeat++;
    });
    const rankRows=["No Rank","Regular","Gold","Platinum"].map(rk=>({
      rank:rk,total:byRank[rk]?.total||0,repeat:byRank[rk]?.repeat||0,
      rate:(byRank[rk]?.total||0)>0?+(((byRank[rk]?.repeat||0)/(byRank[rk]?.total||0))*100).toFixed(1):0
    }));

    // By segment
    const bySeg={};
    Object.values(emailCount).forEach(v=>{
      if(!bySeg[v.segment])bySeg[v.segment]={total:0,repeat:0};
      bySeg[v.segment].total++;
      if(v.count>=2)bySeg[v.segment].repeat++;
    });
    const segRows=Object.entries(bySeg).sort((a,b)=>b[1].total-a[1].total).map(([s,v])=>({
      segment:s,total:v.total,repeat:v.repeat,
      rate:v.total>0?+((v.repeat/v.total)*100).toFixed(1):0
    }));

    // Detail table: top repeaters
    const detailRows=repeaters.sort((a,b)=>b.count-a.count).slice(0,50).map((v,i)=>({
      idx:i+1,name:v.guestName||"—",country:v.country,rank:v.rank,segment:v.segment,bookings:v.count,rev:v.rev
    }));

    // By facility: repeat rate per facility
    const byFac={};
    withEmail.forEach(r=>{
      if(!byFac[r.facility])byFac[r.facility]={emails:{},totalBookings:0,rev:0};
      byFac[r.facility].totalBookings++;
      byFac[r.facility].rev+=r.totalRev||0;
      if(!byFac[r.facility].emails[r.email])byFac[r.facility].emails[r.email]=0;
      byFac[r.facility].emails[r.email]++;
    });
    const facRows=Object.entries(byFac).map(([f,v])=>{
      const guests=Object.keys(v.emails).length;
      const rpt=Object.values(v.emails).filter(c=>c>=2).length;
      return{facility:f,name:shortFac(f),guests,repeaters:rpt,rate:guests>0?+((rpt/guests)*100).toFixed(1):0,bookings:v.totalBookings,rev:v.rev};
    }).sort((a,b)=>b.repeaters-a.repeaters);
    const facByRate=[...facRows].sort((a,b)=>b.rate-a.rate);

    // ─── Repeat Window Analysis (uses ALL data, not filtered) ───
    const allWithEmail=allData.filter(r=>r.email&&r.bookingDate);
    // Group bookings by email
    const guestBookings={};
    allWithEmail.forEach(r=>{
      if(!guestBookings[r.email])guestBookings[r.email]={dates:[],country:r.country};
      guestBookings[r.email].dates.push(r.bookingDate.getTime());
    });
    Object.values(guestBookings).forEach(g=>g.dates.sort((a,b)=>a-b));
    // Determine top 7 foreign countries by reservation count (excluding Japan)
    const foreignCounts={};
    allWithEmail.forEach(r=>{if(r.country!=="Japan")foreignCounts[r.country]=(foreignCounts[r.country]||0)+1});
    const top7Foreign=Object.entries(foreignCounts).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([c])=>c);
    const segmentOf=country=>{
      if(country==="Japan")return"Japanese";
      if(top7Foreign.includes(country))return country;
      return"Other";
    };
    const segments=["Overall","Japanese",...top7Foreign,"Other"];
    // Bucket boundaries in milliseconds
    const MO=30*864e5,buckets=[3*MO,6*MO,12*MO,24*MO];
    const bucketLabels=["≤3mo","3–6mo","6–12mo","12–24mo"];
    // Helper: get tightest gap (min) and first-to-second gap
    const computeGuestStats=g=>{
      if(g.dates.length<2)return{tightest:null,firstSecond:null};
      let tightest=Infinity;
      for(let i=1;i<g.dates.length;i++){const gap=g.dates[i]-g.dates[i-1];if(gap<tightest)tightest=gap}
      const firstSecond=g.dates[1]-g.dates[0];
      return{tightest,firstSecond};
    };
    const bucketIdx=ms=>{for(let i=0;i<buckets.length;i++)if(ms<=buckets[i])return i;return buckets.length-1};

    // Initialize result tables
    const tightestTable={},firstSecondTable={};
    segments.forEach(s=>{
      tightestTable[s]={total:0,buckets:[0,0,0,0]};
      firstSecondTable[s]={total:0,buckets:[0,0,0,0]};
    });

    Object.values(guestBookings).forEach(g=>{
      const segments2=["Overall",segmentOf(g.country)];
      const stats=computeGuestStats(g);
      segments2.forEach(seg=>{
        if(!tightestTable[seg])return;
        tightestTable[seg].total++;
        firstSecondTable[seg].total++;
        if(stats.tightest!==null){const idx=bucketIdx(stats.tightest);if(idx>=0)tightestTable[seg].buckets[idx]++}
        if(stats.firstSecond!==null){const idx=bucketIdx(stats.firstSecond);if(idx>=0)firstSecondTable[seg].buckets[idx]++}
      });
    });

    // Build row-oriented data for tables: rows=windows, columns=segments
    const buildRows=tbl=>bucketLabels.map((label,i)=>{
      const row={window:label};
      segments.forEach(s=>{
        const t=tbl[s];
        row[s]=t.total>0?+((t.buckets[i]/t.total)*100).toFixed(1):0;
      });
      return row;
    });
    const tightestRows=buildRows(tightestTable);
    const firstSecondRows=buildRows(firstSecondTable);

    // Build chart data: stacked bars, X=segment, stacks=window buckets
    const buildChartData=tbl=>segments.map(s=>{
      const t=tbl[s];
      const row={segment:s};
      bucketLabels.forEach((label,i)=>{row[label]=t.total>0?+((t.buckets[i]/t.total)*100).toFixed(1):0});
      return row;
    });
    const tightestChart=buildChartData(tightestTable);
    const firstSecondChart=buildChartData(firstSecondTable);

    // Repeaters vs non-repeaters by country (uses filtered emailCount, top 15 countries by total guests)
    const countryGuests={};
    Object.values(emailCount).forEach(v=>{
      if(!countryGuests[v.country])countryGuests[v.country]={firstTimers:0,repeaters:0};
      if(v.count>=2)countryGuests[v.country].repeaters++;
      else countryGuests[v.country].firstTimers++;
    });
    const countryRptRows=Object.entries(countryGuests)
      .map(([c,v])=>{const total=v.firstTimers+v.repeaters;return{country:c,firstTimers:v.firstTimers,repeaters:v.repeaters,total,rate:total>0?+((v.repeaters/total)*100).toFixed(1):0}})
      .sort((a,b)=>b.total-a.total)
      .slice(0,15);

    return{totalGuests,repeatCount,repeatRate,avgBookings,overviewPie,jpIntlData,rankRows,segRows,detailRows,facRows,facByRate,
      windowSegments:segments,bucketLabels,tightestRows,firstSecondRows,tightestChart,firstSecondChart,countryRptRows};
  },[tab,filtered,allData]);


  // ─── DAILY REPORT ───
  useEffect(()=>{
    if(allData.length&&!drFrom){
      const y=new Date();y.setDate(y.getDate()-1);const yd=tzFmt(y);
      setDrFrom(yd);setDrTo(yd);setDrSingle(yd);
    }
  },[allData]);

  const dailyRpt=useMemo(()=>{
    if(tab!=="daily"||!allData.length||!drFrom)return null;
    const from=drFrom,to=drTo||drFrom;
    // Shift range back 1 year for YoY
    const prevFrom=`${parseInt(from.slice(0,4))-1}${from.slice(4)}`;
    const prevTo=`${parseInt(to.slice(0,4))-1}${to.slice(4)}`;
    // Filter by BOOKING DATE (予約受付日時) using LOCAL date (not UTC)
    const localDate=dt=>tzFmt(dt);
    const inRange=(r,f,t2)=>{const d=localDate(r.bookingDate);if(!d)return false;return d>=f&&d<=t2};
    const curData=allData.filter(r=>inRange(r,from,to));
    const prevData=allData.filter(r=>inRange(r,prevFrom,prevTo));
    if(!curData.length)return{empty:true};
    const byCountry={};
    curData.forEach(r=>{
      if(!byCountry[r.country])byCountry[r.country]={count:0,rev:0,nights:0};
      byCountry[r.country].count++;
      byCountry[r.country].rev+=r.totalRev||0;
      byCountry[r.country].nights+=r.nights||0;
    });
    const totalRev=curData.reduce((a,r)=>a+(r.totalRev||0),0);
    const totalCount=curData.length;
    const totalNights=curData.reduce((a,r)=>a+(r.nights||0),0);
    const countryRows=Object.entries(byCountry)
      .sort((a,b)=>b[1].rev-a[1].rev)
      .map(([c,v])=>({country:c,count:v.count,rev:v.rev,adr:v.nights>0?Math.round(v.rev/v.nights):0,share:totalRev>0?((v.rev/totalRev)*100).toFixed(1)+"%":"0%"}));
    const byRegion={};
    curData.forEach(r=>{
      const reg=GEO_REGION(r.country);
      if(!byRegion[reg])byRegion[reg]={count:0,rev:0,nights:0};
      byRegion[reg].count++;
      byRegion[reg].rev+=r.totalRev||0;
      byRegion[reg].nights+=r.nights||0;
    });
    const regionRows=Object.entries(byRegion)
      .sort((a,b)=>b[1].rev-a[1].rev)
      .map(([reg,v])=>({region:reg,count:v.count,rev:v.rev,adr:v.nights>0?Math.round(v.rev/v.nights):0,share:totalRev>0?((v.rev/totalRev)*100).toFixed(1)+"%":"0%"}));
    const prevByCountry={};
    prevData.forEach(r=>{
      if(!prevByCountry[r.country])prevByCountry[r.country]={count:0,rev:0};
      prevByCountry[r.country].count++;
      prevByCountry[r.country].rev+=r.totalRev||0;
    });
    // Aggregate Europe for YoY
    const euroCountries=[...new Set([...Object.keys(byCountry),...Object.keys(prevByCountry)].filter(c=>GEO_REGION(c)==="Europe"))];
    const euroCurRev=euroCountries.reduce((a,c)=>a+(byCountry[c]?.rev||0),0);
    const euroCurCount=euroCountries.reduce((a,c)=>a+(byCountry[c]?.count||0),0);
    const euroPrevRev=euroCountries.reduce((a,c)=>a+(prevByCountry[c]?.rev||0),0);
    const euroPrevCount=euroCountries.reduce((a,c)=>a+(prevByCountry[c]?.count||0),0);
    // Build YoY with top 10 non-Europe countries + Europe aggregate, sorted by current desc
    const nonEuroTop=countryRows.filter(r=>GEO_REGION(r.country)!=="Europe").slice(0,10).map(r=>r.country);
    const yoyRevRaw=[...nonEuroTop.map(c=>({country:c,current:byCountry[c]?.rev||0,prev:prevByCountry[c]?.rev||0}))];
    if(euroCurRev>0||euroPrevRev>0)yoyRevRaw.push({country:"Europe (合計)",current:euroCurRev,prev:euroPrevRev});
    const yoyRev=yoyRevRaw.sort((a,b)=>b.current-a.current);
    const yoyCountRaw=[...nonEuroTop.map(c=>({country:c,current:byCountry[c]?.count||0,prev:prevByCountry[c]?.count||0}))];
    if(euroCurCount>0||euroPrevCount>0)yoyCountRaw.push({country:"Europe (合計)",current:euroCurCount,prev:euroPrevCount});
    const yoyCount=yoyCountRaw.sort((a,b)=>b.current-a.current);
    const curLabel=from===to?fmtDate(from):`${fmtDate(from)} – ${fmtDate(to)}`;
    const prevLabel=prevFrom===prevTo?fmtDate(prevFrom):`${fmtDate(prevFrom)} – ${fmtDate(prevTo)}`;

    // === Section 1: ADR by country (sorted by ADR descending) ===
    const adrData=countryRows.map(r=>({country:r.country,adr:r.adr})).sort((a,b)=>b.adr-a.adr);

    // === Section 2: 直販比率 — stacked bar by booking date, segmented by check-in month ===
    const localDate2=dt=>tzFmt(dt);
    const bookDates=[...new Set(curData.map(r=>localDate2(r.bookingDate)).filter(Boolean))].sort();
    const ciMonths=[...new Set(curData.map(r=>r.checkinMonth).filter(Boolean))].sort().slice(0,6);
    const directRatio=bookDates.map(bd=>{
      const dayData=curData.filter(r=>localDate2(r.bookingDate)===bd);
      const total=dayData.length;if(!total)return null;
      const row={date:bd};
      ciMonths.forEach(m=>{const cnt=dayData.filter(r=>r.checkinMonth===m).length;row[m]=+((cnt/total)*100).toFixed(1)});
      const otherCnt=dayData.filter(r=>!ciMonths.includes(r.checkinMonth)).length;
      if(otherCnt>0)row["以降"]=+((otherCnt/total)*100).toFixed(1);
      return row;
    }).filter(Boolean);
    const drMonthKeys=[...ciMonths];
    if(directRatio.some(r=>r["以降"]))drMonthKeys.push("以降");

    // === Section 3: 施設別 — by single date, grouped by hotel type ===
    // (computed at render time since it depends on drSingle, not drFrom/drTo)

    // === Section 4: プラン別 — same single date ===
    // (also computed at render time)

    // === Section 5: クーポンデータ ===
    const couponSummary={};
    curData.forEach(r=>{const cn=r.couponName||"利用なし";if(!couponSummary[cn])couponSummary[cn]={count:0,rev:0};couponSummary[cn].count++;couponSummary[cn].rev+=r.totalRev||0});
    const couponRows=Object.entries(couponSummary).sort((a,b)=>b[1].count-a[1].count)
      .map(([name,v])=>({name,count:v.count,pct:totalCount>0?((v.count/totalCount)*100).toFixed(2)+"%":"0%",rev:v.rev}));
    // Coupon detail rows (only rows WITH a coupon)
    const couponDetails=curData.filter(r=>r.couponName&&r.couponName!=="").map(r=>({
      country:r.country,facility:r.facility,nights:r.nights||0,rev:r.totalRev||0,coupon:r.couponName
    }));

    // === Section 6: キャンセルデータ ===
    const cancelData=curData.filter(r=>r.isCancelled);
    const cancelByFac={};
    cancelData.forEach(r=>{if(!cancelByFac[r.facility])cancelByFac[r.facility]={count:0,fee:0};cancelByFac[r.facility].count++;cancelByFac[r.facility].fee+=r.cancelFee||0});
    const cancelFacRows=Object.entries(cancelByFac).sort((a,b)=>b[1].count-a[1].count).map(([f,v])=>({facility:f,count:v.count,fee:v.fee}));
    const cancelByCountry={};
    cancelData.forEach(r=>{if(!cancelByCountry[r.country])cancelByCountry[r.country]={count:0,fee:0};cancelByCountry[r.country].count++;cancelByCountry[r.country].fee+=r.cancelFee||0});
    const cancelCountryRows=Object.entries(cancelByCountry).sort((a,b)=>b[1].count-a[1].count).map(([c,v])=>({country:c,count:v.count,fee:v.fee}));

    return{countryRows,regionRows,yoyRev,yoyCount,totalRev,totalCount,
      totalNights,totalADR:totalNights>0?Math.round(totalRev/totalNights):0,
      curLabel,prevLabel,
      adrData,directRatio,drMonthKeys,
      couponRows,couponDetails,
      cancelFacRows,cancelCountryRows,cancelCount:cancelData.length};
  },[tab,allData,drFrom,drTo,tz]);

  // ─── TL Channel Mix tab data ───
  const tlFiltered=useMemo(()=>{
    if(!tab.startsWith("tl-")||!tlData.length)return[];
    const fPSet=fP.length?new Set(fP):null;
    const fCBSet=fChannelBucket.length?new Set(fChannelBucket):null;
    const fCNSet=fTlChannelName.length?new Set(fTlChannelName):null;
    const from=fDF?new Date(fDF+"T00:00:00"):null,to=fDTo?new Date(fDTo+"T23:59:59"):null;
    const out=[];
    for(let i=0;i<tlData.length;i++){const r=tlData[i];
      if(fPSet&&!fPSet.has(r.facility))continue;
      if(fCBSet&&!fCBSet.has(r.channelBucket))continue;
      if(fCNSet&&!fCNSet.has(r.channel_name))continue;
      // Status filter: net (default) / all / cancelled / modified
      if(fTlStatus==="net"){
        // Net = 予約 not same-day-cancelled + 変更 that modifies prior-day bookings
        if(r.status==="取消")continue;
        if(r.status==="予約"&&r.sameDayCancelled)continue;
        // 変更 rows stay by default — they represent modifications
      }else if(fTlStatus==="cancelled"){
        if(r.status!=="取消"&&!r.sameDayCancelled)continue;
      }else if(fTlStatus==="modified"){
        if(r.status!=="変更")continue;
      }
      // "all" lets everything through
      if(from&&r.date<from)continue;
      if(to&&r.date>to)continue;
      out.push(r);
    }
    return out;
  },[tab,tlData,fP,fChannelBucket,fTlChannelName,fTlStatus,fDF,fDTo]);

  // Cancel-rate and modification tracking need the FULL status dataset, not the Net-filtered view.
  // Re-filter tlData for stats that span all statuses (same dates/facility/channel filters but status=all).
  const tlAllStatusFiltered=useMemo(()=>{
    if(tab!=="tl-channel"||!tlData.length)return[];
    const fPSet=fP.length?new Set(fP):null;
    const fCBSet=fChannelBucket.length?new Set(fChannelBucket):null;
    const fCNSet=fTlChannelName.length?new Set(fTlChannelName):null;
    const from=fDF?new Date(fDF+"T00:00:00"):null,to=fDTo?new Date(fDTo+"T23:59:59"):null;
    const out=[];
    for(let i=0;i<tlData.length;i++){const r=tlData[i];
      if(fPSet&&!fPSet.has(r.facility))continue;
      if(fCBSet&&!fCBSet.has(r.channelBucket))continue;
      if(fCNSet&&!fCNSet.has(r.channel_name))continue;
      if(from&&r.date<from)continue;
      if(to&&r.date>to)continue;
      out.push(r);
    }
    return out;
  },[tab,tlData,fP,fChannelBucket,fTlChannelName,fDF,fDTo]);

  const tlChannelRpt=useMemo(()=>{
    if(tab!=="tl-channel"||!tlFiltered.length)return null;
    const buckets=["ota","rta","direct"];

    // KPIs from the status-filtered (Net by default) view — these are the "real" numbers
    let totalRev=0,totalBookings=0,totalRoomNights=0;
    const byBucket={ota:{rev:0,bookings:0,roomNights:0},rta:{rev:0,bookings:0,roomNights:0},direct:{rev:0,bookings:0,roomNights:0}};
    const byDay={},byMonth={},byFac={},byChannelName={};
    const DOW=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    const byDow={};DOW.forEach(d=>{byDow[d]={day:d,ota:0,rta:0,direct:0}});

    for(let i=0;i<tlFiltered.length;i++){
      const r=tlFiltered[i];const b=r.channelBucket;if(!byBucket[b])continue;
      // Skip 取消 rows for revenue/bookings totals; they're counted separately in cancellations
      if(r.status==="取消")continue;
      const rev=r.totalRev;const rn=(r.nights||0)*(r.rooms||0);
      totalRev+=rev;totalBookings+=1;totalRoomNights+=rn;
      byBucket[b].rev+=rev;byBucket[b].bookings+=1;byBucket[b].roomNights+=rn;
      const dKey=r.dateStr;
      if(!byDay[dKey])byDay[dKey]={date:dKey,ota:0,rta:0,direct:0,otaB:0,rtaB:0,directB:0};
      byDay[dKey][b]+=rev;byDay[dKey][b+"B"]+=1;
      const mKey=dKey.slice(0,7);
      if(!byMonth[mKey])byMonth[mKey]={date:mKey,ota:0,rta:0,direct:0,otaB:0,rtaB:0,directB:0};
      byMonth[mKey][b]+=rev;byMonth[mKey][b+"B"]+=1;
      if(!byFac[r.facility])byFac[r.facility]={facility:r.facility,facilityGroup:r.facilityGroup,ota:0,rta:0,direct:0,otaB:0,rtaB:0,directB:0,total:0,totalB:0};
      byFac[r.facility][b]+=rev;byFac[r.facility][b+"B"]+=1;byFac[r.facility].total+=rev;byFac[r.facility].totalB+=1;
      // Channel name drilldown (per bucket)
      if(!byChannelName[r.channel_name])byChannelName[r.channel_name]={channel:r.channel_name,bucket:b,rev:0,bookings:0};
      byChannelName[r.channel_name].rev+=rev;byChannelName[r.channel_name].bookings+=1;
      const dow=DOW[(r.date.getDay()+6)%7];
      byDow[dow][b]+=rev;
    }

    // Cancellations + modifications come from the all-status view so they're not filtered out by Net
    let totalCancellations=0,totalModifications=0,cancelRevLost=0,modRevImpact=0;
    const cancelByBucket={ota:0,rta:0,direct:0};
    const bookingsByBucket={ota:0,rta:0,direct:0};
    for(let i=0;i<tlAllStatusFiltered.length;i++){
      const r=tlAllStatusFiltered[i];const b=r.channelBucket;if(!cancelByBucket.hasOwnProperty(b))continue;
      if(r.status==="取消"||r.sameDayCancelled){totalCancellations+=1;cancelByBucket[b]+=1;cancelRevLost+=r.totalRev}
      else if(r.status==="予約"){bookingsByBucket[b]+=1}
      if(r.status==="変更"){totalModifications+=1;modRevImpact+=r.totalRev}
    }
    const cancelRateRows=buckets.map(b=>{
      const denom=bookingsByBucket[b]+cancelByBucket[b];
      return{bucket:b,bookings:bookingsByBucket[b],cancellations:cancelByBucket[b],rate:denom>0?+((cancelByBucket[b]/denom)*100).toFixed(1):0};
    });

    const directShare=totalRev>0?+((byBucket.direct.rev/totalRev)*100).toFixed(1):0;

    const dailySeries=Object.values(byDay).sort((a,b)=>a.date.localeCompare(b.date));
    const monthlySeries=Object.values(byMonth).sort((a,b)=>a.date.localeCompare(b.date));
    const directShareSeries=dailySeries.map(d=>{const tot=d.ota+d.rta+d.direct;return{date:d.date,share:tot>0?+((d.direct/tot)*100).toFixed(1):0}});
    const directShareMonthlySeries=monthlySeries.map(d=>{const tot=d.ota+d.rta+d.direct;return{date:d.date,share:tot>0?+((d.direct/tot)*100).toFixed(1):0}});

    const facList=Object.values(byFac).map(f=>{
      const directPct=f.total>0?+((f.direct/f.total)*100).toFixed(1):0;
      return{...f,name:shortFac(f.facility),directPct};
    }).sort((a,b)=>b.total-a.total);
    const facByDirect=[...facList].filter(f=>f.totalB>=3).sort((a,b)=>b.directPct-a.directPct).slice(0,10);

    // Channel name drilldown: sort by revenue within each bucket
    const channelNameList=Object.values(byChannelName).sort((a,b)=>b.rev-a.rev);
    const channelNameByBucket={
      ota:channelNameList.filter(c=>c.bucket==="ota").slice(0,15),
      rta:channelNameList.filter(c=>c.bucket==="rta"),
      direct:channelNameList.filter(c=>c.bucket==="direct"),
    };

    return{
      totalRev,totalBookings,totalRoomNights,totalCancellations,totalModifications,cancelRevLost,modRevImpact,directShare,
      byBucket,
      dailySeries,monthlySeries,directShareSeries,directShareMonthlySeries,
      facList,facByDirect,
      cancelRateRows,
      dowRows:DOW.map(d=>byDow[d]),
      bucketKeys:buckets,
      channelNameList,channelNameByBucket,
    };
  },[tab,tlFiltered,tlAllStatusFiltered]);

  // ─── TL Revenue tab data ───
  const tlRevenueRpt=useMemo(()=>{
    if(tab!=="tl-revenue"||!tlFiltered.length)return null;
    const byMonth={},byDay={},byFac={},bySeg={};
    const DOW=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    const byDow={};DOW.forEach(d=>{byDow[d]={day:d,rev:0,count:0}});
    let totalRev=0,totalRoomNights=0,count=0;
    for(let i=0;i<tlFiltered.length;i++){
      const r=tlFiltered[i];if(r.status==="取消")continue;
      const rev=r.totalRev;const rn=(r.nights||0)*(r.rooms||0);
      totalRev+=rev;totalRoomNights+=rn;count++;
      const mKey=r.dateStr.slice(0,7);
      if(!byMonth[mKey])byMonth[mKey]={month:mKey,rev:0,count:0,roomNights:0};
      byMonth[mKey].rev+=rev;byMonth[mKey].count++;byMonth[mKey].roomNights+=rn;
      if(!byDay[r.dateStr])byDay[r.dateStr]={date:r.dateStr,rev:0,count:0};
      byDay[r.dateStr].rev+=rev;byDay[r.dateStr].count++;
      if(!byFac[r.facility])byFac[r.facility]={facility:r.facility,name:shortFac(r.facility),rev:0,count:0,roomNights:0};
      byFac[r.facility].rev+=rev;byFac[r.facility].count++;byFac[r.facility].roomNights+=rn;
      if(r.segment!=="Unknown"){
        if(!bySeg[r.segment])bySeg[r.segment]={segment:r.segment,rev:0,count:0};
        bySeg[r.segment].rev+=rev;bySeg[r.segment].count++;
      }
      const dow=DOW[(r.date.getDay()+6)%7];
      byDow[dow].rev+=rev;byDow[dow].count++;
    }
    const moRows=Object.values(byMonth).sort((a,b)=>a.month.localeCompare(b.month)).map(v=>({...v,avgRev:v.count>0?Math.round(v.rev/v.count):0,adr:v.roomNights>0?Math.round(v.rev/v.roomNights):0}));
    const dayRows=Object.values(byDay).sort((a,b)=>a.date.localeCompare(b.date));
    const facRows=Object.values(byFac).sort((a,b)=>b.rev-a.rev).map(v=>({...v,avgRev:v.count>0?Math.round(v.rev/v.count):0,adr:v.roomNights>0?Math.round(v.rev/v.roomNights):0}));
    const segRows=SEG_ORDER.filter(s=>bySeg[s]).map(s=>({segment:s,rev:bySeg[s].rev,count:bySeg[s].count,avgRev:bySeg[s].count>0?Math.round(bySeg[s].rev/bySeg[s].count):0}));
    const adr=totalRoomNights>0?Math.round(totalRev/totalRoomNights):0;
    return{totalRev,totalRoomNights,count,adr,moRows,dayRows,facRows,segRows,dowRows:DOW.map(d=>byDow[d])};
  },[tab,tlFiltered]);

  // ─── TL Segments tab data ───
  const tlSegmentsRpt=useMemo(()=>{
    if(tab!=="tl-segments"||!tlFiltered.length)return null;
    const ORDER=segDetailed?SEG_ORDER_DETAILED:SEG_ORDER;
    const segKey=r=>segDetailed?r.segmentDetailed:r.segment;
    const byS={};
    const byFacSeg={}; // {facility: {segment: count}}
    for(let i=0;i<tlFiltered.length;i++){
      const r=tlFiltered[i];if(r.status==="取消")continue;
      const k=segKey(r);if(!k)continue;
      if(k==="Unknown")continue;
      if(!byS[k])byS[k]={count:0,rev:0,nights:[],lead:[]};
      byS[k].count++;byS[k].rev+=r.totalRev;
      if(r.nights)byS[k].nights.push(r.nights);
      if(r.leadTime!=null)byS[k].lead.push(r.leadTime);
      if(!byFacSeg[r.facility])byFacSeg[r.facility]={facility:r.facility,name:shortFac(r.facility),_total:0};
      byFacSeg[r.facility][k]=(byFacSeg[r.facility][k]||0)+1;
      byFacSeg[r.facility]._total++;
    }
    const rows=ORDER.filter(s=>byS[s]).map(s=>({
      segment:s,count:byS[s].count,
      avgRev:byS[s].count>0?Math.round(byS[s].rev/byS[s].count):0,
      avgLOS:byS[s].nights.length?+avg(byS[s].nights).toFixed(2):0,
      avgLead:byS[s].lead.length?+avg(byS[s].lead).toFixed(1):0,
    }));
    const activeSegs=ORDER.filter(s=>byS[s]);
    const facSegRows=Object.values(byFacSeg).sort((a,b)=>b._total-a._total).map(f=>{
      const out={facility:f.facility,name:f.name};
      activeSegs.forEach(s=>{out[s]=f[s]||0});
      return out;
    });
    return{rows,total:rows.reduce((a,r)=>a+r.count,0),facSegRows,activeSegs};
  },[tab,tlFiltered,segDetailed]);

  // ─── TL Daily Report tab data ───
  const tlDailyRpt=useMemo(()=>{
    if(tab!=="tl-daily"||!tlData.length||!drFrom)return null;
    const from=drFrom,to=drTo||drFrom;
    const inRange=dStr=>dStr>=from&&dStr<=to;
    // Apply global filters except date (the tab has its own date picker)
    const apply=r=>{
      if(fP.length&&!fP.includes(r.facility))return false;
      if(fChannelBucket.length&&!fChannelBucket.includes(r.channelBucket))return false;
      if(fTlChannelName.length&&!fTlChannelName.includes(r.channel_name))return false;
      if(fTlStatus==="net"){if(r.status==="取消"||(r.status==="予約"&&r.sameDayCancelled))return false}
      else if(fTlStatus==="cancelled"){if(r.status!=="取消"&&!r.sameDayCancelled)return false}
      else if(fTlStatus==="modified"){if(r.status!=="変更")return false}
      return true;
    };
    const curData=tlData.filter(r=>apply(r)&&inRange(r.dateStr));
    // YoY: shift back 1 year
    const prevFrom=`${parseInt(from.slice(0,4))-1}${from.slice(4)}`;
    const prevTo=`${parseInt(to.slice(0,4))-1}${to.slice(4)}`;
    const prevData=tlData.filter(r=>apply(r)&&r.dateStr>=prevFrom&&r.dateStr<=prevTo);
    const agg=d=>{
      const byFac={},byChannel={bucket:{ota:{count:0,rev:0},rta:{count:0,rev:0},direct:{count:0,rev:0}},name:{}};
      let rev=0,count=0,roomNights=0;
      d.forEach(r=>{
        if(r.status==="取消")return;
        const rn=(r.nights||0)*(r.rooms||0);
        rev+=r.totalRev;count++;roomNights+=rn;
        if(!byFac[r.facility])byFac[r.facility]={facility:r.facility,name:shortFac(r.facility),count:0,rev:0,roomNights:0};
        byFac[r.facility].count++;byFac[r.facility].rev+=r.totalRev;byFac[r.facility].roomNights+=rn;
        byChannel.bucket[r.channelBucket].count++;byChannel.bucket[r.channelBucket].rev+=r.totalRev;
        if(!byChannel.name[r.channel_name])byChannel.name[r.channel_name]={channel:r.channel_name,bucket:r.channelBucket,count:0,rev:0};
        byChannel.name[r.channel_name].count++;byChannel.name[r.channel_name].rev+=r.totalRev;
      });
      return{rev,count,roomNights,adr:roomNights>0?Math.round(rev/roomNights):0,facRows:Object.values(byFac).sort((a,b)=>b.rev-a.rev),byChannel};
    };
    const cur=agg(curData),prev=agg(prevData);
    const yoyRev=prev.rev>0?+((cur.rev-prev.rev)/prev.rev*100).toFixed(1):null;
    const yoyCount=prev.count>0?+((cur.count-prev.count)/prev.count*100).toFixed(1):null;
    const channelNameRows=Object.values(cur.byChannel.name).sort((a,b)=>b.rev-a.rev).slice(0,15);
    return{cur,prev,yoyRev,yoyCount,from,to,channelNameRows};
  },[tab,tlData,drFrom,drTo,fP,fChannelBucket,fTlChannelName,fTlStatus]);

  // ─── TL Member tab data ───
  const tlMemberRpt=useMemo(()=>{
    if(tab!=="tl-member"||!tlFiltered.length)return null;
    const withEmail=tlFiltered.filter(r=>r.email&&r.status!=="取消");
    if(!withEmail.length)return null;
    const emailCount={};
    withEmail.forEach(r=>{
      if(!emailCount[r.email])emailCount[r.email]={count:0,country:r.country,segment:r.segment,rev:0,guestName:r.guestName,facilities:new Set()};
      emailCount[r.email].count++;
      emailCount[r.email].rev+=r.totalRev;
      emailCount[r.email].facilities.add(r.facility);
    });
    const totalGuests=Object.keys(emailCount).length;
    const repeaters=Object.values(emailCount).filter(v=>v.count>=2);
    const repeatCount=repeaters.length;
    const repeatRate=totalGuests>0?+((repeatCount/totalGuests)*100).toFixed(1):0;
    const avgBookings=repeatCount>0?+(repeaters.reduce((a,v)=>a+v.count,0)/repeatCount).toFixed(1):0;
    const overviewPie=[{name:"first",value:totalGuests-repeatCount},{name:"repeat",value:repeatCount}];
    // By segment
    const bySeg={};
    Object.values(emailCount).forEach(v=>{if(!bySeg[v.segment])bySeg[v.segment]={total:0,repeat:0};bySeg[v.segment].total++;if(v.count>=2)bySeg[v.segment].repeat++});
    const segRows=Object.entries(bySeg).sort((a,b)=>b[1].total-a[1].total).map(([s,v])=>({segment:s,total:v.total,repeat:v.repeat,rate:v.total>0?+((v.repeat/v.total)*100).toFixed(1):0}));
    // Detail: top repeaters
    const detailRows=repeaters.sort((a,b)=>b.count-a.count).slice(0,50).map((v,i)=>({idx:i+1,name:v.guestName||"—",country:v.country||"—",segment:v.segment,bookings:v.count,rev:v.rev}));
    // By facility
    const byFac={};
    withEmail.forEach(r=>{
      if(!byFac[r.facility])byFac[r.facility]={emails:{},totalBookings:0,rev:0};
      byFac[r.facility].totalBookings++;byFac[r.facility].rev+=r.totalRev;
      if(!byFac[r.facility].emails[r.email])byFac[r.facility].emails[r.email]=0;
      byFac[r.facility].emails[r.email]++;
    });
    const facRows=Object.entries(byFac).map(([f,v])=>{
      const guests=Object.keys(v.emails).length;
      const rpt=Object.values(v.emails).filter(c=>c>=2).length;
      return{facility:f,name:shortFac(f),guests,repeaters:rpt,rate:guests>0?+((rpt/guests)*100).toFixed(1):0,bookings:v.totalBookings,rev:v.rev};
    }).sort((a,b)=>b.repeaters-a.repeaters);
    const facByRate=[...facRows].sort((a,b)=>b.rate-a.rate);
    return{totalGuests,repeatCount,repeatRate,avgBookings,overviewPie,segRows,detailRows,facRows,facByRate};
  },[tab,tlFiltered]);

  // ─── TL Overview tab data ───
  const tlOverviewRpt=useMemo(()=>{
    if(tab!=="tl-overview"||!tlFiltered.length)return null;
    const byMo={},byMkt={},bySeg={},byDow={};
    const DOW=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    DOW.forEach(d=>{byDow[d]={day:d,count:0,rev:0}});
    for(let i=0;i<tlFiltered.length;i++){
      const r=tlFiltered[i];if(r.status==="取消")continue;
      const m=r.dateStr.slice(0,7);
      if(!byMo[m])byMo[m]={month:m,count:0,rev:0};
      byMo[m].count++;byMo[m].rev+=r.totalRev;
      const c=r.country||"Unknown";
      if(!byMkt[c])byMkt[c]={country:c,count:0,rev:0};
      byMkt[c].count++;byMkt[c].rev+=r.totalRev;
      if(r.segment==="Unknown")continue;if(!bySeg[r.segment])bySeg[r.segment]={segment:r.segment,count:0};
      bySeg[r.segment].count++;
      byDow[DOW[(r.date.getDay()+6)%7]].count++;
    }
    return{
      moRows:Object.values(byMo).sort((a,b)=>a.month.localeCompare(b.month)),
      mktRows:Object.values(byMkt).sort((a,b)=>b.count-a.count).slice(0,15),
      segRows:SEG_ORDER.filter(s=>bySeg[s]).map(s=>bySeg[s]),
      dowRows:DOW.map(d=>byDow[d]),
    };
  },[tab,tlFiltered]);

  // ─── TL LOS tab data ───
  const tlLosRpt=useMemo(()=>{
    if(tab!=="tl-los"||!tlFiltered.length)return null;
    const withNights=tlFiltered.filter(r=>r.nights&&r.nights>0&&r.status!=="取消");
    if(!withNights.length)return null;
    const byNight={},bySeg={},byCountry={};
    let total=0,sum=0;
    withNights.forEach(r=>{
      total++;sum+=r.nights;
      const n=r.nights>=7?"7+":String(r.nights);
      if(!byNight[n])byNight[n]={nights:n,count:0,rev:0};
      byNight[n].count++;byNight[n].rev+=r.totalRev;
      if(r.segment==="Unknown")return;if(!bySeg[r.segment])bySeg[r.segment]={segment:r.segment,nights:[]};
      bySeg[r.segment].nights.push(r.nights);
      const c=r.country||"Unknown";
      if(!byCountry[c])byCountry[c]={country:c,nights:[]};
      byCountry[c].nights.push(r.nights);
    });
    const detailRows=["1","2","3","4","5","6","7+"].filter(k=>byNight[k]).map(k=>({nights:k,count:byNight[k].count,share:+((byNight[k].count/total)*100).toFixed(1),avgRev:byNight[k].count>0?Math.round(byNight[k].rev/byNight[k].count):0}));
    const segLOS=SEG_ORDER.filter(s=>bySeg[s]).map(s=>({segment:s,avgLOS:+avg(bySeg[s].nights).toFixed(2)}));
    const countryLOS=Object.values(byCountry).filter(v=>v.nights.length>=5).map(v=>({country:v.country,avgLOS:+avg(v.nights).toFixed(2),count:v.nights.length})).sort((a,b)=>b.count-a.count).slice(0,15);
    return{overallAvg:+(sum/total).toFixed(2),totalWithNights:total,detailRows,segLOS,countryLOS};
  },[tab,tlFiltered]);

  // ─── TL Booking Patterns ───
  const tlBookingRpt=useMemo(()=>{
    if(tab!=="tl-booking"||!tlFiltered.length)return null;
    const leadBuckets={"0-3":0,"4-7":0,"8-14":0,"15-30":0,"31-60":0,"61+":0};
    const byDow={};const DOW=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    DOW.forEach(d=>{byDow[d]={day:d,count:0}});
    const byMonthDow={};
    for(let i=0;i<tlFiltered.length;i++){
      const r=tlFiltered[i];if(r.status==="取消")continue;
      if(r.leadTime!=null){
        if(r.leadTime<=3)leadBuckets["0-3"]++;
        else if(r.leadTime<=7)leadBuckets["4-7"]++;
        else if(r.leadTime<=14)leadBuckets["8-14"]++;
        else if(r.leadTime<=30)leadBuckets["15-30"]++;
        else if(r.leadTime<=60)leadBuckets["31-60"]++;
        else leadBuckets["61+"]++;
      }
      if(r.checkinDow){
        const dowAbbr=r.checkinDow.slice(0,3);
        if(byDow[dowAbbr])byDow[dowAbbr].count++;
      }
      const m=r.dateStr.slice(0,7);
      if(!byMonthDow[m])byMonthDow[m]={month:m,Mon:0,Tue:0,Wed:0,Thu:0,Fri:0,Sat:0,Sun:0};
      if(r.checkinDow){byMonthDow[m][r.checkinDow.slice(0,3)]++}
    }
    return{
      leadRows:Object.entries(leadBuckets).map(([bucket,count])=>({bucket,count})),
      dowRows:DOW.map(d=>byDow[d]),
      mdowRows:Object.values(byMonthDow).sort((a,b)=>a.month.localeCompare(b.month)),
    };
  },[tab,tlFiltered]);

  // ─── TL Compare ───
  const tlCompareRpt=useMemo(()=>{
    if(tab!=="tl-compare"||!tlData.length||!cmpA.from||!cmpB.from)return null;
    const apply=r=>{
      if(fP.length&&!fP.includes(r.facility))return false;
      if(fChannelBucket.length&&!fChannelBucket.includes(r.channelBucket))return false;
      if(fTlChannelName.length&&!fTlChannelName.includes(r.channel_name))return false;
      if(fTlStatus==="net"){if(r.status==="取消"||(r.status==="予約"&&r.sameDayCancelled))return false}
      else if(fTlStatus==="cancelled"){if(r.status!=="取消"&&!r.sameDayCancelled)return false}
      else if(fTlStatus==="modified"){if(r.status!=="変更")return false}
      return true;
    };
    const base=tlData.filter(apply);
    const inRange=(r,from,to)=>r.dateStr>=from&&r.dateStr<=(to||from);
    const dataA=base.filter(r=>inRange(r,cmpA.from,cmpA.to||cmpA.from));
    const dataB=base.filter(r=>inRange(r,cmpB.from,cmpB.to||cmpB.from));
    if(!dataA.length&&!dataB.length)return{empty:true};
    const aggregate=data=>{
      let totalRev=0;
      const byCountry={},bySegment={},byFacility={};
      data.forEach(r=>{
        if(r.status==="取消")return;
        totalRev+=r.totalRev;
        const c=r.country||"Unknown";
        if(!byCountry[c])byCountry[c]={count:0,rev:0};byCountry[c].count++;byCountry[c].rev+=r.totalRev;
        if(!bySegment[r.segment])bySegment[r.segment]={count:0,rev:0};bySegment[r.segment].count++;bySegment[r.segment].rev+=r.totalRev;
        if(!byFacility[r.facility])byFacility[r.facility]={count:0,rev:0};byFacility[r.facility].count++;byFacility[r.facility].rev+=r.totalRev;
      });
      return{totalCount:data.length,totalRev,byCountry,bySegment,byFacility};
    };
    const a=aggregate(dataA),b=aggregate(dataB);
    const pctChg=(c,p)=>p>0?((c-p)/p*100).toFixed(1)+"%":(c>0?"new":"0%");
    const allCountries=[...new Set([...Object.keys(a.byCountry),...Object.keys(b.byCountry)])];
    const countryRows=allCountries.map(c=>({country:c,countA:a.byCountry[c]?.count||0,revA:a.byCountry[c]?.rev||0,countB:b.byCountry[c]?.count||0,revB:b.byCountry[c]?.rev||0,countDelta:(a.byCountry[c]?.count||0)-(b.byCountry[c]?.count||0),revDelta:(a.byCountry[c]?.rev||0)-(b.byCountry[c]?.rev||0)})).sort((x,y)=>Math.abs(y.revDelta)-Math.abs(x.revDelta));
    const allSegs=[...new Set([...Object.keys(a.bySegment),...Object.keys(b.bySegment)])];
    const segRows=allSegs.map(s=>({segment:s,countA:a.bySegment[s]?.count||0,revA:a.bySegment[s]?.rev||0,countB:b.bySegment[s]?.count||0,revB:b.bySegment[s]?.rev||0,countDelta:(a.bySegment[s]?.count||0)-(b.bySegment[s]?.count||0),revDelta:(a.bySegment[s]?.rev||0)-(b.bySegment[s]?.rev||0)})).sort((x,y)=>Math.abs(y.revDelta)-Math.abs(x.revDelta));
    const allFacs=[...new Set([...Object.keys(a.byFacility),...Object.keys(b.byFacility)])];
    const facRows=allFacs.map(f=>({facility:f,name:shortFac(f),countA:a.byFacility[f]?.count||0,revA:a.byFacility[f]?.rev||0,countB:b.byFacility[f]?.count||0,revB:b.byFacility[f]?.rev||0,countDelta:(a.byFacility[f]?.count||0)-(b.byFacility[f]?.count||0),revDelta:(a.byFacility[f]?.rev||0)-(b.byFacility[f]?.rev||0)})).sort((x,y)=>Math.abs(y.revDelta)-Math.abs(x.revDelta));
    return{a,b,pctChg,countryRows,segRows,facRows};
  },[tab,tlData,cmpA,cmpB,fP,fChannelBucket,fTlChannelName,fTlStatus]);

  // ─── TL Pace ───
  const tlPaceRpt=useMemo(()=>{
    if(tab!=="tl-pace"||!tlData.length)return null;
    const apply=r=>{
      if(fP.length&&!fP.includes(r.facility))return false;
      if(fChannelBucket.length&&!fChannelBucket.includes(r.channelBucket))return false;
      if(fTlChannelName.length&&!fTlChannelName.includes(r.channel_name))return false;
      if(r.status==="取消"||r.sameDayCancelled)return false;
      return r.status!=="変更";
    };
    const base=tlData.filter(apply);
    // Group by reception month: cumulative bookings/rev per day within the month
    const byMonth={};
    base.forEach(r=>{
      const m=r.dateStr.slice(0,7);
      if(!byMonth[m])byMonth[m]={month:m,days:{}};
      if(!byMonth[m].days[r.dateStr])byMonth[m].days[r.dateStr]={date:r.dateStr,count:0,rev:0};
      byMonth[m].days[r.dateStr].count++;
      byMonth[m].days[r.dateStr].rev+=r.totalRev;
    });
    const paceData=Object.values(byMonth).sort((a,b)=>b.month.localeCompare(a.month)).slice(0,6).map(m=>{
      const days=Object.values(m.days).sort((a,b)=>a.date.localeCompare(b.date));
      let cumCount=0,cumRev=0;
      const series=days.map(d=>{cumCount+=d.count;cumRev+=d.rev;return{date:d.date,day:parseInt(d.date.slice(8,10)),count:cumCount,rev:cumRev}});
      return{month:m.month,series,total:{count:cumCount,rev:cumRev}};
    });
    return{paceData};
  },[tab,tlData,fP,fChannelBucket,fTlChannelName]);

  // ─── TL Facilities ───
  const tlFacilitiesRpt=useMemo(()=>{
    if(tab!=="tl-facilities"||!tlFiltered.length)return null;
    const byFac={};
    for(let i=0;i<tlFiltered.length;i++){
      const r=tlFiltered[i];if(r.status==="取消")continue;
      if(!byFac[r.facility])byFac[r.facility]={facility:r.facility,fullName:r.facility,name:shortFac(r.facility),region:r.region,n:0,rev:0,nights:[],directCount:0};
      byFac[r.facility].n++;byFac[r.facility].rev+=r.totalRev;
      if(r.nights)byFac[r.facility].nights.push(r.nights);
      if(r.channelBucket==="direct")byFac[r.facility].directCount++;
    }
    return Object.values(byFac).sort((a,b)=>b.n-a.n).map(f=>({
      ...f,
      avgRev:f.n>0?Math.round(f.rev/f.n):0,
      avgLOS:f.nights.length?+avg(f.nights).toFixed(1):0,
      directPct:f.n>0?+((f.directCount/f.n)*100).toFixed(1):0,
    }));
  },[tab,tlFiltered]);

  // ─── TL ADR ───
  // ADR = revenue / room-nights where room-nights = nights × rooms (TL stores per-reservation rev for all rooms booked,
  // but 'nights' is per-guest stay length, so a 20-room × 3-night group booking needs 60 room-nights in the denominator).
  // Rows with nights<=0 or rooms<=0 are excluded from the denominator.
  const tlAdrRpt=useMemo(()=>{
    if(tab!=="tl-adr"||!tlFiltered.length)return null;
    const byFac={},byCountry={},bySeg={},byChannel={},byBucket={ota:{rev:0,roomNights:0,count:0},rta:{rev:0,roomNights:0,count:0},direct:{rev:0,roomNights:0,count:0}};
    const byMonth={};
    let totalRev=0,totalRoomNights=0,totalCount=0;
    for(let i=0;i<tlFiltered.length;i++){
      const r=tlFiltered[i];if(r.status==="取消")continue;
      const n=r.nights||0;const rm=r.rooms||0;
      if(n<=0||rm<=0)continue;
      const roomNights=n*rm;
      const rev=r.totalRev;totalRev+=rev;totalRoomNights+=roomNights;totalCount++;
      // Facility
      if(!byFac[r.facility])byFac[r.facility]={facility:r.facility,name:shortFac(r.facility),rev:0,roomNights:0,count:0};
      byFac[r.facility].rev+=rev;byFac[r.facility].roomNights+=roomNights;byFac[r.facility].count++;
      // Country
      const c=r.country||"Unknown";
      if(!byCountry[c])byCountry[c]={country:c,rev:0,roomNights:0,count:0};
      byCountry[c].rev+=rev;byCountry[c].roomNights+=roomNights;byCountry[c].count++;
      // Segment
      if(r.segment!=="Unknown"){
        if(!bySeg[r.segment])bySeg[r.segment]={segment:r.segment,rev:0,roomNights:0,count:0};
        bySeg[r.segment].rev+=rev;bySeg[r.segment].roomNights+=roomNights;bySeg[r.segment].count++;
      }
      // Channel name (full OTA granularity)
      if(!byChannel[r.channel_name])byChannel[r.channel_name]={channel:r.channel_name,bucket:r.channelBucket,rev:0,roomNights:0,count:0};
      byChannel[r.channel_name].rev+=rev;byChannel[r.channel_name].roomNights+=roomNights;byChannel[r.channel_name].count++;
      // Channel bucket
      if(byBucket[r.channelBucket]){byBucket[r.channelBucket].rev+=rev;byBucket[r.channelBucket].roomNights+=roomNights;byBucket[r.channelBucket].count++}
      // Month
      const mKey=r.dateStr.slice(0,7);
      if(!byMonth[mKey])byMonth[mKey]={month:mKey,rev:0,roomNights:0,count:0};
      byMonth[mKey].rev+=rev;byMonth[mKey].roomNights+=roomNights;byMonth[mKey].count++;
    }
    const computeAdr=v=>({...v,adr:v.roomNights>0?Math.round(v.rev/v.roomNights):0});
    const facRows=Object.values(byFac).map(computeAdr).sort((a,b)=>b.adr-a.adr);
    const countryRows=Object.values(byCountry).filter(v=>v.count>=5).map(computeAdr).sort((a,b)=>b.adr-a.adr).slice(0,15);
    const segRows=SEG_ORDER.filter(s=>bySeg[s]).map(s=>computeAdr(bySeg[s]));
    const channelRows=Object.values(byChannel).filter(v=>v.count>=5).map(computeAdr).sort((a,b)=>b.adr-a.adr).slice(0,15);
    const bucketRows=["ota","rta","direct"].filter(b=>byBucket[b].count).map(b=>({bucket:b,...computeAdr(byBucket[b])}));
    const monthRows=Object.values(byMonth).sort((a,b)=>a.month.localeCompare(b.month)).map(computeAdr);
    const overallAdr=totalRoomNights>0?Math.round(totalRev/totalRoomNights):0;
    return{overallAdr,totalRev,totalRoomNights,totalCount,facRows,countryRows,segRows,channelRows,bucketRows,monthRows};
  },[tab,tlFiltered]);

  // ─── TL KvK ───
  const tlKvkRpt=useMemo(()=>{
    if(tab!=="tl-kvk"||!tlFiltered.length)return null;
    const mkR={Kanto:{},Kansai:{}};
    const segReg={Kanto:{},Kansai:{}};
    const losSR={Kanto:{},Kansai:{}};
    const dowCI={Kanto:{},Kansai:{}};
    const dowCO={Kanto:{},Kansai:{}};
    const revSR={Kanto:{},Kansai:{}};
    const byC={Kanto:{},Kansai:{}};
    const monthlyByReg={};
    const DOW=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    ["Kanto","Kansai"].forEach(rg=>{DOW.forEach(d=>{dowCI[rg][d]=0;dowCO[rg][d]=0})});
    let kN=0,sN=0,kR=0,sR=0;
    for(let i=0;i<tlFiltered.length;i++){
      const r=tlFiltered[i];if(r.status==="取消")continue;
      const rg=r.region;
      if(rg==="Kanto"){kN++;kR+=r.totalRev}else{sN++;sR+=r.totalRev}
      const c=r.country||"Unknown";
      byC[rg][c]=(byC[rg][c]||0)+1;
      segReg[rg][r.segment]=(segReg[rg][r.segment]||0)+1;
      if(!losSR[rg][r.segment])losSR[rg][r.segment]=[];
      if(r.nights)losSR[rg][r.segment].push(r.nights);
      if(!revSR[rg][r.segment])revSR[rg][r.segment]={count:0,rev:0};
      revSR[rg][r.segment].count++;revSR[rg][r.segment].rev+=r.totalRev;
      if(r.checkinDow)dowCI[rg][r.checkinDow.slice(0,3)]++;
      if(r.checkoutDow)dowCO[rg][r.checkoutDow.slice(0,3)]++;
      const m=r.dateStr.slice(0,7);
      if(!monthlyByReg[m])monthlyByReg[m]={month:m,Kanto:0,Kansai:0};
      monthlyByReg[m][rg]++;
    }
    const mkKanto=Object.entries(byC.Kanto).filter(([c])=>c!=="Japan"&&c!=="Unknown").sort((a,b)=>b[1]-a[1]).slice(0,10).map(([c,n])=>({country:c,count:n}));
    const mkKansai=Object.entries(byC.Kansai).filter(([c])=>c!=="Japan"&&c!=="Unknown").sort((a,b)=>b[1]-a[1]).slice(0,10).map(([c,n])=>({country:c,count:n}));
    const mktMo=Object.values(monthlyByReg).sort((a,b)=>a.month.localeCompare(b.month));
    const segRegRows=SEG_ORDER.map(s=>({segment:s,Kanto:segReg.Kanto[s]||0,Kansai:segReg.Kansai[s]||0}));
    const losSRRows=SEG_ORDER.map(s=>({segment:s,Kanto:losSR.Kanto[s]?+avg(losSR.Kanto[s]).toFixed(2):0,Kansai:losSR.Kansai[s]?+avg(losSR.Kansai[s]).toFixed(2):0}));
    const dowCIRows=DOW.map(d=>({day:d,Kanto:dowCI.Kanto[d],Kansai:dowCI.Kansai[d]}));
    const dowCORows=DOW.map(d=>({day:d,Kanto:dowCO.Kanto[d],Kansai:dowCO.Kansai[d]}));
    const revSRRows=SEG_ORDER.map(s=>({segment:s,Kanto:revSR.Kanto[s]?.count>0?Math.round(revSR.Kanto[s].rev/revSR.Kanto[s].count):0,Kansai:revSR.Kansai[s]?.count>0?Math.round(revSR.Kansai[s].rev/revSR.Kansai[s].count):0}));
    return{kN,sN,kR,sR,mkKanto,mkKansai,mktMo,segRegRows,losSRRows,dowCIRows,dowCORows,revSRRows};
  },[tab,tlFiltered]);

  // ─── TL Markets ───
  const tlMarketsRpt=useMemo(()=>{
    if(tab!=="tl-markets"||!tlFiltered.length)return null;
    const byC={};
    for(let i=0;i<tlFiltered.length;i++){
      const r=tlFiltered[i];if(r.status==="取消")continue;
      const c=r.country||"Unknown";
      if(!byC[c])byC[c]={country:c,count:0,rev:0,nights:[],lead:[]};
      byC[c].count++;byC[c].rev+=r.totalRev;
      if(r.nights)byC[c].nights.push(r.nights);
      if(r.leadTime!=null)byC[c].lead.push(r.leadTime);
    }
    const rows=Object.values(byC).map(v=>({country:v.country,count:v.count,rev:v.rev,avgRev:v.count>0?Math.round(v.rev/v.count):0,avgLOS:v.nights.length?+avg(v.nights).toFixed(2):0,avgLead:v.lead.length?+avg(v.lead).toFixed(1):0})).sort((a,b)=>b.count-a.count);
    return{rows:rows.slice(0,15)};
  },[tab,tlFiltered]);

  // ─── TL Cancellations ───
  const tlCancelRpt=useMemo(()=>{
    if(tab!=="tl-cancellations"||!tlData.length)return null;
    const apply=r=>{
      if(fP.length&&!fP.includes(r.facility))return false;
      if(fChannelBucket.length&&!fChannelBucket.includes(r.channelBucket))return false;
      if(fTlChannelName.length&&!fTlChannelName.includes(r.channel_name))return false;
      const from=fDF?new Date(fDF+"T00:00:00"):null,to=fDTo?new Date(fDTo+"T23:59:59"):null;
      if(from&&r.date<from)return false;
      if(to&&r.date>to)return false;
      return true;
    };
    const base=tlData.filter(apply);
    let total=0,cancelled=0,lost=0;
    const byFac={},bySeg={},byCountry={},byMonth={};
    base.forEach(r=>{
      total++;
      const isC=r.status==="取消"||r.sameDayCancelled;
      if(isC){cancelled++;lost+=r.totalRev}
      const m=r.dateStr.slice(0,7);
      if(!byMonth[m])byMonth[m]={month:m,total:0,cancelled:0};
      byMonth[m].total++;if(isC)byMonth[m].cancelled++;
      if(!byFac[r.facility])byFac[r.facility]={facility:r.facility,name:shortFac(r.facility),total:0,cancelled:0,lostRev:0};
      byFac[r.facility].total++;if(isC){byFac[r.facility].cancelled++;byFac[r.facility].lostRev+=r.totalRev}
      if(r.segment!=="Unknown"){if(!bySeg[r.segment])bySeg[r.segment]={segment:r.segment,total:0,cancelled:0};
      bySeg[r.segment].total++;if(isC)bySeg[r.segment].cancelled++;}
      const c=r.country||"Unknown";
      if(!byCountry[c])byCountry[c]={country:c,total:0,cancelled:0};
      byCountry[c].total++;if(isC)byCountry[c].cancelled++;
    });
    const rate=total>0?+((cancelled/total)*100).toFixed(1):0;
    const monthTrend=Object.values(byMonth).sort((a,b)=>a.month.localeCompare(b.month)).map(v=>({...v,rate:v.total>0?+((v.cancelled/v.total)*100).toFixed(1):0}));
    const facRows=Object.values(byFac).sort((a,b)=>b.total-a.total).map(v=>({...v,rate:v.total>0?+((v.cancelled/v.total)*100).toFixed(1):0}));
    const facByRate=[...facRows].sort((a,b)=>b.rate-a.rate);
    const segRows=Object.values(bySeg).map(v=>({...v,rate:v.total>0?+((v.cancelled/v.total)*100).toFixed(1):0}));
    const countryRows=Object.values(byCountry).sort((a,b)=>b.total-a.total).slice(0,15).map(v=>({...v,rate:v.total>0?+((v.cancelled/v.total)*100).toFixed(1):0}));
    return{total,cancelled,rate,lost,monthTrend,facRows,facByRate,segRows,countryRows};
  },[tab,tlData,fP,fChannelBucket,fTlChannelName,fDF,fDTo]);

  // ─── TL Raw Data table ───
  const tlTC=["dateStr","facility","channel_name","channelBucket","status","guestName","country","segment","checkinStr","checkoutStr","nights","rooms","adults_male","adults_female","children","totalRev","planName","booking_id"];
  const tlTH=["Date","Facility","Channel","Bucket","Status","Guest","Country","Segment","Check-in","Check-out","Nights","Rooms","M","F","Kids","¥ (ex-tax)","Plan","Booking ID"];
  const tlTRows=useMemo(()=>{
    if(tab!=="tl-data")return[];
    let rows=tlFiltered.map(r=>{const o={};tlTC.forEach(c=>{o[c]=r[c]??""});return o});
    if(tSort.col)rows.sort((a,b)=>{let va=a[tSort.col],vb=b[tSort.col];if(typeof va==="number"&&typeof vb==="number")return tSort.asc?va-vb:vb-va;return tSort.asc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va))});
    return rows;
  },[tab,tlFiltered,tSort]);
  const tlPaged=useMemo(()=>tlTRows.slice(tPage*PG,(tPage+1)*PG),[tlTRows,tPage]);
  const tlTotPg=Math.ceil(tlTRows.length/PG);


  // Table
  const tC=["facility","brand","hotelType","region","country","segment","isCancelled","checkin","checkout","nights","leadTime","totalRev","roomSimple","device","rank","partySize"];
  const tH=[t.thFacility,t.brand,t.hotelType,t.thRegion,t.thCountry,t.thSegment,t.statusFilter,t.thCheckin,t.thCheckout,t.thNights,t.thLead,t.thRev,t.thRoom,t.thDevice,t.thRank,t.thParty];
  const tRows=useMemo(()=>{if(tab!=="data")return[];let rows=filtered.map(r=>{const o={};tC.forEach(c=>{o[c]=(c==="checkin"||c==="checkout")?(r[c]?tzFmt(r[c]):""):r[c]??""});return o});if(tSort.col)rows.sort((a,b)=>{let va=a[tSort.col],vb=b[tSort.col];if(typeof va==="number"&&typeof vb==="number")return tSort.asc?va-vb:vb-va;return tSort.asc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va))});return rows},[tab,filtered,tSort]);
  const paged=useMemo(()=>tRows.slice(tPage*PG,(tPage+1)*PG),[tRows,tPage]);const totPg=Math.ceil(tRows.length/PG);

  const expFilt=()=>{const h=["Facility","Region","Country","Segment","Check-in","Check-out","Nights","Lead","Rev","Room","Device","Rank","Party"];expCSV(filtered.map(r=>{const o={};tC.forEach((k,i)=>{o[h[i]]=(k==="checkin"||k==="checkout")?(r[k]?tzFmt(r[k]):""):r[k]??""});return o}),h,"filtered.csv")};
  const expSum=()=>{if(!agg)return;const h=["Country","Res","TotalRev","AvgRev","AvgLOS","AvgLead"];expCSV(Object.entries(agg.byC).sort((a,b)=>b[1].n-a[1].n).map(([c,v])=>({Country:c,Res:v.n,TotalRev:v.rev,AvgRev:Math.round(v.rev/v.n),AvgLOS:v.nights.length?avg(v.nights).toFixed(2):0,AvgLead:v.lead.length?avg(v.lead).toFixed(1):0})),h,"summary.csv")};

  // Styles
  useEffect(()=>{localStorage.setItem("rgl_theme",theme)},[theme]);
  const dk=theme==="dark";
  const TH={
    bg:dk?"#080e1a":"#f5f5f7",
    card:dk?"#0f1928":"#ffffff",
    border:dk?"#1e3150":"#e0e0e8",
    text:dk?"#c8c3b8":"#333333",
    textStrong:dk?"#f0ece4":"#1a1a2e",
    textMuted:dk?"#a0977f":"#888888",
    gold:"#c9a84c",
    input:dk?"#142444":"#f0f0f4",
    accent:dk?"rgba(201,168,76,0.12)":"rgba(201,168,76,0.15)",
    accentBorder:dk?"#c9a84c":"#b8952e",
    insightBg:dk?"rgba(201,168,76,0.06)":"rgba(201,168,76,0.08)",
    insightBorder:dk?"rgba(201,168,76,0.2)":"rgba(201,168,76,0.3)",
    gridLine:dk?"#1e3150":"#e0e0e8",
    tickFill:dk?"#a0977f":"#666666",
    tooltipBg:dk?"#1a3058":"#ffffff",
    tooltipBorder:dk?"#2a4a78":"#e0e0e8",
    tooltipText:dk?"#f0ece4":"#333333",
    filterBg:dk?"rgba(15,25,40,0.97)":"rgba(255,255,255,0.97)",
    pieLabelFill:dk?"#c8c3b8":"#333333",
  };
  const S={app:{fontFamily:"'DM Sans',sans-serif",background:TH.bg,color:TH.text,minHeight:"100vh"},inner:{maxWidth:1440,margin:"0 auto",padding:isMobile?"12px 6px":"24px 16px"},hdr:{borderBottom:"1px solid "+TH.border,paddingBottom:20,marginBottom:24},h1:{fontSize:24,fontWeight:700,color:TH.textStrong,letterSpacing:-.5,margin:0},gold:{color:TH.gold},sub:{fontSize:12,color:TH.textMuted,marginTop:4,fontFamily:"'JetBrains Mono',monospace"},card:{background:TH.card,border:"1px solid "+TH.border,borderRadius:8,padding:isMobile?10:16,marginBottom:12,overflow:"hidden",minWidth:0},ct:{fontSize:13,fontWeight:600,color:TH.textStrong,marginBottom:10},kpi:{background:TH.card,border:"1px solid "+TH.border,borderRadius:8,padding:"12px 14px",minWidth:140,flex:"1 1 140px"},kl:{fontSize:10,textTransform:"uppercase",letterSpacing:1,color:TH.textMuted,fontFamily:"'JetBrains Mono',monospace"},kv:{fontSize:22,fontWeight:700,color:TH.textStrong,marginTop:2},btn:{background:TH.card,border:"1px solid "+TH.border,color:TH.text,fontSize:12,padding:"6px 14px",borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all .15s"},ba:{background:TH.accent,borderColor:TH.accentBorder,color:TH.gold},bg:{background:"rgba(201,168,76,0.15)",border:"1px solid "+TH.gold,color:TH.gold,fontSize:12,padding:"6px 14px",borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"},sel:{background:TH.input,border:"1px solid "+TH.border,color:TH.text,fontSize:12,padding:"5px 8px",borderRadius:5,fontFamily:"'DM Sans',sans-serif",outline:"none"},inp:{background:TH.input,border:"1px solid "+TH.border,color:TH.text,fontSize:12,padding:"5px 8px",borderRadius:5,outline:"none"},tag:c=>({fontSize:10,fontWeight:500,padding:"2px 8px",borderRadius:4,background:c+"22",color:c,marginLeft:6,display:"inline-block"}),tbl:{width:"100%",borderCollapse:"collapse",fontSize:isMobile?10:12},th:{textAlign:"left",fontWeight:600,color:TH.gold,fontSize:isMobile?8:10,textTransform:"uppercase",letterSpacing:.5,padding:isMobile?"4px 4px":"6px 8px",borderBottom:"1px solid "+TH.border,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",userSelect:"none",whiteSpace:"nowrap"},td:{padding:isMobile?"3px 4px":"5px 8px",borderBottom:"1px solid "+TH.border+"66",fontSize:12,color:TH.text},upl:{border:"2px dashed "+TH.border,borderRadius:10,padding:"40px 20px",textAlign:"center",cursor:"pointer"},m:{fontFamily:"'JetBrains Mono',monospace"},fl:{fontSize:10,color:TH.textMuted,marginBottom:3,textTransform:"uppercase",fontFamily:"'JetBrains Mono',monospace"},lt:{display:"flex",background:TH.input,borderRadius:6,overflow:"hidden",border:"1px solid "+TH.border},lb:a=>({padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",border:"none",background:a?TH.gold:"transparent",color:a?(dk?"#080e1a":"#ffffff"):TH.textMuted,fontFamily:"'DM Sans',sans-serif"}),insight:{background:TH.insightBg,border:"1px solid "+TH.insightBorder,borderRadius:8,padding:14,marginBottom:14,fontSize:12,color:TH.textMuted,lineHeight:1.6}};
  const CT=({active,payload,label,formatter})=>{if(!active||!payload?.length)return null;return(<div style={{background:TH.tooltipBg,border:"1px solid "+TH.tooltipBorder,borderRadius:6,padding:"8px 12px",fontSize:12,color:TH.tooltipText}}><div style={{fontWeight:600,marginBottom:4,color:TH.gold}}>{label}</div>{payload.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}><span style={{width:8,height:8,borderRadius:2,background:p.color,display:"inline-block"}}/><span>{p.name}: {formatter?formatter(p.value):typeof p.value==="number"?p.value.toLocaleString():p.value}</span></div>)}</div>)};
  const LT=()=><div style={S.lt}><button style={S.lb(lang==="en")} onClick={()=>setLang("en")}>EN</button><button style={S.lb(lang==="ja")} onClick={()=>setLang("ja")}>日本語</button></div>;
  const trFn=v=>(lang==="ja"&&HEADER_JP[v])?HEADER_JP[v]:tl(v);
  const EB=({id,nm,data,title})=><div style={{display:"flex",gap:4}}><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>dlChart(id,nm,title)}>{t.exportImg}</button>{data&&data.length>0&&<><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>dlTable(data,title||nm,nm,trFn)}>📋</button><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>expXLS(data,title||nm,nm,trFn)}>📊</button></>}</div>;
  const CC=({title,id,nm,children,h,data,grid})=>{if(grid)return(<div style={{background:TH.card,border:"1px solid "+TH.border,borderRadius:8,padding:"6px 10px",height:"calc(100% - 4px)",display:"flex",flexDirection:"column",overflow:"hidden",boxSizing:"border-box"}}><div className="rgl-drag" style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"grab",flexShrink:0,marginBottom:4}}><div style={{fontSize:12,fontWeight:600,color:TH.textStrong,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{title}</div><EB id={id} nm={nm} data={data} title={title}/></div><div id={id} style={{flex:1,minHeight:0}}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div></div>);return(<div style={S.card}><div style={S.ct}>{title}</div><div id={id}><ResponsiveContainer width="100%" height={h||280}>{children}</ResponsiveContainer></div><div style={{marginTop:4}}><EB id={id} nm={nm} data={data} title={title}/></div></div>)};
  const SortTbl=({data,columns,renderRow,grandTotalRow,title,exportFn})=>{
    const[sortCol,setSortCol]=useState(null);
    const[sortAsc,setSortAsc]=useState(false);
    const sorted=useMemo(()=>{
      if(!sortCol||!data)return data||[];
      return[...data].sort((a,b)=>{
        let va=a[sortCol],vb=b[sortCol];
        if(typeof va==="string"&&va.match(/^[\d,.]+%?$/))va=parseFloat(va.replace(/[,%]/g,""));
        if(typeof vb==="string"&&vb.match(/^[\d,.]+%?$/))vb=parseFloat(vb.replace(/[,%]/g,""));
        if(typeof va==="number"&&typeof vb==="number")return sortAsc?va-vb:vb-va;
        return sortAsc?String(va||"").localeCompare(String(vb||"")):String(vb||"").localeCompare(String(va||""));
      });
    },[data,sortCol,sortAsc]);
    const toggleSort=col=>{if(sortCol===col)setSortAsc(!sortAsc);else{setSortCol(col);setSortAsc(false)}};
    const arrow=col=>sortCol===col?(sortAsc?" ▲":" ▼"):"";
    return<div style={S.card}>
      {(title||exportFn)&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>{title&&<div style={S.ct}>{title}</div>}<div style={{display:"flex",gap:4}}>{exportFn&&exportFn}{data&&data.length>0&&<button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>{const xlsData=data.map(r=>{const o={};columns.forEach(c=>{o[c.label]=r[c.key]});return o});expXLS(xlsData,title||"export",title||"export",trFn)}}>📊</button>}</div></div>}
      <div style={{overflowX:"auto"}}><table style={S.tbl}><thead><tr>
        {columns.map(c=><th key={c.key} style={{...S.th,cursor:"pointer"}} onClick={()=>toggleSort(c.key)}>{c.label}{arrow(c.key)}</th>)}
      </tr></thead><tbody>
        {sorted.map(renderRow)}
        {grandTotalRow}
      </tbody></table></div>
    </div>;
  };
  const[layoutVer,setLayoutVer]=useState(0);
  const[layoutLocked,setLayoutLocked]=useState(()=>localStorage.getItem("rgl_locked")==="1");
  const toggleLock=useCallback(()=>{setLayoutLocked(l=>{const n=!l;localStorage.setItem("rgl_locked",n?"1":"0");return n})},[]);
  const resetLay=useCallback(tabId=>{clearLayout(tabId);setLayoutVer(v=>v+1)},[]);
  const dgProps=tabId=>({tabId,layoutVer,onReset:()=>resetLay(tabId),resetLabel:t.resetLayout,btnStyle:{...S.btn,fontSize:10},locked:layoutLocked,onLockToggle:toggleLock,lockLabel:t.lockLayout});
  const tk={fill:TH.tickFill,fontSize:11},tks={fill:TH.tickFill,fontSize:10},gl={strokeDasharray:"3 3",stroke:TH.gridLine};
  const tlTick={fill:TH.tickFill,fontSize:11,formatter:v=>tl(v)};
  const TlTick=({x,y,payload,anchor})=><text x={x} y={y} textAnchor={anchor||"middle"} fill={TH.tickFill} fontSize={11} dy={12}>{tl(payload.value)}</text>;
  const TlTickV=({x,y,payload})=><text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={11} dy={4}>{tl(payload.value)}</text>;
  const TlTickV2=({x,y,payload})=>{const v=tl(payload.value);if(isMobile){const short=v.length>6?v.slice(0,6)+"…":v;return<text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={7} transform={`rotate(-45,${x},${y})`} dy={4}>{short}</text>}const parts=v.length>10?[v.slice(0,10),v.slice(10)]:[v];return<text x={x} y={y} textAnchor="middle" fill={TH.tickFill} fontSize={9}>{parts.map((p,i)=><tspan key={i} x={x} dy={i===0?12:11}>{p}</tspan>)}</text>};

  const TABS=[{id:"daily",l:t.dailyReport,src:"yyb"},{id:"compare",l:t.compare,src:"yyb"},{id:"pace",l:t.pace,src:"yyb"},{id:"overview",l:t.overview,src:"yyb"},{id:"kvk",l:t.kvk,src:"yyb"},{id:"markets",l:t.sourceMarkets,src:"yyb"},{id:"segments",l:t.segments,src:"yyb"},{id:"booking",l:t.bookingPatterns,src:"yyb"},{id:"member",l:t.memberTab,src:"yyb"},{id:"los",l:t.losTab,src:"yyb"},{id:"revenue",l:t.revenue,src:"yyb"},{id:"cancellations",l:t.cancellations,src:"yyb"},{id:"rooms",l:t.roomTypes,src:"yyb"},{id:"adr",l:t.adrTab,src:"yyb"},{id:"facilities",l:t.facilities,src:"yyb"},{id:"data",l:t.rawData,src:"yyb"},
    {id:"tl-channel",l:t.tlChannelMix,src:"tl"},
    {id:"tl-daily",l:t.tlDailyReport,src:"tl"},
    {id:"tl-revenue",l:t.tlRevenueTab,src:"tl"},
    {id:"tl-segments",l:t.tlSegmentsTab,src:"tl"},
    {id:"tl-member",l:t.tlMemberTab,src:"tl"},
    {id:"tl-overview",l:t.tlOverviewTab,src:"tl"},
    {id:"tl-los",l:t.tlLosTab,src:"tl"},
    {id:"tl-booking",l:t.tlBookingTab,src:"tl"},
    {id:"tl-compare",l:t.tlCompareTab,src:"tl"},
    {id:"tl-pace",l:t.tlPaceTab,src:"tl"},
    {id:"tl-adr",l:t.tlAdrTab,src:"tl"},
    {id:"tl-facilities",l:t.tlFacilitiesTab,src:"tl"},
    {id:"tl-kvk",l:t.tlKvkTab,src:"tl"},
    {id:"tl-markets",l:t.tlMarketsTab,src:"tl"},
    {id:"tl-cancellations",l:t.tlCancellationsTab,src:"tl"},
    {id:"tl-data",l:t.tlDataTab,src:"tl"},
  ];
  const activeTabSrc=(TABS.find(tb=>tb.id===tab)||{}).src||"yyb";
  const isTlTab=activeTabSrc==="tl";

  if(!allData.length)return(
    <div style={S.app}><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
    <div style={{...S.inner,maxWidth:700,paddingTop:60}}>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16,gap:8}}><div style={S.lt}><button style={S.lb(theme==="dark")} onClick={()=>setTheme("dark")}>{t.darkMode}</button><button style={S.lb(theme==="light")} onClick={()=>setTheme("light")}>{t.lightMode}</button></div><div><select style={{...S.sel,fontSize:10,padding:"4px 6px"}} value={tz} onChange={e=>setTz(e.target.value)} title={t.timezone}><option value="Asia/Tokyo">JST (UTC+9)</option><option value="America/New_York">EST (UTC-5)</option><option value="America/Chicago">CST (UTC-6)</option><option value="America/Los_Angeles">PST (UTC-8)</option><option value="Europe/London">GMT (UTC+0)</option><option value="Europe/Paris">CET (UTC+1)</option><option value="Asia/Shanghai">CST (UTC+8)</option><option value="Asia/Kolkata">IST (UTC+5:30)</option><option value="Australia/Sydney">AEST (UTC+11)</option><option value="Pacific/Auckland">NZST (UTC+12)</option><option value="UTC">UTC</option></select></div><LT/></div>
      <div style={{textAlign:"center",marginBottom:40}}><h1 style={{...S.h1,fontSize:28}}>{t.uploadTitle} <span style={S.gold}>{t.uploadAccent}</span> <span style={{fontSize:10,color:TH.textMuted,fontWeight:400,fontFamily:"'JetBrains Mono',monospace"}}>v{APP_VERSION}</span></h1></div>
      {sheetStatus==="loading"&&<div style={{textAlign:"center",marginBottom:24,overflow:"hidden",position:"relative",height:100}}>
        <div style={{position:"absolute",animation:"logoTumble 3.5s linear infinite",top:10}}>
          <img src={import.meta.env.BASE_URL+"monday-logo.png"} alt="MONday" style={{width:60,height:60,animation:"logoSpin 1.2s linear infinite"}}/>
        </div>
        <style>{`@keyframes logoTumble{0%{left:-80px}100%{left:calc(100% + 80px)}}@keyframes logoSpin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
        <div style={{position:"absolute",bottom:0,width:"100%",fontSize:14,color:TH.gold,fontWeight:600}}>{t.sheetLoading}</div>
      </div>}
      {sheetStatus==="error"&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:14,marginBottom:16,textAlign:"center"}}><div style={{fontSize:12,color:"#ef4444"}}>⚠ {t.sheetError}</div></div>}
      {sheetStatus!=="loading"&&(<><div style={{textAlign:"center",fontSize:12,color:TH.textMuted,marginBottom:12}}>{sheetStatus==="error"?"":t.orUpload}</div>
      <label style={S.upl} onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor="#c9a84c"}} onDragLeave={e=>{e.currentTarget.style.borderColor="#1e3150"}} onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor="#1e3150";handleFiles(e)}}>
        <input type="file" accept=".csv" multiple style={{display:"none"}} onChange={handleFiles}/><div style={{fontSize:40,marginBottom:12}}>📂</div><div style={{fontSize:15,color:TH.textStrong,fontWeight:600,marginBottom:4}}>{t.dropHere}</div><div style={{fontSize:12,color:TH.textMuted}}>{t.dropSub}</div>
      </label></>)}
      {proc&&<div style={{textAlign:"center",marginTop:20,color:"#c9a84c"}}>{t.processing}</div>}
      {errs.length>0&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:14,marginTop:16}}>{errs.map((e,i)=><div key={i} style={{fontSize:12,color:"#ef4444",marginBottom:2}}>⚠ {e}</div>)}</div>}
    </div></div>
  );

  return(
    <div style={S.app}><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
    <div style={S.inner}>
      {/* Header */}
      <div style={S.hdr}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}><div><h1 style={S.h1}>{t.title} <span style={S.gold}>{t.titleAccent}</span> <span style={{fontSize:10,color:TH.textMuted,fontWeight:400,fontFamily:"'JetBrains Mono',monospace"}}>v{APP_VERSION}</span></h1><div style={S.sub}>{t.loadedFrom(fmtN(allData.length),fL.length)} • {t.showing(fmtN(filtered.length))}</div></div><div style={{display:"flex",gap:8,alignItems:"center"}}><div style={S.lt}><button style={S.lb(theme==="dark")} onClick={()=>setTheme("dark")}>{t.darkMode}</button><button style={S.lb(theme==="light")} onClick={()=>setTheme("light")}>{t.lightMode}</button></div><div><select style={{...S.sel,fontSize:10,padding:"4px 6px"}} value={tz} onChange={e=>setTz(e.target.value)} title={t.timezone}><option value="Asia/Tokyo">JST (UTC+9)</option><option value="America/New_York">EST (UTC-5)</option><option value="America/Chicago">CST (UTC-6)</option><option value="America/Los_Angeles">PST (UTC-8)</option><option value="Europe/London">GMT (UTC+0)</option><option value="Europe/Paris">CET (UTC+1)</option><option value="Asia/Shanghai">CST (UTC+8)</option><option value="Asia/Kolkata">IST (UTC+5:30)</option><option value="Australia/Sydney">AEST (UTC+11)</option><option value="Pacific/Auckland">NZST (UTC+12)</option><option value="UTC">UTC</option></select></div><LT/><button style={{...S.btn,...((sheetStatus==="loading"||tlStatus==="loading")?{opacity:0.6,cursor:"wait"}:{})}} onClick={refreshAllData} disabled={sheetStatus==="loading"||tlStatus==="loading"} title={lastFetchTs?`Last loaded: ${new Date(lastFetchTs).toLocaleTimeString()}`:""}>{(sheetStatus==="loading"||tlStatus==="loading")?"⟳ "+t.refreshing:"⟳ "+t.refresh}</button><label style={S.bg}><input type="file" accept=".csv" multiple style={{display:"none"}} onChange={handleFiles}/>{t.addFiles}</label><button style={S.btn} onClick={clearAll}>{t.clearAll}</button><button style={{...S.btn,background:"rgba(239,68,68,0.1)",borderColor:"#ef4444",color:"#ef4444"}} className="no-print" onClick={()=>window.print()}>{t.downloadPDF}</button></div></div>
        {fL.length>0&&<div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap",alignItems:"center"}}>{fL.map((f,i)=><span key={i} style={{fontSize:10,background:TH.input,padding:"3px 8px",borderRadius:4,color:TH.textMuted}}>{f.name} ({fmtN(f.rows)}) <span style={{color:"#4ea8de"}}>{f.encoding}</span></span>)}<span style={{fontSize:10,color:TH.textMuted,fontStyle:"italic"}}>{t.dataCoverage}</span></div>}
        {errs.length>0&&<div style={{marginTop:8}}>{errs.map((e,i)=><div key={i} style={{fontSize:11,color:"#ef4444"}}>⚠ {e}</div>)}</div>}
      </div>
      {/* Filters */}
      {filtersOpen?<div style={{...S.card,overflow:"visible",marginBottom:16,display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap",position:"sticky",top:0,zIndex:50,background:TH.filterBg,backdropFilter:"blur(8px)",boxShadow:"0 4px 16px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex",gap:6,alignItems:"center",flexBasis:"100%",marginBottom:6,flexWrap:"wrap"}}>
          <div style={{fontSize:10,fontWeight:600,color:TH.textMuted,textTransform:"uppercase",fontFamily:"'JetBrains Mono',monospace"}}>{t.presets}:</div>
          {presets.map(p=><div key={p.name} style={{display:"flex",gap:2,alignItems:"center"}}><button style={{...S.btn,fontSize:10,padding:"3px 10px",...(activePreset===p.name?{background:"rgba(52,211,153,0.15)",borderColor:"#34d399",color:"#34d399"}:{background:TH.accent,borderColor:TH.accentBorder,color:TH.gold})}} onClick={()=>loadPreset(p)}>{activePreset===p.name?"✓ ":""}{p.name}</button><button style={{...S.btn,fontSize:8,padding:"2px 5px",color:"#ef4444",borderColor:"rgba(239,68,68,0.3)"}} onClick={()=>deletePreset(p.name)}>×</button></div>)}
          {presets.length===0&&<span style={{fontSize:10,color:TH.textMuted,fontStyle:"italic"}}>{t.noPresets}</span>}
          <div style={{display:"flex",gap:4,alignItems:"center",marginLeft:"auto"}}>
            <input id="preset-input" type="text" placeholder={t.presetName} style={{...S.inp,fontSize:10,padding:"3px 8px",width:120}} onKeyDown={e=>{if(e.key==="Enter"){savePreset(e.target.value);e.target.value=""}}}/>
            <button style={{...S.btn,fontSize:10,padding:"3px 10px",background:"rgba(201,168,76,0.15)",borderColor:TH.gold,color:TH.gold}} onClick={()=>{const inp=document.getElementById("preset-input");if(inp){savePreset(inp.value);inp.value=""}}}>{t.saveView}</button>
            {presetMsg&&<span style={{fontSize:10,color:"#34d399"}}>{presetMsg}</span>}
          </div>
        </div>
        {!isTlTab&&<div><div style={S.fl}>{t.statusFilter}</div><div style={{display:"flex",gap:3}}>{[["confirmed",t.statusConfirmed],["cancelled",t.statusCancelled],["all",t.statusAll]].map(([v,l])=><button key={v} style={{...S.btn,...(fCancel===v?S.ba:{})}} onClick={()=>setFCancel(v)}>{l}</button>)}</div></div>}
        {!isTlTab&&<div><div style={S.fl}>{t.hotelType}</div><div style={{display:"flex",gap:3}}>{[["All",t.all],["Hotel",t.hotelTypeHotel],["Apart",t.hotelTypeApart]].map(([v,l])=><button key={v} style={{...S.btn,...(fHType===v?S.ba:{})}} onClick={()=>setFHType(v)}>{l}</button>)}</div></div>}
        {!isTlTab&&<div><div style={S.fl}>{t.brand}</div><MS options={uB} selected={fBrands} onChange={setFBrands} placeholder={t.allBrands} S={S} cl={t.clear}/></div>}
        {!isTlTab&&<div><div style={S.fl}>{t.region}</div><div style={{display:"flex",gap:3}}>{["All","Kanto","Kansai"].map(r=><button key={r} style={{...S.btn,...(fR===r?S.ba:{})}} onClick={()=>setFR(r)}>{r==="All"?t.all:tl(r)}</button>)}</div></div>}
        {!isTlTab&&<div><div style={S.fl}>{t.country}</div><MS options={uC} selected={fC} onChange={setFC} placeholder={t.allCountries} S={S} cl={t.clear}/></div>}
        {!isTlTab&&<div><div style={S.fl}>{t.segment}</div><MS options={uS} selected={fS} onChange={setFS} placeholder={t.allSegments} S={S} cl={t.clear}/></div>}
        {!isTlTab&&<div><div style={S.fl}>{t.property}</div><MS options={uP} selected={fP} onChange={setFP} placeholder={t.allProperties} maxShow={1} S={S} cl={t.clear}/></div>}
        {isTlTab&&<div><div style={S.fl}>{t.property}</div><MS options={uTlFac} selected={fP} onChange={setFP} placeholder={t.allProperties} maxShow={1} S={S} cl={t.clear}/></div>}
        {isTlTab&&<div><div style={S.fl}>{t.tlChannelBucket}</div><MS options={["ota","rta","direct"]} selected={fChannelBucket} onChange={setFChannelBucket} placeholder={t.all} S={S} cl={t.clear}/></div>}
        {isTlTab&&<div><div style={S.fl}>{t.tlChannelName}</div><MS options={uTlChannelName} selected={fTlChannelName} onChange={setFTlChannelName} placeholder={t.all} maxShow={1} S={S} cl={t.clear}/></div>}
        {isTlTab&&<div><div style={S.fl}>{t.tlStatus}</div><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{[["net",t.tlStatusNet],["all",t.tlStatusAll],["cancelled",t.tlStatusCancelled],["modified",t.tlStatusModified]].map(([v,l])=><button key={v} style={{...S.btn,...(fTlStatus===v?S.ba:{})}} onClick={()=>setFTlStatus(v)}>{l}</button>)}</div></div>}
{!isTlTab&&<div><div style={S.fl}>{t.geoArea}</div><MS options={uGeo} selected={fGeo} onChange={setFGeo} placeholder={t.allGeoAreas} S={S} cl={t.clear}/></div>}
{!isTlTab&&<div><div style={S.fl}>{t.dowFilter}</div><MS options={uDOW} selected={fDOW} onChange={setFDOW} placeholder={t.allDOW} S={S} cl={t.clear}/></div>}
        {!isTlTab&&<div><div style={S.fl}>{t.dateType}</div><select style={S.sel} value={fDT} onChange={e=>setFDT(e.target.value)}><option value="checkin">{t.checkin}</option><option value="checkout">{t.checkout}</option><option value="booking">{t.bookingDate}</option></select></div>}
        <div><div style={S.fl}>{t.from}</div><input type="date" style={S.inp} value={fDF} onChange={e=>setFDF(e.target.value)}/></div>
        <div><div style={S.fl}>{t.to}</div><input type="date" style={S.inp} value={fDTo} onChange={e=>setFDTo(e.target.value)}/></div>
        {!isTlTab&&<div><div style={S.fl}>{t.monthModeLabel}</div><div style={{display:"flex",gap:3}}><button style={{...S.btn,...(monthMode==="stay"?S.ba:{})}} onClick={()=>setMonthMode("stay")}>{t.monthByStay}</button><button style={{...S.btn,...(monthMode==="booking"?S.ba:{})}} onClick={()=>setMonthMode("booking")}>{t.monthByBooking}</button></div></div>}
        <button style={{...S.btn,color:"#ef4444",borderColor:"rgba(239,68,68,0.3)"}} onClick={()=>{setFR("All");setFC([]);setFS([]);setFP([]);setFDF("");setFDTo("");setMonthMode("booking");setFCancel("all");setFHType("All");setFBrands([]);setFGeo([]);setFDOW([]);setFChannelBucket([]);setFTlChannelName([]);setFTlStatus("net");setActivePreset(null)}}>{t.reset}</button>
        <button style={{...S.btn,fontSize:16,padding:"4px 10px",marginLeft:"auto"}} onClick={()=>setFiltersOpen(false)} title="Minimize filters">−</button>
      </div>:<button onClick={()=>setFiltersOpen(true)} style={{position:"sticky",top:8,zIndex:50,marginLeft:"auto",display:"block",background:TH.filterBg,border:"1px solid "+TH.border,borderRadius:8,padding:"8px 14px",cursor:"pointer",color:TH.gold,fontSize:12,fontFamily:"'DM Sans',sans-serif",marginBottom:12,boxShadow:"0 4px 12px rgba(0,0,0,0.4)"}}>⚙ Filters</button>}
      {/* KPIs */}
      {agg&&!isTlTab&&<div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
        <div style={S.kpi}><div style={S.kl}>{t.reservations}</div><div style={S.kv}>{fmtN(agg.n)}</div></div>
        <div style={S.kpi}><div style={S.kl}>{t.totalRevenue}</div><div style={S.kv}>¥{fmtN(agg.totalRev)}</div></div>
        <div style={S.kpi}><div style={S.kl}>{t.avgRevRes}</div><div style={S.kv}>¥{fmtN(Math.round(agg.avgRev))}</div></div>
        <div style={S.kpi}><div style={S.kl}>{t.avgLOS}</div><div style={S.kv}>{agg.avgNights.toFixed(1)}{t.nu}</div></div>
        <div style={S.kpi}><div style={S.kl}>{t.avgLeadTime}</div><div style={S.kv}>{agg.avgLead.toFixed(0)}{t.du}</div></div>
        <div style={S.kpi}><div style={S.kl}>{t.intlPct}</div><div style={S.kv}>{agg.intlPct.toFixed(1)}%</div></div>
      </div>}
      {/* Tabs */}
      <div style={{display:"flex",gap:2,borderBottom:"1px solid "+TH.border,marginBottom:8,overflowX:"auto",alignItems:"flex-end"}}>
        <span style={{fontSize:9,fontWeight:700,letterSpacing:1,color:SOURCE_COLORS.yyb,padding:"10px 8px 10px 4px",textTransform:"uppercase",userSelect:"none",alignSelf:"center"}}>YYB</span>
        {TABS.filter(tb=>tb.src==="yyb").map(tb=><button key={tb.id} onClick={()=>{setTab(tb.id);setTPage(0)}} style={{...S.btn,border:"none",borderBottom:"2px solid "+(tab===tb.id?SOURCE_COLORS.yyb:"transparent"),color:tab===tb.id?SOURCE_COLORS.yyb:TH.textMuted,borderRadius:0,padding:"8px 14px",whiteSpace:"nowrap"}}>{tb.l}</button>)}
        <span style={{borderLeft:"1px solid "+TH.border,height:24,margin:"0 8px",alignSelf:"center"}}/>
        <span style={{fontSize:9,fontWeight:700,letterSpacing:1,color:SOURCE_COLORS.tl,padding:"10px 8px 10px 4px",textTransform:"uppercase",userSelect:"none",alignSelf:"center"}}>TL</span>
        {TABS.filter(tb=>tb.src==="tl").map(tb=><button key={tb.id} onClick={()=>{setTab(tb.id);setTPage(0)}} style={{...S.btn,border:"none",borderBottom:"2px solid "+(tab===tb.id?SOURCE_COLORS.tl:"transparent"),color:tab===tb.id?SOURCE_COLORS.tl:TH.textMuted,borderRadius:0,padding:"8px 14px",whiteSpace:"nowrap"}}>{tb.l}</button>)}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",marginBottom:14,borderRadius:6,background:isTlTab?"rgba(94,234,212,0.08)":"rgba(201,168,76,0.08)",border:"1px solid "+(isTlTab?"rgba(94,234,212,0.3)":"rgba(201,168,76,0.3)"),fontSize:10,color:isTlTab?SOURCE_COLORS.tl:SOURCE_COLORS.yyb,fontWeight:600,letterSpacing:0.5,flexWrap:"wrap"}}>
        <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:isTlTab?SOURCE_COLORS.tl:SOURCE_COLORS.yyb}}/>
        {isTlTab?t.sourceBannerTL:t.sourceBannerYYB}
        {isTlTab&&tlCoverage&&<span style={{marginLeft:"auto",color:TH.textMuted,fontWeight:500,fontSize:9,letterSpacing:0.3}}>{t.tlCoverage}: {tlCoverage.coverage}% ({fmtN(tlCoverage.rowsWithCountry)}/{fmtN(tlCoverage.totalRows)}) · {t.tlCoverageNote}</span>}
      </div>

      {/* DAILY REPORT */}
      {tab==="daily"&&<div>
        <div style={{display:"flex",gap:16,alignItems:"flex-end",marginBottom:16,flexWrap:"wrap"}}>
          <div><div style={S.fl}>{t.drDate}</div><div style={{fontSize:9,color:TH.textMuted,fontStyle:"italic"}}>{t.drDisclaimer}</div></div>
          <div><div style={S.fl}>{t.drFrom}</div><input type="date" style={S.inp} value={drFrom} onChange={e=>setDrFrom(e.target.value)}/></div>
          <div><div style={S.fl}>{t.drTo}</div><input type="date" style={S.inp} value={drTo} onChange={e=>setDrTo(e.target.value)}/></div>
        </div>
        {dailyRpt&&!dailyRpt.empty?<>
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",flexDirection:isMobile?"column":"row"}}>
            <div style={S.kpi}><div style={S.kl}>{t.drCount}</div><div style={S.kv}>{fmtN(dailyRpt.totalCount)}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.drRevenue}</div><div style={S.kv}>¥{fmtN(dailyRpt.totalRev)}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.drADR}</div><div style={S.kv}>¥{fmtN(dailyRpt.totalADR)}</div></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
            <SortTbl
              data={dailyRpt.countryRows}
              columns={[{key:"country",label:t.drCountry},{key:"count",label:t.drCount},{key:"rev",label:t.drRevenue},{key:"adr",label:t.drADR},{key:"share",label:t.drShare}]}
              renderRow={r=><tr key={r.country}><td style={S.td}>{tl(r.country)}</td><td style={{...S.td,...S.m}}>{r.count}</td><td style={{...S.td,...S.m}}>{fmtN(r.rev)}</td><td style={{...S.td,...S.m}}>{fmtN(r.adr)}</td><td style={{...S.td,...S.m}}>{r.share}</td></tr>}
              grandTotalRow={<tr style={{fontWeight:700}}><td style={S.td}>{t.drGrandTotal}</td><td style={{...S.td,...S.m}}>{dailyRpt.totalCount}</td><td style={{...S.td,...S.m}}>{fmtN(dailyRpt.totalRev)}</td><td style={{...S.td,...S.m}}>{fmtN(dailyRpt.totalADR)}</td><td style={{...S.td,...S.m}}>100%</td></tr>}
              title={t.drCountryTable}
              exportFn={<button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>expCSV(dailyRpt.countryRows.map(r=>({Country:r.country,Res:r.count,Revenue:r.rev,ADR:r.adr,Share:r.share})),["Country","Res","Revenue","ADR","Share"],"daily_country.csv")}>⬇ CSV</button>}
            />
            <div style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={S.ct}>{t.drRevYoY}</div><div style={{display:"flex",gap:4}}><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>dlChart("dr-rev-yoy","rev_yoy",t.drRevYoY)}>{t.exportImg}</button><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>dlTable(dailyRpt.yoyRev,t.drRevYoY,"rev_yoy",v=>(lang==="ja"&&HEADER_JP[v])?HEADER_JP[v]:tl(v))}>📋</button></div></div>
              <div id="dr-rev-yoy"><ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyRpt.yoyRev}>
                  <CartesianGrid {...gl}/>
                  <XAxis dataKey="country" tick={<TlTickV2/>} interval={0} height={isMobile?60:30}/>
                  <YAxis tick={tk} tickFormatter={fmtY}/>
                  <Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/>
                  <Legend/>
                  <Bar dataKey="current" fill={dk?"#c8c3b8":"#1a1a2e"} name={dailyRpt.curLabel} radius={[4,4,0,0]}/>
                  <Bar dataKey="prev" fill={TH.gold} name={dailyRpt.prevLabel} radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer></div>
            </div>
            <SortTbl
              data={dailyRpt.regionRows}
              columns={[{key:"region",label:t.drRegion},{key:"count",label:t.drCount},{key:"rev",label:t.drRevenue},{key:"adr",label:t.drADR},{key:"share",label:t.drShare}]}
              renderRow={r=><tr key={r.region}><td style={S.td}>{r.region}</td><td style={{...S.td,...S.m}}>{r.count}</td><td style={{...S.td,...S.m}}>{fmtN(r.rev)}</td><td style={{...S.td,...S.m}}>{fmtN(r.adr)}</td><td style={{...S.td,...S.m}}>{r.share}</td></tr>}
              grandTotalRow={<tr style={{fontWeight:700}}><td style={S.td}>{t.drGrandTotal}</td><td style={{...S.td,...S.m}}>{dailyRpt.totalCount}</td><td style={{...S.td,...S.m}}>{fmtN(dailyRpt.totalRev)}</td><td style={{...S.td,...S.m}}>{fmtN(dailyRpt.totalADR)}</td><td style={{...S.td,...S.m}}>100%</td></tr>}
              title={t.drRegionTable}
              exportFn={<button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>expCSV(dailyRpt.regionRows.map(r=>({Region:r.region,Res:r.count,Revenue:r.rev,ADR:r.adr,Share:r.share})),["Region","Res","Revenue","ADR","Share"],"daily_region.csv")}>⬇ CSV</button>}
            />
            <div style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={S.ct}>{t.drCountYoY}</div><div style={{display:"flex",gap:4}}><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>dlChart("dr-count-yoy","count_yoy",t.drCountYoY)}>{t.exportImg}</button><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>dlTable(dailyRpt.yoyCount,t.drCountYoY,"count_yoy",v=>(lang==="ja"&&HEADER_JP[v])?HEADER_JP[v]:tl(v))}>📋</button></div></div>
              <div id="dr-count-yoy"><ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyRpt.yoyCount}>
                  <CartesianGrid {...gl}/>
                  <XAxis dataKey="country" tick={<TlTickV2/>} interval={0} height={isMobile?60:30}/>
                  <YAxis tick={tk}/>
                  <Tooltip content={<CT/>}/>
                  <Legend/>
                  <Bar dataKey="current" fill={dk?"#c8c3b8":"#1a1a2e"} name={dailyRpt.curLabel} radius={[4,4,0,0]}/>
                  <Bar dataKey="prev" fill={TH.gold} name={dailyRpt.prevLabel} radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer></div>
            </div>
          </div>
          {/* Section 1+2: ADR + 直販比率 */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14,marginTop:14}}>
            <div style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={S.ct}>{t.drADRChart}</div><div style={{display:"flex",gap:4}}><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>dlChart("dr-adr","adr",t.drADRChart)}>{t.exportImg}</button></div></div>
              <div id="dr-adr"><ResponsiveContainer width="100%" height={Math.max(280,dailyRpt.adrData.length*24)}>
                <BarChart data={dailyRpt.adrData} layout="vertical">
                  <CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={v=>"¥"+v.toLocaleString()}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/>
                  <Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="adr" fill={TH.gold} radius={[0,4,4,0]} name="ADR"/>
                </BarChart>
              </ResponsiveContainer></div>
            </div>
            <div style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={S.ct}>{t.drDirectRatio}</div><div style={{display:"flex",gap:4}}><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>dlChart("dr-direct","direct_ratio",t.drDirectRatio)}>{t.exportImg}</button></div></div>
              <div id="dr-direct"><ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyRpt.directRatio}>
                  <CartesianGrid {...gl}/><XAxis dataKey="date" tick={tks}/><YAxis tick={tks} tickFormatter={v=>v+"%"} domain={[0,100]}/>
                  <Tooltip content={<CT formatter={v=>v+"%"}/>}/><Legend wrapperStyle={{fontSize:10}}/>
                  {dailyRpt.drMonthKeys.map((m,i)=><Bar key={m} dataKey={m} stackId="a" fill={PALETTE[i%PALETTE.length]} name={m}/>)}
                </BarChart>
              </ResponsiveContainer></div>
            </div>
          </div>
          {/* Section 3+4: 施設別 + プラン別 */}
          <div style={{marginTop:14,borderTop:"1px solid "+TH.border,paddingTop:14}}>
            <div style={{display:"flex",gap:16,alignItems:"flex-end",marginBottom:14}}>
              <div><div style={S.fl}>{t.drSingleDate}</div><input type="date" style={S.inp} value={drSingle} onChange={e=>setDrSingle(e.target.value)}/></div>
              <div style={{fontSize:9,color:TH.textMuted,fontStyle:"italic"}}>※数字は8:40以降に確定</div>
            </div>
            {(()=>{
              const localD=dt=>tzFmt(dt);
              const sd=drSingle;if(!sd)return null;
              const dayData=allData.filter(r=>localD(r.bookingDate)===sd);
              if(!dayData.length)return<div style={{color:TH.textMuted,textAlign:"center",padding:20}}>{t.drNoData}</div>;
              // Current month and next 4 months
              const now=new Date(sd);const months=[];for(let i=0;i<5;i++){const d2=new Date(now.getFullYear(),now.getMonth()+i,1);months.push(tzFmt(d2,"month"))}
              const monthLabels=months.map(m=>{const[y,mo]=m.split("-");return parseInt(mo)+"月"});
              const afterLabel="以降";

              // Helper to build month breakdown rows
              const buildRows=(data,keyField)=>{
                const groups={};
                data.forEach(r=>{const k=r[keyField]||"Unknown";if(!groups[k])groups[k]={counts:{},total:0,rev:0};const ci=r.checkinMonth||"unknown";groups[k].total++;groups[k].rev+=r.totalRev||0;const bucket=months.includes(ci)?ci:"after";groups[k].counts[bucket]=(groups[k].counts[bucket]||0)+1});
                return Object.entries(groups).sort((a,b)=>b[1].total-a[1].total).map(([k,v])=>{
                  const row={name:k};months.forEach((m,i)=>{row[monthLabels[i]]=v.counts[m]||0});row[afterLabel]=v.counts["after"]||0;row["件数"]=v.total;row["売上"]=v.rev;return row;
                });
              };

              // Section 3: 施設別 — Hotel, Apart, Direct(TABI/GRAND/Premium)
              const hotelData=dayData.filter(r=>{const lw=r.facility.toLowerCase();return lw.includes("hotel")||lw.includes("イチホテル")||lw.includes("premium hotel")});
              const apartData=dayData.filter(r=>{const lw=r.facility.toLowerCase();return!(lw.includes("hotel")||lw.includes("イチホテル")||lw.includes("premium hotel"))});
              const hotelRows=buildRows(hotelData,"facility");
              const apartRows=buildRows(apartData,"facility");
              const directFacs=["TABI","GRAND","Premium hotel","Premium Apart"];
              const directData=dayData.filter(r=>directFacs.some(f=>r.facility.includes(f)));
              const directRows=buildRows(directData,"facility");
              const allCols=[...monthLabels,afterLabel,"件数","売上"];
              const grandRow=(rows)=>{const gr={name:"Grand total"};allCols.forEach(c=>{gr[c]=rows.reduce((a,r)=>a+(r[c]||0),0)});return gr};

              const FacTable=({title,rows})=><div style={{...S.card,overflow:"hidden",minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={S.ct}>{title}</div><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>expCSV([...rows,grandRow(rows)].map(r=>{const o={};["name",...allCols].forEach(c=>{o[c]=r[c]});return o}),["name",...allCols],title+".csv")}>⬇ CSV</button></div>
                <div style={{overflowX:"auto"}}><table style={S.tbl}><thead><tr><th style={S.th}>{t.drFacilityName}</th>{allCols.map(c=><th key={c} style={S.th}>{c}</th>)}</tr></thead><tbody>
                {rows.map(r=><tr key={r.name}><td style={{...S.td,whiteSpace:"nowrap"}}>{shortFac(r.name)}</td>{allCols.map(c=><td key={c} style={{...S.td,...S.m}}>{c==="売上"?fmtN(r[c]):r[c]}</td>)}</tr>)}
                {(()=>{const gr=grandRow(rows);return<tr style={{fontWeight:700}}><td style={S.td}>Grand total</td>{allCols.map(c=><td key={c} style={{...S.td,...S.m}}>{c==="売上"?fmtN(gr[c]):gr[c]}</td>)}</tr>})()}
                </tbody></table></div>
              </div>;

              // Section 4: プラン別 — Total, Hotel, Apart
              const planTable=(title,data)=>{
                const totalRev2=data.reduce((a,r)=>a+(r.totalRev||0),0);
                const byPlan={};["返金不可","学生","その他"].forEach(pt=>{byPlan[pt]={counts:{},total:0,rev:0}});
                data.forEach(r=>{const pt=r.planType||"その他";if(!byPlan[pt])byPlan[pt]={counts:{},total:0,rev:0};const ci=r.checkinMonth||"unknown";const bucket=months.includes(ci)?ci:"after";byPlan[pt].counts[bucket]=(byPlan[pt].counts[bucket]||0)+1;byPlan[pt].total++;byPlan[pt].rev+=r.totalRev||0});
                const planRows=["返金不可","学生","その他"].map(pt=>{const v=byPlan[pt];const row={name:pt};months.forEach((m,i)=>{row[monthLabels[i]]=v.counts[m]||0});row[afterLabel]=v.counts["after"]||0;row["件数"]=v.total;row["売上"]=v.rev;row["売上シェア"]=totalRev2>0?((v.rev/totalRev2)*100).toFixed(1)+"%":"0%";return row});
                const planCols=[...monthLabels,afterLabel,"件数","売上","売上シェア"];
                const planGrand={name:"Grand total"};planCols.forEach(c=>{if(c==="売上シェア")planGrand[c]="100%";else planGrand[c]=planRows.reduce((a,r)=>a+(typeof r[c]==="number"?r[c]:0),0)});
                return<div style={S.card}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={S.ct}>{title}</div><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>expCSV([...planRows,planGrand].map(r=>{const o={};["name",...planCols].forEach(c=>{o[c]=r[c]});return o}),["name",...planCols],title+".csv")}>⬇ CSV</button></div>
                  <div style={{overflowX:"auto"}}><table style={S.tbl}><thead><tr><th style={S.th}>{t.drPlanType}</th>{planCols.map(c=><th key={c} style={S.th}>{c}</th>)}</tr></thead><tbody>
                  {planRows.map(r=><tr key={r.name}><td style={S.td}>{r.name}</td>{planCols.map(c=><td key={c} style={{...S.td,...S.m}}>{c==="売上"?fmtN(r[c]):r[c]}</td>)}</tr>)}
                  <tr style={{fontWeight:700}}><td style={S.td}>Grand total</td>{planCols.map(c=><td key={c} style={{...S.td,...S.m}}>{c==="売上"?fmtN(planGrand[c]):planGrand[c]}</td>)}</tr>
                  </tbody></table></div>
                </div>;
              };

              // Cancellation data (same month breakdown format)
              const cancelDayData=dayData.filter(r=>r.isCancelled);
              const cancelFacMonthRows=buildRows(cancelDayData,"facility");
              const cancelCountryMonthRows=buildRows(cancelDayData,"country");

              return<>
                <div style={S.ct}>{t.drByFacility}</div>
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
                  <FacTable title={t.drHotel} rows={hotelRows}/>
                  <FacTable title={t.drApart} rows={apartRows}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
                  <FacTable title="直販" rows={directRows}/>
                </div>
                <div style={{marginTop:14}}><div style={S.ct}>{t.drByPlan}</div></div>
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
                  {planTable(t.drTotal,dayData)}
                </div>
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
                  {planTable(t.drHotel,hotelData)}
                  {planTable(t.drApart,apartData)}
                </div>
                {cancelDayData.length>0&&<>
                  <div style={{marginTop:14}}><div style={S.ct}>{t.drCancelData} ({cancelDayData.length})</div></div>
                  <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
                    <FacTable title={t.drCancelFacility} rows={cancelFacMonthRows}/>
                    <div style={S.card}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={S.ct}>{t.drCancelCountry}</div><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>expCSV([...cancelCountryMonthRows,grandRow(cancelCountryMonthRows)].map(r=>{const o={};["name",...allCols].forEach(c=>{o[c]=r[c]});return o}),["name",...allCols],"cancel_country.csv")}>⬇ CSV</button></div>
                      <div style={{overflowX:"auto"}}><table style={S.tbl}><thead><tr><th style={S.th}>{t.drCountry}</th>{allCols.map(c=><th key={c} style={S.th}>{c}</th>)}</tr></thead><tbody>
                      {cancelCountryMonthRows.map(r=><tr key={r.name}><td style={S.td}>{tl(r.name)}</td>{allCols.map(c=><td key={c} style={{...S.td,...S.m}}>{c==="売上"?fmtN(r[c]):r[c]}</td>)}</tr>)}
                      {(()=>{const gr=grandRow(cancelCountryMonthRows);return<tr style={{fontWeight:700}}><td style={S.td}>Grand total</td>{allCols.map(c=><td key={c} style={{...S.td,...S.m}}>{c==="売上"?fmtN(gr[c]):gr[c]}</td>)}</tr>})()}
                      </tbody></table></div>
                    </div>
                  </div>
                </>}
              </>;
            })()}
          </div>
          {/* Section 5: クーポンデータ */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14,marginTop:14}}>
            <SortTbl
              data={dailyRpt.couponRows}
              columns={[{key:"name",label:t.drCouponName},{key:"count",label:t.drCount},{key:"pct",label:t.drUsage},{key:"rev",label:t.drRevenue}]}
              renderRow={r=><tr key={r.name}><td style={S.td}>{r.name}</td><td style={{...S.td,...S.m}}>{r.count}</td><td style={{...S.td,...S.m}}>{r.pct}</td><td style={{...S.td,...S.m}}>{fmtN(r.rev)}</td></tr>}
              title={t.drCouponData}
              exportFn={<button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>expCSV(dailyRpt.couponRows,["name","count","pct","rev"],"coupon_summary.csv")}>⬇ CSV</button>}
            />
            {dailyRpt.couponDetails.length>0&&<SortTbl
              data={dailyRpt.couponDetails}
              columns={[{key:"country",label:t.drCountry},{key:"facility",label:t.drFacilityName},{key:"nights",label:t.drNights},{key:"rev",label:t.drRevenue}]}
              renderRow={(r,i)=><tr key={i}><td style={S.td}>{tl(r.country)}</td><td style={{...S.td,whiteSpace:"nowrap"}}>{shortFac(r.facility)}</td><td style={{...S.td,...S.m}}>{r.nights}</td><td style={{...S.td,...S.m}}>{fmtN(r.rev)}</td></tr>}
              grandTotalRow={<tr style={{fontWeight:700}}><td style={S.td} colSpan={2}>Grand total</td><td style={{...S.td,...S.m}}>{dailyRpt.couponDetails.reduce((a,r)=>a+r.nights,0)}</td><td style={{...S.td,...S.m}}>{fmtN(dailyRpt.couponDetails.reduce((a,r)=>a+r.rev,0))}</td></tr>}
              title={t.drCouponData+" — Details"}
            />}
          </div>
        </>:<div style={{textAlign:"center",padding:40,color:TH.textMuted}}>{t.drNoData}</div>}
      </div>}

        {/* COMPARE */}
        {tab==="compare"&&<div>
                    <div style={{display:"flex",gap:16,alignItems:"flex-end",marginBottom:16,flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap"}}>
              <div style={{fontWeight:600,color:TH.textStrong,fontSize:12,alignSelf:"center"}}>{t.cmpPeriodA}</div>
              <div><div style={S.fl}>{t.from}</div><input type="date" style={{...S.inp,borderColor:"#4ea8de"}} value={cmpA.from} onChange={e=>setCmpA(p=>({...p,from:e.target.value}))}/></div>
              <div><div style={S.fl}>{t.to}</div><input type="date" style={{...S.inp,borderColor:"#4ea8de"}} value={cmpA.to} onChange={e=>setCmpA(p=>({...p,to:e.target.value}))}/></div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap"}}>
              <div style={{fontWeight:600,color:TH.gold,fontSize:12,alignSelf:"center"}}>{t.cmpPeriodB}</div>
              <div><div style={S.fl}>{t.from}</div><input type="date" style={{...S.inp,borderColor:TH.gold}} value={cmpB.from} onChange={e=>setCmpB(p=>({...p,from:e.target.value}))}/></div>
              <div><div style={S.fl}>{t.to}</div><input type="date" style={{...S.inp,borderColor:TH.gold}} value={cmpB.to} onChange={e=>setCmpB(p=>({...p,to:e.target.value}))}/></div>
            </div>
            <div style={{display:"flex",gap:4}}>
              <button style={{...S.btn,fontSize:10}} onClick={()=>{const end=new Date();end.setDate(end.getDate()-DATA_LAG_DAYS);const y=end.getFullYear(),m=end.getMonth(),d=end.getDate();const a1=`${y}-${String(m+1).padStart(2,"0")}-01`;const a2=tzFmt(end);const days=d-1;const prevY=m===0?y-1:y;const prevM=m===0?12:m;const b1=`${prevY}-${String(prevM).padStart(2,"0")}-01`;const bEnd=new Date(prevY,prevM-1,1);bEnd.setDate(bEnd.getDate()+days);const b2=tzFmt(bEnd);setCmpA({from:a1,to:a2});setCmpB({from:b1,to:b2})}}>{t.cmpMonthVsMonth}</button>
              <button style={{...S.btn,fontSize:10}} onClick={()=>{const end=new Date();end.setDate(end.getDate()-DATA_LAG_DAYS);const start=new Date(end);start.setDate(end.getDate()-6);const prevEnd=new Date(start);prevEnd.setDate(start.getDate()-1);const prevStart=new Date(prevEnd);prevStart.setDate(prevEnd.getDate()-6);setCmpA({from:tzFmt(start),to:tzFmt(end)});setCmpB({from:tzFmt(prevStart),to:tzFmt(prevEnd)})}}>{t.cmpWeekVsWeek}</button>
              <button style={{...S.btn,fontSize:10}} onClick={()=>{const end=new Date();end.setDate(end.getDate()-DATA_LAG_DAYS);const y=end.getFullYear();const a1=`${y}-01-01`;const a2=tzFmt(end);const b1=`${y-1}-01-01`;const prevEnd=new Date(y-1,end.getMonth(),end.getDate());const b2=tzFmt(prevEnd);setCmpA({from:a1,to:a2});setCmpB({from:b1,to:b2})}}>{t.cmpYearVsYear}</button>
            </div>
          </div>
          {compareRpt&&!compareRpt.empty?<>
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
              {[
                [t.reservations,compareRpt.a.totalCount,compareRpt.b.totalCount],
                [t.totalRevenue,compareRpt.a.totalRev,compareRpt.b.totalRev],
                [t.drADR,compareRpt.a.adr,compareRpt.b.adr],
              ].map(([label,va,vb])=>{const d=va-vb;const isRev=label===t.totalRevenue||label===t.drADR;const fmt=v=>isRev?"¥"+fmtN(v):fmtN(v);return<div key={label} style={S.kpi}><div style={S.kl}>{label}</div><div style={{display:"flex",gap:12,alignItems:"baseline"}}><div><div style={{fontSize:10,color:"#4ea8de"}}>A</div><div style={{...S.kv,fontSize:18}}>{fmt(va)}</div></div><div><div style={{fontSize:10,color:TH.gold}}>B</div><div style={{...S.kv,fontSize:18}}>{fmt(vb)}</div></div></div><div style={{fontSize:11,marginTop:4,color:d>0?"#34d399":d<0?"#ef4444":TH.textMuted}}>{d>0?"+":""}{fmt(d)} ({compareRpt.pctChg(va,vb)})</div></div>})}
            </div>
            <DraggableGrid {...dgProps("compare")}>
              <div key="cmp-country"><SortTbl
                data={compareRpt.countryRows}
                columns={[{key:"country",label:t.drCountry},{key:"countA",label:"A "+t.drCount},{key:"revA",label:"A "+t.drRevenue},{key:"countB",label:"B "+t.drCount},{key:"revB",label:"B "+t.drRevenue},{key:"revDelta",label:t.cmpDelta}]}
                renderRow={r=><tr key={r.country}><td style={S.td}>{tl(r.country)}</td><td style={{...S.td,...S.m}}>{r.countA}</td><td style={{...S.td,...S.m}}>{fmtN(r.revA)}</td><td style={{...S.td,...S.m}}>{r.countB}</td><td style={{...S.td,...S.m}}>{fmtN(r.revB)}</td><td style={{...S.td,...S.m,color:r.revDelta>0?"#34d399":r.revDelta<0?"#ef4444":TH.text}}>{r.revDelta>0?"+":""}{fmtN(r.revDelta)}</td></tr>}
                title={t.cmpByCountry}
              /></div>
              <div key="cmp-rev"><CC grid title={t.cmpRevChart} id="cmp-rev" nm="cmp_rev" data={compareRpt.revChart}><BarChart data={compareRpt.revChart}><CartesianGrid {...gl}/><XAxis dataKey="country" tick={<TlTickV2/>} interval={0} height={isMobile?60:30}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Legend/><Bar dataKey="B" fill={TH.gold} name={compareRpt.labelB} radius={[4,4,0,0]}/><Bar dataKey="A" fill="#4ea8de" name={compareRpt.labelA} radius={[4,4,0,0]}/></BarChart></CC></div>
              <div key="cmp-segment"><SortTbl
                data={compareRpt.segRows}
                columns={[{key:"segment",label:t.thSegment},{key:"countA",label:"A "+t.drCount},{key:"revA",label:"A "+t.drRevenue},{key:"countB",label:"B "+t.drCount},{key:"revB",label:"B "+t.drRevenue},{key:"revDelta",label:t.cmpDelta}]}
                renderRow={r=><tr key={r.segment}><td style={S.td}>{tl(r.segment)}</td><td style={{...S.td,...S.m}}>{r.countA}</td><td style={{...S.td,...S.m}}>{fmtN(r.revA)}</td><td style={{...S.td,...S.m}}>{r.countB}</td><td style={{...S.td,...S.m}}>{fmtN(r.revB)}</td><td style={{...S.td,...S.m,color:r.revDelta>0?"#34d399":r.revDelta<0?"#ef4444":TH.text}}>{r.revDelta>0?"+":""}{fmtN(r.revDelta)}</td></tr>}
                title={t.cmpBySegment}
              /></div>
              <div key="cmp-count"><CC grid title={t.cmpCountChart} id="cmp-count" nm="cmp_count" data={compareRpt.countChart}><BarChart data={compareRpt.countChart}><CartesianGrid {...gl}/><XAxis dataKey="country" tick={<TlTickV2/>} interval={0} height={isMobile?60:30}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="B" fill={TH.gold} name={compareRpt.labelB} radius={[4,4,0,0]}/><Bar dataKey="A" fill="#4ea8de" name={compareRpt.labelA} radius={[4,4,0,0]}/></BarChart></CC></div>
              <div key="cmp-facility"><SortTbl
                data={compareRpt.facRows}
                columns={[{key:"name",label:t.thFacility},{key:"countA",label:"A "+t.drCount},{key:"revA",label:"A "+t.drRevenue},{key:"countB",label:"B "+t.drCount},{key:"revB",label:"B "+t.drRevenue},{key:"revDelta",label:t.cmpDelta}]}
                renderRow={r=><tr key={r.facility}><td style={{...S.td,whiteSpace:"nowrap"}}>{r.name}</td><td style={{...S.td,...S.m}}>{r.countA}</td><td style={{...S.td,...S.m}}>{fmtN(r.revA)}</td><td style={{...S.td,...S.m}}>{r.countB}</td><td style={{...S.td,...S.m}}>{fmtN(r.revB)}</td><td style={{...S.td,...S.m,color:r.revDelta>0?"#34d399":r.revDelta<0?"#ef4444":TH.text}}>{r.revDelta>0?"+":""}{fmtN(r.revDelta)}</td></tr>}
                title={t.cmpByFacility}
              /></div>
            </DraggableGrid>
          </>:<div style={{textAlign:"center",padding:40,color:TH.textMuted}}>{t.cmpNoData}</div>}
        </div>}

        {/* PACE */}
        {tab==="pace"&&<div>
                    <div style={{display:"flex",gap:16,alignItems:"flex-end",marginBottom:16,flexWrap:"wrap"}}>
            <div><div style={S.fl}>{t.paceTitle}</div><div style={{display:"flex",gap:3}}><button style={{...S.btn,...(paceMetric==="count"?S.ba:{})}} onClick={()=>setPaceMetric("count")}>{t.paceToggleRes}</button><button style={{...S.btn,...(paceMetric==="rev"?S.ba:{})}} onClick={()=>setPaceMetric("rev")}>{t.paceToggleRev}</button></div></div>
          </div>
          {paceRpt?<>
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",flexDirection:isMobile?"column":"row"}}>
              <div style={S.kpi}><div style={S.kl}>{paceRpt.currentMonth} {t.paceSoFar}</div><div style={S.kv}>{paceMetric==="count"?fmtN(paceRpt.curAtDay.count):"¥"+fmtN(paceRpt.curAtDay.rev)}</div></div>
              {paceRpt.lastAtDay&&<div style={S.kpi}><div style={S.kl}>{paceRpt.months[1]} {t.paceSoFar}</div><div style={S.kv}>{paceMetric==="count"?fmtN(paceRpt.lastAtDay.count):"¥"+fmtN(paceRpt.lastAtDay.rev)}</div><div style={{fontSize:11,marginTop:4,color:(paceMetric==="count"?paceRpt.curAtDay.count-paceRpt.lastAtDay.count:paceRpt.curAtDay.rev-paceRpt.lastAtDay.rev)>0?"#34d399":"#ef4444"}}>{(paceMetric==="count"?paceRpt.curAtDay.count-paceRpt.lastAtDay.count:paceRpt.curAtDay.rev-paceRpt.lastAtDay.rev)>0?"+":""}{paceMetric==="count"?(paceRpt.curAtDay.count-paceRpt.lastAtDay.count):fmtN(paceRpt.curAtDay.rev-paceRpt.lastAtDay.rev)}</div></div>}
              <div style={S.kpi}><div style={S.kl}>{t.paceProjected}</div><div style={S.kv}>{paceMetric==="count"?fmtN(paceRpt.projectedCount):"¥"+fmtN(paceRpt.projectedRev)}</div></div>
            </div>
            <DraggableGrid {...dgProps("pace")}>
              <div key="pace-chart"><CC grid title={t.paceTitle} id="pace-chart" nm="pace" data={paceRpt.chartData}><LineChart data={paceRpt.chartData}><CartesianGrid {...gl}/><XAxis dataKey="day" tick={tk} label={{value:"Day of Month",position:"insideBottom",offset:-5,fill:TH.tickFill,fontSize:10}}/><YAxis tick={tk} tickFormatter={paceMetric==="rev"?fmtY:undefined}/><Tooltip content={<CT formatter={paceMetric==="rev"?v=>"¥"+v.toLocaleString():undefined}/>}/><Legend wrapperStyle={{fontSize:10}}/>{paceRpt.months.map((m,i)=><Line key={m} type="monotone" dataKey={m} stroke={i===0?TH.gold:PALETTE[i%PALETTE.length]} strokeWidth={i===0?3:1.5} dot={i===0?{fill:TH.gold,r:3}:false} name={m} connectNulls={false}/>)}</LineChart></CC></div>
              <div key="pace-summary"><SortTbl
                data={paceRpt.summaryRows}
                columns={[{key:"month",label:"Month"},{key:"count",label:t.reservations},{key:"rev",label:t.totalRevenue}]}
                renderRow={r=><tr key={r.month} style={r.month===paceRpt.currentMonth?{fontWeight:700}:{}}><td style={S.td}>{r.month}</td><td style={{...S.td,...S.m}}>{fmtN(r.count)}</td><td style={{...S.td,...S.m}}>{fmtN(r.rev)}</td></tr>}
                title={t.paceSummary}
              /></div>
            </DraggableGrid>
          </>:<div style={{textAlign:"center",padding:40,color:TH.textMuted}}>{t.paceNoData}</div>}
        </div>}

      {!agg?<div style={{textAlign:"center",color:TH.textMuted,padding:40}}>{t.noData}</div>:<>

        {/* OVERVIEW */}
        {tab==="overview"&&<><DraggableGrid {...dgProps("overview")}>
          <div key="ch-mo"><CC grid title={t.resByMonth} id="ch-mo" nm="monthly" data={moD}><BarChart data={moD}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#4ea8de" radius={[4,4,0,0]} name={t.reservations}/></BarChart></CC></div>
          <div key="ch-sp"><CC grid title={t.resBySeg} id="ch-sp" nm="seg_pie" data={segD}><PieChart><Pie data={segD} dataKey="count" nameKey="segment" cx="50%" cy="50%" outerRadius="65%" label={({segment,percent,cx,cy,midAngle,outerRadius:r})=>{const x=cx+Math.cos(-midAngle*Math.PI/180)*(r+14);const y=cy+Math.sin(-midAngle*Math.PI/180)*(r+14);return<text x={x} y={y} textAnchor={x>cx?"start":"end"} fill={TH.pieLabelFill} fontSize={10}>{`${tl(segment)} ${(percent*100).toFixed(0)}%`}</text>}} labelLine={{stroke:"#a0977f"}}>{segD.map((e,i)=><Cell key={i} fill={SEG_COLORS[e.segment]||PALETTE[i]}/>)}</Pie><Tooltip content={<CT/>}/></PieChart></CC></div>
          <div key="ch-mk"><CC grid title={t.topMarkets} id="ch-mk" nm="top_markets" h={320} data={mktD.slice(0,10)}><BarChart data={mktD.slice(0,10)} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={100} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#c9a84c" radius={[0,4,4,0]} name={t.reservations}/></BarChart></CC></div>
          <div key="ch-dw"><CC grid title={t.checkinDOW} id="ch-dw" nm="dow" h={320} data={dowD}><BarChart data={dowD}><CartesianGrid {...gl}/><XAxis dataKey="day" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="checkin" fill="#4ea8de" radius={[4,4,0,0]} name={t.checkInLabel}/><Bar dataKey="checkout" fill="#e07b54" radius={[4,4,0,0]} name={t.checkOutLabel}/></BarChart></CC></div>
          <div key="ch-mo-rev"><CC grid title={t.monthlyRev} id="ch-mo-rev" nm="monthly_rev_ov" data={moD}><BarChart data={moD}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="rev" fill="#34d399" radius={[4,4,0,0]} name={t.totalRevenue}/></BarChart></CC></div>
          <div key="ch-res-day"><CC grid title={t.resByDay} id="ch-res-day" nm="res_day" data={dailyD}><BarChart data={dailyD}><CartesianGrid {...gl}/><XAxis dataKey="date" tick={tks}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#4ea8de" radius={[4,4,0,0]} name={t.reservations}/></BarChart></CC></div>
          <div key="ch-rev-day"><CC grid title={t.revByDay} id="ch-rev-day" nm="rev_day" data={dailyD}><BarChart data={dailyD}><CartesianGrid {...gl}/><XAxis dataKey="date" tick={tks}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="rev" fill="#34d399" radius={[4,4,0,0]} name={t.totalRevenue}/></BarChart></CC></div>
        </DraggableGrid></>}

        {/* ═══════════════════ KANTO VS KANSAI ═══════════════════ */}
        {tab==="kvk"&&kvk&&<div>
                    <div style={{marginBottom:16}}><div style={{fontSize:18,fontWeight:600,color:TH.textStrong}}>{t.kvkTitle}</div><div style={{fontSize:12,color:TH.textMuted,marginTop:4}}>{t.kvkSub} — {t.kanto} {fmtN(kvk.kantoN)} / {t.kansai} {fmtN(kvk.kansaiN)}</div></div>

          <DraggableGrid {...dgProps("kvk")}>
            <div key="kk-mk-kt"><CC grid title={`${t.kvkKantoMarkets}`} id="kk-mk-kt" nm="kanto_markets" h={Math.max(250,kvk.mkKanto.length*26)} data={kvk.mkKanto}><BarChart data={kvk.mkKanto} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={100} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#4ea8de" radius={[0,4,4,0]} name={t.reservations}/></BarChart></CC></div>
            <div key="kk-mk-ks"><CC grid title={`${t.kvkKansaiMarkets}`} id="kk-mk-ks" nm="kansai_markets" h={Math.max(250,kvk.mkKansai.length*26)} data={kvk.mkKansai}><BarChart data={kvk.mkKansai} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={100} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#e07b54" radius={[0,4,4,0]} name={t.reservations}/></BarChart></CC></div>
            <div key="kk-mk-mo"><CC grid title={t.kvkMarketMonthly} id="kk-mk-mo" nm="market_monthly" h={300} data={kvk.mktMo}><BarChart data={kvk.mktMo}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/>{kvk.topC.map((c,i)=><Bar key={c} dataKey={c} stackId="a" fill={PALETTE[i%PALETTE.length]} name={tl(c)}/>)}</BarChart></CC></div>
            <div key="kk-sg-rg"><CC grid title={t.kvkSegByRegion} id="kk-sg-rg" nm="seg_region" data={kvk.segReg}><BarChart data={kvk.segReg}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de" radius={[4,4,0,0]} name={t.kanto}/><Bar dataKey="Kansai" fill="#e07b54" radius={[4,4,0,0]} name={t.kansai}/></BarChart></CC></div>
            <div key="kk-los-co"><CC grid title={t.kvkLOSByCountry} id="kk-los-co" nm="los_country" h={Math.max(280,kvk.losC.length*26)} data={kvk.losC}><BarChart data={kvk.losC} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>v+" "+t.ns}/>}/><Bar dataKey="avg" fill="#4ea8de" radius={[0,4,4,0]} name={t.avgLOS}/></BarChart></CC></div>
            <div key="kk-los-sr"><CC grid title={t.kvkLOSBySegRegion} id="kk-los-sr" nm="los_seg_region" data={kvk.losSR}><BarChart data={kvk.losSR}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk}/><Tooltip content={<CT formatter={v=>v+" "+t.ns}/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de" radius={[4,4,0,0]} name={t.kanto}/><Bar dataKey="Kansai" fill="#e07b54" radius={[4,4,0,0]} name={t.kansai}/></BarChart></CC></div>
            <div key="kk-dw-ci"><CC grid title={`${t.kvkDOWCheckin}`} id="kk-dw-ci" nm="dow_checkin" h={300} data={kvk.dowCI}><RadarChart data={kvk.dowCI} cx="50%" cy="50%" outerRadius={100}><PolarGrid stroke={TH.gridLine}/><PolarAngleAxis dataKey="day" tick={{fill:TH.pieLabelFill,fontSize:11}}/><PolarRadiusAxis tick={false}/><Radar name={t.kanto} dataKey="Kanto" stroke="#4ea8de" fill="rgba(78,168,222,0.1)" dot={{r:3}}/><Radar name={`${t.kansai} (×${kvk.scale})`} dataKey="Kansai" stroke="#e07b54" fill="rgba(224,123,84,0.1)" dot={{r:3}}/><Legend/><Tooltip content={<CT/>}/></RadarChart></CC></div>
            <div key="kk-dw-co"><CC grid title={`${t.kvkDOWCheckout}`} id="kk-dw-co" nm="dow_checkout" h={300} data={kvk.dowCO}><RadarChart data={kvk.dowCO} cx="50%" cy="50%" outerRadius={100}><PolarGrid stroke={TH.gridLine}/><PolarAngleAxis dataKey="day" tick={{fill:TH.pieLabelFill,fontSize:11}}/><PolarRadiusAxis tick={false}/><Radar name={t.kanto} dataKey="Kanto" stroke="#4ea8de" fill="rgba(78,168,222,0.1)" dot={{r:3}}/><Radar name={`${t.kansai} (×${kvk.scale})`} dataKey="Kansai" stroke="#e07b54" fill="rgba(224,123,84,0.1)" dot={{r:3}}/><Legend/><Tooltip content={<CT/>}/></RadarChart></CC></div>
            <div key="kk-dev"><CC grid title={t.kvkDeviceByRegion} id="kk-dev" nm="device_region" data={kvk.devR}><BarChart data={kvk.devR}><CartesianGrid {...gl}/><XAxis dataKey="device" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de" radius={[4,4,0,0]} name={t.kanto}/><Bar dataKey="Kansai" fill="#e07b54" radius={[4,4,0,0]} name={t.kansai}/></BarChart></CC></div>
            <div key="kk-rev-sr"><CC grid title={t.kvkRevBySegRegion} id="kk-rev-sr" nm="rev_seg_region" data={kvk.revSR}><BarChart data={kvk.revSR}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de" radius={[4,4,0,0]} name={t.kanto}/><Bar dataKey="Kansai" fill="#e07b54" radius={[4,4,0,0]} name={t.kansai}/></BarChart></CC></div>
            <div key="kk-rev-co"><CC grid title={t.kvkRevByCountry} id="kk-rev-co" nm="rev_country" h={Math.max(300,kvk.revC.length*26)} data={kvk.revC}><BarChart data={kvk.revC} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={fmtY}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="avgRev" fill="#c9a84c" radius={[0,4,4,0]} name={t.avgRevRes}/></BarChart></CC></div>
            <div key="kk-rm-sg"><CC grid title={t.kvkRoomBySeg} id="kk-rm-sg" nm="room_seg" h={320} data={kvk.roomSeg}><BarChart data={kvk.roomSeg} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="segment" type="category" width={80} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:10}}/>{kvk.allRoomTypes.slice(0,10).map((rm,i)=><Bar key={rm} dataKey={rm} stackId="a" fill={PALETTE[i%PALETTE.length]} name={rm}/>)}</BarChart></CC></div>
            <div key="kk-rm-rg"><CC grid title={t.kvkRoomByRegion} id="kk-rm-rg" nm="room_region" h={Math.max(280,kvk.roomReg.length*26)} data={kvk.roomReg}><BarChart data={kvk.roomReg} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="room" type="category" width={110} tick={tk} interval={0}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de" radius={[0,4,4,0]} name={t.kanto}/><Bar dataKey="Kansai" fill="#e07b54" radius={[0,4,4,0]} name={t.kansai}/></BarChart></CC></div>
            <div key="kk-rk-rg"><CC grid title={t.kvkRankByRegion} id="kk-rk-rg" nm="rank_region" data={kvk.rankReg}><BarChart data={kvk.rankReg}><CartesianGrid {...gl}/><XAxis dataKey="region" tick={<TlTick/>}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/>{RANK_ORDER.map((rk,i)=><Bar key={rk} dataKey={rk} stackId="a" fill={RANK_COLORS[i]} name={tl(rk)}/>)}</BarChart></CC></div>
          </DraggableGrid>
        </div>}

        {/* MARKETS */}
        {tab==="markets"&&<div><DraggableGrid {...dgProps("markets")}>
          <div key="ch-mf"><CC grid title={t.allMarketsCount} id="ch-mf" nm="markets" h={Math.max(300,mktD.length*28)} data={mktD}><BarChart data={mktD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#4ea8de" radius={[0,4,4,0]} name={t.reservations}/></BarChart></CC></div>
          <div key="ch-mr"><CC grid title={t.avgRevByMarket} id="ch-mr" nm="markets_rev" h={Math.max(300,mktD.length*28)} data={mktD}><BarChart data={mktD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={fmtY}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="avgRev" fill="#c9a84c" radius={[0,4,4,0]} name={t.avgRevRes}/></BarChart></CC></div>
          <div key="ch-ml"><CC grid title={t.avgLOSByCountry} id="ch-ml" nm="mkt_los" h={Math.max(300,mktLOS.length*28)} data={mktLOS}><BarChart data={mktLOS} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>v+" "+t.ns}/>}/><Bar dataKey="avgLOS" fill="#c084fc" radius={[0,4,4,0]} name={t.avgLOS}/></BarChart></CC></div>
          <div key="ch-mld"><CC grid title={t.avgLeadByCountry} id="ch-mld" nm="mkt_lead" h={Math.max(300,mktLead.length*28)} data={mktLead}><BarChart data={mktLead} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>v+" "+t.ds}/>}/><Bar dataKey="avgLead" fill="#e07b54" radius={[0,4,4,0]} name={t.avgLeadTime}/></BarChart></CC></div>
          <div key="ch-msc">{kvk&&<CC grid title={t.segMixByCountry} id="ch-msc" nm="seg_mix_country" h={Math.max(300,kvk.segCountry.length*26)} data={kvk.segCountry}><BarChart data={kvk.segCountry} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" domain={[0,100]} tick={tks} tickFormatter={v=>v+"%"}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Legend/>{SEG_ORDER.map(s=><Bar key={s} dataKey={s} stackId="a" fill={SEG_COLORS[s]} name={tl(s)}/>)}</BarChart></CC>}</div>
          <div key="ch-rkc">{kvk&&<CC grid title={t.kvkRankByCountry} id="ch-rkc" nm="rank_country" h={Math.max(250,kvk.rankC.length*30)} data={kvk.rankC}><BarChart data={kvk.rankC} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={100} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT/>}/><Legend/>{RANK_ORDER.map((rk,i)=><Bar key={rk} dataKey={rk} stackId="a" fill={RANK_COLORS[i]} name={tl(rk)}/>)}</BarChart></CC>}</div>
        </DraggableGrid><div style={{marginTop:14}}><SortTbl
          data={mktD.map(d=>({country:d.country,count:d.count,totalRev:agg.byC[d.country]?.rev||0,avgRev:d.avgRev,avgLOS:agg.byC[d.country]?.nights.length?(avg(agg.byC[d.country].nights)):0,avgLead:agg.byC[d.country]?.lead.length?(avg(agg.byC[d.country].lead)):0}))}
          columns={[{key:"country",label:t.thCountry},{key:"count",label:t.reservations},{key:"totalRev",label:t.thTotalRev},{key:"avgRev",label:t.thAvgRev},{key:"avgLOS",label:t.thAvgLOS},{key:"avgLead",label:t.thAvgLeadTime}]}
          renderRow={r=><tr key={r.country}><td style={S.td}>{tl(r.country)}</td><td style={{...S.td,...S.m}}>{fmtN(r.count)}</td><td style={{...S.td,...S.m}}>{fmtY(r.totalRev)}</td><td style={{...S.td,...S.m}}>{fmtY(r.avgRev)}</td><td style={{...S.td,...S.m}}>{r.avgLOS.toFixed(1)}{t.ns}</td><td style={{...S.td,...S.m}}>{r.avgLead>0?r.avgLead.toFixed(0)+t.ds:"—"}</td></tr>}
          title={t.marketSummary}
          exportFn={<button style={{...S.bg,fontSize:10}} onClick={expSum}>⬇ {t.exportCSV}</button>}
        /></div></div>}

        {/* SEGMENTS */}
        {tab==="segments"&&<>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14}}>
            <span style={{fontSize:11,color:TH.textMuted,fontWeight:600}}>{t.segBreakdownMode}:</span>
            <div style={{display:"flex",gap:3}}>
              <button style={{...S.btn,...(segDetailed===false?S.ba:{})}} onClick={()=>setSegDetailed(false)}>{t.segSimple}</button>
              <button style={{...S.btn,...(segDetailed===true?S.ba:{})}} onClick={()=>setSegDetailed(true)}>{t.segDetailedLabel}</button>
            </div>
          </div>
          {(()=>{const sd=segDetailed?segDetailedD:segD;const sc=segDetailed?SEG_COLORS_DETAILED:SEG_COLORS;return(<DraggableGrid {...dgProps("segments")}>{[[t.segBreakdown,"count",t.reservations,"ch-sb"],[t.avgRevBySeg,"avgRev",t.avgRevRes,"ch-sr"],[t.avgLOSBySeg,"avgLOS",t.avgLOS,"ch-sl"],[t.avgLeadBySeg,"avgLead",t.avgLeadTime,"ch-slt"]].map(([ti,key,yL,id])=><div key={id}><CC grid title={ti} id={id} nm={id} data={sd}><BarChart data={sd}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={({x,y,payload})=><text x={x} y={y} textAnchor={segDetailed?"end":"middle"} fill={TH.tickFill} fontSize={segDetailed?8:11} dy={12} transform={segDetailed?`rotate(-30,${x},${y})`:undefined}>{tl(payload.value)}</text>} height={segDetailed?60:30} interval={0}/><YAxis tick={tk} tickFormatter={key==="avgRev"?fmtY:undefined}/><Tooltip content={<CT formatter={key==="avgRev"?v=>"¥"+v.toLocaleString():undefined}/>}/><Bar dataKey={key} name={yL} radius={[4,4,0,0]}>{sd.map((e,i)=><Cell key={i} fill={sc[e.segment]||PALETTE[i]}/>)}</Bar></BarChart></CC></div>)}
          <div key="sg-seg-mo">{(()=>{const data=segDetailed?segDetailedExtras.segMo:(kvk?kvk.segMo:null);const segs=segDetailed?segDetailedExtras.activeSegs:SEG_ORDER;const colors=segDetailed?SEG_COLORS_DETAILED:SEG_COLORS;return data?<CC grid title={t.kvkSegByMonth} id="sg-seg-mo" nm="seg_month" data={data}><BarChart data={data}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:9}}/>{segs.map((s,i)=><Bar key={s} dataKey={s} stackId="a" fill={colors[s]||PALETTE[i%PALETTE.length]} name={tl(s)}/>)}</BarChart></CC>:null})()}</div>
          <div key="sg-seg-co">{(()=>{const data=segDetailed?segDetailedExtras.segCountry:(kvk?kvk.segCountry:null);const segs=segDetailed?segDetailedExtras.activeSegs:SEG_ORDER;const colors=segDetailed?SEG_COLORS_DETAILED:SEG_COLORS;return data?<CC grid title={t.kvkSegByCountry} id="sg-seg-co" nm="seg_country" h={Math.max(300,data.length*26)} data={data}><BarChart data={data} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" domain={[0,100]} tick={tks} tickFormatter={v=>v+"%"}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Legend wrapperStyle={{fontSize:9}}/>{segs.map((s,i)=><Bar key={s} dataKey={s} stackId="a" fill={colors[s]||PALETTE[i%PALETTE.length]} name={tl(s)}/>)}</BarChart></CC>:null})()}</div>
          <div key="sg-ld-sg">{(()=>{const data=segDetailed?segDetailedExtras.leadSeg:(kvk?kvk.leadSeg:null);return data?<CC grid title={t.kvkLeadBySeg} id="sg-ld-sg" nm="lead_seg" data={data}><BarChart data={data}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={({x,y,payload})=><text x={x} y={y} textAnchor={segDetailed?"end":"middle"} fill={TH.tickFill} fontSize={segDetailed?8:11} dy={12} transform={segDetailed?`rotate(-30,${x},${y})`:undefined}>{tl(payload.value)}</text>} height={segDetailed?60:30} interval={0}/><YAxis tick={tk}/><Tooltip content={<CT formatter={v=>v+" "+t.ds}/>}/><Legend/><Bar dataKey="avg" fill="#4ea8de" radius={[4,4,0,0]} name={t.avg}/><Bar dataKey="median" fill="rgba(78,168,222,0.4)" radius={[4,4,0,0]} name={t.median}/></BarChart></CC>:null})()}</div>
          <div key="sg-ld-mo">{kvk&&<CC grid title={t.kvkLeadByMonth} id="sg-ld-mo" nm="lead_month" data={kvk.leadMo}><BarChart data={kvk.leadMo}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT formatter={v=>v+" "+t.ds}/>}/><Legend/><Bar dataKey="avg" fill="#c9a84c" radius={[4,4,0,0]} name={t.avg}/><Bar dataKey="median" fill="rgba(201,168,76,0.4)" radius={[4,4,0,0]} name={t.median}/></BarChart></CC>}</div>
          <div key="sg-adr">{(()=>{const data=segDetailed?segDetailedExtras.adrSeg:(kvk?kvk.adrSeg:null);const colors=segDetailed?SEG_COLORS_DETAILED:SEG_COLORS;return data?<CC grid title={t.kvkADRBySeg} id="sg-adr" nm="adr_seg" data={data}><BarChart data={data}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={({x,y,payload})=><text x={x} y={y} textAnchor={segDetailed?"end":"middle"} fill={TH.tickFill} fontSize={segDetailed?8:11} dy={12} transform={segDetailed?`rotate(-30,${x},${y})`:undefined}>{tl(payload.value)}</text>} height={segDetailed?60:30} interval={0}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="adr" radius={[4,4,0,0]} name="ADR">{data.map((e,i)=><Cell key={i} fill={colors[e.segment]||PALETTE[i%PALETTE.length]}/>)}</Bar></BarChart></CC>:null})()}</div>

        </DraggableGrid>)})()}</>}

        {/* BOOKING */}
        {tab==="booking"&&<><DraggableGrid {...dgProps("booking")}>
          <div key="ch-bd"><CC grid title={t.ciCoDOW} id="ch-bd" nm="dow" h={300} data={dowD}><BarChart data={dowD}><CartesianGrid {...gl}/><XAxis dataKey="day" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="checkin" fill="#4ea8de" radius={[4,4,0,0]} name={t.checkInLabel}/><Bar dataKey="checkout" fill="#e07b54" radius={[4,4,0,0]} name={t.checkOutLabel}/></BarChart></CC></div>
          <div key="ch-mdow"><CC grid title={t.monthlyDOW+" ("+t.checkInLabel+")"} id="ch-mdow" nm="monthly_dow_ci" data={monthDowD.ciData}><LineChart data={monthDowD.ciData}><CartesianGrid {...gl}/><XAxis dataKey="day" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:10}}/>{monthDowD.months.map((m,i)=><Line key={m} type="monotone" dataKey={m} stroke={PALETTE[i%PALETTE.length]} strokeWidth={2} dot={{r:3}} name={m}/>)}</LineChart></CC></div>
          <div key="ch-mdow2"><CC grid title={t.monthlyDOW+" ("+t.checkOutLabel+")"} id="ch-mdow2" nm="monthly_dow_co" data={monthDowD.coData}><LineChart data={monthDowD.coData}><CartesianGrid {...gl}/><XAxis dataKey="day" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:10}}/>{monthDowD.months.map((m,i)=><Line key={m} type="monotone" dataKey={m} stroke={PALETTE[i%PALETTE.length]} strokeWidth={2} dot={{r:3}} name={m}/>)}</LineChart></CC></div>
          <div key="ch-bt"><CC grid title={t.monthlyTrend} id="ch-bt" nm="trend" h={300} data={moD}><LineChart data={moD}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk}/><YAxis yAxisId="r" orientation="right" tick={tks} tickFormatter={fmtY}/><Tooltip content={<CT/>}/><Legend/><Line type="monotone" dataKey="count" stroke="#c9a84c" strokeWidth={2} dot={{fill:"#c9a84c",r:4}} name={t.reservations}/><Line type="monotone" dataKey="avgRev" stroke="#4ea8de" strokeWidth={2} dot={{fill:"#4ea8de",r:4}} name={t.avgRevRes} yAxisId="r"/></LineChart></CC></div>
          <div key="ch-bv"><CC grid title={t.bookingDevice} id="ch-bv" nm="device" data={(()=>{const m={};filtered.forEach(r=>{const d=r.device==="スマートフォン"?t.smartphone:r.device==="パソコン"?t.pc:r.device==="タブレット"?t.tablet:"Other";m[d]=(m[d]||0)+1});return Object.entries(m).map(([name,value])=>({name,value}))})()}>{(()=>{const m={};filtered.forEach(r=>{const d=r.device==="スマートフォン"?t.smartphone:r.device==="パソコン"?t.pc:r.device==="タブレット"?t.tablet:"Other";m[d]=(m[d]||0)+1});const dd=Object.entries(m).map(([name,value])=>({name,value}));return(<PieChart><Pie data={dd} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="65%" label={({name,percent,cx,cy,midAngle,outerRadius:r})=>{const x=cx+Math.cos(-midAngle*Math.PI/180)*(r+14);const y=cy+Math.sin(-midAngle*Math.PI/180)*(r+14);return<text x={x} y={y} textAnchor={x>cx?"start":"end"} fill={TH.pieLabelFill} fontSize={10}>{`${name} ${(percent*100).toFixed(0)}%`}</text>}} labelLine={{stroke:"#a0977f"}}>{dd.map((_,i)=><Cell key={i} fill={PALETTE[i]}/>)}</Pie><Tooltip content={<CT/>}/></PieChart>)})()}</CC></div>
        </DraggableGrid></>}

        {/* MEMBER */}
        {tab==="member"&&<>          <div style={{...S.card,background:TH.insightBg,border:"1px solid "+TH.insightBorder,marginBottom:14,fontSize:11,color:TH.textMuted,lineHeight:1.6}}>{t.memberDisclaimer}</div>
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",flexDirection:isMobile?"column":"row"}}>
            <div style={S.kpi}><div style={S.kl}>{t.memberTotal}</div><div style={S.kv}>{memberRpt?fmtN(memberRpt.totalGuests):"—"}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.memberRepeatCount}</div><div style={S.kv}>{memberRpt?fmtN(memberRpt.repeatCount):"—"}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.memberRepeatRate}</div><div style={S.kv}>{memberRpt?memberRpt.repeatRate+"%":"—"}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.memberAvgBookings}</div><div style={S.kv}>{memberRpt?memberRpt.avgBookings:"—"}</div></div>
          </div>
          {memberRpt?<DraggableGrid {...dgProps("member")}>
            <div key="mb-overview"><CC grid title={t.memberRepeatRate} id="mb-overview" nm="member_overview" data={memberRpt.overviewPie}><PieChart><Pie data={memberRpt.overviewPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="65%" label={({name,percent,cx,cy,midAngle,outerRadius:r})=>{const x2=cx+Math.cos(-midAngle*Math.PI/180)*(r+14);const y2=cy+Math.sin(-midAngle*Math.PI/180)*(r+14);const label=name==="repeat"?t.memberRepeater:t.memberFirstTimer;return<text x={x2} y={y2} textAnchor={x2>cx?"start":"end"} fill={TH.pieLabelFill} fontSize={10}>{`${label} ${(percent*100).toFixed(0)}%`}</text>}} labelLine={{stroke:"#a0977f"}}><Cell fill="#34d399"/><Cell fill="#4ea8de"/></Pie><Tooltip content={<CT/>}/></PieChart></CC></div>
            <div key="mb-jpintl"><CC grid title={t.memberByCountryType} id="mb-jpintl" nm="member_jpintl" data={memberRpt.jpIntlData}><BarChart data={memberRpt.jpIntlData}><CartesianGrid {...gl}/><XAxis dataKey="type" tick={tk}/><YAxis tick={tks} tickFormatter={v=>v+"%"}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Bar dataKey="rate" radius={[4,4,0,0]} name={t.memberRepeatRate}><Cell fill="#c9a84c"/><Cell fill="#4ea8de"/></Bar></BarChart></CC></div>
            <div key="mb-cntry-stack"><CC grid title={t.memberCountryStack} id="mb-cntry-stack" nm="member_cntry_stack" data={memberRpt.countryRptRows}><BarChart data={memberRpt.countryRptRows.map(r=>({country:r.country,firstTimerPct:r.total>0?+((r.firstTimers/r.total)*100).toFixed(1):0,repeaterPct:r.rate}))}><CartesianGrid {...gl}/><XAxis dataKey="country" tick={({x,y,payload})=><text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={9} dy={4} transform={`rotate(-45,${x},${y})`}>{tl(payload.value)}</text>} height={70} interval={0}/><YAxis tick={tks} tickFormatter={v=>v+"%"} domain={[0,100]}/><Tooltip content={<CT formatter={v=>v+"%"}/>} labelFormatter={v=>tl(v)}/><Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="firstTimerPct" stackId="a" fill="#4ea8de" name={t.memberFirstTimer}/><Bar dataKey="repeaterPct" stackId="a" fill="#34d399" name={t.memberRepeater}/></BarChart></CC></div>
            <div key="mb-cntry-counts"><CC grid title={t.memberCountryCounts} id="mb-cntry-counts" nm="member_cntry_counts" data={memberRpt.countryRptRows}><BarChart data={memberRpt.countryRptRows}><CartesianGrid {...gl}/><XAxis dataKey="country" tick={({x,y,payload})=><text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={9} dy={4} transform={`rotate(-45,${x},${y})`}>{tl(payload.value)}</text>} height={70} interval={0}/><YAxis tick={tk}/><Tooltip content={<CT/>} labelFormatter={v=>tl(v)}/><Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="firstTimers" fill="#4ea8de" radius={[4,4,0,0]} name={t.memberFirstTimer}/><Bar dataKey="repeaters" fill="#34d399" radius={[4,4,0,0]} name={t.memberRepeater}/></BarChart></CC></div>
            <div key="mb-rank"><CC grid title={t.memberByRank} id="mb-rank" nm="member_rank" data={memberRpt.rankRows}><ComposedChart data={memberRpt.rankRows}><CartesianGrid {...gl}/><XAxis dataKey="rank" tick={<TlTick/>}/><YAxis tick={tks} tickFormatter={v=>v+"%"} domain={[0,100]}/><YAxis yAxisId="count" orientation="right" tick={false} axisLine={false}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="rate" fill="#34d399" radius={[4,4,0,0]} name={t.memberRepeatRate}/><Bar dataKey="total" fill="#4ea8de" radius={[4,4,0,0]} name={t.memberTotal} opacity={0.4} yAxisId="count"/></ComposedChart></CC></div>
            <div key="mb-seg"><CC grid title={t.memberBySegment} id="mb-seg" nm="member_seg" data={memberRpt.segRows}><BarChart data={memberRpt.segRows}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tks} tickFormatter={v=>v+"%"}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Bar dataKey="rate" radius={[4,4,0,0]} name={t.memberRepeatRate}>{memberRpt.segRows.map((e,i)=><Cell key={i} fill={SEG_COLORS[e.segment]||PALETTE[i]}/>)}</Bar></BarChart></CC></div>
            <div key="mb-fac"><CC grid title={t.memberByFac} id="mb-fac" nm="member_fac" data={memberRpt.facByRate}><BarChart data={memberRpt.facByRate} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={v=>v+"%"}/><YAxis dataKey="name" type="category" width={140} tick={tk} interval={0}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Bar dataKey="rate" fill="#34d399" radius={[0,4,4,0]} name={t.memberRepeatRate}/></BarChart></CC></div>
            <div key="mb-fac-tbl"><SortTbl
              data={memberRpt.facRows}
              columns={[{key:"name",label:t.thFacility},{key:"guests",label:t.memberTotal},{key:"repeaters",label:t.memberRepeatCount},{key:"rate",label:t.memberRepeatRate},{key:"bookings",label:t.reservations}]}
              renderRow={r=><tr key={r.facility}><td style={{...S.td,whiteSpace:"nowrap"}}>{r.name}</td><td style={{...S.td,...S.m}}>{fmtN(r.guests)}</td><td style={{...S.td,...S.m}}>{fmtN(r.repeaters)}</td><td style={{...S.td,...S.m,color:r.rate>20?"#34d399":TH.text}}>{r.rate}%</td><td style={{...S.td,...S.m}}>{fmtN(r.bookings)}</td></tr>}
              title={t.memberByFac}
            /></div>
            <div key="mb-tight-chart"><CC grid title={t.memberTightest} id="mb-tight-chart" nm="member_tightest" data={memberRpt.tightestChart}><BarChart data={memberRpt.tightestChart}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={({x,y,payload})=><text x={x} y={y} textAnchor={isMobile?"end":"middle"} fill={TH.tickFill} fontSize={9} dy={12} transform={isMobile?`rotate(-45,${x},${y})`:undefined}>{tl(payload.value)}</text>} height={isMobile?60:30} interval={0}/><YAxis tick={tks} tickFormatter={v=>v+"%"}/><Tooltip content={<CT formatter={v=>v+"%"}/>} labelFormatter={v=>tl(v)}/><Legend wrapperStyle={{fontSize:10}}/>{memberRpt.bucketLabels.map((label,i)=><Bar key={label} dataKey={label} stackId="a" fill={["#34d399","#4ea8de","#c084fc","#c9a84c"][i]} name={label}/>)}</BarChart></CC></div>
            <div key="mb-tight-tbl"><SortTbl
              data={memberRpt.tightestRows}
              columns={[{key:"window",label:t.memberWindow},...memberRpt.windowSegments.map(s=>({key:s,label:tl(s)}))]}
              renderRow={r=><tr key={r.window}><td style={{...S.td,fontWeight:600}}>{r.window}</td>{memberRpt.windowSegments.map(s=><td key={s} style={{...S.td,...S.m,color:r[s]>5?"#34d399":TH.text}}>{r[s]}%</td>)}</tr>}
              title={t.memberTightest}
            /></div>
            <div key="mb-fs-chart"><CC grid title={t.memberFirstSecond} id="mb-fs-chart" nm="member_firstsecond" data={memberRpt.firstSecondChart}><BarChart data={memberRpt.firstSecondChart}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={({x,y,payload})=><text x={x} y={y} textAnchor={isMobile?"end":"middle"} fill={TH.tickFill} fontSize={9} dy={12} transform={isMobile?`rotate(-45,${x},${y})`:undefined}>{tl(payload.value)}</text>} height={isMobile?60:30} interval={0}/><YAxis tick={tks} tickFormatter={v=>v+"%"}/><Tooltip content={<CT formatter={v=>v+"%"}/>} labelFormatter={v=>tl(v)}/><Legend wrapperStyle={{fontSize:10}}/>{memberRpt.bucketLabels.map((label,i)=><Bar key={label} dataKey={label} stackId="a" fill={["#34d399","#4ea8de","#c084fc","#c9a84c"][i]} name={label}/>)}</BarChart></CC></div>
            <div key="mb-fs-tbl"><SortTbl
              data={memberRpt.firstSecondRows}
              columns={[{key:"window",label:t.memberWindow},...memberRpt.windowSegments.map(s=>({key:s,label:tl(s)}))]}
              renderRow={r=><tr key={r.window}><td style={{...S.td,fontWeight:600}}>{r.window}</td>{memberRpt.windowSegments.map(s=><td key={s} style={{...S.td,...S.m,color:r[s]>5?"#34d399":TH.text}}>{r[s]}%</td>)}</tr>}
              title={t.memberFirstSecond}
            /></div>
            <div key="mb-detail"><SortTbl
              data={memberRpt.detailRows}
              columns={[{key:"idx",label:"#"},{key:"name",label:t.memberName},{key:"country",label:t.drCountry},{key:"rank",label:t.thRank},{key:"segment",label:t.thSegment},{key:"bookings",label:t.reservations},{key:"rev",label:t.totalRevenue}]}
              renderRow={r=><tr key={r.idx}><td style={{...S.td,...S.m}}>{r.idx}</td><td style={S.td}>{r.name}</td><td style={S.td}>{tl(r.country)}</td><td style={S.td}>{tl(r.rank)}</td><td style={S.td}>{tl(r.segment)}</td><td style={{...S.td,...S.m}}>{r.bookings}</td><td style={{...S.td,...S.m}}>{fmtN(r.rev)}</td></tr>}
              title={t.memberDetail+" (Top 50)"}
            /></div>
          </DraggableGrid>:<div style={{textAlign:"center",padding:40,color:TH.textMuted}}>No data</div>}
        </>}

        {/* LOS DISTRIBUTION */}
        {tab==="los"&&<>          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",flexDirection:isMobile?"column":"row"}}>
            <div style={S.kpi}><div style={S.kl}>{t.avgLOS}</div><div style={S.kv}>{losRpt?losRpt.overallAvg:0} {t.ns}</div></div>
          </div>
          {losRpt?<DraggableGrid {...dgProps("los")}>
            <div key="los-hist"><CC grid title={t.losByNight} id="los-hist" nm="los_hist" data={losRpt.histData}><BarChart data={losRpt.histData}><CartesianGrid {...gl}/><XAxis dataKey="nights" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:10}}/>{SEG_ORDER.map(s=><Bar key={s} dataKey={s} stackId="a" fill={SEG_COLORS[s]} name={tl(s)}/>)}</BarChart></CC></div>
            <div key="los-seg"><CC grid title={t.losBySeg} id="los-seg" nm="los_seg" data={losRpt.segLOS}><BarChart data={losRpt.segLOS}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk}/><Tooltip content={<CT formatter={v=>v+" "+t.ns}/>}/><Bar dataKey="avgLOS" radius={[4,4,0,0]} name={t.avgLOS}>{losRpt.segLOS.map((e,i)=><Cell key={i} fill={SEG_COLORS[e.segment]||PALETTE[i]}/>)}</Bar></BarChart></CC></div>
            <div key="los-country"><CC grid title={t.losByCountry} id="los-country" nm="los_country" data={losRpt.countryLOS}><BarChart data={losRpt.countryLOS} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>v+" "+t.ns}/>}/><Bar dataKey="avgLOS" fill="#c084fc" radius={[0,4,4,0]} name={t.avgLOS}/></BarChart></CC></div>
            <div key="los-detail"><SortTbl
              data={losRpt.detailRows}
              columns={[{key:"nights",label:t.losNights},{key:"count",label:t.reservations},{key:"share",label:t.drShare},{key:"avgRevNight",label:t.losAvgRev}]}
              renderRow={r=><tr key={r.nights}><td style={{...S.td,fontWeight:600}}>{r.nights}</td><td style={{...S.td,...S.m}}>{fmtN(r.count)}</td><td style={{...S.td,...S.m}}>{r.share}%</td><td style={{...S.td,...S.m}}>{fmtY(r.avgRevNight)}</td></tr>}
              title={t.losDetail}
            /></div>
          </DraggableGrid>:<div style={{textAlign:"center",padding:40,color:TH.textMuted}}>{t.paceNoData}</div>}
        </>}

        {/* REVENUE */}
        {tab==="revenue"&&<><DraggableGrid {...dgProps("revenue")}>
          <div key="ch-rm"><CC grid title={t.revByMarket} id="ch-rm" nm="rev_mkt" h={Math.max(300,mktD.length*28)} data={mktD}><BarChart data={mktD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={fmtY}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="avgRev" fill="#c9a84c" radius={[0,4,4,0]} name={t.avgRevRes}/></BarChart></CC></div>
          <div key="ch-rv"><CC grid title={t.monthlyRev} id="ch-rv" nm="monthly_rev" h={300} data={moD}><BarChart data={moD}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="rev" fill="#34d399" radius={[4,4,0,0]} name={t.totalRevenue}/></BarChart></CC></div>
          <div key="ch-rmm"><CC grid title={t.revByMarketMonth} id="ch-rmm" nm="rev_mkt_month" h={300} data={revMktMo.data}><BarChart data={revMktMo.data}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Legend wrapperStyle={{fontSize:10}}/>{revMktMo.countries.map((c,i)=><Bar key={c} dataKey={c} stackId="a" fill={PALETTE[i%PALETTE.length]} name={tl(c)}/>)}</BarChart></CC></div>
          <div key="ch-drev"><CC grid title={t.dailyRev} id="ch-drev" nm="daily_rev" data={dailyD}><BarChart data={dailyD}><CartesianGrid {...gl}/><XAxis dataKey="date" tick={tks}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="rev" fill="#34d399" radius={[4,4,0,0]} name={t.totalRevenue}/></BarChart></CC></div>
          <div key="ch-rdow"><CC grid title={t.revByDOW} id="ch-rdow" nm="rev_dow" data={revDowD}><BarChart data={revDowD}><CartesianGrid {...gl}/><XAxis dataKey="day" tick={tk}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="rev" fill="#34d399" radius={[4,4,0,0]} name={t.totalRevenue}/></BarChart></CC></div>
          <div key="ch-rdowm"><CC grid title={t.revByDOWMonth} id="ch-rdowm" nm="rev_dow_month" data={revDowMonthD.data}><LineChart data={revDowMonthD.data}><CartesianGrid {...gl}/><XAxis dataKey="day" tick={tk}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Legend wrapperStyle={{fontSize:10}}/>{revDowMonthD.months.map((m,i)=><Line key={m} type="monotone" dataKey={m} stroke={PALETTE[i%PALETTE.length]} strokeWidth={2} dot={{r:3}} name={m}/>)}</LineChart></CC></div>
        </DraggableGrid></>}

        {/* CANCELLATIONS */}
        {tab==="cancellations"&&<div>
                    <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",flexDirection:isMobile?"column":"row"}}>
            <div style={S.kpi}><div style={S.kl}>{t.cancelCancelled}</div><div style={S.kv}>{cancelRpt?fmtN(cancelRpt.cancelledN):"—"}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.cancelRate}</div><div style={S.kv}>{cancelRpt?cancelRpt.overallRate+"%":"—"}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.cancelRevLost}</div><div style={S.kv}>{cancelRpt?"¥"+fmtN(cancelRpt.lostRev):"—"}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.cancelFeePct}</div><div style={S.kv}>{cancelRpt?"¥"+fmtN(cancelRpt.totalFee):"—"}</div></div>
          </div>
          {cancelRpt&&!cancelRpt.empty?<DraggableGrid {...dgProps("cancellations")}>
            <div key="canc-trend"><CC grid title={t.cancelTrend} id="canc-trend" nm="cancel_trend" data={cancelRpt.monthTrend}><ComposedChart data={cancelRpt.monthTrend}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tks}/><YAxis tick={tk}/><YAxis yAxisId="rate" orientation="right" tick={tks} tickFormatter={v=>v+"%"} domain={[0,100]}/><Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="total" fill="#4ea8de" radius={[4,4,0,0]} name={t.cancelTotal} opacity={0.5}/><Bar dataKey="cancelled" fill="#ef4444" radius={[4,4,0,0]} name={t.cancelCancelled}/><Line type="monotone" dataKey="rate" stroke={TH.gold} strokeWidth={2} yAxisId="rate" dot={{fill:TH.gold,r:3}} name={t.cancelRatePct}/></ComposedChart></CC></div>
            <div key="canc-country"><CC grid title={t.cancelByCountry} id="canc-country" nm="cancel_country" data={cancelRpt.countryByRate}><BarChart data={cancelRpt.countryByRate} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={v=>v+"%"}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Bar dataKey="rate" fill="#ef4444" radius={[0,4,4,0]} name={t.cancelRatePct}/></BarChart></CC></div>
            <div key="canc-seg"><CC grid title={t.cancelBySeg} id="canc-seg" nm="cancel_seg" data={cancelRpt.segRows}><BarChart data={cancelRpt.segRows}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tks} tickFormatter={v=>v+"%"}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Bar dataKey="rate" radius={[4,4,0,0]} name={t.cancelRatePct}>{cancelRpt.segRows.map((e,i)=><Cell key={i} fill={SEG_COLORS[e.segment]||PALETTE[i]}/>)}</Bar></BarChart></CC></div>
            <div key="canc-fac"><CC grid title={t.cancelByFac} id="canc-fac" nm="cancel_fac" data={cancelRpt.facByRate}><BarChart data={cancelRpt.facByRate} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={v=>v+"%"}/><YAxis dataKey="name" type="category" width={140} tick={tk} interval={0}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Bar dataKey="rate" fill="#ef4444" radius={[0,4,4,0]} name={t.cancelRatePct}/></BarChart></CC></div>
            <div key="canc-detail"><SortTbl
              data={cancelRpt.countryRows}
              columns={[{key:"country",label:t.drCountry},{key:"total",label:t.cancelTotal},{key:"cancelled",label:t.cancelCancelled},{key:"rate",label:t.cancelRatePct},{key:"lostRev",label:t.cancelRevLost},{key:"cancelFee",label:t.cancelFeePct}]}
              renderRow={r=><tr key={r.country}><td style={S.td}>{tl(r.country)}</td><td style={{...S.td,...S.m}}>{fmtN(r.total)}</td><td style={{...S.td,...S.m}}>{fmtN(r.cancelled)}</td><td style={{...S.td,...S.m,color:r.rate>30?"#ef4444":r.rate>15?TH.gold:TH.text}}>{r.rate}%</td><td style={{...S.td,...S.m}}>{fmtN(r.lostRev)}</td><td style={{...S.td,...S.m}}>{fmtN(r.cancelFee)}</td></tr>}
              title={t.cancelDetail}
            /></div>
          </DraggableGrid>:<div style={{textAlign:"center",padding:40,color:TH.textMuted}}>No data</div>}
        </div>}

        {/* REVPAR */}
        {tab==="revpar"&&<>          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",flexDirection:isMobile?"column":"row"}}>
            <div style={S.kpi}><div style={S.kl}>RevPAR</div><div style={S.kv}>¥{revparRpt?fmtN(revparRpt.overallRevpar):"—"}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.revparOcc}</div><div style={S.kv}>{revparRpt?revparRpt.overallOcc+"%":"—"}</div></div>
            <div style={S.kpi}><div style={S.kl}>ADR</div><div style={S.kv}>¥{revparRpt?fmtN(revparRpt.overallAdr):"—"}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.revparAvail}</div><div style={S.kv}>{revparRpt?fmtN(revparRpt.totalAvail):"—"}</div></div>
          </div>
          {revparRpt?<DraggableGrid {...dgProps("revpar")}>
            <div key="rp-trend"><CC grid title={t.revparTrend} id="rp-trend" nm="revpar_trend" data={revparRpt.monthTrend}><ComposedChart data={revparRpt.monthTrend}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tks}/><YAxis tick={tk} tickFormatter={fmtY}/><YAxis yAxisId="occ" orientation="right" tick={tks} tickFormatter={v=>v+"%"} domain={[0,100]}/><Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="revpar" fill={TH.gold} radius={[4,4,0,0]} name="RevPAR"/><Line type="monotone" dataKey="occ" stroke="#4ea8de" strokeWidth={2} yAxisId="occ" dot={{fill:"#4ea8de",r:3}} name={t.occRate}/></ComposedChart></CC></div>
            <div key="rp-daily"><CC grid title="Daily RevPAR" id="rp-daily" nm="revpar_daily" data={revparRpt.dailyTrend}><ComposedChart data={revparRpt.dailyTrend}><CartesianGrid {...gl}/><XAxis dataKey="date" tick={tks}/><YAxis tick={tk} tickFormatter={fmtY}/><YAxis yAxisId="occ" orientation="right" tick={tks} tickFormatter={v=>v+"%"} domain={[0,100]}/><Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="revpar" fill={TH.gold} radius={[4,4,0,0]} name="RevPAR"/><Line type="monotone" dataKey="occ" stroke="#4ea8de" strokeWidth={1.5} yAxisId="occ" dot={false} name={t.occRate}/></ComposedChart></CC></div>
            <div key="rp-fac"><CC grid title={t.revparByFac} id="rp-fac" nm="revpar_fac" data={revparRpt.facRows}><BarChart data={revparRpt.facRows} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={fmtY}/><YAxis dataKey="name" type="category" width={140} tick={tk} interval={0}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="revpar" fill={TH.gold} radius={[0,4,4,0]} name="RevPAR"/></BarChart></CC></div>
            <div key="rp-detail"><SortTbl
              data={revparRpt.facRows}
              columns={[{key:"name",label:t.thFacility},{key:"rooms",label:"Rooms"},{key:"occ",label:t.occRate},{key:"revpar",label:"RevPAR"},{key:"adr",label:"ADR"},{key:"nightsSold",label:t.revparSold}]}
              renderRow={r=><tr key={r.facility}><td style={{...S.td,whiteSpace:"nowrap"}}>{r.name}</td><td style={{...S.td,...S.m}}>{r.rooms}</td><td style={{...S.td,...S.m}}>{r.occ}%</td><td style={{...S.td,...S.m}}>{fmtY(r.revpar)}</td><td style={{...S.td,...S.m}}>{fmtY(r.adr)}</td><td style={{...S.td,...S.m}}>{fmtN(r.nightsSold)}</td></tr>}
              title={t.revparTitle}
            /></div>
          </DraggableGrid>:<div style={{textAlign:"center",padding:40,color:TH.textMuted}}>No data</div>}
        </>}

        {/* ROOMS */}
        {tab==="adr"&&adrRpt&&<div>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <div style={{...S.kpi,borderColor:TH.gold}}><div style={S.kl}>Overall ADR</div><div style={{...S.kv,color:TH.gold}}>¥{fmtN(adrRpt.overallAdr)}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.totalRevenue}</div><div style={S.kv}>¥{fmtN(adrRpt.totalRev)}</div></div>
            <div style={S.kpi}><div style={S.kl}>Nights Sold</div><div style={S.kv}>{fmtN(adrRpt.totalNights)}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.reservations}</div><div style={S.kv}>{fmtN(adrRpt.totalCount)}</div></div>
          </div>
          <DraggableGrid {...dgProps("adr")}>
            <div key="adr-fac"><CC grid title="ADR by Facility" id="adr-fac" nm="adr_fac" h={Math.max(320,adrRpt.facRows.length*24)} data={adrRpt.facRows}>
              <BarChart data={adrRpt.facRows} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={fmtY}/><YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="adr" fill={TH.gold} radius={[0,4,4,0]} name="ADR"/></BarChart>
            </CC></div>
            <div key="adr-country"><CC grid title="ADR by Country (min 5 rsv)" id="adr-country" nm="adr_country" data={adrRpt.countryRows}>
              <BarChart data={adrRpt.countryRows}><CartesianGrid {...gl}/><XAxis dataKey="country" tick={({x,y,payload})=><text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={9} dy={4} transform={`rotate(-45,${x},${y})`}>{tl(payload.value)}</text>} height={70} interval={0}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>} labelFormatter={v=>tl(v)}/><Bar dataKey="adr" fill="#4ea8de" radius={[4,4,0,0]} name="ADR"/></BarChart>
            </CC></div>
            <div key="adr-seg"><CC grid title="ADR by Segment" id="adr-seg" nm="adr_seg" data={adrRpt.segRows}>
              <BarChart data={adrRpt.segRows}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="adr" name="ADR">{adrRpt.segRows.map((e,i)=><Cell key={i} fill={SEG_COLORS[e.segment]||PALETTE[i]}/>)}</Bar></BarChart>
            </CC></div>
            <div key="adr-region"><CC grid title="ADR by Region" id="adr-region" nm="adr_region" data={adrRpt.regionRows}>
              <BarChart data={adrRpt.regionRows}><CartesianGrid {...gl}/><XAxis dataKey="region" tick={tk} tickFormatter={v=>tl(v)}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="adr" radius={[4,4,0,0]} name="ADR">{adrRpt.regionRows.map((r,i)=><Cell key={i} fill={r.region==="Kanto"?"#4ea8de":"#e07b54"}/>)}</Bar></BarChart>
            </CC></div>
            <div key="adr-mo"><CC grid title="Monthly ADR Trend" id="adr-mo" nm="adr_mo" data={adrRpt.monthRows}>
              <LineChart data={adrRpt.monthRows}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Line type="monotone" dataKey="adr" stroke={TH.gold} strokeWidth={2} dot={{r:3}} name="ADR"/></LineChart>
            </CC></div>
          </DraggableGrid>
        </div>}

        {tab==="rooms"&&<><DraggableGrid {...dgProps("rooms")}>
          <div key="ch-rt"><CC grid title={t.roomTypeDist} id="ch-rt" nm="rooms" h={Math.max(280,rmD.length*26)} data={rmD}><BarChart data={rmD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="room" type="category" width={120} tick={tk} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#c084fc" radius={[0,4,4,0]} name={t.reservations}/></BarChart></CC></div>
        </DraggableGrid>
          <SortTbl
            data={rmD.map(d=>({room:d.room,count:d.count,share:agg.n>0?((d.count/agg.n)*100):0}))}
            columns={[{key:"room",label:t.thRoom},{key:"count",label:t.thCount},{key:"share",label:t.thShare}]}
            renderRow={d=><tr key={d.room}><td style={S.td}>{d.room}</td><td style={{...S.td,...S.m}}>{fmtN(d.count)}</td><td style={{...S.td,...S.m}}>{d.share.toFixed(1)}%</td></tr>}
            title={t.roomTypeTable}
          />
        </>}

        {/* FACILITIES */}
        {tab==="facilities"&&<div>          <DraggableGrid {...dgProps("facilities")}>
            <div key="fac-res"><CC grid title={t.facResByFacility} id="fac-res" nm="fac_res" h={Math.max(300,facD.length*22)} data={facD}><BarChart data={facD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="n" fill="#4ea8de" radius={[0,4,4,0]} name={t.reservations}/></BarChart></CC></div>
            <div key="fac-rev"><CC grid title={t.facAvgRevByFacility} id="fac-rev" nm="fac_rev" h={Math.max(300,facD.length*22)} data={facD}><BarChart data={facD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={fmtY}/><YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="avgRev" fill="#c9a84c" radius={[0,4,4,0]} name={t.avgRevRes}/></BarChart></CC></div>
            <div key="fac-intl"><CC grid title={t.facIntlByFacility} id="fac-intl" nm="fac_intl" h={Math.max(300,facD.length*22)} data={facD}><BarChart data={facD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={v=>v+"%"}/><YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Bar dataKey="intlPct" fill="#e07b54" radius={[0,4,4,0]} name={t.intlPct}/></BarChart></CC></div>
            <div key="fac-los"><CC grid title={t.facLOSByFacility} id="fac-los" nm="fac_los" h={Math.max(300,facD.length*22)} data={facD}><BarChart data={facD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/><Tooltip content={<CT formatter={v=>v+" "+t.ns}/>}/><Bar dataKey="avgLOS" fill="#c084fc" radius={[0,4,4,0]} name={t.avgLOS}/></BarChart></CC></div>
            <div key="fac-kvk"><CC grid title={t.facKvKCompare} id="fac-kvk" nm="fac_kvk" data={kvkFac}><BarChart data={kvkFac}><CartesianGrid {...gl}/><XAxis dataKey="metric" tick={tks}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de" radius={[4,4,0,0]} name={tl("Kanto")}/><Bar dataKey="Kansai" fill="#e07b54" radius={[4,4,0,0]} name={tl("Kansai")}/></BarChart></CC></div>
            <div key="fac-hva"><CC grid title={t.facHvACompare} id="fac-hva" nm="fac_hva" data={hvaFac}><BarChart data={hvaFac}><CartesianGrid {...gl}/><XAxis dataKey="metric" tick={tks}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="Hotel" fill="#4ea8de" radius={[4,4,0,0]} name={tl("Hotel")}/><Bar dataKey="Apart" fill="#c9a84c" radius={[4,4,0,0]} name={tl("Apart")}/></BarChart></CC></div>
          </DraggableGrid>
          <SortTbl
            data={facD}
            columns={[{key:"fullName",label:t.thFacility},{key:"region",label:t.thRegion},{key:"n",label:t.reservations},{key:"avgRev",label:t.thAvgRev},{key:"intlPct",label:t.thIntlPct},{key:"avgLOS",label:t.thAvgLOS},{key:"topSeg",label:t.thTopSeg}]}
            renderRow={f=><tr key={f.fullName}><td style={{...S.td,maxWidth:260,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={f.fullName}>{f.fullName}</td><td style={S.td}><span style={S.tag(f.region==="Kanto"?"#4ea8de":"#e07b54")}>{tl(f.region)}</span></td><td style={{...S.td,...S.m}}>{fmtN(f.n)}</td><td style={{...S.td,...S.m}}>{fmtY(f.avgRev)}</td><td style={{...S.td,...S.m,color:f.intlPct>50?"#c9a84c":"#c8c3b8"}}>{f.intlPct}%</td><td style={{...S.td,...S.m}}>{f.avgLOS}{t.nu}</td><td style={S.td}><span style={S.tag(SEG_COLORS[f.topSeg]||"#64748b")}>{tl(f.topSeg)}</span></td></tr>}
            title={t.facilityPerf}
            exportFn={<button style={{...S.bg,fontSize:10}} onClick={()=>{expCSV(facD.map(f=>({Facility:f.fullName,Region:f.region,Res:f.n,AvgRev:f.avgRev,"Intl%":f.intlPct,AvgLOS:f.avgLOS,TopSeg:f.topSeg})),["Facility","Region","Res","AvgRev","Intl%","AvgLOS","TopSeg"],"facilities.csv")}}>⬇ {t.exportCSV}</button>}
          /></div>}

        {/* TL CHANNEL MIX */}
        {tab==="tl-channel"&&<div>
          {tlStatus==="loading"&&<div style={{textAlign:"center",padding:40,color:TH.textMuted,fontSize:12}}>Loading TL data…</div>}
          {tlStatus==="error"&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:14,marginBottom:16,textAlign:"center",fontSize:12,color:"#ef4444"}}>⚠ Failed to load TL Lincoln data. Check the publish URL.</div>}
          {tlStatus==="done"&&!tlData.length&&<div style={{textAlign:"center",padding:40,color:TH.textMuted,fontSize:12}}>{t.tlNoData}</div>}
          {tlChannelRpt?<>
            {/* KPIs */}
            <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <div style={S.kpi}><div style={S.kl}>{t.tlTotalRevenue}</div><div style={S.kv}>¥{fmtN(tlChannelRpt.totalRev)}</div></div>
              <div style={S.kpi}><div style={S.kl}>{t.tlTotalBookings}</div><div style={S.kv}>{fmtN(tlChannelRpt.totalBookings)}</div></div>
              <div style={S.kpi}><div style={S.kl}>{t.tlTotalRoomNights}</div><div style={S.kv}>{fmtN(tlChannelRpt.totalRoomNights)}</div></div>
              <div style={S.kpi}><div style={S.kl}>{t.tlTotalCancellations}</div><div style={S.kv}>{fmtN(tlChannelRpt.totalCancellations)}</div></div>
              <div style={{...S.kpi,borderColor:SOURCE_COLORS.tl}}><div style={S.kl}>{t.tlDirectShare}</div><div style={{...S.kv,color:SOURCE_COLORS.tl}}>{tlChannelRpt.directShare}%</div></div>
            </div>
            {/* Group/metric toggles */}
            <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:10,color:TH.textMuted,letterSpacing:0.5}}>{t.monthModeLabel}:</span>
              <div style={{display:"flex",gap:3}}>
                <button style={{...S.btn,...(tlGroupBy==="day"?S.ba:{})}} onClick={()=>setTlGroupBy("day")}>{t.tlGroupByDay}</button>
                <button style={{...S.btn,...(tlGroupBy==="month"?S.ba:{})}} onClick={()=>setTlGroupBy("month")}>{t.tlGroupByMonth}</button>
              </div>
              <span style={{fontSize:10,color:TH.textMuted,letterSpacing:0.5,marginLeft:10}}>Metric:</span>
              <div style={{display:"flex",gap:3}}>
                <button style={{...S.btn,...(tlMetric==="revenue"?S.ba:{})}} onClick={()=>setTlMetric("revenue")}>{t.tlMetricRev}</button>
                <button style={{...S.btn,...(tlMetric==="bookings"?S.ba:{})}} onClick={()=>setTlMetric("bookings")}>{t.tlMetricBookings}</button>
              </div>
            </div>
            <DraggableGrid {...dgProps("tl-channel")}>
              {/* Stacked channel mix */}
              <div key="tl-mix"><CC grid title={tlGroupBy==="day"?t.tlChannelMixDaily:t.tlChannelMixMonthly} id="tl-mix" nm="tl_mix" data={tlGroupBy==="day"?tlChannelRpt.dailySeries:tlChannelRpt.monthlySeries}>
                <BarChart data={tlGroupBy==="day"?tlChannelRpt.dailySeries:tlChannelRpt.monthlySeries}>
                  <CartesianGrid {...gl}/>
                  <XAxis dataKey="date" tick={tks}/>
                  <YAxis tick={tk} tickFormatter={tlMetric==="revenue"?fmtY:undefined}/>
                  <Tooltip content={<CT formatter={tlMetric==="revenue"?(v=>"¥"+v.toLocaleString()):undefined}/>}/>
                  <Legend wrapperStyle={{fontSize:10}}/>
                  <Bar dataKey={tlMetric==="revenue"?"direct":"directB"} stackId="a" fill={CHANNEL_COLORS.direct} name={t.tlDirect}/>
                  <Bar dataKey={tlMetric==="revenue"?"rta":"rtaB"} stackId="a" fill={CHANNEL_COLORS.rta} name={t.tlRTA}/>
                  <Bar dataKey={tlMetric==="revenue"?"ota":"otaB"} stackId="a" fill={CHANNEL_COLORS.ota} name={t.tlOTA}/>
                </BarChart>
              </CC></div>
              {/* Direct share trend (switches with Day/Month toggle) */}
              <div key="tl-direct-trend"><CC grid title={t.tlDirectShareTrend+" — "+(tlGroupBy==="day"?t.tlGroupByDay:t.tlGroupByMonth)} id="tl-direct-trend" nm="tl_direct_trend" data={tlGroupBy==="day"?tlChannelRpt.directShareSeries:tlChannelRpt.directShareMonthlySeries}>
                <LineChart data={tlGroupBy==="day"?tlChannelRpt.directShareSeries:tlChannelRpt.directShareMonthlySeries}>
                  <CartesianGrid {...gl}/>
                  <XAxis dataKey="date" tick={tks}/>
                  <YAxis tick={tk} tickFormatter={v=>v+"%"} domain={[0,100]}/>
                  <Tooltip content={<CT formatter={v=>v+"%"}/>}/>
                  <Line type="monotone" dataKey="share" stroke={CHANNEL_COLORS.direct} strokeWidth={tlGroupBy==="day"?2:2.5} dot={{fill:CHANNEL_COLORS.direct,r:tlGroupBy==="day"?3:4}} name={t.tlDirectShare}/>
                </LineChart>
              </CC></div>
              {/* Facility × Channel stacked horizontal */}
              <div key="tl-fac-stack"><CC grid title={t.tlFacByChannel} id="tl-fac-stack" nm="tl_fac_stack" h={Math.max(320,tlChannelRpt.facList.length*22)} data={tlChannelRpt.facList}>
                <BarChart data={tlChannelRpt.facList} layout="vertical">
                  <CartesianGrid {...gl}/>
                  <XAxis type="number" tick={tks} tickFormatter={fmtY}/>
                  <YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/>
                  <Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/>
                  <Legend wrapperStyle={{fontSize:10}}/>
                  <Bar dataKey="direct" stackId="a" fill={CHANNEL_COLORS.direct} name={t.tlDirect}/>
                  <Bar dataKey="rta" stackId="a" fill={CHANNEL_COLORS.rta} name={t.tlRTA}/>
                  <Bar dataKey="ota" stackId="a" fill={CHANNEL_COLORS.ota} name={t.tlOTA}/>
                </BarChart>
              </CC></div>
              {/* Top facilities by direct share */}
              <div key="tl-fac-direct"><CC grid title={t.tlTopFacDirect} id="tl-fac-direct" nm="tl_fac_direct" data={tlChannelRpt.facByDirect}>
                <BarChart data={tlChannelRpt.facByDirect} layout="vertical">
                  <CartesianGrid {...gl}/>
                  <XAxis type="number" tick={tks} tickFormatter={v=>v+"%"} domain={[0,100]}/>
                  <YAxis dataKey="name" type="category" width={140} tick={tk} interval={0}/>
                  <Tooltip content={<CT formatter={v=>v+"%"}/>}/>
                  <Bar dataKey="directPct" fill={CHANNEL_COLORS.direct} radius={[0,4,4,0]} name={t.tlDirectShare}/>
                </BarChart>
              </CC></div>
              {/* Cancellation rate by channel */}
              <div key="tl-canc-channel"><CC grid title={t.tlCancByChannel} id="tl-canc-channel" nm="tl_canc_channel" data={tlChannelRpt.cancelRateRows}>
                <BarChart data={tlChannelRpt.cancelRateRows}>
                  <CartesianGrid {...gl}/>
                  <XAxis dataKey="bucket" tick={tks} tickFormatter={v=>v.toUpperCase()}/>
                  <YAxis tick={tks} tickFormatter={v=>v+"%"}/>
                  <Tooltip content={<CT formatter={v=>v+"%"}/>}/>
                  <Bar dataKey="rate" radius={[4,4,0,0]} name="Cancel %">
                    {tlChannelRpt.cancelRateRows.map((r,i)=><Cell key={i} fill={CHANNEL_COLORS[r.bucket]||"#888"}/>)}
                  </Bar>
                </BarChart>
              </CC></div>
              {/* Top channel-name drilldown (OTA granularity) */}
              <div key="tl-channel-name"><CC grid title={t.tlTopChannels} id="tl-channel-name" nm="tl_channel_name" h={Math.max(280,tlChannelRpt.channelNameList.slice(0,20).length*24)} data={tlChannelRpt.channelNameList.slice(0,20)}>
                <BarChart data={tlChannelRpt.channelNameList.slice(0,20)} layout="vertical">
                  <CartesianGrid {...gl}/>
                  <XAxis type="number" tick={tks} tickFormatter={fmtY}/>
                  <YAxis dataKey="channel" type="category" width={180} tick={tk} interval={0}/>
                  <Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/>
                  <Bar dataKey="rev" radius={[0,4,4,0]} name={t.tlMetricRev}>
                    {tlChannelRpt.channelNameList.slice(0,20).map((c,i)=><Cell key={i} fill={CHANNEL_COLORS[c.bucket]||"#888"}/>)}
                  </Bar>
                </BarChart>
              </CC></div>
              {/* DOW pattern */}
              <div key="tl-dow"><CC grid title={t.tlDOWByChannel} id="tl-dow" nm="tl_dow" data={tlChannelRpt.dowRows}>
                <BarChart data={tlChannelRpt.dowRows}>
                  <CartesianGrid {...gl}/>
                  <XAxis dataKey="day" tick={tks}/>
                  <YAxis tick={tk} tickFormatter={fmtY}/>
                  <Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/>
                  <Legend wrapperStyle={{fontSize:10}}/>
                  <Bar dataKey="direct" stackId="a" fill={CHANNEL_COLORS.direct} name={t.tlDirect}/>
                  <Bar dataKey="rta" stackId="a" fill={CHANNEL_COLORS.rta} name={t.tlRTA}/>
                  <Bar dataKey="ota" stackId="a" fill={CHANNEL_COLORS.ota} name={t.tlOTA}/>
                </BarChart>
              </CC></div>
              {/* Matrix table */}
              <div key="tl-matrix"><div style={{...S.card,height:"100%",overflow:"auto"}}>
                <div style={{...S.ct,marginBottom:8}} className="rgl-drag">{t.tlMatrix}</div>
                <table style={S.tbl}><thead><tr>
                  <th style={S.th}>{t.property}</th>
                  <th style={{...S.th,textAlign:"right"}}>OTA ¥</th>
                  <th style={{...S.th,textAlign:"right"}}>RTA ¥</th>
                  <th style={{...S.th,textAlign:"right"}}>Direct ¥</th>
                  <th style={{...S.th,textAlign:"right"}}>Total ¥</th>
                  <th style={{...S.th,textAlign:"right"}}>Direct %</th>
                </tr></thead><tbody>
                  {tlChannelRpt.facList.map(f=><tr key={f.facility}>
                    <td style={{...S.td,whiteSpace:"nowrap"}}>{f.name}</td>
                    <td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(f.ota)}</td>
                    <td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(f.rta)}</td>
                    <td style={{...S.td,...S.m,textAlign:"right",color:CHANNEL_COLORS.direct}}>¥{fmtN(f.direct)}</td>
                    <td style={{...S.td,...S.m,textAlign:"right",fontWeight:600}}>¥{fmtN(f.total)}</td>
                    <td style={{...S.td,...S.m,textAlign:"right",color:f.directPct>30?CHANNEL_COLORS.direct:TH.text}}>{f.directPct}%</td>
                  </tr>)}
                  <tr style={{fontWeight:700,borderTop:"1px solid "+TH.border}}>
                    <td style={S.td}>{t.drGrandTotal}</td>
                    <td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(tlChannelRpt.byBucket.ota.rev)}</td>
                    <td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(tlChannelRpt.byBucket.rta.rev)}</td>
                    <td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(tlChannelRpt.byBucket.direct.rev)}</td>
                    <td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(tlChannelRpt.totalRev)}</td>
                    <td style={{...S.td,...S.m,textAlign:"right"}}>{tlChannelRpt.directShare}%</td>
                  </tr>
                </tbody></table>
              </div></div>
            </DraggableGrid>
          </>:null}
        </div>}

        {/* TL REVENUE */}
        {tab==="tl-revenue"&&tlRevenueRpt&&<div>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <div style={S.kpi}><div style={S.kl}>{t.tlTotalRevenue}</div><div style={S.kv}>¥{fmtN(tlRevenueRpt.totalRev)}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.tlTotalBookings}</div><div style={S.kv}>{fmtN(tlRevenueRpt.count)}</div></div>
            <div style={S.kpi}><div style={S.kl}>Room-Nights</div><div style={S.kv}>{fmtN(tlRevenueRpt.totalRoomNights)}</div></div>
            <div style={S.kpi}><div style={S.kl}>ADR (税抜)</div><div style={S.kv}>¥{fmtN(tlRevenueRpt.adr)}</div></div>
          </div>
          <DraggableGrid {...dgProps("tl-revenue")}>
            <div key="tlr-mo"><CC grid title="Monthly Revenue" id="tlr-mo" nm="tl_rev_mo" data={tlRevenueRpt.moRows}>
              <ComposedChart data={tlRevenueRpt.moRows}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="rev" fill={SOURCE_COLORS.tl} radius={[4,4,0,0]} name={t.tlMetricRev}/></ComposedChart>
            </CC></div>
            <div key="tlr-daily"><CC grid title="Daily Revenue" id="tlr-daily" nm="tl_rev_daily" data={tlRevenueRpt.dayRows}>
              <LineChart data={tlRevenueRpt.dayRows}><CartesianGrid {...gl}/><XAxis dataKey="date" tick={tks}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Line type="monotone" dataKey="rev" stroke={SOURCE_COLORS.tl} strokeWidth={1.5} dot={false} name={t.tlMetricRev}/></LineChart>
            </CC></div>
            <div key="tlr-fac"><CC grid title="Revenue by Facility" id="tlr-fac" nm="tl_rev_fac" h={Math.max(320,tlRevenueRpt.facRows.length*22)} data={tlRevenueRpt.facRows}>
              <BarChart data={tlRevenueRpt.facRows} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={fmtY}/><YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="rev" fill={SOURCE_COLORS.tl} radius={[0,4,4,0]} name={t.tlMetricRev}/></BarChart>
            </CC></div>
            <div key="tlr-seg"><CC grid title="Revenue by Segment" id="tlr-seg" nm="tl_rev_seg" data={tlRevenueRpt.segRows}>
              <BarChart data={tlRevenueRpt.segRows}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="rev" name={t.tlMetricRev}>{tlRevenueRpt.segRows.map((e,i)=><Cell key={i} fill={SEG_COLORS[e.segment]||PALETTE[i]}/>)}</Bar></BarChart>
            </CC></div>
            <div key="tlr-dow"><CC grid title="Revenue by Day-of-Week" id="tlr-dow" nm="tl_rev_dow" data={tlRevenueRpt.dowRows}>
              <BarChart data={tlRevenueRpt.dowRows}><CartesianGrid {...gl}/><XAxis dataKey="day" tick={tk}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="rev" fill={SOURCE_COLORS.tl} radius={[4,4,0,0]} name={t.tlMetricRev}/></BarChart>
            </CC></div>
          </DraggableGrid>
        </div>}

        {/* TL SEGMENTS */}
        {tab==="tl-segments"&&tlSegmentsRpt&&<div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:TH.textMuted,fontWeight:600}}>{t.segBreakdownMode}:</span>
            <div style={{display:"flex",gap:3}}>
              <button style={{...S.btn,...(segDetailed===false?S.ba:{})}} onClick={()=>setSegDetailed(false)}>{t.segSimple}</button>
              <button style={{...S.btn,...(segDetailed===true?S.ba:{})}} onClick={()=>setSegDetailed(true)}>{t.segDetailedLabel}</button>
            </div>
          </div>
          <DraggableGrid {...dgProps("tl-segments")}>
            <div key="tls-dist"><CC grid title="Segment Distribution" id="tls-dist" nm="tl_seg_dist" data={tlSegmentsRpt.rows}>
              <BarChart data={tlSegmentsRpt.rows}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={({x,y,payload})=><text x={x} y={y} textAnchor={segDetailed?"end":"middle"} fill={TH.tickFill} fontSize={segDetailed?8:11} dy={12} transform={segDetailed?`rotate(-30,${x},${y})`:undefined}>{tl(payload.value)}</text>} height={segDetailed?60:30} interval={0}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Bar dataKey="count" name={t.reservations}>{tlSegmentsRpt.rows.map((e,i)=><Cell key={i} fill={(segDetailed?SEG_COLORS_DETAILED:SEG_COLORS)[e.segment]||PALETTE[i]}/>)}</Bar></BarChart>
            </CC></div>
            <div key="tls-rev"><CC grid title="Avg Revenue by Segment" id="tls-rev" nm="tl_seg_rev" data={tlSegmentsRpt.rows}>
              <BarChart data={tlSegmentsRpt.rows}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="avgRev" name={t.avgRevRes}>{tlSegmentsRpt.rows.map((e,i)=><Cell key={i} fill={(segDetailed?SEG_COLORS_DETAILED:SEG_COLORS)[e.segment]||PALETTE[i]}/>)}</Bar></BarChart>
            </CC></div>
            <div key="tls-los"><CC grid title="Avg LOS by Segment" id="tls-los" nm="tl_seg_los" data={tlSegmentsRpt.rows}>
              <BarChart data={tlSegmentsRpt.rows}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Bar dataKey="avgLOS" name={t.avgLOS}>{tlSegmentsRpt.rows.map((e,i)=><Cell key={i} fill={(segDetailed?SEG_COLORS_DETAILED:SEG_COLORS)[e.segment]||PALETTE[i]}/>)}</Bar></BarChart>
            </CC></div>
            <div key="tls-lead"><CC grid title="Avg Lead Time by Segment" id="tls-lead" nm="tl_seg_lead" data={tlSegmentsRpt.rows}>
              <BarChart data={tlSegmentsRpt.rows}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Bar dataKey="avgLead" name={t.avgLeadTime}>{tlSegmentsRpt.rows.map((e,i)=><Cell key={i} fill={(segDetailed?SEG_COLORS_DETAILED:SEG_COLORS)[e.segment]||PALETTE[i]}/>)}</Bar></BarChart>
            </CC></div>
            <div key="tls-fac"><CC grid title="Segment Distribution by Facility" id="tls-fac" nm="tl_seg_fac" h={Math.max(320,tlSegmentsRpt.facSegRows.length*24)} data={tlSegmentsRpt.facSegRows}>
              <BarChart data={tlSegmentsRpt.facSegRows} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/><Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:10}}/>
                {tlSegmentsRpt.activeSegs.map(s=><Bar key={s} dataKey={s} stackId="a" fill={(segDetailed?SEG_COLORS_DETAILED:SEG_COLORS)[s]||"#888"} name={tl(s)}/>)}
              </BarChart>
            </CC></div>
          </DraggableGrid>
        </div>}

        {/* TL DAILY REPORT */}
        {tab==="tl-daily"&&<div>
          <div style={{...S.card,background:"rgba(94,234,212,0.06)",border:"1px solid rgba(94,234,212,0.2)",padding:"8px 12px",marginBottom:12,fontSize:10,color:TH.textMuted,lineHeight:1.5}}>{t.tlHintDailyDate}</div>
          <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
            <div><div style={S.fl}>{t.from}</div><input type="date" style={S.inp} value={drFrom||""} onChange={e=>{setDrFrom(e.target.value);if(!drTo)setDrTo(e.target.value)}}/></div>
            <div><div style={S.fl}>{t.to}</div><input type="date" style={S.inp} value={drTo||""} onChange={e=>setDrTo(e.target.value)}/></div>
          </div>
          {tlDailyRpt?<div>
            <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <div style={S.kpi}><div style={S.kl}>{t.tlTotalRevenue}</div><div style={S.kv}>¥{fmtN(tlDailyRpt.cur.rev)}</div>{tlDailyRpt.yoyRev!=null&&<div style={{fontSize:10,color:tlDailyRpt.yoyRev>=0?"#34d399":"#ef4444",marginTop:2}}>YoY: {tlDailyRpt.yoyRev>=0?"+":""}{tlDailyRpt.yoyRev}%</div>}</div>
              <div style={S.kpi}><div style={S.kl}>{t.tlTotalBookings}</div><div style={S.kv}>{fmtN(tlDailyRpt.cur.count)}</div>{tlDailyRpt.yoyCount!=null&&<div style={{fontSize:10,color:tlDailyRpt.yoyCount>=0?"#34d399":"#ef4444",marginTop:2}}>YoY: {tlDailyRpt.yoyCount>=0?"+":""}{tlDailyRpt.yoyCount}%</div>}</div>
              <div style={S.kpi}><div style={S.kl}>Room-Nights</div><div style={S.kv}>{fmtN(tlDailyRpt.cur.roomNights)}</div></div>
              <div style={S.kpi}><div style={S.kl}>ADR (税抜)</div><div style={S.kv}>¥{fmtN(tlDailyRpt.cur.adr)}</div></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
              <div style={S.card}><div style={S.ct}>By Facility</div>
                <table style={S.tbl}><thead><tr><th style={S.th}>Facility</th><th style={{...S.th,textAlign:"right"}}>Res</th><th style={{...S.th,textAlign:"right"}}>Revenue (税抜)</th><th style={{...S.th,textAlign:"right"}}>Room-Nights</th></tr></thead>
                <tbody>{tlDailyRpt.cur.facRows.map(f=><tr key={f.facility}><td style={{...S.td,whiteSpace:"nowrap"}}>{f.name}</td><td style={{...S.td,...S.m,textAlign:"right"}}>{fmtN(f.count)}</td><td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(f.rev)}</td><td style={{...S.td,...S.m,textAlign:"right"}}>{fmtN(f.roomNights)}</td></tr>)}
                <tr style={{fontWeight:700,borderTop:"1px solid "+TH.border}}><td style={S.td}>{t.drGrandTotal}</td><td style={{...S.td,...S.m,textAlign:"right"}}>{fmtN(tlDailyRpt.cur.count)}</td><td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(tlDailyRpt.cur.rev)}</td><td style={{...S.td,...S.m,textAlign:"right"}}>{fmtN(tlDailyRpt.cur.roomNights)}</td></tr>
                </tbody></table>
              </div>
              <div style={S.card}><div style={S.ct}>By Channel (full name)</div>
                <table style={S.tbl}><thead><tr><th style={S.th}>Channel</th><th style={S.th}>Bucket</th><th style={{...S.th,textAlign:"right"}}>Res</th><th style={{...S.th,textAlign:"right"}}>Revenue (税抜)</th></tr></thead>
                <tbody>{tlDailyRpt.channelNameRows.map(c=><tr key={c.channel}><td style={{...S.td,whiteSpace:"nowrap"}}>{c.channel}</td><td style={S.td}><span style={S.tag(CHANNEL_COLORS[c.bucket]||"#888")}>{c.bucket}</span></td><td style={{...S.td,...S.m,textAlign:"right"}}>{fmtN(c.count)}</td><td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(c.rev)}</td></tr>)}</tbody></table>
              </div>
            </div>
          </div>:<div style={{textAlign:"center",color:TH.textMuted,padding:40}}>Select a date range.</div>}
        </div>}

        {/* TL MEMBER */}
        {tab==="tl-member"&&tlMemberRpt&&<div>
          <div style={{...S.card,background:TH.insightBg,border:"1px solid "+TH.insightBorder,marginBottom:14,fontSize:11,color:TH.textMuted,lineHeight:1.6}}>TL data member coverage depends on email availability. Walk-ins and group bookings may lack email and are excluded from this analysis.</div>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <div style={S.kpi}><div style={S.kl}>{t.memberTotal}</div><div style={S.kv}>{fmtN(tlMemberRpt.totalGuests)}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.memberRepeatCount}</div><div style={S.kv}>{fmtN(tlMemberRpt.repeatCount)}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.memberRepeatRate}</div><div style={S.kv}>{tlMemberRpt.repeatRate}%</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.memberAvgBookings}</div><div style={S.kv}>{tlMemberRpt.avgBookings}</div></div>
          </div>
          <DraggableGrid {...dgProps("tl-member")}>
            <div key="tlm-overview"><CC grid title={t.memberRepeatRate} id="tlm-overview" nm="tl_member_overview" data={tlMemberRpt.overviewPie}>
              <PieChart><Pie data={tlMemberRpt.overviewPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="65%"><Cell fill="#34d399"/><Cell fill="#4ea8de"/></Pie><Tooltip content={<CT/>}/></PieChart>
            </CC></div>
            <div key="tlm-seg"><CC grid title={t.memberBySegment} id="tlm-seg" nm="tl_member_seg" data={tlMemberRpt.segRows}>
              <BarChart data={tlMemberRpt.segRows}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tks} tickFormatter={v=>v+"%"}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Bar dataKey="rate" radius={[4,4,0,0]} name={t.memberRepeatRate}>{tlMemberRpt.segRows.map((e,i)=><Cell key={i} fill={SEG_COLORS[e.segment]||PALETTE[i]}/>)}</Bar></BarChart>
            </CC></div>
            <div key="tlm-fac"><CC grid title={t.memberByFac} id="tlm-fac" nm="tl_member_fac" h={Math.max(300,tlMemberRpt.facByRate.length*22)} data={tlMemberRpt.facByRate}>
              <BarChart data={tlMemberRpt.facByRate} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={v=>v+"%"}/><YAxis dataKey="name" type="category" width={140} tick={tk} interval={0}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Bar dataKey="rate" fill="#34d399" radius={[0,4,4,0]} name={t.memberRepeatRate}/></BarChart>
            </CC></div>
            <div key="tlm-detail"><div style={{...S.card,height:"100%",overflow:"auto"}}>
              <div style={{...S.ct,marginBottom:8}} className="rgl-drag">{t.memberDetail}</div>
              <table style={S.tbl}><thead><tr><th style={S.th}>#</th><th style={S.th}>{t.memberName}</th><th style={S.th}>{t.thCountry}</th><th style={S.th}>{t.thSegment}</th><th style={{...S.th,textAlign:"right"}}>{t.reservations}</th><th style={{...S.th,textAlign:"right"}}>¥(税抜)</th></tr></thead>
              <tbody>{tlMemberRpt.detailRows.map(r=><tr key={r.idx}><td style={S.td}>{r.idx}</td><td style={S.td}>{r.name}</td><td style={S.td}>{tl(r.country)}</td><td style={S.td}>{tl(r.segment)}</td><td style={{...S.td,...S.m,textAlign:"right"}}>{fmtN(r.bookings)}</td><td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(r.rev)}</td></tr>)}</tbody></table>
            </div></div>
          </DraggableGrid>
        </div>}

        {/* TL OVERVIEW */}
        {tab==="tl-overview"&&tlOverviewRpt&&<DraggableGrid {...dgProps("tl-overview")}>
          <div key="tlo-mo"><CC grid title="Monthly Reservations" id="tlo-mo" nm="tl_ov_mo" data={tlOverviewRpt.moRows}><BarChart data={tlOverviewRpt.moRows}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill={SOURCE_COLORS.tl} radius={[4,4,0,0]} name={t.reservations}/></BarChart></CC></div>
          <div key="tlo-mkt"><CC grid title="Top Markets (by reservations)" id="tlo-mkt" nm="tl_ov_mkt" data={tlOverviewRpt.mktRows}><BarChart data={tlOverviewRpt.mktRows} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={120} tick={({x,y,payload})=><text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={9} dy={4}>{tl(payload.value)}</text>} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#4ea8de" radius={[0,4,4,0]} name={t.reservations}/></BarChart></CC></div>
          <div key="tlo-seg"><CC grid title="Segment Distribution" id="tlo-seg" nm="tl_ov_seg" data={tlOverviewRpt.segRows}><BarChart data={tlOverviewRpt.segRows}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Bar dataKey="count" name={t.reservations}>{tlOverviewRpt.segRows.map((e,i)=><Cell key={i} fill={SEG_COLORS[e.segment]||PALETTE[i]}/>)}</Bar></BarChart></CC></div>
          <div key="tlo-dow"><CC grid title="Check-in DOW" id="tlo-dow" nm="tl_ov_dow" data={tlOverviewRpt.dowRows}><BarChart data={tlOverviewRpt.dowRows}><CartesianGrid {...gl}/><XAxis dataKey="day" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill={SOURCE_COLORS.tl} radius={[4,4,0,0]} name={t.reservations}/></BarChart></CC></div>
          <div key="tlo-mo-rev"><CC grid title="Monthly Revenue (税抜)" id="tlo-mo-rev" nm="tl_ov_mo_rev" data={tlOverviewRpt.moRows}><LineChart data={tlOverviewRpt.moRows}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Line type="monotone" dataKey="rev" stroke={SOURCE_COLORS.tl} strokeWidth={2} dot={{r:3}} name={t.tlMetricRev}/></LineChart></CC></div>
        </DraggableGrid>}

        {/* TL LOS */}
        {tab==="tl-los"&&tlLosRpt&&<div>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <div style={S.kpi}><div style={S.kl}>{t.avgLOS}</div><div style={S.kv}>{tlLosRpt.overallAvg} {t.ns}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.tlTotalBookings}</div><div style={S.kv}>{fmtN(tlLosRpt.totalWithNights)}</div></div>
          </div>
          <DraggableGrid {...dgProps("tl-los")}>
            <div key="tll-hist"><CC grid title="LOS Distribution" id="tll-hist" nm="tl_los_hist" data={tlLosRpt.detailRows}><BarChart data={tlLosRpt.detailRows}><CartesianGrid {...gl}/><XAxis dataKey="nights" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill={SOURCE_COLORS.tl} radius={[4,4,0,0]} name={t.reservations}/></BarChart></CC></div>
            <div key="tll-seg"><CC grid title="LOS by Segment" id="tll-seg" nm="tl_los_seg" data={tlLosRpt.segLOS}><BarChart data={tlLosRpt.segLOS}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Bar dataKey="avgLOS" name={t.avgLOS}>{tlLosRpt.segLOS.map((e,i)=><Cell key={i} fill={SEG_COLORS[e.segment]||PALETTE[i]}/>)}</Bar></BarChart></CC></div>
            <div key="tll-country"><CC grid title="LOS by Country (min 5 rsv)" id="tll-country" nm="tl_los_country" data={tlLosRpt.countryLOS}><BarChart data={tlLosRpt.countryLOS} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={120} tick={({x,y,payload})=><text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={9} dy={4}>{tl(payload.value)}</text>} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="avgLOS" fill="#c084fc" radius={[0,4,4,0]} name={t.avgLOS}/></BarChart></CC></div>
          </DraggableGrid>
        </div>}

        {/* TL BOOKING PATTERNS */}
        {tab==="tl-booking"&&tlBookingRpt&&<DraggableGrid {...dgProps("tl-booking")}>
          <div key="tlb-lead"><CC grid title="Lead Time Distribution" id="tlb-lead" nm="tl_book_lead" data={tlBookingRpt.leadRows}><BarChart data={tlBookingRpt.leadRows}><CartesianGrid {...gl}/><XAxis dataKey="bucket" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#c9a84c" radius={[4,4,0,0]} name={t.reservations}/></BarChart></CC></div>
          <div key="tlb-dow"><CC grid title="Check-in DOW" id="tlb-dow" nm="tl_book_dow" data={tlBookingRpt.dowRows}><BarChart data={tlBookingRpt.dowRows}><CartesianGrid {...gl}/><XAxis dataKey="day" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill={SOURCE_COLORS.tl} radius={[4,4,0,0]} name={t.reservations}/></BarChart></CC></div>
          <div key="tlb-mdow"><CC grid title="Monthly DOW Pattern" id="tlb-mdow" nm="tl_book_mdow" data={tlBookingRpt.mdowRows}><BarChart data={tlBookingRpt.mdowRows}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tks}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:9}}/>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d,i)=><Bar key={d} dataKey={d} stackId="a" fill={PALETTE[i%PALETTE.length]}/>)}</BarChart></CC></div>
        </DraggableGrid>}

        {/* TL COMPARE */}
        {tab==="tl-compare"&&<div>
          <div style={{...S.card,background:"rgba(94,234,212,0.06)",border:"1px solid rgba(94,234,212,0.2)",padding:"8px 12px",marginBottom:12,fontSize:10,color:TH.textMuted,lineHeight:1.5}}>{t.tlHintCompareDate}</div>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div><div style={S.fl}>{t.cmpPeriodA}</div><div style={{display:"flex",gap:4}}><input type="date" style={{...S.inp,borderColor:"#4ea8de"}} value={cmpA.from} onChange={e=>setCmpA(p=>({...p,from:e.target.value}))}/><input type="date" style={{...S.inp,borderColor:"#4ea8de"}} value={cmpA.to} onChange={e=>setCmpA(p=>({...p,to:e.target.value}))}/></div></div>
            <div><div style={S.fl}>{t.cmpPeriodB}</div><div style={{display:"flex",gap:4}}><input type="date" style={{...S.inp,borderColor:TH.gold}} value={cmpB.from} onChange={e=>setCmpB(p=>({...p,from:e.target.value}))}/><input type="date" style={{...S.inp,borderColor:TH.gold}} value={cmpB.to} onChange={e=>setCmpB(p=>({...p,to:e.target.value}))}/></div></div>
            <div style={{display:"flex",gap:4}}>
              <button style={{...S.btn,fontSize:10}} onClick={()=>{const end=new Date();end.setDate(end.getDate()-DATA_LAG_DAYS);const y=end.getFullYear(),m=end.getMonth(),d=end.getDate();const a1=`${y}-${String(m+1).padStart(2,"0")}-01`;const a2=tzFmt(end);const days=d-1;const prevY=m===0?y-1:y;const prevM=m===0?12:m;const b1=`${prevY}-${String(prevM).padStart(2,"0")}-01`;const bEnd=new Date(prevY,prevM-1,1);bEnd.setDate(bEnd.getDate()+days);const b2=tzFmt(bEnd);setCmpA({from:a1,to:a2});setCmpB({from:b1,to:b2})}}>{t.cmpMonthVsMonth}</button>
              <button style={{...S.btn,fontSize:10}} onClick={()=>{const end=new Date();end.setDate(end.getDate()-DATA_LAG_DAYS);const start=new Date(end);start.setDate(end.getDate()-6);const prevEnd=new Date(start);prevEnd.setDate(start.getDate()-1);const prevStart=new Date(prevEnd);prevStart.setDate(prevEnd.getDate()-6);setCmpA({from:tzFmt(start),to:tzFmt(end)});setCmpB({from:tzFmt(prevStart),to:tzFmt(prevEnd)})}}>{t.cmpWeekVsWeek}</button>
              <button style={{...S.btn,fontSize:10}} onClick={()=>{const end=new Date();end.setDate(end.getDate()-DATA_LAG_DAYS);const y=end.getFullYear();const a1=`${y}-01-01`;const a2=tzFmt(end);const b1=`${y-1}-01-01`;const prevEnd=new Date(y-1,end.getMonth(),end.getDate());const b2=tzFmt(prevEnd);setCmpA({from:a1,to:a2});setCmpB({from:b1,to:b2})}}>{t.cmpYearVsYear}</button>
            </div>
          </div>
          {tlCompareRpt&&!tlCompareRpt.empty?<div>
            <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <div style={S.kpi}><div style={S.kl}>{t.cmpPeriodA} Rev</div><div style={S.kv}>¥{fmtN(tlCompareRpt.a.totalRev)}</div></div>
              <div style={S.kpi}><div style={S.kl}>{t.cmpPeriodB} Rev</div><div style={S.kv}>¥{fmtN(tlCompareRpt.b.totalRev)}</div></div>
              <div style={S.kpi}><div style={S.kl}>{t.cmpChange} Rev</div><div style={S.kv}>{tlCompareRpt.pctChg(tlCompareRpt.a.totalRev,tlCompareRpt.b.totalRev)}</div></div>
              <div style={S.kpi}><div style={S.kl}>A Res</div><div style={S.kv}>{fmtN(tlCompareRpt.a.totalCount)}</div></div>
              <div style={S.kpi}><div style={S.kl}>B Res</div><div style={S.kv}>{fmtN(tlCompareRpt.b.totalCount)}</div></div>
              <div style={S.kpi}><div style={S.kl}>{t.cmpChange} Res</div><div style={S.kv}>{tlCompareRpt.pctChg(tlCompareRpt.a.totalCount,tlCompareRpt.b.totalCount)}</div></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
              <div style={S.card}><div style={S.ct}>{t.cmpByCountry}</div><table style={S.tbl}><thead><tr><th style={S.th}>Country</th><th style={{...S.th,textAlign:"right"}}>A</th><th style={{...S.th,textAlign:"right"}}>B</th><th style={{...S.th,textAlign:"right"}}>Δ</th></tr></thead><tbody>{tlCompareRpt.countryRows.slice(0,15).map(r=><tr key={r.country}><td style={S.td}>{tl(r.country)}</td><td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(r.revA)}</td><td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(r.revB)}</td><td style={{...S.td,...S.m,textAlign:"right",color:r.revDelta>=0?"#34d399":"#ef4444"}}>{r.revDelta>=0?"+":""}¥{fmtN(Math.abs(r.revDelta))}</td></tr>)}</tbody></table></div>
              <div style={S.card}><div style={S.ct}>{t.cmpBySegment}</div><table style={S.tbl}><thead><tr><th style={S.th}>Segment</th><th style={{...S.th,textAlign:"right"}}>A</th><th style={{...S.th,textAlign:"right"}}>B</th><th style={{...S.th,textAlign:"right"}}>Δ</th></tr></thead><tbody>{tlCompareRpt.segRows.map(r=><tr key={r.segment}><td style={S.td}>{tl(r.segment)}</td><td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(r.revA)}</td><td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(r.revB)}</td><td style={{...S.td,...S.m,textAlign:"right",color:r.revDelta>=0?"#34d399":"#ef4444"}}>{r.revDelta>=0?"+":""}¥{fmtN(Math.abs(r.revDelta))}</td></tr>)}</tbody></table></div>
              <div style={{...S.card,gridColumn:isMobile?"auto":"span 2"}}><div style={S.ct}>{t.cmpByFacility}</div><table style={S.tbl}><thead><tr><th style={S.th}>Facility</th><th style={{...S.th,textAlign:"right"}}>A Rev</th><th style={{...S.th,textAlign:"right"}}>B Rev</th><th style={{...S.th,textAlign:"right"}}>Δ</th></tr></thead><tbody>{tlCompareRpt.facRows.slice(0,20).map(r=><tr key={r.facility}><td style={{...S.td,whiteSpace:"nowrap"}}>{r.name}</td><td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(r.revA)}</td><td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(r.revB)}</td><td style={{...S.td,...S.m,textAlign:"right",color:r.revDelta>=0?"#34d399":"#ef4444"}}>{r.revDelta>=0?"+":""}¥{fmtN(Math.abs(r.revDelta))}</td></tr>)}</tbody></table></div>
            </div>
          </div>:<div style={{textAlign:"center",padding:40,color:TH.textMuted}}>{t.cmpNoData}</div>}
        </div>}

        {/* TL PACE */}
        {tab==="tl-pace"&&tlPaceRpt&&<div>
          <div style={{...S.card,background:"rgba(94,234,212,0.06)",border:"1px solid rgba(94,234,212,0.2)",padding:"8px 12px",marginBottom:12,fontSize:10,color:TH.textMuted,lineHeight:1.5}}>{t.tlHintPaceStatus}</div>
          <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:10,color:TH.textMuted,letterSpacing:0.5}}>Metric:</span>
            <div style={{display:"flex",gap:3}}>
              <button style={{...S.btn,...(paceMetric==="count"?S.ba:{})}} onClick={()=>setPaceMetric("count")}>{t.paceToggleRes}</button>
              <button style={{...S.btn,...(paceMetric==="rev"?S.ba:{})}} onClick={()=>setPaceMetric("rev")}>{t.paceToggleRev}</button>
            </div>
          </div>
          <DraggableGrid {...dgProps("tl-pace")}>
            <div key="tlp-chart"><CC grid title={`Cumulative ${paceMetric==="rev"?"Revenue":"Bookings"} by Reception Date (last 6 months)`} id="tlp-chart" nm="tl_pace" data={tlPaceRpt.paceData[0]?.series||[]}>
              <LineChart data={tlPaceRpt.paceData[0]?.series||[]}><CartesianGrid {...gl}/><XAxis dataKey="day" tick={tks}/><YAxis tick={tk} tickFormatter={paceMetric==="rev"?fmtY:undefined}/><Tooltip content={<CT formatter={paceMetric==="rev"?v=>"¥"+v.toLocaleString():undefined}/>}/><Legend/>
                {tlPaceRpt.paceData.slice(0,6).map((m,i)=><Line key={m.month} type="monotone" data={m.series} dataKey={paceMetric==="rev"?"rev":"count"} stroke={PALETTE[i%PALETTE.length]} name={m.month} strokeWidth={1.5} dot={false}/>)}
              </LineChart>
            </CC></div>
            <div key="tlp-summary"><div style={{...S.card,height:"100%"}}><div style={{...S.ct,marginBottom:8}} className="rgl-drag">Month Totals</div><table style={S.tbl}><thead><tr><th style={S.th}>Month</th><th style={{...S.th,textAlign:"right"}}>Bookings</th><th style={{...S.th,textAlign:"right"}}>Revenue</th></tr></thead><tbody>{tlPaceRpt.paceData.map(m=><tr key={m.month}><td style={S.td}>{m.month}</td><td style={{...S.td,...S.m,textAlign:"right"}}>{fmtN(m.total.count)}</td><td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(m.total.rev)}</td></tr>)}</tbody></table></div></div>
          </DraggableGrid>
        </div>}

        {/* TL ADR */}
        {tab==="tl-adr"&&tlAdrRpt&&<div>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <div style={{...S.kpi,borderColor:SOURCE_COLORS.tl}}><div style={S.kl}>Overall ADR (税抜)</div><div style={{...S.kv,color:SOURCE_COLORS.tl}}>¥{fmtN(tlAdrRpt.overallAdr)}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.tlTotalRevenue}</div><div style={S.kv}>¥{fmtN(tlAdrRpt.totalRev)}</div></div>
            <div style={S.kpi}><div style={S.kl}>Room-Nights</div><div style={S.kv}>{fmtN(tlAdrRpt.totalRoomNights)}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.tlTotalBookings}</div><div style={S.kv}>{fmtN(tlAdrRpt.totalCount)}</div></div>
          </div>
          <DraggableGrid {...dgProps("tl-adr")}>
            <div key="tla-fac"><CC grid title="ADR by Facility (税抜)" id="tla-fac" nm="tl_adr_fac" h={Math.max(320,tlAdrRpt.facRows.length*24)} data={tlAdrRpt.facRows}>
              <BarChart data={tlAdrRpt.facRows} layout="vertical">
                <CartesianGrid {...gl}/>
                <XAxis type="number" tick={tks} tickFormatter={fmtY}/>
                <YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/>
                <Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/>
                <Bar dataKey="adr" fill={SOURCE_COLORS.tl} radius={[0,4,4,0]} name="ADR"/>
              </BarChart>
            </CC></div>
            <div key="tla-country"><CC grid title="ADR by Country (min 5 rsv, 税抜)" id="tla-country" nm="tl_adr_country" data={tlAdrRpt.countryRows}>
              <BarChart data={tlAdrRpt.countryRows}>
                <CartesianGrid {...gl}/>
                <XAxis dataKey="country" tick={({x,y,payload})=><text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={9} dy={4} transform={`rotate(-45,${x},${y})`}>{tl(payload.value)}</text>} height={70} interval={0}/>
                <YAxis tick={tk} tickFormatter={fmtY}/>
                <Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>} labelFormatter={v=>tl(v)}/>
                <Bar dataKey="adr" fill="#4ea8de" radius={[4,4,0,0]} name="ADR"/>
              </BarChart>
            </CC></div>
            <div key="tla-seg"><CC grid title="ADR by Segment (税抜)" id="tla-seg" nm="tl_adr_seg" data={tlAdrRpt.segRows}>
              <BarChart data={tlAdrRpt.segRows}>
                <CartesianGrid {...gl}/>
                <XAxis dataKey="segment" tick={<TlTick/>}/>
                <YAxis tick={tk} tickFormatter={fmtY}/>
                <Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/>
                <Bar dataKey="adr" name="ADR">
                  {tlAdrRpt.segRows.map((e,i)=><Cell key={i} fill={SEG_COLORS[e.segment]||PALETTE[i]}/>)}
                </Bar>
              </BarChart>
            </CC></div>
            <div key="tla-channel"><CC grid title="ADR by Channel (min 5 rsv, 税抜)" id="tla-channel" nm="tl_adr_channel" data={tlAdrRpt.channelRows}>
              <BarChart data={tlAdrRpt.channelRows} layout="vertical">
                <CartesianGrid {...gl}/>
                <XAxis type="number" tick={tks} tickFormatter={fmtY}/>
                <YAxis dataKey="channel" type="category" width={160} tick={tk} interval={0}/>
                <Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/>
                <Bar dataKey="adr" radius={[0,4,4,0]} name="ADR">
                  {tlAdrRpt.channelRows.map((c,i)=><Cell key={i} fill={CHANNEL_COLORS[c.bucket]||"#888"}/>)}
                </Bar>
              </BarChart>
            </CC></div>
            <div key="tla-bucket"><CC grid title="ADR by Channel Bucket (税抜)" id="tla-bucket" nm="tl_adr_bucket" data={tlAdrRpt.bucketRows}>
              <BarChart data={tlAdrRpt.bucketRows}>
                <CartesianGrid {...gl}/>
                <XAxis dataKey="bucket" tick={tk} tickFormatter={v=>v.toUpperCase()}/>
                <YAxis tick={tk} tickFormatter={fmtY}/>
                <Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/>
                <Bar dataKey="adr" radius={[4,4,0,0]} name="ADR">
                  {tlAdrRpt.bucketRows.map((b,i)=><Cell key={i} fill={CHANNEL_COLORS[b.bucket]||"#888"}/>)}
                </Bar>
              </BarChart>
            </CC></div>
            <div key="tla-mo"><CC grid title="Monthly ADR Trend (税抜)" id="tla-mo" nm="tl_adr_mo" data={tlAdrRpt.monthRows}>
              <LineChart data={tlAdrRpt.monthRows}>
                <CartesianGrid {...gl}/>
                <XAxis dataKey="month" tick={tk}/>
                <YAxis tick={tk} tickFormatter={fmtY}/>
                <Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/>
                <Line type="monotone" dataKey="adr" stroke={SOURCE_COLORS.tl} strokeWidth={2} dot={{r:3}} name="ADR"/>
              </LineChart>
            </CC></div>
          </DraggableGrid>
        </div>}

        {/* TL FACILITIES */}
        {tab==="tl-facilities"&&tlFacilitiesRpt&&<DraggableGrid {...dgProps("tl-facilities")}>
          <div key="tlf-res"><CC grid title="Reservations by Facility" id="tlf-res" nm="tl_fac_res" h={Math.max(300,tlFacilitiesRpt.length*22)} data={tlFacilitiesRpt}><BarChart data={tlFacilitiesRpt} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="n" fill="#4ea8de" radius={[0,4,4,0]} name={t.reservations}/></BarChart></CC></div>
          <div key="tlf-rev"><CC grid title="Avg Revenue by Facility (税抜)" id="tlf-rev" nm="tl_fac_rev" h={Math.max(300,tlFacilitiesRpt.length*22)} data={tlFacilitiesRpt}><BarChart data={tlFacilitiesRpt} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={fmtY}/><YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="avgRev" fill={TH.gold} radius={[0,4,4,0]} name={t.avgRevRes}/></BarChart></CC></div>
          <div key="tlf-direct"><CC grid title="Direct Share % by Facility" id="tlf-direct" nm="tl_fac_direct" h={Math.max(300,tlFacilitiesRpt.length*22)} data={tlFacilitiesRpt}><BarChart data={tlFacilitiesRpt} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={v=>v+"%"}/><YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Bar dataKey="directPct" fill={CHANNEL_COLORS.direct} radius={[0,4,4,0]} name={t.tlDirectShare}/></BarChart></CC></div>
          <div key="tlf-los"><CC grid title="Avg LOS by Facility" id="tlf-los" nm="tl_fac_los" h={Math.max(300,tlFacilitiesRpt.length*22)} data={tlFacilitiesRpt}><BarChart data={tlFacilitiesRpt} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="avgLOS" fill="#c084fc" radius={[0,4,4,0]} name={t.avgLOS}/></BarChart></CC></div>
        </DraggableGrid>}

        {/* TL KvK */}
        {tab==="tl-kvk"&&tlKvkRpt&&<div>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <div style={S.kpi}><div style={S.kl}>{t.kanto} Res</div><div style={S.kv}>{fmtN(tlKvkRpt.kN)}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.kansai} Res</div><div style={S.kv}>{fmtN(tlKvkRpt.sN)}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.kanto} Rev</div><div style={S.kv}>¥{fmtN(tlKvkRpt.kR)}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.kansai} Rev</div><div style={S.kv}>¥{fmtN(tlKvkRpt.sR)}</div></div>
          </div>
          <DraggableGrid {...dgProps("tl-kvk")}>
            <div key="tlkv-mk-kt"><CC grid title={t.kvkKantoMarkets} id="tlkv-mk-kt" nm="tl_kvk_mk_kt" data={tlKvkRpt.mkKanto}><BarChart data={tlKvkRpt.mkKanto} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={100} tick={({x,y,payload})=><text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={9} dy={4}>{tl(payload.value)}</text>} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#4ea8de" radius={[0,4,4,0]}/></BarChart></CC></div>
            <div key="tlkv-mk-ks"><CC grid title={t.kvkKansaiMarkets} id="tlkv-mk-ks" nm="tl_kvk_mk_ks" data={tlKvkRpt.mkKansai}><BarChart data={tlKvkRpt.mkKansai} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={100} tick={({x,y,payload})=><text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={9} dy={4}>{tl(payload.value)}</text>} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#e07b54" radius={[0,4,4,0]}/></BarChart></CC></div>
            <div key="tlkv-mk-mo"><CC grid title={t.kvkMarketMonthly} id="tlkv-mk-mo" nm="tl_kvk_mk_mo" data={tlKvkRpt.mktMo}><BarChart data={tlKvkRpt.mktMo}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tks}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="Kanto" stackId="a" fill="#4ea8de"/><Bar dataKey="Kansai" stackId="a" fill="#e07b54"/></BarChart></CC></div>
            <div key="tlkv-sg-rg"><CC grid title={t.kvkSegByRegion} id="tlkv-sg-rg" nm="tl_kvk_seg_rg" data={tlKvkRpt.segRegRows}><BarChart data={tlKvkRpt.segRegRows}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de"/><Bar dataKey="Kansai" fill="#e07b54"/></BarChart></CC></div>
            <div key="tlkv-los-sr"><CC grid title={t.kvkLOSBySegRegion} id="tlkv-los-sr" nm="tl_kvk_los_sr" data={tlKvkRpt.losSRRows}><BarChart data={tlKvkRpt.losSRRows}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de"/><Bar dataKey="Kansai" fill="#e07b54"/></BarChart></CC></div>
            <div key="tlkv-dw-ci"><CC grid title={t.kvkDOWCheckin} id="tlkv-dw-ci" nm="tl_kvk_dw_ci" data={tlKvkRpt.dowCIRows}><BarChart data={tlKvkRpt.dowCIRows}><CartesianGrid {...gl}/><XAxis dataKey="day" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de"/><Bar dataKey="Kansai" fill="#e07b54"/></BarChart></CC></div>
            <div key="tlkv-dw-co"><CC grid title={t.kvkDOWCheckout} id="tlkv-dw-co" nm="tl_kvk_dw_co" data={tlKvkRpt.dowCORows}><BarChart data={tlKvkRpt.dowCORows}><CartesianGrid {...gl}/><XAxis dataKey="day" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de"/><Bar dataKey="Kansai" fill="#e07b54"/></BarChart></CC></div>
            <div key="tlkv-rev-sr"><CC grid title={t.kvkRevBySegRegion} id="tlkv-rev-sr" nm="tl_kvk_rev_sr" data={tlKvkRpt.revSRRows}><BarChart data={tlKvkRpt.revSRRows}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de"/><Bar dataKey="Kansai" fill="#e07b54"/></BarChart></CC></div>
          </DraggableGrid>
        </div>}

        {/* TL MARKETS */}
        {tab==="tl-markets"&&tlMarketsRpt&&<DraggableGrid {...dgProps("tl-markets")}>
          <div key="tlmk-country"><CC grid title="Top Source Markets" id="tlmk-country" nm="tl_mk_country" h={Math.max(320,tlMarketsRpt.rows.length*26)} data={tlMarketsRpt.rows}><BarChart data={tlMarketsRpt.rows} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={130} tick={({x,y,payload})=><text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={10} dy={4}>{tl(payload.value)}</text>} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#4ea8de" radius={[0,4,4,0]} name={t.reservations}/></BarChart></CC></div>
          <div key="tlmk-rev"><CC grid title="Avg Revenue by Market (税抜)" id="tlmk-rev" nm="tl_mk_rev" data={tlMarketsRpt.rows}><BarChart data={tlMarketsRpt.rows} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={fmtY}/><YAxis dataKey="country" type="category" width={110} tick={({x,y,payload})=><text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={9} dy={4}>{tl(payload.value)}</text>} interval={0}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="avgRev" fill={TH.gold} radius={[0,4,4,0]} name={t.avgRevRes}/></BarChart></CC></div>
          <div key="tlmk-los"><CC grid title="Avg LOS by Market" id="tlmk-los" nm="tl_mk_los" data={tlMarketsRpt.rows}><BarChart data={tlMarketsRpt.rows} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={110} tick={({x,y,payload})=><text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={9} dy={4}>{tl(payload.value)}</text>} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="avgLOS" fill="#c084fc" radius={[0,4,4,0]} name={t.avgLOS}/></BarChart></CC></div>
          <div key="tlmk-lead"><CC grid title="Avg Lead Time by Market" id="tlmk-lead" nm="tl_mk_lead" data={tlMarketsRpt.rows}><BarChart data={tlMarketsRpt.rows}><CartesianGrid {...gl}/><XAxis dataKey="country" tick={({x,y,payload})=><text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={9} dy={4} transform={`rotate(-45,${x},${y})`}>{tl(payload.value)}</text>} height={70} interval={0}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Bar dataKey="avgLead" fill="#e07b54" radius={[4,4,0,0]} name={t.avgLeadTime}/></BarChart></CC></div>
        </DraggableGrid>}

        {/* TL CANCELLATIONS */}
        {tab==="tl-cancellations"&&tlCancelRpt&&<div>
          <div style={{...S.card,background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.2)",padding:"8px 12px",marginBottom:12,fontSize:10,color:TH.textMuted,lineHeight:1.5}}>{t.tlHintCancelStatus}</div>
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
            <div style={S.kpi}><div style={S.kl}>Total</div><div style={S.kv}>{fmtN(tlCancelRpt.total)}</div></div>
            <div style={S.kpi}><div style={S.kl}>Cancelled</div><div style={S.kv}>{fmtN(tlCancelRpt.cancelled)}</div></div>
            <div style={S.kpi}><div style={S.kl}>Cancel Rate</div><div style={S.kv}>{tlCancelRpt.rate}%</div></div>
            <div style={S.kpi}><div style={S.kl}>Revenue Lost (税抜)</div><div style={S.kv}>¥{fmtN(tlCancelRpt.lost)}</div></div>
          </div>
          <DraggableGrid {...dgProps("tl-cancellations")}>
            <div key="tlcn-trend"><CC grid title="Monthly Cancel Rate" id="tlcn-trend" nm="tl_cn_trend" data={tlCancelRpt.monthTrend}><LineChart data={tlCancelRpt.monthTrend}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tks} tickFormatter={v=>v+"%"}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Line type="monotone" dataKey="rate" stroke="#ef4444" strokeWidth={2} dot={{r:3}} name="Rate %"/></LineChart></CC></div>
            <div key="tlcn-country"><CC grid title="Cancel Rate by Country" id="tlcn-country" nm="tl_cn_country" data={tlCancelRpt.countryRows}><BarChart data={tlCancelRpt.countryRows} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={v=>v+"%"}/><YAxis dataKey="country" type="category" width={110} tick={({x,y,payload})=><text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={9} dy={4}>{tl(payload.value)}</text>} interval={0}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Bar dataKey="rate" fill="#ef4444" radius={[0,4,4,0]} name="Rate %"/></BarChart></CC></div>
            <div key="tlcn-seg"><CC grid title="Cancel Rate by Segment" id="tlcn-seg" nm="tl_cn_seg" data={tlCancelRpt.segRows}><BarChart data={tlCancelRpt.segRows}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tks} tickFormatter={v=>v+"%"}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Bar dataKey="rate" fill="#ef4444" radius={[4,4,0,0]} name="Rate %"/></BarChart></CC></div>
            <div key="tlcn-fac"><CC grid title="Cancel Rate by Facility" id="tlcn-fac" nm="tl_cn_fac" h={Math.max(300,tlCancelRpt.facByRate.length*22)} data={tlCancelRpt.facByRate}><BarChart data={tlCancelRpt.facByRate} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={v=>v+"%"}/><YAxis dataKey="name" type="category" width={140} tick={tk} interval={0}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Bar dataKey="rate" fill="#ef4444" radius={[0,4,4,0]} name="Rate %"/></BarChart></CC></div>
            <div key="tlcn-detail"><div style={{...S.card,height:"100%",overflow:"auto"}}><div style={{...S.ct,marginBottom:8}} className="rgl-drag">Facility Detail</div><table style={S.tbl}><thead><tr><th style={S.th}>Facility</th><th style={{...S.th,textAlign:"right"}}>Total</th><th style={{...S.th,textAlign:"right"}}>Cancelled</th><th style={{...S.th,textAlign:"right"}}>Rate</th><th style={{...S.th,textAlign:"right"}}>Lost ¥</th></tr></thead><tbody>{tlCancelRpt.facRows.map(r=><tr key={r.facility}><td style={{...S.td,whiteSpace:"nowrap"}}>{r.name}</td><td style={{...S.td,...S.m,textAlign:"right"}}>{fmtN(r.total)}</td><td style={{...S.td,...S.m,textAlign:"right"}}>{fmtN(r.cancelled)}</td><td style={{...S.td,...S.m,textAlign:"right"}}>{r.rate}%</td><td style={{...S.td,...S.m,textAlign:"right"}}>¥{fmtN(r.lostRev)}</td></tr>)}</tbody></table></div></div>
          </DraggableGrid>
        </div>}

        {/* TL RAW DATA */}
        {tab==="tl-data"&&<div style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={S.ct}>{fmtN(tlFiltered.length)} rows filtered</div></div>
          <div style={{overflowX:"auto"}}>
            <table style={S.tbl}><thead><tr>{tlTH.map((h,i)=><th key={h} style={S.th} onClick={()=>{setTSort(p=>({col:tlTC[i],asc:p.col===tlTC[i]?!p.asc:true}));setTPage(0)}}>{h} {tSort.col===tlTC[i]?(tSort.asc?"↑":"↓"):""}</th>)}</tr></thead>
            <tbody>{tlPaged.map((r,ri)=><tr key={ri}>{tlTC.map((c,ci)=><td key={ci} style={{...S.td,...(["nights","rooms","adults_male","adults_female","children","totalRev"].includes(c)?{...S.m,textAlign:"right"}:{}),maxWidth:c==="facility"||c==="planName"?180:undefined,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c==="totalRev"&&r[c]?"¥"+Number(r[c]).toLocaleString():c==="channelBucket"?<span style={S.tag(CHANNEL_COLORS[r[c]]||"#888")}>{r[c]}</span>:c==="status"?<span style={S.tag(r[c]==="取消"?"#ef4444":r[c]==="変更"?"#c9a84c":"#34d399")}>{r[c]}</span>:String(r[c]??"")}</td>)}</tr>)}</tbody></table>
          </div>
          {tlTotPg>1&&<div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:8,marginTop:12}}><button style={S.btn} onClick={()=>setTPage(p=>Math.max(0,p-1))} disabled={tPage===0}>{t.prev}</button><span style={{fontSize:12,color:"#a0977f"}}>{t.pageOf(tPage+1,tlTotPg)}</span><button style={S.btn} onClick={()=>setTPage(p=>Math.min(tlTotPg-1,p+1))} disabled={tPage>=tlTotPg-1}>{t.next}</button></div>}
        </div>}

        {/* RAW DATA */}
        {tab==="data"&&<div style={S.card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={S.ct}>{t.rowsFiltered(fmtN(filtered.length))}</div><button style={S.bg} onClick={expFilt}>⬇ {t.exportFiltered}</button></div><div style={{overflowX:"auto"}}><table style={S.tbl}><thead><tr>{tH.map((h,i)=><th key={h} style={S.th} onClick={()=>{setTSort(p=>({col:tC[i],asc:p.col===tC[i]?!p.asc:true}));setTPage(0)}}>{h} {tSort.col===tC[i]?(tSort.asc?"↑":"↓"):""}</th>)}</tr></thead><tbody>{paged.map((r,ri)=><tr key={ri}>{tC.map((c,ci)=><td key={ci} style={{...S.td,...(["nights","leadTime","totalRev","partySize"].includes(c)?{...S.m,textAlign:"right"}:{}),maxWidth:c==="facility"?180:undefined,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c==="totalRev"&&r[c]?"¥"+Number(r[c]).toLocaleString():c==="region"?<span style={S.tag(r[c]==="Kanto"?"#4ea8de":"#e07b54")}>{tl(r[c])}</span>:c==="isCancelled"?<span style={S.tag(r[c]?"#ef4444":"#34d399")}>{r[c]?t.statusCancelled:t.statusConfirmed}</span>:["segment","hotelType"].includes(c)?tl(String(r[c]??"")):String(r[c]??"")}</td>)}</tr>)}</tbody></table></div>{totPg>1&&<div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:8,marginTop:12}}><button style={S.btn} onClick={()=>setTPage(p=>Math.max(0,p-1))} disabled={tPage===0}>{t.prev}</button><span style={{fontSize:12,color:"#a0977f"}}>{t.pageOf(tPage+1,totPg)}</span><button style={S.btn} onClick={()=>setTPage(p=>Math.min(totPg-1,p+1))} disabled={tPage>=totPg-1}>{t.next}</button></div>}</div>}
      </>}
    </div></div>
  );
}
