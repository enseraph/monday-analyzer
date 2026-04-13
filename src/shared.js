// Shared helpers used by both App.jsx and tlWorker.js
// Any changes here must be verified in both consumers.

export const KANSAI_KW=["京都丸太町","京都烏丸二条","京都駅","京都駅鴨川","京都五条","大阪難波"];
export const DOW_FULL=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
export const DOW_SHORT=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
export const TL_REQUIRED_COLS=["date","facility","facility_group","status","channel_code","channel_name","channel_bucket","booking_id","email","checkin","checkout","nights","rooms","guests","adults_male","adults_female","children","plan_name","plan_code","revenue","revenue_other"];

export function getRegion(f){return KANSAI_KW.some(k=>f.includes(k))?"Kansai":"Kanto"}
export function getBrand(f){if(f.includes("イチホテル"))return"ICHI";if(f.includes("GRAND"))return"GRAND MONday";if(f.includes("TABI"))return"TABI";if(f.includes("Apart"))return"MONday Apart";return"hotel MONday"}
export function getSegment(a,k){const t=a+k;if(k>0)return"Family";if(t===1)return"Solo";if(t===2)return"Couple";if(t>=3)return"Group";return"Unknown"}
export function getSegmentDetailed(male,female,kids){
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

export function parseTLRow(row,hIdx){
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

export function applyTLSameDayCancel(rows){
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

// Formatting helper used by compare reports — stateless, no closure deps
export function pctChg(cur,prev){return prev>0?((cur-prev)/prev*100).toFixed(1)+"%":(cur>0?"new":"0%")}
