"use client";
import { LoaderCircle, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AirportOption, AirportSearchResult } from "../../lib/airlabs-airports";

export type SourceState="idle"|"loading"|"live"|"error";
type Props={id:string;label:string;value:string;onChange:(value:string,iata:string)=>void;onSourceChange:(state:SourceState)=>void};

export default function AirportField({id,label,value,onChange,onSourceChange}:Props){
 const[options,setOptions]=useState<AirportOption[]>([]),[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[resolved,setResolved]=useState(false),[error,setError]=useState("");
 const requestId=useRef(0),cacheRef=useRef(new Map<string,AirportOption[]>()),listId=`${id}-airport-options`;
 useEffect(()=>{
  if(!open)return;
  const keyword=value.replace(/\s*\([A-Z]{3}\).*$/i,"").trim().slice(0,30),cacheKey=keyword.toLocaleLowerCase("es");
  if(keyword.length<3){setOptions([]);setResolved(false);setError("");return}
  const cached=cacheRef.current.get(cacheKey);if(cached){setOptions(cached);setResolved(true);setError("");onSourceChange("live");return}
  const controller=new AbortController(),current=++requestId.current,timer=window.setTimeout(()=>{
   setLoading(true);setError("");onSourceChange("loading");
   fetch(`/api/airports?q=${encodeURIComponent(keyword)}`,{signal:controller.signal,cache:"no-store"})
    .then(async response=>{const payload=await response.json() as AirportSearchResult;if(!response.ok)throw new Error(payload.message||`La búsqueda de aeropuertos respondió HTTP ${response.status}`);return payload})
    .then(payload=>{if(requestId.current!==current)return;const next=Array.isArray(payload.airports)?payload.airports:[];if(next.length)cacheRef.current.set(cacheKey,next);setOptions(next);setResolved(true);setError("");onSourceChange("live")})
    .catch(reason=>{if(reason instanceof DOMException&&reason.name==="AbortError")return;if(requestId.current!==current)return;setOptions([]);setResolved(true);setError(reason instanceof Error?reason.message:"La búsqueda de aeropuertos no respondió.");onSourceChange("error")})
    .finally(()=>{if(requestId.current===current)setLoading(false)})
  },650);
  return()=>{window.clearTimeout(timer);controller.abort()}
 },[open,value,onSourceChange]);
 const choose=(airport:AirportOption)=>{onChange(`${airport.cityName} (${airport.iataCode})`,airport.iataCode);setOptions([]);setOpen(false);setError("")};
 return <div className="search-field location airport-field"><label htmlFor={id}><span>{label}</span><div><MapPin aria-hidden="true"/><input id={id} role="combobox" aria-autocomplete="list" aria-controls={listId} aria-expanded={open} autoComplete="off" value={value} onFocus={()=>setOpen(true)} onBlur={()=>window.setTimeout(()=>setOpen(false),160)} onChange={event=>{requestId.current+=1;onChange(event.target.value,"");setOptions([]);setResolved(false);setError("");setOpen(true)}} onKeyDown={event=>{if(event.key==="Escape")setOpen(false);if(event.key==="Enter"&&options[0]){event.preventDefault();choose(options[0])}}}/>{loading?<LoaderCircle className="field-loader" aria-label="Buscando aeropuertos"/>:null}</div></label>{open&&(loading||resolved||options.length>0||error)?<div className="airport-dropdown" id={listId} role="listbox">{options.map(airport=><button key={airport.id} role="option" aria-selected="false" type="button" onMouseDown={event=>event.preventDefault()} onClick={()=>choose(airport)}><span className="airport-code">{airport.iataCode}</span><span><strong>{airport.cityName}</strong><small>{airport.name}{airport.countryName?` · ${airport.countryName}`:""}</small></span></button>)}{loading&&options.length===0?<p>Buscando aeropuertos…</p>:null}{!loading&&resolved&&options.length===0?<p role={error?"alert":undefined}>{error||"No encontramos aeropuertos para esa búsqueda."}</p>:null}</div>:null}</div>
}
