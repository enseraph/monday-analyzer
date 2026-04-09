// TL parse worker — runs Papa.parse + parseTLRow + applyTLSameDayCancel off the main thread.
// This eliminates the 2-4 second main-thread freeze on cold load with 180k+ TL rows.
//
// Contract:
//   postMessage({type:"parse", jobs:[{yr, text}, ...]})
//   → worker responds postMessage({type:"result", rows:[...], perYear:{yr:count,...}, errors:[...]})
//   OR postMessage({type:"error", message})
//
// All helpers below must remain self-contained — the worker context has no access to App.jsx.

import * as Papa from "papaparse";

// ─── Shared helpers duplicated from App.jsx (must stay in sync) ───
const KANSAI_KW=["京都丸太町","京都烏丸二条","京都駅","京都駅鴨川","京都五条","大阪難波"];
const DOW_FULL=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
function getRegion(f){return KANSAI_KW.some(k=>f.includes(k))?"Kansai":"Kanto"}
function getBrand(f){if(f.includes("イチホテル"))return"ICHI";if(f.includes("GRAND"))return"GRAND MONday";if(f.includes("TABI"))return"TABI";if(f.includes("Apart"))return"MONday Apart";return"hotel MONday"}
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
    if(male===2)return"Duo (Male)";
    if(female===2)return"Duo (Female)";
  }
  if(adults>=3){
    if(male===adults)return"Group (All Male)";
    if(female===adults)return"Group (All Female)";
    return"Group (Mixed)";
  }
  return"Unknown";
}

const TL_REQUIRED_COLS=["date","facility","facility_group","status","channel_code","channel_name","channel_bucket","booking_id","email","checkin","checkout","nights","rooms","guests","adults_male","adults_female","children","plan_name","plan_code","revenue","revenue_other"];

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
  let leadTime=null;
  if(checkin){const c2=new Date(checkin);c2.setHours(0,0,0,0);const b=new Date(dt);b.setHours(0,0,0,0);leadTime=Math.max(0,Math.round((c2-b)/864e5))}
  return{
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
    region:getRegion(facility),
    hotelType:(row[hIdx.facility_group]||"")==="hotel"?"Hotel":"Apart",
    brand:getBrand(facility),
    segment:getSegment(adults,children),
    segmentDetailed:getSegmentDetailed(adults_male,adults_female,children),
    leadTime,
    checkinDow:checkin?DOW_FULL[(checkin.getDay()+6)%7]:null,
    checkoutDow:checkout?DOW_FULL[(checkout.getDay()+6)%7]:null,
    bookingDate:dt,
    partySize:adults+children,
    adults,
    kids:children,
    male:adults_male,
    female:adults_female,
    totalRev,
    isCancelled:status==="取消",
    isModified:status==="変更",
    sameDayCancelled:false,
    country:null,
  };
}

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

function parseYearText(text,yr){
  try{
    const res=Papa.parse(text,{header:false,skipEmptyLines:true});
    if(!res.data||res.data.length<2)return{rows:[],error:`[TL ${yr}] empty CSV`};
    const h=res.data[0];
    const miss=TL_REQUIRED_COLS.filter(c=>!h.includes(c));
    if(miss.length)return{rows:[],error:`[TL ${yr}] missing cols: ${miss.join(",")}`};
    const hIdx={};h.forEach((c,i)=>{hIdx[c]=i});
    const rows=[];
    for(let i=1;i<res.data.length;i++){
      try{const row=parseTLRow(res.data[i],hIdx);if(row)rows.push(row)}
      catch(e){/* skip bad rows silently; main thread has no way to display per-row errors anyway */}
    }
    return{rows,error:null};
  }catch(e){return{rows:[],error:`[TL ${yr}] parse failed: ${e.message}`}}
}

self.onmessage=(ev)=>{
  const{type,jobs}=ev.data||{};
  if(type!=="parse"||!Array.isArray(jobs)){
    self.postMessage({type:"error",message:"invalid worker message"});
    return;
  }
  try{
    const allRows=[];
    const perYear={};
    const errors=[];
    for(const{yr,text}of jobs){
      const{rows,error}=parseYearText(text,yr);
      if(error)errors.push(error);
      perYear[yr]=rows.length;
      for(let i=0;i<rows.length;i++)allRows.push(rows[i]);
    }
    applyTLSameDayCancel(allRows);
    self.postMessage({type:"result",rows:allRows,perYear,errors});
  }catch(e){
    self.postMessage({type:"error",message:e.message||String(e)});
  }
};
