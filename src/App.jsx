import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as Papa from "papaparse";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from "recharts";
import { Responsive, useContainerWidth } from "react-grid-layout";

const APP_VERSION="1.15";

// ─── Grid Layout Helpers ───
function loadLayouts(tabId){try{const v=localStorage.getItem("rgl_ver");if(v!==APP_VERSION){Object.keys(localStorage).filter(k=>k.startsWith("rgl_")).forEach(k=>localStorage.removeItem(k));localStorage.setItem("rgl_ver",APP_VERSION);return null}return JSON.parse(localStorage.getItem(`rgl_${tabId}`))||null}catch{return null}}
function saveLayouts(tabId,layouts){localStorage.setItem(`rgl_${tabId}`,JSON.stringify(layouts))}
function clearLayout(tabId){localStorage.removeItem(`rgl_${tabId}`)}
// 12-column grid (like Looker Studio) — items sized in 1/12 increments for free-form layout
function mkL(items){return{lg:items.map(([i,x,y,w,h])=>({i,x,y,w:w||6,h:h||3,minW:2,minH:2})),sm:items.map(([i,_x,_y,_w,h])=>({i,x:0,y:0,w:12,h:h||3,minW:4,minH:2}))}}
const DL={
  overview:mkL([["ch-mo",0,0,6,3],["ch-sp",6,0,6,3],["ch-mk",0,3,6,3],["ch-dw",6,3,6,3],["ch-mo-rev",0,6,12,3],["ch-res-day",0,9,6,3],["ch-rev-day",6,9,6,3]]),
  markets:mkL([["ch-mf",0,0,6,4],["ch-mr",6,0,6,4],["ch-ml",0,4,6,4],["ch-mld",6,4,6,4],["ch-msc",0,8,12,4]]),
  segments:mkL([["ch-sb",0,0,6,3],["ch-sr",6,0,6,3],["ch-sl",0,3,6,3],["ch-slt",6,3,6,3],["sg-seg-mo",0,6,6,3],["sg-seg-co",6,6,6,4],["sg-ld-sg",0,9,6,3],["sg-ld-mo",6,10,6,3],["sg-adr",0,12,6,3]]),
  booking:mkL([["ch-bd",0,0,6,3],["ch-bt",6,0,6,3],["ch-bv",0,3,6,3]]),
  revenue:mkL([["ch-rm",0,0,6,4],["ch-rv",6,0,6,3],["ch-rmm",0,4,6,3],["ch-drev",6,3,6,3]]),
  rooms:mkL([["ch-rt",0,0,12,4]]),
  facilities:mkL([["fac-res",0,0,6,7],["fac-rev",6,0,6,7],["fac-intl",0,7,6,7],["fac-los",6,7,6,7],["fac-kvk",0,14,6,3],["fac-hva",6,14,6,3]]),
};
const RGL_PROPS={breakpoints:{lg:900,sm:0},cols:{lg:12,sm:1},rowHeight:80,draggableHandle:".rgl-drag",margin:[10,10],containerPadding:[0,0],resizeHandles:["se","s","e"],compactType:"vertical",preventCollision:false};

function DraggableGrid({tabId,children,layoutVer,onReset,resetLabel,btnStyle}){
  const saved=loadLayouts(tabId);const layouts=saved||DL[tabId];const{containerRef,width}=useContainerWidth();
  const validChildren=Array.isArray(children)?children.flat().filter(c=>c&&c.key):children?[children]:[];
  const validKeys=new Set(validChildren.map(c=>c.key));
  const safeLayouts={};
  Object.entries(layouts).forEach(([bp,items])=>{safeLayouts[bp]=items.filter(item=>validKeys.has(item.i))});
  return(<div ref={containerRef}><div style={{display:"flex",justifyContent:"flex-end",marginBottom:6}}><button style={btnStyle} onClick={onReset}>{resetLabel}</button></div>{width>0&&validChildren.length>0&&<Responsive key={tabId+layoutVer} width={width} {...RGL_PROPS} layouts={safeLayouts} onLayoutChange={(_,all)=>saveLayouts(tabId,all)}>{validChildren}</Responsive>}</div>);
}

// ─── Google Sheets Backend ───
const GSHEET_CSV_URL="https://docs.google.com/spreadsheets/d/e/2PACX-1vQ_G18beGfHLBfeWlS9biwDrt73kQhC0i8RLvIPkybgCejNffzMnsBp7AfmrrS8suD69dQxCyTWEOzh/pub?gid=0&single=true&output=csv";

// ─── i18n ───
const T = {
  en: {
    title:"MONday",titleAccent:"Reservation Analyzer",uploadTitle:"MONday Group",uploadAccent:"Reservation Analyzer",
    uploadDesc:"Upload YYB reservation CSVs to begin analysis. Multiple files will be merged.",
    dropHere:"Drop CSV files here or click to browse",dropSub:"Supports multiple files • CP932 / Shift-JIS / UTF-8 • YYB format",
    requiredCols:"Required columns",processing:"Processing files…",
    loadedFrom:(n,f)=>`${n} reservations from ${f} file${f!==1?"s":""}`,showing:n=>`Showing ${n} filtered`,
    addFiles:"+ Add Files",clearAll:"Clear All",reset:"Reset",
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
    marketSummary:"Market Summary Table",
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
    sheetLoading:"Loading live data from Google Sheets…",sheetLoaded:n=>`${n} reservations loaded from Google Sheets`,sheetError:"Could not load Google Sheets data. Upload a CSV manually.",orUpload:"Or upload a CSV manually",
    resetLayout:"Reset Layout",
    dailyReport:"Daily Report",
    drDate:"Booking Date",drFrom:"From",drTo:"To",drCountryTable:"By Country",drRegionTable:"By Region",
    drCountry:"Country",drRegion:"Region",drCount:"Res",drRevenue:"Revenue",drADR:"ADR",drShare:"Share",drGrandTotal:"Grand total",
    drRevYoY:"Revenue YoY",drCountYoY:"Reservation Count YoY",
    drCurrent:"Current",drPrevYear:"Previous Year",
    drNoData:"No reservations for this date.",
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
    addFiles:"+ 追加",clearAll:"全消去",reset:"リセット",
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
    marketSummary:"市場サマリー",
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
    sheetLoading:"Google Sheetsからデータを読み込み中…",sheetLoaded:n=>`Google Sheetsから${n}件読込`,sheetError:"Google Sheetsの読み込みに失敗しました。CSVを手動でアップロードしてください。",orUpload:"またはCSVを手動でアップロード",
    resetLayout:"レイアウトリセット",
    dailyReport:"日次レポート",
    drDate:"予約日",drFrom:"開始日",drTo:"終了日",drCountryTable:"国籍別",drRegionTable:"地域別",
    drCountry:"国籍",drRegion:"地域",drCount:"件数",drRevenue:"売上",drADR:"ADR",drShare:"シェア",drGrandTotal:"合計",
    drRevYoY:"売上YoY",drCountYoY:"件数YoY",
    drCurrent:"当年",drPrevYear:"前年",
    drNoData:"この日付のデータはありません。",
    drDisclaimer:"予約番入れ込みデータ",
    geoArea:"地理エリア",allGeoAreas:"全エリア",
    darkMode:"ダーク",lightMode:"ライト",
  }
};

const HEADER_JP={country:"国",count:"件数",avgRev:"平均単価",avgLOS:"平均泊数",avgLead:"平均LT",segment:"タイプ",month:"月",day:"曜日",room:"部屋",device:"端末",region:"エリア",avg:"平均",median:"中央値",adr:"ADR",rev:"売上",n:"件数",name:"施設名",intlPct:"海外%",topSeg:"主タイプ",Kanto:"関東",Kansai:"関西",Hotel:"ホテル",Apart:"アパート",date:"日付",metric:"指標",avgRev:"平均単価"};

// ─── CONSTANTS ───
const KANSAI_KW=["京都丸太町","京都烏丸二条","京都駅","京都駅鴨川","京都五条","大阪難波"];
const JP_PREFS=["東京都","大阪府","愛知県","兵庫県","北海道","静岡県","神奈川県","千葉県","埼玉県","宮城県","福岡県","京都府","新潟県","長野県","茨城県","群馬県","栃木県","三重県","奈良県","福島県","石川県","広島県","岐阜県","岡山県","富山県","和歌山県","大分県","鹿児島県","滋賀県","愛媛県","山口県","秋田県","山梨県","山形県","徳島県","鳥取県","長崎県","香川県","宮崎県","岩手県","熊本県","沖縄県","佐賀県","島根県","高知県","福井県","青森県"];
const PHONE_MAP={"+1":"United States","+81":"Japan","+886":"Taiwan","+61":"Australia","+852":"Hong Kong","+65":"Singapore","+82":"South Korea","+62":"Indonesia","+66":"Thailand","+60":"Malaysia","+44":"UK","+63":"Philippines","+33":"France","+86":"China","+64":"New Zealand","+91":"India","+49":"Germany","+34":"Spain","+52":"Mexico","+55":"Brazil","+39":"Italy","+353":"Ireland","+41":"Switzerland","+972":"Israel","+971":"UAE","+56":"Chile","+54":"Argentina","+31":"Netherlands","+45":"Denmark","+43":"Austria","+673":"Brunei","+358":"Finland","+48":"Poland","+47":"Norway","+375":"Belarus","+27":"South Africa","+7":"Russia","+32":"Belgium","+40":"Romania","+420":"Czech Republic","+372":"Estonia","+234":"Nigeria","+352":"Luxembourg","+598":"Uruguay","+84":"Vietnam","+46":"Sweden"};
const COUNTRY_MAP={"United States":"United States","Canada":"Canada","Taiwan":"Taiwan","Republic of China":"Taiwan","Australia":"Australia","Hong Kong":"Hong Kong","Singapore":"Singapore","Republic of Korea":"South Korea","Indonesia":"Indonesia","Thailand":"Thailand","Malaysia":"Malaysia","United Kingdom":"UK","Philippines":"Philippines","France":"France","China":"China","New Zealand":"New Zealand","India":"India","Spain":"Spain","Germany":"Germany","Brazil":"Brazil","Italy":"Italy","Ireland":"Ireland","Switzerland":"Switzerland","Israel":"Israel","United Arab Emirates":"UAE","Chile":"Chile","Argentina":"Argentina","Netherlands":"Netherlands","Denmark":"Denmark","Austria":"Austria","Brunei Darussalam":"Brunei","Finland":"Finland","Poland":"Poland","Norway":"Norway","Belarus":"Belarus","South Africa":"South Africa","Russian Federation":"Russia","Belgium":"Belgium","Romania":"Romania","Czech Republic":"Czech Republic","Estonia":"Estonia","Nigeria":"Nigeria","Luxembourg":"Luxembourg","Uruguay":"Uruguay","Viet Nam":"Vietnam","Sweden":"Sweden","Japan":"Japan","Other":"Other","その他":"Other","Mexico":"Mexico"};
const SEG_ORDER=["Solo","Couple","Family","Group"];
const SEG_COLORS={Solo:"#7ec8e3",Couple:"#c084fc",Family:"#f59e0b",Group:"#34d399"};
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

// ─── HELPERS ───
function getRegion(f){return KANSAI_KW.some(k=>f.includes(k))?"Kansai":"Kanto"}
function getHotelType(f){if(f.includes("Apart")||f.includes("TABI")||f.includes("GRAND"))return"Apart";return"Hotel"}
function getBrand(f){if(f.includes("イチホテル"))return"ICHI";if(f.includes("GRAND"))return"GRAND MONday";if(f.includes("TABI"))return"TABI";if(f.includes("Apart"))return"MONday Apart";return"hotel MONday"}
function getCountry(p,ph,l){if(p){if(JP_PREFS.includes(p))return"Japan";if(COUNTRY_MAP[p])return COUNTRY_MAP[p]}if(ph){for(const[c,co]of Object.entries(PHONE_MAP))if(ph===c)return co}if(l){if(l==="日本語")return"Japan";if(l==="英語")return"International (EN)";if(l.includes("中国語"))return"Taiwan/HK (ZH)";if(l==="韓国語")return"South Korea"}return"Unknown"}
function getSegment(a,k){const t=a+k;if(k>0)return"Family";if(t===1)return"Solo";if(t===2)return"Couple";if(t>=3)return"Group";return"Unknown"}
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
  const g=c=>row[headers.indexOf(c)]??"";
  let facility=g("施設名");
  // Normalize garbled encoding variants of 舞浜ビューⅠ
  if(facility.includes("舞浜ビュー")&&!facility.includes("舞浜ビューⅠ"))facility=facility.replace(/舞浜ビュー.*$/,"舞浜ビューⅠ");
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
  return{facility,region:getRegion(facility),hotelType:getHotelType(facility),brand:getBrand(facility),country:getCountry(g("都道府県"),g("国番号（ 連絡先（主） ）"),g("言語")),segment:getSegment(adults,kids),checkin,checkout,bookingDate:bookingDt,month:checkin?checkin.toISOString().slice(0,7):null,bookMonth:bookingDt?bookingDt.toISOString().slice(0,7):null,checkinDow:checkin?DOW_FULL[(checkin.getDay()+6)%7]:null,checkoutDow:checkout?DOW_FULL[(checkout.getDay()+6)%7]:null,leadTime,nights:parseInt(g("泊数"))||null,totalRev:parseYen(g("予約料金合計")),partySize:adults+kids,adults,kids,device:g("予約方法"),roomSimple:simplifyRoom(g("部屋タイプ")),rank:g("ランク名")||"No Rank",isCancelled,cancelFee}
}

function decodeBuffer(buf){
  const b=new Uint8Array(buf);
  try{const t=new TextDecoder("utf-8",{fatal:true}).decode(b);if(t.includes("施設名"))return{text:t,encoding:"UTF-8"}}catch{}
  try{const t=new TextDecoder("shift-jis",{fatal:false}).decode(b);if(t.includes("施設名"))return{text:t,encoding:"Shift-JIS"}}catch{}
  return{text:new TextDecoder("utf-8",{fatal:false}).decode(b),encoding:"UTF-8 (lossy)"}
}

function dlChart(id,fn,title){const el=document.getElementById(id);if(!el)return;const svg=el.querySelector("svg");if(!svg)return;const bbox=svg.getBoundingClientRect();const w=Math.round(bbox.width),h=Math.round(bbox.height);if(w<10||h<10)return;const c=svg.cloneNode(true);c.setAttribute("xmlns","http://www.w3.org/2000/svg");c.setAttribute("width",w);c.setAttribute("height",h);c.setAttribute("viewBox",`0 0 ${w} ${h}`);c.style.width=w+"px";c.style.height=h+"px";const d=new XMLSerializer().serializeToString(c);const cv=document.createElement("canvas");const ctx=cv.getContext("2d");const img=new Image();const titleH=title?48:0;const u=URL.createObjectURL(new Blob([d],{type:"image/svg+xml;charset=utf-8"}));img.onload=()=>{cv.width=w*2;cv.height=(h+titleH)*2;ctx.scale(2,2);if(title){ctx.fillStyle="#1a1a2e";ctx.font="bold 14px 'DM Sans',sans-serif";ctx.fillText(title,12,titleH-14)}ctx.drawImage(img,0,titleH,w,h);const a=document.createElement("a");a.download=fn+".png";a.href=cv.toDataURL("image/png");a.click();URL.revokeObjectURL(u)};img.src=u}

function dlTable(data,title,fn,tr){if(!data||!data.length)return;const keys=Object.keys(data[0]);const tKey=k=>tr?tr(k):k;const tVal=v=>{if(v==null)return"";if(typeof v==="number")return v.toLocaleString();const s=String(v);return tr?tr(s):s};const pad=14,rowH=28,headH=36,titleH=44,font="12px 'DM Sans',sans-serif",headFont="bold 11px 'JetBrains Mono',monospace",titleFont="bold 14px 'DM Sans',sans-serif";const cv=document.createElement("canvas");const ctx=cv.getContext("2d");ctx.font=font;const colW=keys.map(k=>{const hdr=tKey(k).toUpperCase();ctx.font=headFont;let mx=ctx.measureText(hdr).width;ctx.font=font;data.forEach(r=>{const w=ctx.measureText(tVal(r[k])).width;if(w>mx)mx=w});return mx+pad*2});const totalW=colW.reduce((a,b)=>a+b,0)+2;const totalH=titleH+headH+data.length*rowH+2;cv.width=totalW*2;cv.height=totalH*2;ctx.scale(2,2);ctx.fillStyle="#ffffff";ctx.fillRect(0,0,totalW,totalH);ctx.fillStyle="#1a1a2e";ctx.font=titleFont;ctx.fillText(title,pad,titleH-14);ctx.fillStyle="#f0f0f4";ctx.fillRect(0,titleH,totalW,headH);ctx.fillStyle="#4a4a6a";ctx.font=headFont;let x=1;keys.forEach((k,i)=>{ctx.fillText(tKey(k).toUpperCase(),x+pad,titleH+headH-10);x+=colW[i]});data.forEach((row,ri)=>{const y=titleH+headH+ri*rowH;if(ri%2===0){ctx.fillStyle="#fafaff";ctx.fillRect(0,y,totalW,rowH)}ctx.fillStyle="#333";ctx.font=font;let x2=1;keys.forEach((k,i)=>{ctx.fillText(tVal(row[k]),x2+pad,y+rowH-8);x2+=colW[i]})});ctx.strokeStyle="#e0e0e8";ctx.lineWidth=0.5;let lx=1;keys.forEach((_,i)=>{lx+=colW[i];ctx.beginPath();ctx.moveTo(lx,titleH);ctx.lineTo(lx,totalH);ctx.stroke()});const a=document.createElement("a");a.download=fn+"_table.png";a.href=cv.toDataURL("image/png");a.click()}

function expCSV(rows,headers,fn){const csv=[headers.join(","),...rows.map(r=>headers.map(h=>{const v=r[h];if(v==null)return"";const s=String(v);return s.includes(",")||s.includes('"')||s.includes("\n")?'"'+s.replace(/"/g,'""')+'"':s}).join(","))].join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));a.download=fn;a.click()}

const CT=({active,payload,label,formatter})=>{if(!active||!payload?.length)return null;return(<div style={{background:"#1a3058",border:"1px solid #2a4a78",borderRadius:6,padding:"8px 12px",fontSize:12,color:"#f0ece4"}}><div style={{fontWeight:600,marginBottom:4,color:"#c9a84c"}}>{label}</div>{payload.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}><span style={{width:8,height:8,borderRadius:2,background:p.color,display:"inline-block"}}/><span>{p.name}: {formatter?formatter(p.value):typeof p.value==="number"?p.value.toLocaleString():p.value}</span></div>)}</div>)};

const MS=({options,selected,onChange,placeholder,maxShow=2,S,cl})=>{const[open,setOpen]=useState(false);const ref=useRef();useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false)};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h)},[]);const toggle=v=>onChange(selected.includes(v)?selected.filter(s=>s!==v):[...selected,v]);const label=selected.length===0?placeholder:selected.length<=maxShow?selected.join(", "):`${selected.length} ✓`;return(<div ref={ref} style={{position:"relative",display:"inline-block"}}><button style={{...S.btn,...(selected.length>0?S.ba:{}),minWidth:120,textAlign:"left",display:"flex",alignItems:"center",justifyContent:"space-between",gap:4}} onClick={()=>setOpen(!open)}><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}}>{label}</span><span style={{fontSize:8}}>▼</span></button>{open&&<div style={{position:"absolute",top:"100%",left:0,zIndex:100,background:"#142444",border:"1px solid #1e3150",borderRadius:6,marginTop:4,maxHeight:240,overflowY:"auto",minWidth:220,boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}><div style={{padding:"4px 8px",borderBottom:"1px solid #1e3150",display:"flex",justifyContent:"space-between"}}><button onClick={()=>onChange([])} style={{...S.btn,padding:"2px 8px",fontSize:10,border:"none"}}>{cl}</button><button onClick={()=>onChange([...options])} style={{...S.btn,padding:"2px 8px",fontSize:10,border:"none"}}>All</button></div>{options.map(o=><div key={o} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",cursor:"pointer",fontSize:12,color:selected.includes(o)?"#c9a84c":"#c8c3b8"}} onClick={()=>toggle(o)}><span style={{width:14,height:14,borderRadius:3,border:"1px solid "+(selected.includes(o)?"#c9a84c":"#1e3150"),background:selected.includes(o)?"rgba(201,168,76,0.2)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,flexShrink:0}}>{selected.includes(o)?"✓":""}</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o}</span></div>)}</div>}</div>)};

// ─── MAIN ───
export default function App(){
  const[lang,setLang]=useState("en");const[theme,setTheme]=useState(()=>localStorage.getItem("rgl_theme")||"dark");const t=T[lang];const dL=lang==="ja"?DOW_JA:DOW_SHORT;
  // Translate data-level labels (region, segment, type, rank, country)
  const tl=v=>{const m={"Kanto":t.kanto,"Kansai":t.kansai,"Solo":t._Solo,"Couple":t._Couple,"Family":t._Family,"Group":t._Group,"Hotel":t._Hotel,"Apart":t._Apart,"No Rank":t._NoRank,"Regular":t._Regular,"Gold":t._Gold,"Platinum":t._Platinum};if(m[v])return m[v];if(lang==="ja"){const cm={"Japan":"日本","United States":"アメリカ","Canada":"カナダ","Taiwan":"台湾","Australia":"オーストラリア","Hong Kong":"香港","Singapore":"シンガポール","South Korea":"韓国","Indonesia":"インドネシア","Thailand":"タイ","Malaysia":"マレーシア","UK":"英国","Philippines":"フィリピン","France":"フランス","China":"中国","New Zealand":"ニュージーランド","India":"インド","Germany":"ドイツ","Spain":"スペイン","Mexico":"メキシコ","Brazil":"ブラジル","Italy":"イタリア","Ireland":"アイルランド","Switzerland":"スイス","Israel":"イスラエル","UAE":"UAE","Chile":"チリ","Argentina":"アルゼンチン","Netherlands":"オランダ","Denmark":"デンマーク","Austria":"オーストリア","Brunei":"ブルネイ","Finland":"フィンランド","Poland":"ポーランド","Norway":"ノルウェー","Russia":"ロシア","Belgium":"ベルギー","Sweden":"スウェーデン","Vietnam":"ベトナム","Unknown":"不明","Other":"その他","International (EN)":"海外(英語)","Taiwan/HK (ZH)":"台湾/香港(中文)"};if(cm[v])return cm[v]}return v};
  const[allData,setAllData]=useState([]);const[allH,setAllH]=useState([]);const[fL,setFL]=useState([]);const[errs,setErrs]=useState([]);const[proc,setProc]=useState(false);
  const[fR,setFR]=useState("All");const[fC,setFC]=useState([]);const[fDT,setFDT]=useState("checkin");const[fDF,setFDF]=useState("");const[fDTo,setFDTo]=useState("");const[fS,setFS]=useState([]);const[fP,setFP]=useState([]);
  const[fCancel,setFCancel]=useState("confirmed"); // "confirmed" | "cancelled" | "all"
  const[fHType,setFHType]=useState("All"); // "All" | "Hotel" | "Apart"
  const[fBrands,setFBrands]=useState([]);
const[fGeo,setFGeo]=useState([]);
  const[tab,setTab]=useState("overview");const[tSort,setTSort]=useState({col:null,asc:true});const[tPage,setTPage]=useState(0);const PG=50;
  const[filtersOpen,setFiltersOpen]=useState(true);
  const[drFrom,setDrFrom]=useState("");const[drTo,setDrTo]=useState("");
  const[monthMode,setMonthMode]=useState("stay"); // "stay" or "booking"
  const getM=r=>monthMode==="stay"?r.month:r.bookMonth;
  const[sheetStatus,setSheetStatus]=useState("idle"); // "idle"|"loading"|"done"|"error"

  // ─── Auto-fetch from Google Sheets on mount ───
  useEffect(()=>{
    if(allData.length>0)return; // skip if user already uploaded files
    setSheetStatus("loading");
    fetch(GSHEET_CSV_URL)
      .then(r=>{if(!r.ok)throw new Error(r.status);return r.text()})
      .then(text=>{
        const res=Papa.parse(text,{header:false,skipEmptyLines:true});
        if(!res.data||res.data.length<2){setSheetStatus("error");return}
        const h=res.data[0];
        const miss=REQUIRED_COLS.filter(c=>!h.includes(c));
        if(miss.length){setSheetStatus("error");return}
        const rows=res.data.slice(1).filter(r=>r.length>=10&&r[0]);
        const processed=rows.map(r=>processRow(r,h));
        setAllH(h);setAllData(processed);
        setFL([{name:"Google Sheets (live)",rows:rows.length,encoding:"UTF-8"}]);
        setSheetStatus("done");
      })
      .catch(()=>setSheetStatus("error"));
  },[]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFiles=useCallback(e=>{const files=Array.from(e.target?.files||e.dataTransfer?.files||[]);if(!files.length)return;setProc(true);setErrs([]);const errors=[];let nd=[...allData],bH=allH.length?allH:null,done=0;const nFL=[...fL];files.forEach(file=>{const r=new FileReader();r.onload=ev=>{const{text,encoding}=decodeBuffer(ev.target.result);const res=Papa.parse(text,{header:false,skipEmptyLines:true});if(!res.data||res.data.length<2){errors.push(`${file.name}: Empty`);done++;if(done===files.length){setErrs(errors);setProc(false)}return}const h=res.data[0];const miss=REQUIRED_COLS.filter(c=>!h.includes(c));if(miss.length){errors.push(`${file.name}: Missing — ${miss.slice(0,3).join(", ")}${miss.length>3?` (+${miss.length-3})`:""}`);done++;if(done===files.length){setErrs(errors);setProc(false)}return}if(!bH){bH=h;setAllH(h)}const rows=res.data.slice(1).filter(r=>r.length>=10&&r[0]);nd=[...nd,...rows.map(r=>processRow(r,h))];nFL.push({name:file.name,rows:rows.length,encoding});done++;if(done===files.length){setAllData(nd);setFL(nFL);setAllH(bH);setErrs(errors);setProc(false)}};r.readAsArrayBuffer(file)});},[allData,allH,fL]);

  const clearAll=()=>{setAllData([]);setAllH([]);setFL([]);setErrs([]);setFR("All");setFC([]);setFDF("");setFDTo("");setFS([]);setFP([]);setFCancel("confirmed");setFHType("All");setFBrands([]);setFGeo([])};

  const filtered=useMemo(()=>{let d=allData;if(fCancel==="confirmed")d=d.filter(r=>!r.isCancelled);else if(fCancel==="cancelled")d=d.filter(r=>r.isCancelled);if(fHType!=="All")d=d.filter(r=>r.hotelType===fHType);if(fBrands.length)d=d.filter(r=>fBrands.includes(r.brand));if(fR!=="All")d=d.filter(r=>r.region===fR);if(fC.length)d=d.filter(r=>fC.includes(r.country));if(fS.length)d=d.filter(r=>fS.includes(r.segment));if(fP.length)d=d.filter(r=>fP.includes(r.facility));if(fGeo.length)d=d.filter(r=>fGeo.includes(GEO_REGION(r.country)));if(fDF||fDTo){const from=fDF?new Date(fDF):null,to=fDTo?new Date(fDTo+"T23:59:59"):null;d=d.filter(r=>{const dt=fDT==="checkin"?r.checkin:fDT==="checkout"?r.checkout:r.bookingDate;if(!dt)return false;if(from&&dt<from)return false;if(to&&dt>to)return false;return true})}return d},[allData,fR,fC,fS,fP,fDT,fDF,fDTo,fCancel,fHType,fBrands,fGeo]);

  const uC=useMemo(()=>[...new Set(allData.map(r=>r.country))].sort(),[allData]);
  const uP=useMemo(()=>[...new Set(allData.map(r=>r.facility))].sort(),[allData]);
  const uS=useMemo(()=>[...new Set(allData.map(r=>r.segment))].filter(s=>s!=="Unknown").sort(),[allData]);
  const uB=useMemo(()=>[...new Set(allData.map(r=>r.brand))].sort(),[allData]);
const uGeo=useMemo(()=>[...new Set(allData.map(r=>GEO_REGION(r.country)))].sort(),[allData]);

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
      if(r.checkoutDow){if(!byD[r.checkoutDow])byD[r.checkoutDow]=byD[r.checkoutDow]||{ci:0,co:0};byD[r.checkoutDow].co++}
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
  },[filtered,monthMode]);

  // ─── CHART DATA ───
  const mktD=useMemo(()=>!agg?[]:Object.entries(agg.byC).sort((a,b)=>b[1].n-a[1].n).slice(0,15).map(([c,v])=>({country:c,count:v.n,avgRev:Math.round(v.rev/v.n)})),[agg]);
  const segD=useMemo(()=>!agg?[]:SEG_ORDER.filter(s=>agg.byS[s]).map(s=>({segment:s,count:agg.byS[s].n,avgRev:Math.round(agg.byS[s].rev/agg.byS[s].n),avgLOS:+(avg(agg.byS[s].nights)).toFixed(2),avgLead:+(avg(agg.byS[s].lead)).toFixed(1)})),[agg]);
  const moD=useMemo(()=>!agg?[]:Object.entries(agg.byM).sort((a,b)=>a[0].localeCompare(b[0])).map(([m,v])=>({month:m,count:v.n,rev:v.rev,avgRev:Math.round(v.rev/v.n)})),[agg]);
  const dowD=useMemo(()=>!agg?[]:DOW_FULL.map((d,i)=>({day:dL[i],checkin:agg.byD[d]?.ci||0,checkout:agg.byD[d]?.co||0})),[agg,dL]);
  const rmD=useMemo(()=>!agg?[]:Object.entries(agg.byRm).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([r,c])=>({room:r,count:c})),[agg]);
  const facD=useMemo(()=>!agg?[]:Object.entries(agg.byF).sort((a,b)=>b[1].n-a[1].n).map(([nm,f])=>({name:shortFac(nm),fullName:nm,region:f.region,n:f.n,avgRev:f.n>0?Math.round(f.rev/f.n):0,intlPct:f.n>0?+((f.intl/f.n)*100).toFixed(1):0,avgLOS:f.nights.length?+(avg(f.nights)).toFixed(1):0,topSeg:Object.entries(f.segs).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—"})),[agg]);

  // Daily aggregation
  const dailyD=useMemo(()=>{
    if(!filtered.length)return[];
    const byDate={};
    filtered.forEach(r=>{const dt=r.checkin?r.checkin.toISOString().slice(0,10):null;if(!dt)return;if(!byDate[dt])byDate[dt]={date:dt,rev:0,count:0};byDate[dt].rev+=r.totalRev||0;byDate[dt].count++});
    return Object.values(byDate).sort((a,b)=>a.date.localeCompare(b.date));
  },[filtered]);

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
    if(!agg)return null;
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
  },[agg,filtered,dL,lang]);

  // ─── DYNAMIC INSIGHTS ───
  const insights=useMemo(()=>{
    if(!agg||!filtered.length)return{};
    const ja=lang==="ja";
    const n=agg.n,tr=agg.totalRev,ar=agg.avgRev;
    // top market
    const topMkt=mktD.length?mktD[0]:null;
    // top segment
    const topSeg=segD.length?segD.reduce((a,b)=>b.count>a.count?b:a,segD[0]):null;
    // highest rev segment
    const hiRevSeg=segD.length?segD.reduce((a,b)=>b.avgRev>a.avgRev?b:a,segD[0]):null;
    // longest LOS segment
    const hiLOSSeg=segD.length?segD.reduce((a,b)=>b.avgLOS>a.avgLOS?b:a,segD[0]):null;
    // longest lead segment
    const hiLeadSeg=segD.length?segD.reduce((a,b)=>b.avgLead>a.avgLead?b:a,segD[0]):null;
    // peak DOW
    const peakCI=dowD.length?dowD.reduce((a,b)=>b.checkin>a.checkin?b:a,dowD[0]):null;
    // smartphone %
    const spN=filtered.filter(r=>r.device==="スマートフォン").length;
    const spPct=pct(spN,n);
    // top room
    const topRoom=rmD.length?rmD[0]:null;
    const top3RoomPct=rmD.length>=3?pct(rmD[0].count+rmD[1].count+rmD[2].count,n):"—";
    // top facility
    const topFac=facD.length?facD[0]:null;
    const hiRevFac=facD.length?facD.reduce((a,b)=>b.avgRev>a.avgRev?b:a,facD[0]):null;
    const hiIntlFac=facD.length?facD.reduce((a,b)=>b.intlPct>a.intlPct?b:a,facD[0]):null;
    // kanto vs kansai
    const kN=kvk?kvk.kantoN:0,sN=kvk?kvk.kansaiN:0;
    const kIntl=agg.rC.Kanto?pct(Object.entries(agg.rC.Kanto).filter(([c])=>c!=="Japan").reduce((a,[,v])=>a+v,0),kN):"—";
    const sIntl=agg.rC.Kansai?pct(Object.entries(agg.rC.Kansai).filter(([c])=>c!=="Japan").reduce((a,[,v])=>a+v,0),sN):"—";
    const kTop=kvk&&kvk.mkKanto.length?kvk.mkKanto[0].country:"—";
    const sTop=kvk&&kvk.mkKansai.length?kvk.mkKansai[0].country:"—";
    // highest rev market
    const hiRevMkt=mktD.length?mktD.reduce((a,b)=>b.avgRev>a.avgRev?b:a,mktD[0]):null;
    // highest LOS market
    const hiLOSMkt=mktLOS.length?mktLOS[0]:null;

    const b=(items)=>items.filter(Boolean).map(s=>"• "+s).join("\n");

    return{
      overview:b([
        ja?`予約${fmtN(n)}件、売上合計${fmtY(tr)}、平均単価${fmtY(ar)}`:`${fmtN(n)} reservations, ${fmtY(tr)} total revenue, ${fmtY(ar)} avg/res`,
        topMkt?(ja?`最大市場: ${tl(topMkt.country)}（${fmtN(topMkt.count)}件）`:`Top market: ${tl(topMkt.country)} (${fmtN(topMkt.count)})`):null,
        topSeg?(ja?`最多タイプ: ${tl(topSeg.segment)}（${pct(topSeg.count,n)}）`:`Largest segment: ${tl(topSeg.segment)} (${pct(topSeg.count,n)})`):null,
        ja?`海外比率: ${pct(agg.intlPct*n/100,n)}、平均泊数: ${agg.avgNights.toFixed(1)}泊`:`International: ${pct(agg.intlPct*n/100,n)}, avg stay: ${agg.avgNights.toFixed(1)} nights`,
      ]),
      kvk:b([
        ja?`関東${fmtN(kN)}件 vs 関西${fmtN(sN)}件`:`Kanto ${fmtN(kN)} vs Kansai ${fmtN(sN)} reservations`,
        ja?`海外比率: 関東${kIntl} / 関西${sIntl}`:`International: Kanto ${kIntl} / Kansai ${sIntl}`,
        ja?`関東トップインバウンド: ${tl(kTop)}、関西: ${tl(sTop)}`:`Top inbound — Kanto: ${tl(kTop)}, Kansai: ${tl(sTop)}`,
        kvk&&kvk.losSR.length?(ja?`平均泊数: 関東${kvk.losSR.reduce((a,s)=>a+s.Kanto,0)/kvk.losSR.length>0?(kvk.losSR.reduce((a,s)=>a+s.Kanto,0)/kvk.losSR.length).toFixed(1):"—"}泊 / 関西${(kvk.losSR.reduce((a,s)=>a+s.Kansai,0)/kvk.losSR.length).toFixed(1)}泊`:`Avg LOS: Kanto ${(kvk.losSR.reduce((a,s)=>a+s.Kanto,0)/kvk.losSR.length).toFixed(1)} / Kansai ${(kvk.losSR.reduce((a,s)=>a+s.Kansai,0)/kvk.losSR.length).toFixed(1)} nights`):null,
      ]),
      markets:b([
        topMkt?(ja?`最大市場: ${tl(topMkt.country)}（${fmtN(topMkt.count)}件）`:`#1 market: ${tl(topMkt.country)} (${fmtN(topMkt.count)})`):null,
        hiRevMkt?(ja?`最高平均単価: ${tl(hiRevMkt.country)}（${fmtY(hiRevMkt.avgRev)}）`:`Highest avg revenue: ${tl(hiRevMkt.country)} (${fmtY(hiRevMkt.avgRev)})`):null,
        hiLOSMkt?(ja?`最長平均泊数: ${tl(hiLOSMkt.country)}（${hiLOSMkt.avgLOS}泊）`:`Longest avg stay: ${tl(hiLOSMkt.country)} (${hiLOSMkt.avgLOS} nights)`):null,
        ja?`国内${pct(filtered.filter(r=>r.country==="Japan").length,n)} / 海外${pct(filtered.filter(r=>r.country!=="Japan").length,n)}`:`Domestic ${pct(filtered.filter(r=>r.country==="Japan").length,n)} / International ${pct(filtered.filter(r=>r.country!=="Japan").length,n)}`,
      ]),
      segments:b([
        topSeg?(ja?`最多: ${tl(topSeg.segment)}（${fmtN(topSeg.count)}件、${pct(topSeg.count,n)}）`:`Largest: ${tl(topSeg.segment)} (${fmtN(topSeg.count)}, ${pct(topSeg.count,n)})`):null,
        hiRevSeg?(ja?`最高単価: ${tl(hiRevSeg.segment)}（${fmtY(hiRevSeg.avgRev)}）`:`Highest revenue: ${tl(hiRevSeg.segment)} (${fmtY(hiRevSeg.avgRev)}/res)`):null,
        hiLOSSeg?(ja?`最長泊数: ${tl(hiLOSSeg.segment)}（${hiLOSSeg.avgLOS.toFixed(1)}泊）`:`Longest stay: ${tl(hiLOSSeg.segment)} (${hiLOSSeg.avgLOS.toFixed(1)} nights)`):null,
        hiLeadSeg?(ja?`最長LT: ${tl(hiLeadSeg.segment)}（${hiLeadSeg.avgLead.toFixed(0)}日）`:`Longest lead: ${tl(hiLeadSeg.segment)} (${hiLeadSeg.avgLead.toFixed(0)} days)`):null,
      ]),
      booking:b([
        ja?`平均リードタイム: ${agg.avgLead.toFixed(0)}日`:`Average lead time: ${agg.avgLead.toFixed(0)} days`,
        peakCI?(ja?`チェックインピーク: ${peakCI.day}（${fmtN(peakCI.checkin)}件）`:`Peak check-in day: ${peakCI.day} (${fmtN(peakCI.checkin)})`):null,
        ja?`スマホ予約: ${spPct}`:`Smartphone bookings: ${spPct}`,
        moD.length>=2?(ja?`月次トレンド: ${moD[moD.length-1].count>moD[0].count?"増加傾向":"減少傾向"}`:`Monthly trend: ${moD[moD.length-1].count>moD[0].count?"increasing":"decreasing"}`):null,
      ]),
      revenue:b([
        ja?`売上合計: ${fmtY(tr)}、平均単価: ${fmtY(ar)}`:`Total revenue: ${fmtY(tr)}, avg ${fmtY(ar)}/res`,
        hiRevMkt?(ja?`最高単価市場: ${tl(hiRevMkt.country)}（${fmtY(hiRevMkt.avgRev)}）`:`Top market by avg rev: ${tl(hiRevMkt.country)} (${fmtY(hiRevMkt.avgRev)})`):null,
        hiRevSeg?(ja?`最高単価タイプ: ${tl(hiRevSeg.segment)}（${fmtY(hiRevSeg.avgRev)}）`:`Top segment by avg rev: ${tl(hiRevSeg.segment)} (${fmtY(hiRevSeg.avgRev)})`):null,
        moD.length>=2?(ja?`月次売上: ${moD[moD.length-1].rev>moD[0].rev?"増加傾向":"減少傾向"}`:`Revenue trend: ${moD[moD.length-1].rev>moD[0].rev?"increasing":"decreasing"}`):null,
      ]),
      rooms:b([
        topRoom?(ja?`最多部屋タイプ: ${topRoom.room}（${pct(topRoom.count,n)}）`:`Top room type: ${topRoom.room} (${pct(topRoom.count,n)})`):null,
        rmD.length>=3?(ja?`上位3タイプで${top3RoomPct}`:`Top 3 types account for ${top3RoomPct}`):null,
      ]),
      facilities:b([
        topFac?(ja?`最多施設: ${topFac.name}（${fmtN(topFac.n)}件）`:`Top facility: ${topFac.name} (${fmtN(topFac.n)})`):null,
        hiRevFac?(ja?`最高単価: ${hiRevFac.name}（${fmtY(hiRevFac.avgRev)}）`:`Highest avg rev: ${hiRevFac.name} (${fmtY(hiRevFac.avgRev)})`):null,
        hiIntlFac?(ja?`最高海外比率: ${hiIntlFac.name}（${hiIntlFac.intlPct}%）`:`Most international: ${hiIntlFac.name} (${hiIntlFac.intlPct}%)`):null,
        ja?`関東${facD.filter(f=>f.region==="Kanto").length}施設 / 関西${facD.filter(f=>f.region==="Kansai").length}施設`:`Kanto: ${facD.filter(f=>f.region==="Kanto").length} properties / Kansai: ${facD.filter(f=>f.region==="Kansai").length} properties`,
      ]),
    };
  },[agg,filtered,mktD,segD,dowD,rmD,facD,kvk,moD,mktLOS,lang]);

  // ─── DAILY REPORT ───
  useEffect(()=>{
    if(allData.length&&!drFrom){
      const y=new Date();y.setDate(y.getDate()-1);const yd=y.getFullYear()+"-"+String(y.getMonth()+1).padStart(2,"0")+"-"+String(y.getDate()).padStart(2,"0");
      setDrFrom(yd);setDrTo(yd);
    }
  },[allData]);

  const dailyRpt=useMemo(()=>{
    if(!allData.length||!drFrom)return null;
    const from=drFrom,to=drTo||drFrom;
    // Shift range back 1 year for YoY
    const prevFrom=`${parseInt(from.slice(0,4))-1}${from.slice(4)}`;
    const prevTo=`${parseInt(to.slice(0,4))-1}${to.slice(4)}`;
    // Filter by BOOKING DATE (予約受付日時) using LOCAL date (not UTC)
    const localDate=dt=>{if(!dt)return null;const y=dt.getFullYear(),m=String(dt.getMonth()+1).padStart(2,"0"),d=String(dt.getDate()).padStart(2,"0");return`${y}-${m}-${d}`};
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
    return{countryRows,regionRows,yoyRev,yoyCount,totalRev,totalCount,
      totalNights,totalADR:totalNights>0?Math.round(totalRev/totalNights):0,
      curLabel,prevLabel};
  },[allData,drFrom,drTo]);

  // Table
  const tC=["facility","brand","hotelType","region","country","segment","isCancelled","checkin","checkout","nights","leadTime","totalRev","roomSimple","device","rank","partySize"];
  const tH=[t.thFacility,t.brand,t.hotelType,t.thRegion,t.thCountry,t.thSegment,t.statusFilter,t.thCheckin,t.thCheckout,t.thNights,t.thLead,t.thRev,t.thRoom,t.thDevice,t.thRank,t.thParty];
  const tRows=useMemo(()=>{let rows=filtered.map(r=>{const o={};tC.forEach(c=>{o[c]=(c==="checkin"||c==="checkout")?(r[c]?r[c].toISOString().slice(0,10):""):r[c]??""});return o});if(tSort.col)rows.sort((a,b)=>{let va=a[tSort.col],vb=b[tSort.col];if(typeof va==="number"&&typeof vb==="number")return tSort.asc?va-vb:vb-va;return tSort.asc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va))});return rows},[filtered,tSort]);
  const paged=useMemo(()=>tRows.slice(tPage*PG,(tPage+1)*PG),[tRows,tPage]);const totPg=Math.ceil(tRows.length/PG);

  const expFilt=()=>{const h=["Facility","Region","Country","Segment","Check-in","Check-out","Nights","Lead","Rev","Room","Device","Rank","Party"];expCSV(filtered.map(r=>{const o={};tC.forEach((k,i)=>{o[h[i]]=(k==="checkin"||k==="checkout")?(r[k]?r[k].toISOString().slice(0,10):""):r[k]??""});return o}),h,"filtered.csv")};
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
  const S={app:{fontFamily:"'DM Sans',sans-serif",background:TH.bg,color:TH.text,minHeight:"100vh"},inner:{maxWidth:1440,margin:"0 auto",padding:"24px 16px"},hdr:{borderBottom:"1px solid "+TH.border,paddingBottom:20,marginBottom:24},h1:{fontSize:24,fontWeight:700,color:TH.textStrong,letterSpacing:-.5,margin:0},gold:{color:TH.gold},sub:{fontSize:12,color:TH.textMuted,marginTop:4,fontFamily:"'JetBrains Mono',monospace"},card:{background:TH.card,border:"1px solid "+TH.border,borderRadius:8,padding:16,marginBottom:12},ct:{fontSize:13,fontWeight:600,color:TH.textStrong,marginBottom:10},kpi:{background:TH.card,border:"1px solid "+TH.border,borderRadius:8,padding:"12px 14px",minWidth:140,flex:"1 1 140px"},kl:{fontSize:10,textTransform:"uppercase",letterSpacing:1,color:TH.textMuted,fontFamily:"'JetBrains Mono',monospace"},kv:{fontSize:22,fontWeight:700,color:TH.textStrong,marginTop:2},btn:{background:TH.card,border:"1px solid "+TH.border,color:TH.text,fontSize:12,padding:"6px 14px",borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all .15s"},ba:{background:TH.accent,borderColor:TH.accentBorder,color:TH.gold},bg:{background:"rgba(201,168,76,0.15)",border:"1px solid "+TH.gold,color:TH.gold,fontSize:12,padding:"6px 14px",borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"},sel:{background:TH.input,border:"1px solid "+TH.border,color:TH.text,fontSize:12,padding:"5px 8px",borderRadius:5,fontFamily:"'DM Sans',sans-serif",outline:"none"},inp:{background:TH.input,border:"1px solid "+TH.border,color:TH.text,fontSize:12,padding:"5px 8px",borderRadius:5,outline:"none"},tag:c=>({fontSize:10,fontWeight:500,padding:"2px 8px",borderRadius:4,background:c+"22",color:c,marginLeft:6,display:"inline-block"}),tbl:{width:"100%",borderCollapse:"collapse",fontSize:12},th:{textAlign:"left",fontWeight:600,color:TH.gold,fontSize:10,textTransform:"uppercase",letterSpacing:.5,padding:"6px 8px",borderBottom:"1px solid "+TH.border,fontFamily:"'JetBrains Mono',monospace",cursor:"pointer",userSelect:"none",whiteSpace:"nowrap"},td:{padding:"5px 8px",borderBottom:"1px solid "+TH.border+"66",fontSize:12,color:TH.text},upl:{border:"2px dashed "+TH.border,borderRadius:10,padding:"40px 20px",textAlign:"center",cursor:"pointer"},m:{fontFamily:"'JetBrains Mono',monospace"},fl:{fontSize:10,color:TH.textMuted,marginBottom:3,textTransform:"uppercase",fontFamily:"'JetBrains Mono',monospace"},lt:{display:"flex",background:TH.input,borderRadius:6,overflow:"hidden",border:"1px solid "+TH.border},lb:a=>({padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",border:"none",background:a?TH.gold:"transparent",color:a?(dk?"#080e1a":"#ffffff"):TH.textMuted,fontFamily:"'DM Sans',sans-serif"}),insight:{background:TH.insightBg,border:"1px solid "+TH.insightBorder,borderRadius:8,padding:14,marginBottom:14,fontSize:12,color:TH.textMuted,lineHeight:1.6}};
  const CT=({active,payload,label,formatter})=>{if(!active||!payload?.length)return null;return(<div style={{background:TH.tooltipBg,border:"1px solid "+TH.tooltipBorder,borderRadius:6,padding:"8px 12px",fontSize:12,color:TH.tooltipText}}><div style={{fontWeight:600,marginBottom:4,color:TH.gold}}>{label}</div>{payload.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}><span style={{width:8,height:8,borderRadius:2,background:p.color,display:"inline-block"}}/><span>{p.name}: {formatter?formatter(p.value):typeof p.value==="number"?p.value.toLocaleString():p.value}</span></div>)}</div>)};
  const LT=()=><div style={S.lt}><button style={S.lb(lang==="en")} onClick={()=>setLang("en")}>EN</button><button style={S.lb(lang==="ja")} onClick={()=>setLang("ja")}>日本語</button></div>;
  const EB=({id,nm,data,title})=><div style={{display:"flex",gap:4}}><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>dlChart(id,nm,title)}>{t.exportImg}</button>{data&&data.length>0&&<button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>dlTable(data,title||nm,nm,v=>(lang==="ja"&&HEADER_JP[v])?HEADER_JP[v]:tl(v))}>📋</button>}</div>;
  const CC=({title,id,nm,children,h,data,grid})=>{if(grid)return(<div style={{background:TH.card,border:"1px solid "+TH.border,borderRadius:8,padding:"6px 10px",height:"calc(100% - 4px)",display:"flex",flexDirection:"column",overflow:"hidden",boxSizing:"border-box"}}><div className="rgl-drag" style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"grab",flexShrink:0,marginBottom:4}}><div style={{fontSize:12,fontWeight:600,color:TH.textStrong,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{title}</div><EB id={id} nm={nm} data={data} title={title}/></div><div id={id} style={{flex:1,minHeight:0}}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div></div>);return(<div style={S.card}><div style={S.ct}>{title}</div><div id={id}><ResponsiveContainer width="100%" height={h||280}>{children}</ResponsiveContainer></div><div style={{marginTop:4}}><EB id={id} nm={nm} data={data} title={title}/></div></div>)};
  const G={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(400px,1fr))",gap:14};
  const[layoutVer,setLayoutVer]=useState(0);
  const resetLay=useCallback(tabId=>{clearLayout(tabId);setLayoutVer(v=>v+1)},[]);
  const dgProps=tabId=>({tabId,layoutVer,onReset:()=>resetLay(tabId),resetLabel:t.resetLayout,btnStyle:{...S.btn,fontSize:10}});
  const tk={fill:TH.tickFill,fontSize:11},tks={fill:TH.tickFill,fontSize:10},gl={strokeDasharray:"3 3",stroke:TH.gridLine};
  const tlTick={fill:TH.tickFill,fontSize:11,formatter:v=>tl(v)};
  const TlTick=({x,y,payload,anchor})=><text x={x} y={y} textAnchor={anchor||"middle"} fill={TH.tickFill} fontSize={11} dy={12}>{tl(payload.value)}</text>;
  const TlTickV=({x,y,payload})=><text x={x} y={y} textAnchor="end" fill={TH.tickFill} fontSize={11} dy={4}>{tl(payload.value)}</text>;
  const TlTickV2=({x,y,payload})=>{const v=tl(payload.value);const parts=v.length>10?[v.slice(0,10),v.slice(10)]:[v];return<text x={x} y={y} textAnchor="middle" fill={TH.tickFill} fontSize={9}>{parts.map((p,i)=><tspan key={i} x={x} dy={i===0?12:11}>{p}</tspan>)}</text>};

  const TABS=[{id:"daily",l:t.dailyReport},{id:"overview",l:t.overview},{id:"kvk",l:t.kvk},{id:"markets",l:t.sourceMarkets},{id:"segments",l:t.segments},{id:"booking",l:t.bookingPatterns},{id:"revenue",l:t.revenue},{id:"rooms",l:t.roomTypes},{id:"facilities",l:t.facilities},{id:"data",l:t.rawData}];

  if(!allData.length)return(
    <div style={S.app}><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
    <div style={{...S.inner,maxWidth:700,paddingTop:60}}>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16,gap:8}}><div style={S.lt}><button style={S.lb(theme==="dark")} onClick={()=>setTheme("dark")}>{t.darkMode}</button><button style={S.lb(theme==="light")} onClick={()=>setTheme("light")}>{t.lightMode}</button></div><LT/></div>
      <div style={{textAlign:"center",marginBottom:40}}><h1 style={{...S.h1,fontSize:28}}>{t.uploadTitle} <span style={S.gold}>{t.uploadAccent}</span> <span style={{fontSize:10,color:TH.textMuted,fontWeight:400,fontFamily:"'JetBrains Mono',monospace"}}>v{APP_VERSION}</span></h1><p style={{...S.sub,marginTop:8}}>{t.uploadDesc}</p></div>
      {sheetStatus==="loading"&&<div style={{textAlign:"center",marginBottom:24,overflow:"hidden",position:"relative",height:80}}>
        <div style={{position:"absolute",animation:"duckWalk 3s linear infinite",fontSize:40,top:10}}>
          <span style={{display:"inline-block",animation:"duckBob 0.4s ease-in-out infinite alternate"}}>🐥</span>
        </div>
        <style>{`
          @keyframes duckWalk{0%{left:-50px}100%{left:calc(100% + 50px)}}
          @keyframes duckBob{0%{transform:translateY(0) scaleX(1)}100%{transform:translateY(-6px) scaleX(1)}}
        `}</style>
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
      <div style={S.hdr}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}><div><h1 style={S.h1}>{t.title} <span style={S.gold}>{t.titleAccent}</span> <span style={{fontSize:10,color:TH.textMuted,fontWeight:400,fontFamily:"'JetBrains Mono',monospace"}}>v{APP_VERSION}</span></h1><div style={S.sub}>{t.loadedFrom(fmtN(allData.length),fL.length)} • {t.showing(fmtN(filtered.length))}</div></div><div style={{display:"flex",gap:8,alignItems:"center"}}><div style={S.lt}><button style={S.lb(theme==="dark")} onClick={()=>setTheme("dark")}>{t.darkMode}</button><button style={S.lb(theme==="light")} onClick={()=>setTheme("light")}>{t.lightMode}</button></div><LT/><label style={S.bg}><input type="file" accept=".csv" multiple style={{display:"none"}} onChange={handleFiles}/>{t.addFiles}</label><button style={S.btn} onClick={clearAll}>{t.clearAll}</button></div></div>
        {fL.length>0&&<div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>{fL.map((f,i)=><span key={i} style={{fontSize:10,background:TH.input,padding:"3px 8px",borderRadius:4,color:TH.textMuted}}>{f.name} ({fmtN(f.rows)}) <span style={{color:"#4ea8de"}}>{f.encoding}</span></span>)}</div>}
        {errs.length>0&&<div style={{marginTop:8}}>{errs.map((e,i)=><div key={i} style={{fontSize:11,color:"#ef4444"}}>⚠ {e}</div>)}</div>}
      </div>
      {/* Filters */}
      {filtersOpen?<div style={{...S.card,marginBottom:16,display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap",position:"sticky",top:0,zIndex:50,background:TH.filterBg,backdropFilter:"blur(8px)",boxShadow:"0 4px 16px rgba(0,0,0,0.4)"}}>
        <div><div style={S.fl}>{t.statusFilter}</div><div style={{display:"flex",gap:3}}>{[["confirmed",t.statusConfirmed],["cancelled",t.statusCancelled],["all",t.statusAll]].map(([v,l])=><button key={v} style={{...S.btn,...(fCancel===v?S.ba:{})}} onClick={()=>setFCancel(v)}>{l}</button>)}</div></div>
        <div><div style={S.fl}>{t.hotelType}</div><div style={{display:"flex",gap:3}}>{[["All",t.all],["Hotel",t.hotelTypeHotel],["Apart",t.hotelTypeApart]].map(([v,l])=><button key={v} style={{...S.btn,...(fHType===v?S.ba:{})}} onClick={()=>setFHType(v)}>{l}</button>)}</div></div>
        <div><div style={S.fl}>{t.brand}</div><MS options={uB} selected={fBrands} onChange={setFBrands} placeholder={t.allBrands} S={S} cl={t.clear}/></div>
        <div><div style={S.fl}>{t.region}</div><div style={{display:"flex",gap:3}}>{["All","Kanto","Kansai"].map(r=><button key={r} style={{...S.btn,...(fR===r?S.ba:{})}} onClick={()=>setFR(r)}>{r==="All"?t.all:tl(r)}</button>)}</div></div>
        <div><div style={S.fl}>{t.country}</div><MS options={uC} selected={fC} onChange={setFC} placeholder={t.allCountries} S={S} cl={t.clear}/></div>
        <div><div style={S.fl}>{t.segment}</div><MS options={uS} selected={fS} onChange={setFS} placeholder={t.allSegments} S={S} cl={t.clear}/></div>
        <div><div style={S.fl}>{t.property}</div><MS options={uP} selected={fP} onChange={setFP} placeholder={t.allProperties} maxShow={1} S={S} cl={t.clear}/></div>
<div><div style={S.fl}>{t.geoArea}</div><MS options={uGeo} selected={fGeo} onChange={setFGeo} placeholder={t.allGeoAreas} S={S} cl={t.clear}/></div>
        <div><div style={S.fl}>{t.dateType}</div><select style={S.sel} value={fDT} onChange={e=>setFDT(e.target.value)}><option value="checkin">{t.checkin}</option><option value="checkout">{t.checkout}</option><option value="booking">{t.bookingDate}</option></select></div>
        <div><div style={S.fl}>{t.from}</div><input type="date" style={S.inp} value={fDF} onChange={e=>setFDF(e.target.value)}/></div>
        <div><div style={S.fl}>{t.to}</div><input type="date" style={S.inp} value={fDTo} onChange={e=>setFDTo(e.target.value)}/></div>
        <div><div style={S.fl}>{t.monthModeLabel}</div><div style={{display:"flex",gap:3}}><button style={{...S.btn,...(monthMode==="stay"?S.ba:{})}} onClick={()=>setMonthMode("stay")}>{t.monthByStay}</button><button style={{...S.btn,...(monthMode==="booking"?S.ba:{})}} onClick={()=>setMonthMode("booking")}>{t.monthByBooking}</button></div></div>
        <button style={{...S.btn,color:"#ef4444",borderColor:"rgba(239,68,68,0.3)"}} onClick={()=>{setFR("All");setFC([]);setFS([]);setFP([]);setFDF("");setFDTo("");setMonthMode("stay");setFCancel("confirmed");setFHType("All");setFBrands([]);setFGeo([])}}>{t.reset}</button>
        <button style={{...S.btn,fontSize:16,padding:"4px 10px",marginLeft:"auto"}} onClick={()=>setFiltersOpen(false)} title="Minimize filters">−</button>
      </div>:<button onClick={()=>setFiltersOpen(true)} style={{position:"sticky",top:8,zIndex:50,marginLeft:"auto",display:"block",background:TH.filterBg,border:"1px solid "+TH.border,borderRadius:8,padding:"8px 14px",cursor:"pointer",color:TH.gold,fontSize:12,fontFamily:"'DM Sans',sans-serif",marginBottom:12,boxShadow:"0 4px 12px rgba(0,0,0,0.4)"}}>⚙ Filters</button>}
      {/* KPIs */}
      {agg&&<div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
        <div style={S.kpi}><div style={S.kl}>{t.reservations}</div><div style={S.kv}>{fmtN(agg.n)}</div></div>
        <div style={S.kpi}><div style={S.kl}>{t.totalRevenue}</div><div style={S.kv}>{fmtY(agg.totalRev)}</div></div>
        <div style={S.kpi}><div style={S.kl}>{t.avgRevRes}</div><div style={S.kv}>{fmtY(Math.round(agg.avgRev))}</div></div>
        <div style={S.kpi}><div style={S.kl}>{t.avgLOS}</div><div style={S.kv}>{agg.avgNights.toFixed(1)}{t.nu}</div></div>
        <div style={S.kpi}><div style={S.kl}>{t.avgLeadTime}</div><div style={S.kv}>{agg.avgLead.toFixed(0)}{t.du}</div></div>
        <div style={S.kpi}><div style={S.kl}>{t.intlPct}</div><div style={S.kv}>{agg.intlPct.toFixed(1)}%</div></div>
      </div>}
      {/* Tabs */}
      <div style={{display:"flex",gap:2,borderBottom:"1px solid "+TH.border,marginBottom:20,overflowX:"auto"}}>{TABS.map(tb=><button key={tb.id} onClick={()=>{setTab(tb.id);setTPage(0)}} style={{...S.btn,border:"none",borderBottom:"2px solid "+(tab===tb.id?TH.gold:"transparent"),color:tab===tb.id?TH.gold:TH.textMuted,borderRadius:0,padding:"8px 14px",whiteSpace:"nowrap"}}>{tb.l}</button>)}</div>

      {/* DAILY REPORT */}
      {tab==="daily"&&<div>
        <div style={{display:"flex",gap:16,alignItems:"flex-end",marginBottom:16,flexWrap:"wrap"}}>
          <div><div style={S.fl}>{t.drDate}</div><div style={{fontSize:9,color:TH.textMuted,fontStyle:"italic"}}>{t.drDisclaimer}</div></div>
          <div><div style={S.fl}>{t.drFrom}</div><input type="date" style={S.inp} value={drFrom} onChange={e=>setDrFrom(e.target.value)}/></div>
          <div><div style={S.fl}>{t.drTo}</div><input type="date" style={S.inp} value={drTo} onChange={e=>setDrTo(e.target.value)}/></div>
        </div>
        {dailyRpt&&!dailyRpt.empty?<>
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            <div style={S.kpi}><div style={S.kl}>{t.drCount}</div><div style={S.kv}>{fmtN(dailyRpt.totalCount)}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.drRevenue}</div><div style={S.kv}>{fmtY(dailyRpt.totalRev)}</div></div>
            <div style={S.kpi}><div style={S.kl}>{t.drADR}</div><div style={S.kv}>¥{fmtN(dailyRpt.totalADR)}</div></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={S.ct}>{t.drCountryTable}</div><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>expCSV(dailyRpt.countryRows.map(r=>({Country:r.country,Res:r.count,Revenue:r.rev,ADR:r.adr,Share:r.share})),["Country","Res","Revenue","ADR","Share"],"daily_country.csv")}>⬇ CSV</button></div>
              <div style={{overflowX:"auto"}}><table style={S.tbl}><thead><tr>
                {[t.drCountry,t.drCount,t.drRevenue,t.drADR,t.drShare].map(h=><th key={h} style={S.th}>{h}</th>)}
              </tr></thead><tbody>
                {dailyRpt.countryRows.map(r=><tr key={r.country}>
                  <td style={S.td}>{tl(r.country)}</td>
                  <td style={{...S.td,...S.m}}>{r.count}</td>
                  <td style={{...S.td,...S.m}}>{fmtN(r.rev)}</td>
                  <td style={{...S.td,...S.m}}>{fmtN(r.adr)}</td>
                  <td style={{...S.td,...S.m}}>{r.share}</td>
                </tr>)}
                <tr style={{fontWeight:700}}>
                  <td style={S.td}>{t.drGrandTotal}</td>
                  <td style={{...S.td,...S.m}}>{dailyRpt.totalCount}</td>
                  <td style={{...S.td,...S.m}}>{fmtN(dailyRpt.totalRev)}</td>
                  <td style={{...S.td,...S.m}}>{fmtN(dailyRpt.totalADR)}</td>
                  <td style={{...S.td,...S.m}}>100%</td>
                </tr>
              </tbody></table></div>
            </div>
            <div style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={S.ct}>{t.drRevYoY}</div><div style={{display:"flex",gap:4}}><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>dlChart("dr-rev-yoy","rev_yoy",t.drRevYoY)}>{t.exportImg}</button><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>dlTable(dailyRpt.yoyRev,t.drRevYoY,"rev_yoy",v=>(lang==="ja"&&HEADER_JP[v])?HEADER_JP[v]:tl(v))}>📋</button></div></div>
              <div id="dr-rev-yoy"><ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyRpt.yoyRev}>
                  <CartesianGrid {...gl}/>
                  <XAxis dataKey="country" tick={<TlTickV2/>} interval={0}/>
                  <YAxis tick={tk} tickFormatter={fmtY}/>
                  <Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/>
                  <Legend/>
                  <Bar dataKey="current" fill={dk?"#c8c3b8":"#1a1a2e"} name={dailyRpt.curLabel} radius={[4,4,0,0]}/>
                  <Bar dataKey="prev" fill={TH.gold} name={dailyRpt.prevLabel} radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer></div>
            </div>
            <div style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={S.ct}>{t.drRegionTable}</div><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>expCSV(dailyRpt.regionRows.map(r=>({Region:r.region,Res:r.count,Revenue:r.rev,ADR:r.adr,Share:r.share})),["Region","Res","Revenue","ADR","Share"],"daily_region.csv")}>⬇ CSV</button></div>
              <div style={{overflowX:"auto"}}><table style={S.tbl}><thead><tr>
                {[t.drRegion,t.drCount,t.drRevenue,t.drADR,t.drShare].map(h=><th key={h} style={S.th}>{h}</th>)}
              </tr></thead><tbody>
                {dailyRpt.regionRows.map(r=><tr key={r.region}>
                  <td style={S.td}>{r.region}</td>
                  <td style={{...S.td,...S.m}}>{r.count}</td>
                  <td style={{...S.td,...S.m}}>{fmtN(r.rev)}</td>
                  <td style={{...S.td,...S.m}}>{fmtN(r.adr)}</td>
                  <td style={{...S.td,...S.m}}>{r.share}</td>
                </tr>)}
                <tr style={{fontWeight:700}}>
                  <td style={S.td}>{t.drGrandTotal}</td>
                  <td style={{...S.td,...S.m}}>{dailyRpt.totalCount}</td>
                  <td style={{...S.td,...S.m}}>{fmtN(dailyRpt.totalRev)}</td>
                  <td style={{...S.td,...S.m}}>{fmtN(dailyRpt.totalADR)}</td>
                  <td style={{...S.td,...S.m}}>100%</td>
                </tr>
              </tbody></table></div>
            </div>
            <div style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={S.ct}>{t.drCountYoY}</div><div style={{display:"flex",gap:4}}><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>dlChart("dr-count-yoy","count_yoy",t.drCountYoY)}>{t.exportImg}</button><button style={{...S.btn,fontSize:9,padding:"3px 8px"}} onClick={()=>dlTable(dailyRpt.yoyCount,t.drCountYoY,"count_yoy",v=>(lang==="ja"&&HEADER_JP[v])?HEADER_JP[v]:tl(v))}>📋</button></div></div>
              <div id="dr-count-yoy"><ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyRpt.yoyCount}>
                  <CartesianGrid {...gl}/>
                  <XAxis dataKey="country" tick={<TlTickV2/>} interval={0}/>
                  <YAxis tick={tk}/>
                  <Tooltip content={<CT/>}/>
                  <Legend/>
                  <Bar dataKey="current" fill={dk?"#c8c3b8":"#1a1a2e"} name={dailyRpt.curLabel} radius={[4,4,0,0]}/>
                  <Bar dataKey="prev" fill={TH.gold} name={dailyRpt.prevLabel} radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer></div>
            </div>
          </div>
        </>:<div style={{textAlign:"center",padding:40,color:TH.textMuted}}>{t.drNoData}</div>}
      </div>}

      {!agg?<div style={{textAlign:"center",color:TH.textMuted,padding:40}}>{t.noData}</div>:<>

        {/* OVERVIEW */}
        {tab==="overview"&&<>{insights.overview&&<div style={{...S.insight,whiteSpace:"pre-line"}}>{insights.overview}</div>}<DraggableGrid {...dgProps("overview")}>
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
          {insights.kvk&&<div style={{...S.insight,whiteSpace:"pre-line"}}>{insights.kvk}</div>}
          <div style={{marginBottom:16}}><div style={{fontSize:18,fontWeight:600,color:TH.textStrong}}>{t.kvkTitle}</div><div style={{fontSize:12,color:TH.textMuted,marginTop:4}}>{t.kvkSub} — {t.kanto} {fmtN(kvk.kantoN)} / {t.kansai} {fmtN(kvk.kansaiN)}</div></div>

          {/* 1. SOURCE MARKETS */}
          <div style={G}>
            <CC title={`${t.kvkKantoMarkets}`} id="kk-mk-kt" nm="kanto_markets" h={Math.max(250,kvk.mkKanto.length*26)} data={kvk.mkKanto}><BarChart data={kvk.mkKanto} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={100} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#4ea8de" radius={[0,4,4,0]} name={t.reservations}/></BarChart></CC>
            <CC title={`${t.kvkKansaiMarkets}`} id="kk-mk-ks" nm="kansai_markets" h={Math.max(250,kvk.mkKansai.length*26)} data={kvk.mkKansai}><BarChart data={kvk.mkKansai} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={100} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#e07b54" radius={[0,4,4,0]} name={t.reservations}/></BarChart></CC>
          </div>
          <CC title={t.kvkMarketMonthly} id="kk-mk-mo" nm="market_monthly" h={300} data={kvk.mktMo}><BarChart data={kvk.mktMo}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/>{kvk.topC.map((c,i)=><Bar key={c} dataKey={c} stackId="a" fill={PALETTE[i%PALETTE.length]} name={tl(c)}/>)}</BarChart></CC>


          {/* 2. SEGMENTS */}
          <div style={G}>
            <CC title={t.kvkSegByRegion} id="kk-sg-rg" nm="seg_region" data={kvk.segReg}><BarChart data={kvk.segReg}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de" radius={[4,4,0,0]} name={t.kanto}/><Bar dataKey="Kansai" fill="#e07b54" radius={[4,4,0,0]} name={t.kansai}/></BarChart></CC>
          </div>

          {/* 3. LOS */}
          <div style={G}>
            <CC title={t.kvkLOSByCountry} id="kk-los-co" nm="los_country" h={Math.max(280,kvk.losC.length*26)} data={kvk.losC}><BarChart data={kvk.losC} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>v+" "+t.ns}/>}/><Bar dataKey="avg" fill="#4ea8de" radius={[0,4,4,0]} name={t.avgLOS}/></BarChart></CC>
            <CC title={t.kvkLOSBySegRegion} id="kk-los-sr" nm="los_seg_region" data={kvk.losSR}><BarChart data={kvk.losSR}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk}/><Tooltip content={<CT formatter={v=>v+" "+t.ns}/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de" radius={[4,4,0,0]} name={t.kanto}/><Bar dataKey="Kansai" fill="#e07b54" radius={[4,4,0,0]} name={t.kansai}/></BarChart></CC>
          </div>


          {/* 4. BOOKING */}
          <div style={G}>
            <CC title={`${t.kvkDOWCheckin}`} id="kk-dw-ci" nm="dow_checkin" h={300} data={kvk.dowCI}><RadarChart data={kvk.dowCI} cx="50%" cy="50%" outerRadius={100}><PolarGrid stroke={TH.gridLine}/><PolarAngleAxis dataKey="day" tick={{fill:TH.pieLabelFill,fontSize:11}}/><PolarRadiusAxis tick={false}/><Radar name={t.kanto} dataKey="Kanto" stroke="#4ea8de" fill="rgba(78,168,222,0.1)" dot={{r:3}}/><Radar name={`${t.kansai} (×${kvk.scale})`} dataKey="Kansai" stroke="#e07b54" fill="rgba(224,123,84,0.1)" dot={{r:3}}/><Legend/><Tooltip content={<CT/>}/></RadarChart></CC>
            <CC title={`${t.kvkDOWCheckout}`} id="kk-dw-co" nm="dow_checkout" h={300} data={kvk.dowCO}><RadarChart data={kvk.dowCO} cx="50%" cy="50%" outerRadius={100}><PolarGrid stroke={TH.gridLine}/><PolarAngleAxis dataKey="day" tick={{fill:TH.pieLabelFill,fontSize:11}}/><PolarRadiusAxis tick={false}/><Radar name={t.kanto} dataKey="Kanto" stroke="#4ea8de" fill="rgba(78,168,222,0.1)" dot={{r:3}}/><Radar name={`${t.kansai} (×${kvk.scale})`} dataKey="Kansai" stroke="#e07b54" fill="rgba(224,123,84,0.1)" dot={{r:3}}/><Legend/><Tooltip content={<CT/>}/></RadarChart></CC>
          </div>
          <CC title={t.kvkDeviceByRegion} id="kk-dev" nm="device_region" data={kvk.devR}><BarChart data={kvk.devR}><CartesianGrid {...gl}/><XAxis dataKey="device" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de" radius={[4,4,0,0]} name={t.kanto}/><Bar dataKey="Kansai" fill="#e07b54" radius={[4,4,0,0]} name={t.kansai}/></BarChart></CC>


          {/* 5. REVENUE */}
          <div style={G}>
            <CC title={t.kvkRevBySegRegion} id="kk-rev-sr" nm="rev_seg_region" data={kvk.revSR}><BarChart data={kvk.revSR}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de" radius={[4,4,0,0]} name={t.kanto}/><Bar dataKey="Kansai" fill="#e07b54" radius={[4,4,0,0]} name={t.kansai}/></BarChart></CC>
          </div>
          <CC title={t.kvkRevByCountry} id="kk-rev-co" nm="rev_country" h={Math.max(300,kvk.revC.length*26)} data={kvk.revC}><BarChart data={kvk.revC} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={fmtY}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="avgRev" fill="#c9a84c" radius={[0,4,4,0]} name={t.avgRevRes}/></BarChart></CC>


          {/* 6. ROOMS */}
          <div style={G}>
            <CC title={t.kvkRoomBySeg} id="kk-rm-sg" nm="room_seg" h={320} data={kvk.roomSeg}><BarChart data={kvk.roomSeg} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="segment" type="category" width={80} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT/>}/><Legend wrapperStyle={{fontSize:10}}/>{kvk.allRoomTypes.slice(0,10).map((rm,i)=><Bar key={rm} dataKey={rm} stackId="a" fill={PALETTE[i%PALETTE.length]} name={rm}/>)}</BarChart></CC>
            <CC title={t.kvkRoomByRegion} id="kk-rm-rg" nm="room_region" h={Math.max(280,kvk.roomReg.length*26)} data={kvk.roomReg}><BarChart data={kvk.roomReg} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="room" type="category" width={110} tick={tk} interval={0}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de" radius={[0,4,4,0]} name={t.kanto}/><Bar dataKey="Kansai" fill="#e07b54" radius={[0,4,4,0]} name={t.kansai}/></BarChart></CC>
          </div>


          {/* 7. MEMBERSHIP */}
          <div style={G}>
            <CC title={t.kvkRankByRegion} id="kk-rk-rg" nm="rank_region" data={kvk.rankReg}><BarChart data={kvk.rankReg}><CartesianGrid {...gl}/><XAxis dataKey="region" tick={<TlTick/>}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/>{RANK_ORDER.map((rk,i)=><Bar key={rk} dataKey={rk} stackId="a" fill={RANK_COLORS[i]} name={tl(rk)}/>)}</BarChart></CC>
            <CC title={t.kvkRankByCountry} id="kk-rk-co" nm="rank_country" h={Math.max(250,kvk.rankC.length*30)} data={kvk.rankC}><BarChart data={kvk.rankC} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={100} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT/>}/><Legend/>{RANK_ORDER.map((rk,i)=><Bar key={rk} dataKey={rk} stackId="a" fill={RANK_COLORS[i]} name={tl(rk)}/>)}</BarChart></CC>
          </div>

        </div>}

        {/* MARKETS */}
        {tab==="markets"&&<div>{insights.markets&&<div style={{...S.insight,whiteSpace:"pre-line"}}>{insights.markets}</div>}<DraggableGrid {...dgProps("markets")}>
          <div key="ch-mf"><CC grid title={t.allMarketsCount} id="ch-mf" nm="markets" h={Math.max(300,mktD.length*28)} data={mktD}><BarChart data={mktD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#4ea8de" radius={[0,4,4,0]} name={t.reservations}/></BarChart></CC></div>
          <div key="ch-mr"><CC grid title={t.avgRevByMarket} id="ch-mr" nm="markets_rev" h={Math.max(300,mktD.length*28)} data={mktD}><BarChart data={mktD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={fmtY}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="avgRev" fill="#c9a84c" radius={[0,4,4,0]} name={t.avgRevRes}/></BarChart></CC></div>
          <div key="ch-ml"><CC grid title={t.avgLOSByCountry} id="ch-ml" nm="mkt_los" h={Math.max(300,mktLOS.length*28)} data={mktLOS}><BarChart data={mktLOS} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>v+" "+t.ns}/>}/><Bar dataKey="avgLOS" fill="#c084fc" radius={[0,4,4,0]} name={t.avgLOS}/></BarChart></CC></div>
          <div key="ch-mld"><CC grid title={t.avgLeadByCountry} id="ch-mld" nm="mkt_lead" h={Math.max(300,mktLead.length*28)} data={mktLead}><BarChart data={mktLead} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>v+" "+t.ds}/>}/><Bar dataKey="avgLead" fill="#e07b54" radius={[0,4,4,0]} name={t.avgLeadTime}/></BarChart></CC></div>
          <div key="ch-msc">{kvk&&<CC grid title={t.segMixByCountry} id="ch-msc" nm="seg_mix_country" h={Math.max(300,kvk.segCountry.length*26)} data={kvk.segCountry}><BarChart data={kvk.segCountry} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" domain={[0,100]} tick={tks} tickFormatter={v=>v+"%"}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Legend/>{SEG_ORDER.map(s=><Bar key={s} dataKey={s} stackId="a" fill={SEG_COLORS[s]} name={tl(s)}/>)}</BarChart></CC>}</div>
        </DraggableGrid><div style={{...S.card,marginTop:14}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={S.ct}>{t.marketSummary}</div><button style={{...S.bg,fontSize:10}} onClick={expSum}>⬇ {t.exportCSV}</button></div><div style={{overflowX:"auto"}}><table style={S.tbl}><thead><tr>{[t.thCountry,t.reservations,t.thTotalRev,t.thAvgRev,t.thAvgLOS,t.thAvgLeadTime].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead><tbody>{mktD.map(d=><tr key={d.country}><td style={S.td}>{tl(d.country)}</td><td style={{...S.td,...S.m}}>{fmtN(d.count)}</td><td style={{...S.td,...S.m}}>{fmtY(agg.byC[d.country]?.rev||0)}</td><td style={{...S.td,...S.m}}>{fmtY(d.avgRev)}</td><td style={{...S.td,...S.m}}>{(avg(agg.byC[d.country]?.nights||[])).toFixed(1)}{t.ns}</td><td style={{...S.td,...S.m}}>{agg.byC[d.country]?.lead.length?(avg(agg.byC[d.country].lead)).toFixed(0)+t.ds:"—"}</td></tr>)}</tbody></table></div></div></div>}

        {/* SEGMENTS */}
        {tab==="segments"&&<>{insights.segments&&<div style={{...S.insight,whiteSpace:"pre-line"}}>{insights.segments}</div>}<DraggableGrid {...dgProps("segments")}>{[[t.segBreakdown,"count",t.reservations,"ch-sb"],[t.avgRevBySeg,"avgRev",t.avgRevRes,"ch-sr"],[t.avgLOSBySeg,"avgLOS",t.avgLOS,"ch-sl"],[t.avgLeadBySeg,"avgLead",t.avgLeadTime,"ch-slt"]].map(([ti,key,yL,id])=><div key={id}><CC grid title={ti} id={id} nm={id} data={segD}><BarChart data={segD}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk} tickFormatter={key==="avgRev"?fmtY:undefined}/><Tooltip content={<CT formatter={key==="avgRev"?v=>"¥"+v.toLocaleString():undefined}/>}/><Bar dataKey={key} name={yL} radius={[4,4,0,0]}>{segD.map((e,i)=><Cell key={i} fill={SEG_COLORS[e.segment]||PALETTE[i]}/>)}</Bar></BarChart></CC></div>)}
          <div key="sg-seg-mo">{kvk&&<CC grid title={t.kvkSegByMonth} id="sg-seg-mo" nm="seg_month" data={kvk.segMo}><BarChart data={kvk.segMo}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/>{SEG_ORDER.map((s,i)=><Bar key={s} dataKey={s} stackId="a" fill={SEG_COLORS[s]} name={tl(s)}/>)}</BarChart></CC>}</div>
          <div key="sg-seg-co">{kvk&&<CC grid title={t.kvkSegByCountry} id="sg-seg-co" nm="seg_country" h={Math.max(300,kvk.segCountry.length*26)} data={kvk.segCountry}><BarChart data={kvk.segCountry} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" domain={[0,100]} tick={tks} tickFormatter={v=>v+"%"}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Legend/>{SEG_ORDER.map(s=><Bar key={s} dataKey={s} stackId="a" fill={SEG_COLORS[s]} name={tl(s)}/>)}</BarChart></CC>}</div>
          <div key="sg-ld-sg">{kvk&&<CC grid title={t.kvkLeadBySeg} id="sg-ld-sg" nm="lead_seg" data={kvk.leadSeg}><BarChart data={kvk.leadSeg}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk}/><Tooltip content={<CT formatter={v=>v+" "+t.ds}/>}/><Legend/><Bar dataKey="avg" fill="#4ea8de" radius={[4,4,0,0]} name={t.avg}/><Bar dataKey="median" fill="rgba(78,168,222,0.4)" radius={[4,4,0,0]} name={t.median}/></BarChart></CC>}</div>
          <div key="sg-ld-mo">{kvk&&<CC grid title={t.kvkLeadByMonth} id="sg-ld-mo" nm="lead_month" data={kvk.leadMo}><BarChart data={kvk.leadMo}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT formatter={v=>v+" "+t.ds}/>}/><Legend/><Bar dataKey="avg" fill="#c9a84c" radius={[4,4,0,0]} name={t.avg}/><Bar dataKey="median" fill="rgba(201,168,76,0.4)" radius={[4,4,0,0]} name={t.median}/></BarChart></CC>}</div>
          <div key="sg-adr">{kvk&&<CC grid title={t.kvkADRBySeg} id="sg-adr" nm="adr_seg" data={kvk.adrSeg}><BarChart data={kvk.adrSeg}><CartesianGrid {...gl}/><XAxis dataKey="segment" tick={<TlTick/>}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="adr" radius={[4,4,0,0]} name="ADR">{kvk.adrSeg.map((e,i)=><Cell key={i} fill={SEG_COLORS[e.segment]||PALETTE[i]}/>)}</Bar></BarChart></CC>}</div>

        </DraggableGrid></>}

        {/* BOOKING */}
        {tab==="booking"&&<>{insights.booking&&<div style={{...S.insight,whiteSpace:"pre-line"}}>{insights.booking}</div>}<DraggableGrid {...dgProps("booking")}>
          <div key="ch-bd"><CC grid title={t.ciCoDOW} id="ch-bd" nm="dow" h={300} data={dowD}><BarChart data={dowD}><CartesianGrid {...gl}/><XAxis dataKey="day" tick={tk}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="checkin" fill="#4ea8de" radius={[4,4,0,0]} name={t.checkInLabel}/><Bar dataKey="checkout" fill="#e07b54" radius={[4,4,0,0]} name={t.checkOutLabel}/></BarChart></CC></div>
          <div key="ch-bt"><CC grid title={t.monthlyTrend} id="ch-bt" nm="trend" h={300} data={moD}><LineChart data={moD}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk}/><YAxis yAxisId="r" orientation="right" tick={tks} tickFormatter={fmtY}/><Tooltip content={<CT/>}/><Legend/><Line type="monotone" dataKey="count" stroke="#c9a84c" strokeWidth={2} dot={{fill:"#c9a84c",r:4}} name={t.reservations}/><Line type="monotone" dataKey="avgRev" stroke="#4ea8de" strokeWidth={2} dot={{fill:"#4ea8de",r:4}} name={t.avgRevRes} yAxisId="r"/></LineChart></CC></div>
          <div key="ch-bv"><CC grid title={t.bookingDevice} id="ch-bv" nm="device" data={(()=>{const m={};filtered.forEach(r=>{const d=r.device==="スマートフォン"?t.smartphone:r.device==="パソコン"?t.pc:r.device==="タブレット"?t.tablet:"Other";m[d]=(m[d]||0)+1});return Object.entries(m).map(([name,value])=>({name,value}))})()}>{(()=>{const m={};filtered.forEach(r=>{const d=r.device==="スマートフォン"?t.smartphone:r.device==="パソコン"?t.pc:r.device==="タブレット"?t.tablet:"Other";m[d]=(m[d]||0)+1});const dd=Object.entries(m).map(([name,value])=>({name,value}));return(<PieChart><Pie data={dd} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="65%" label={({name,percent,cx,cy,midAngle,outerRadius:r})=>{const x=cx+Math.cos(-midAngle*Math.PI/180)*(r+14);const y=cy+Math.sin(-midAngle*Math.PI/180)*(r+14);return<text x={x} y={y} textAnchor={x>cx?"start":"end"} fill={TH.pieLabelFill} fontSize={10}>{`${name} ${(percent*100).toFixed(0)}%`}</text>}} labelLine={{stroke:"#a0977f"}}>{dd.map((_,i)=><Cell key={i} fill={PALETTE[i]}/>)}</Pie><Tooltip content={<CT/>}/></PieChart>)})()}</CC></div>
        </DraggableGrid></>}

        {/* REVENUE */}
        {tab==="revenue"&&<>{insights.revenue&&<div style={{...S.insight,whiteSpace:"pre-line"}}>{insights.revenue}</div>}<DraggableGrid {...dgProps("revenue")}>
          <div key="ch-rm"><CC grid title={t.revByMarket} id="ch-rm" nm="rev_mkt" h={Math.max(300,mktD.length*28)} data={mktD}><BarChart data={mktD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={fmtY}/><YAxis dataKey="country" type="category" width={120} tick={<TlTickV/>} interval={0}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="avgRev" fill="#c9a84c" radius={[0,4,4,0]} name={t.avgRevRes}/></BarChart></CC></div>
          <div key="ch-rv"><CC grid title={t.monthlyRev} id="ch-rv" nm="monthly_rev" h={300} data={moD}><BarChart data={moD}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="rev" fill="#34d399" radius={[4,4,0,0]} name={t.totalRevenue}/></BarChart></CC></div>
          <div key="ch-rmm"><CC grid title={t.revByMarketMonth} id="ch-rmm" nm="rev_mkt_month" h={300} data={revMktMo.data}><BarChart data={revMktMo.data}><CartesianGrid {...gl}/><XAxis dataKey="month" tick={tk}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Legend wrapperStyle={{fontSize:10}}/>{revMktMo.countries.map((c,i)=><Bar key={c} dataKey={c} stackId="a" fill={PALETTE[i%PALETTE.length]} name={tl(c)}/>)}</BarChart></CC></div>
          <div key="ch-drev"><CC grid title={t.dailyRev} id="ch-drev" nm="daily_rev" data={dailyD}><BarChart data={dailyD}><CartesianGrid {...gl}/><XAxis dataKey="date" tick={tks}/><YAxis tick={tk} tickFormatter={fmtY}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="rev" fill="#34d399" radius={[4,4,0,0]} name={t.totalRevenue}/></BarChart></CC></div>
        </DraggableGrid></>}

        {/* ROOMS */}
        {tab==="rooms"&&<>{insights.rooms&&<div style={{...S.insight,whiteSpace:"pre-line"}}>{insights.rooms}</div>}<DraggableGrid {...dgProps("rooms")}>
          <div key="ch-rt"><CC grid title={t.roomTypeDist} id="ch-rt" nm="rooms" h={Math.max(280,rmD.length*26)} data={rmD}><BarChart data={rmD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="room" type="category" width={120} tick={tk} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="count" fill="#c084fc" radius={[0,4,4,0]} name={t.reservations}/></BarChart></CC></div>
        </DraggableGrid>
          <div style={S.card}><div style={S.ct}>{t.roomTypeTable}</div><table style={S.tbl}><thead><tr><th style={S.th}>{t.thRoom}</th><th style={S.th}>{t.thCount}</th><th style={S.th}>{t.thShare}</th></tr></thead><tbody>{rmD.map(d=><tr key={d.room}><td style={S.td}>{d.room}</td><td style={{...S.td,...S.m}}>{fmtN(d.count)}</td><td style={{...S.td,...S.m}}>{pct(d.count,agg.n)}</td></tr>)}</tbody></table></div>
        </>}

        {/* FACILITIES */}
        {tab==="facilities"&&<div>{insights.facilities&&<div style={{...S.insight,whiteSpace:"pre-line"}}>{insights.facilities}</div>}
          <DraggableGrid {...dgProps("facilities")}>
            <div key="fac-res"><CC grid title={t.facResByFacility} id="fac-res" nm="fac_res" h={Math.max(300,facD.length*22)} data={facD}><BarChart data={facD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/><Tooltip content={<CT/>}/><Bar dataKey="n" fill="#4ea8de" radius={[0,4,4,0]} name={t.reservations}/></BarChart></CC></div>
            <div key="fac-rev"><CC grid title={t.facAvgRevByFacility} id="fac-rev" nm="fac_rev" h={Math.max(300,facD.length*22)} data={facD}><BarChart data={facD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={fmtY}/><YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/><Tooltip content={<CT formatter={v=>"¥"+v.toLocaleString()}/>}/><Bar dataKey="avgRev" fill="#c9a84c" radius={[0,4,4,0]} name={t.avgRevRes}/></BarChart></CC></div>
            <div key="fac-intl"><CC grid title={t.facIntlByFacility} id="fac-intl" nm="fac_intl" h={Math.max(300,facD.length*22)} data={facD}><BarChart data={facD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks} tickFormatter={v=>v+"%"}/><YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/><Tooltip content={<CT formatter={v=>v+"%"}/>}/><Bar dataKey="intlPct" fill="#e07b54" radius={[0,4,4,0]} name={t.intlPct}/></BarChart></CC></div>
            <div key="fac-los"><CC grid title={t.facLOSByFacility} id="fac-los" nm="fac_los" h={Math.max(300,facD.length*22)} data={facD}><BarChart data={facD} layout="vertical"><CartesianGrid {...gl}/><XAxis type="number" tick={tks}/><YAxis dataKey="name" type="category" width={160} tick={tk} interval={0}/><Tooltip content={<CT formatter={v=>v+" "+t.ns}/>}/><Bar dataKey="avgLOS" fill="#c084fc" radius={[0,4,4,0]} name={t.avgLOS}/></BarChart></CC></div>
            <div key="fac-kvk"><CC grid title={t.facKvKCompare} id="fac-kvk" nm="fac_kvk" data={kvkFac}><BarChart data={kvkFac}><CartesianGrid {...gl}/><XAxis dataKey="metric" tick={tks}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="Kanto" fill="#4ea8de" radius={[4,4,0,0]} name={tl("Kanto")}/><Bar dataKey="Kansai" fill="#e07b54" radius={[4,4,0,0]} name={tl("Kansai")}/></BarChart></CC></div>
            <div key="fac-hva"><CC grid title={t.facHvACompare} id="fac-hva" nm="fac_hva" data={hvaFac}><BarChart data={hvaFac}><CartesianGrid {...gl}/><XAxis dataKey="metric" tick={tks}/><YAxis tick={tk}/><Tooltip content={<CT/>}/><Legend/><Bar dataKey="Hotel" fill="#4ea8de" radius={[4,4,0,0]} name={tl("Hotel")}/><Bar dataKey="Apart" fill="#c9a84c" radius={[4,4,0,0]} name={tl("Apart")}/></BarChart></CC></div>
          </DraggableGrid>
          <div style={S.card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={S.ct}>{t.facilityPerf}</div><button style={{...S.bg,fontSize:10}} onClick={()=>{expCSV(facD.map(f=>({Facility:f.fullName,Region:f.region,Res:f.n,AvgRev:f.avgRev,"Intl%":f.intlPct,AvgLOS:f.avgLOS,TopSeg:f.topSeg})),["Facility","Region","Res","AvgRev","Intl%","AvgLOS","TopSeg"],"facilities.csv")}}>⬇ {t.exportCSV}</button></div><div style={{overflowX:"auto"}}><table style={S.tbl}><thead><tr>{[t.thFacility,t.thRegion,t.reservations,t.thAvgRev,t.thIntlPct,t.thAvgLOS,t.thTopSeg].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead><tbody>{facD.map(f=><tr key={f.fullName}><td style={{...S.td,maxWidth:260,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={f.fullName}>{f.fullName}</td><td style={S.td}><span style={S.tag(f.region==="Kanto"?"#4ea8de":"#e07b54")}>{tl(f.region)}</span></td><td style={{...S.td,...S.m}}>{fmtN(f.n)}</td><td style={{...S.td,...S.m}}>{fmtY(f.avgRev)}</td><td style={{...S.td,...S.m,color:f.intlPct>50?"#c9a84c":"#c8c3b8"}}>{f.intlPct}%</td><td style={{...S.td,...S.m}}>{f.avgLOS}{t.nu}</td><td style={S.td}><span style={S.tag(SEG_COLORS[f.topSeg]||"#64748b")}>{tl(f.topSeg)}</span></td></tr>)}</tbody></table></div></div></div>}

        {/* RAW DATA */}
        {tab==="data"&&<div style={S.card}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={S.ct}>{t.rowsFiltered(fmtN(filtered.length))}</div><button style={S.bg} onClick={expFilt}>⬇ {t.exportFiltered}</button></div><div style={{overflowX:"auto"}}><table style={S.tbl}><thead><tr>{tH.map((h,i)=><th key={h} style={S.th} onClick={()=>{setTSort(p=>({col:tC[i],asc:p.col===tC[i]?!p.asc:true}));setTPage(0)}}>{h} {tSort.col===tC[i]?(tSort.asc?"↑":"↓"):""}</th>)}</tr></thead><tbody>{paged.map((r,ri)=><tr key={ri}>{tC.map((c,ci)=><td key={ci} style={{...S.td,...(["nights","leadTime","totalRev","partySize"].includes(c)?{...S.m,textAlign:"right"}:{}),maxWidth:c==="facility"?180:undefined,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c==="totalRev"&&r[c]?"¥"+Number(r[c]).toLocaleString():c==="region"?<span style={S.tag(r[c]==="Kanto"?"#4ea8de":"#e07b54")}>{tl(r[c])}</span>:c==="isCancelled"?<span style={S.tag(r[c]?"#ef4444":"#34d399")}>{r[c]?t.statusCancelled:t.statusConfirmed}</span>:["segment","hotelType"].includes(c)?tl(String(r[c]??"")):String(r[c]??"")}</td>)}</tr>)}</tbody></table></div>{totPg>1&&<div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:8,marginTop:12}}><button style={S.btn} onClick={()=>setTPage(p=>Math.max(0,p-1))} disabled={tPage===0}>{t.prev}</button><span style={{fontSize:12,color:"#a0977f"}}>{t.pageOf(tPage+1,totPg)}</span><button style={S.btn} onClick={()=>setTPage(p=>Math.min(totPg-1,p+1))} disabled={tPage>=totPg-1}>{t.next}</button></div>}</div>}
      </>}
    </div></div>
  );
}
