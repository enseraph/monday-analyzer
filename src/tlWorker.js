// TL parse worker — runs Papa.parse + parseTLRow + applyTLSameDayCancel off the main thread.
// This eliminates the 2-4 second main-thread freeze on cold load with 180k+ TL rows.
//
// Contract:
//   postMessage({type:"parse", jobs:[{yr, text}, ...]})
//   → worker responds postMessage({type:"result", rows:[...], perYear:{yr:count,...}, errors:[...]})
//   OR postMessage({type:"error", message})
//
// Shared helpers imported from shared.js — single source of truth for both App.jsx and this worker.

import * as Papa from "papaparse";
import { TL_REQUIRED_COLS, parseTLRow, applyTLSameDayCancel } from "./shared.js";

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
    for(let j=0;j<jobs.length;j++){
      const yr=jobs[j].yr;
      const{rows,error}=parseYearText(jobs[j].text,yr);
      jobs[j].text=null; // release raw CSV string after parsing
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
