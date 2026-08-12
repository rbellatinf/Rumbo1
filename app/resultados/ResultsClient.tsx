"use client";

import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Filter,
  Heart,
  LoaderCircle,
  MapPin,
  Package,
  Plane,
  Search,
  SlidersHorizontal,
  Star,
  Users,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { TravelPackage } from "../../lib/travel-packages";
import styles from "./results.module.css";

type SortMode="recommended"|"price-asc"|"price-desc"|"rating-desc";
type DurationFilter="all"|"short"|"medium"|"long";
type ConfirmationFilter="all"|"confirmed"|"minimum";

function numberPrice(item:TravelPackage){
  if(typeof item.priceAmount==="number"&&Number.isFinite(item.priceAmount))return item.priceAmount;
  const raw=String(item.price||"").replace(/[^0-9.,]/g,"");
  if(!raw)return null;
  const normalized=raw.includes(",")&&raw.includes(".")?raw.replace(/,/g,""):raw.replace(/,/g,"");
  const value=Number(normalized);
  return Number.isFinite(value)?value:null;
}
function numericRating(item:TravelPackage){
  const value=Number.parseFloat(String(item.rating||""));
  return Number.isFinite(value)&&value>=0&&value<=10?value:null;
}
function nights(item:TravelPackage){
  if(item.departureDate&&item.returnDate){
    const value=Math.round((Date.parse(item.returnDate)-Date.parse(item.departureDate))/86_400_000);
    if(Number.isFinite(value)&&value>0)return value;
  }
  const nightMatch=item.duration.match(/(\d+)\s*noches?/i);if(nightMatch)return Number(nightMatch[1]);
  const dayMatch=item.duration.match(/(\d+)\s*d[ií]as?/i);if(dayMatch)return Math.max(1,Number(dayMatch[1])-1);
  return null;
}
function providerLabel(item:TravelPackage){
  if(item.providerReference?.startsWith("rumbo:"))return "Rumbo";
  return item.provider||"Rumbo";
}
function dateLabel(value?:string){
  if(!value)return "Fecha flexible";
  try{return new Intl.DateTimeFormat("es-PE",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(`${value}T12:00:00`))}catch{return value}
}
function confirmationKind(item:TravelPackage){
  const text=`${item.rating} ${item.tag}`.toLowerCase();
  if(text.includes("mínim")||text.includes("minim"))return "minimum";
  if(text.includes("confirmad"))return "confirmed";
  return "other";
}
function formatRange(value:number,currency:string){
  try{return new Intl.NumberFormat("es-PE",{style:"currency",currency,maximumFractionDigits:0}).format(value)}catch{return `${currency} ${Math.round(value)}`}
}

export default function ResultsClient(){
  const searchParams=useSearchParams();
  const queryKey=searchParams.toString();
  const type=searchParams.get("type")||"packages";
  const origin=searchParams.get("origin")||"";
  const originName=searchParams.get("originName")||origin;
  const destination=searchParams.get("destination")||"";
  const destinationName=searchParams.get("destinationName")||destination;
  const departureDate=searchParams.get("departureDate")||"";
  const returnDate=searchParams.get("returnDate")||"";
  const adults=Math.max(1,Number(searchParams.get("adults")||2));
  const children=Math.max(0,Number(searchParams.get("children")||0));
  const travellerCount=adults+children;

  const [items,setItems]=useState<TravelPackage[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [mode,setMode]=useState<"demo"|"live">("demo");
  const [text,setText]=useState("");
  const [sort,setSort]=useState<SortMode>("recommended");
  const [bookableOnly,setBookableOnly]=useState(false);
  const [lowStockOnly,setLowStockOnly]=useState(false);
  const [durationFilter,setDurationFilter]=useState<DurationFilter>("all");
  const [confirmation,setConfirmation]=useState<ConfirmationFilter>("all");
  const [ratingMin,setRatingMin]=useState(0);
  const [providers,setProviders]=useState<Set<string>>(new Set());
  const [benefits,setBenefits]=useState<Set<string>>(new Set());
  const [priceBounds,setPriceBounds]=useState<[number,number]>([0,0]);
  const [priceRange,setPriceRange]=useState<[number,number]>([0,0]);
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [selected,setSelected]=useState<TravelPackage|null>(null);

  useEffect(()=>{
    let cancelled=false;
    setLoading(true);setError("");setMessage("");setItems([]);
    if(type!=="packages"){
      setLoading(false);setError("Esta pantalla ya está preparada, pero la búsqueda en vivo está habilitada primero para Paquetes.");
      return()=>{cancelled=true};
    }
    if(!origin||!destination||!departureDate||!returnDate){
      setLoading(false);setError("Faltan datos de la búsqueda. Vuelve al inicio y completa origen, destino y fechas.");
      return()=>{cancelled=true};
    }
    const params=new URLSearchParams({origin,destination,destinationName,departureDate,returnDate,adults:String(adults)});
    fetch(`/api/packages?${params.toString()}`,{cache:"no-store"})
      .then(async response=>{
        const payload=await response.json() as {mode?:"demo"|"live";packages?:TravelPackage[];message?:string};
        if(!response.ok)throw new Error(payload.message||"No pudimos completar la búsqueda.");
        return payload;
      })
      .then(payload=>{
        if(cancelled)return;
        const packages=Array.isArray(payload.packages)?payload.packages:[];
        setItems(packages);setMode(payload.mode||"demo");setMessage(payload.message||"");
        const values=packages.map(numberPrice).filter((v):v is number=>typeof v==="number"&&v>=0);
        if(values.length){const low=Math.floor(Math.min(...values));const high=Math.ceil(Math.max(...values));setPriceBounds([low,high]);setPriceRange([low,high])}else{setPriceBounds([0,0]);setPriceRange([0,0])}
        setProviders(new Set());setBenefits(new Set());setDurationFilter("all");setConfirmation("all");setRatingMin(0);setBookableOnly(false);setLowStockOnly(false);setText("");setSort("recommended");
      })
      .catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:"No pudimos completar la búsqueda.")})
      .finally(()=>{if(!cancelled)setLoading(false)});
    return()=>{cancelled=true};
  },[queryKey,type,origin,destination,destinationName,departureDate,returnDate,adults]);

  const providerOptions=useMemo(()=>Array.from(new Set(items.map(providerLabel))).sort(),[items]);
  const benefitOptions=useMemo(()=>Array.from(new Set(items.flatMap(item=>item.included||[]).filter(Boolean))).slice(0,10),[items]);
  const ratings=useMemo(()=>items.map(numericRating).filter((value):value is number=>typeof value==="number"),[items]);
  const currencies=useMemo(()=>Array.from(new Set(items.map(item=>item.currency).filter((v):v is string=>Boolean(v)))),[items]);
  const currency=currencies[0]||"USD";
  const priceEnabled=priceBounds[1]>0&&currencies.length<=1;

  const filtered=useMemo(()=>{
    const q=text.trim().toLowerCase();
    const rows=items.filter(item=>{
      if(q&&![item.destination,item.country,item.tag,...(item.included||[])].some(value=>String(value||"").toLowerCase().includes(q)))return false;
      if(providers.size&&!providers.has(providerLabel(item)))return false;
      if(bookableOnly&&!item.bookable)return false;
      if(lowStockOnly&&!item.lowStock)return false;
      const itemNights=nights(item);
      if(durationFilter==="short"&&(itemNights==null||itemNights>4))return false;
      if(durationFilter==="medium"&&(itemNights==null||itemNights<5||itemNights>7))return false;
      if(durationFilter==="long"&&(itemNights==null||itemNights<8))return false;
      const kind=confirmationKind(item);
      if(confirmation!=="all"&&kind!==confirmation)return false;
      if(ratingMin>0){const rating=numericRating(item);if(rating==null||rating<ratingMin)return false}
      if(benefits.size&&!Array.from(benefits).every(benefit=>(item.included||[]).includes(benefit)))return false;
      if(priceEnabled){const value=numberPrice(item);if(value==null||value<priceRange[0]||value>priceRange[1])return false}
      return true;
    });
    return [...rows].sort((a,b)=>{
      if(sort==="price-asc")return (numberPrice(a)??Number.MAX_SAFE_INTEGER)-(numberPrice(b)??Number.MAX_SAFE_INTEGER);
      if(sort==="price-desc")return (numberPrice(b)??-1)-(numberPrice(a)??-1);
      if(sort==="rating-desc")return (numericRating(b)??-1)-(numericRating(a)??-1);
      return 0;
    });
  },[items,text,providers,bookableOnly,lowStockOnly,durationFilter,confirmation,ratingMin,benefits,priceEnabled,priceRange,sort]);

  const activeFilterCount=(providers.size?1:0)+(benefits.size?1:0)+(bookableOnly?1:0)+(lowStockOnly?1:0)+(durationFilter!=="all"?1:0)+(confirmation!=="all"?1:0)+(ratingMin>0?1:0)+(priceEnabled&&(priceRange[0]!==priceBounds[0]||priceRange[1]!==priceBounds[1])?1:0);
  const toggleSet=(setter:React.Dispatch<React.SetStateAction<Set<string>>>,value:string)=>setter(current=>{const next=new Set(current);if(next.has(value))next.delete(value);else next.add(value);return next});
  const clearFilters=()=>{setProviders(new Set());setBenefits(new Set());setBookableOnly(false);setLowStockOnly(false);setDurationFilter("all");setConfirmation("all");setRatingMin(0);setPriceRange(priceBounds);setText("")};

  return <main className={styles.page}>
    <header className={styles.header}>
      <a className={styles.brand} href="/">rumbo<span>.</span></a>
      <nav><a href="/">Vuelos</a><a href="/">Hoteles</a><a className={styles.navActive} href="/">Paquetes</a><a href="/reservas">Mis reservas</a></nav>
      <a className={styles.account} href="/panel">Mi cuenta</a>
    </header>

    <section className={styles.searchSummary}>
      <div className={styles.route}><Plane/><span><small>Origen</small><strong>{originName} ({origin})</strong></span><span className={styles.arrow}>→</span><MapPin/><span><small>Destino</small><strong>{destinationName} ({destination})</strong></span></div>
      <div className={styles.summaryItem}><CalendarDays/><span><small>Fechas</small><strong>{dateLabel(departureDate)} – {dateLabel(returnDate)}</strong></span></div>
      <div className={styles.summaryItem}><Users/><span><small>Viajeros</small><strong>{travellerCount} {travellerCount===1?"persona":"personas"}</strong></span></div>
      <a className={styles.modifyButton} href="/"><ArrowLeft/> Modificar búsqueda</a>
    </section>

    <section className={styles.body}>
      <div className={styles.mobileToolbar}><button type="button" onClick={()=>setFiltersOpen(true)}><Filter/> Filtros {activeFilterCount?`(${activeFilterCount})`:""}</button><span>{filtered.length} opciones</span></div>
      <aside className={`${styles.filters} ${filtersOpen?styles.filtersOpen:""}`}>
        <div className={styles.filterHeader}><div><SlidersHorizontal/><strong>Filtrar resultados</strong></div>{activeFilterCount?<button type="button" onClick={clearFilters}>Limpiar</button>:null}<button className={styles.closeFilters} type="button" onClick={()=>setFiltersOpen(false)} aria-label="Cerrar filtros"><X/></button></div>

        <label className={styles.searchWithin}><Search/><input value={text} onChange={e=>setText(e.target.value)} placeholder="Buscar dentro de resultados"/></label>

        <details open><summary>Precio por persona <ChevronDown/></summary><div className={styles.filterContent}>{priceEnabled?<><div className={styles.priceLabels}><span>{formatRange(priceRange[0],currency)}</span><span>{formatRange(priceRange[1],currency)}</span></div><label><small>Mínimo</small><input type="range" min={priceBounds[0]} max={priceBounds[1]} step={Math.max(1,Math.round((priceBounds[1]-priceBounds[0])/100))} value={priceRange[0]} onChange={e=>setPriceRange([Math.min(Number(e.target.value),priceRange[1]),priceRange[1]])}/></label><label><small>Máximo</small><input type="range" min={priceBounds[0]} max={priceBounds[1]} step={Math.max(1,Math.round((priceBounds[1]-priceBounds[0])/100))} value={priceRange[1]} onChange={e=>setPriceRange([priceRange[0],Math.max(Number(e.target.value),priceRange[0])])}/></label></>:<p className={styles.filterHint}>{currencies.length>1?"Hay monedas distintas; no mezclamos importes sin conversión.":"Los resultados actuales no publican un importe numérico."}</p>}</div></details>

        <details open><summary>Disponibilidad <ChevronDown/></summary><div className={styles.filterContent}><CheckRow checked={bookableOnly} onChange={setBookableOnly} label="Disponible para reservar"/><CheckRow checked={lowStockOnly} onChange={setLowStockOnly} label="Últimos cupos"/></div></details>

        <details open><summary>Duración <ChevronDown/></summary><div className={styles.filterContent}><RadioRow name="duration" checked={durationFilter==="all"} onChange={()=>setDurationFilter("all")} label="Todas"/><RadioRow name="duration" checked={durationFilter==="short"} onChange={()=>setDurationFilter("short")} label="Hasta 4 noches"/><RadioRow name="duration" checked={durationFilter==="medium"} onChange={()=>setDurationFilter("medium")} label="5 a 7 noches"/><RadioRow name="duration" checked={durationFilter==="long"} onChange={()=>setDurationFilter("long")} label="8 noches o más"/></div></details>

        <details open><summary>Proveedor <ChevronDown/></summary><div className={styles.filterContent}>{providerOptions.length?providerOptions.map(value=><CheckRow key={value} checked={providers.has(value)} onChange={()=>toggleSet(setProviders,value)} label={value}/>):<p className={styles.filterHint}>Se habilitará al recibir resultados.</p>}</div></details>

        <details open><summary>Condición de salida <ChevronDown/></summary><div className={styles.filterContent}><RadioRow name="confirmation" checked={confirmation==="all"} onChange={()=>setConfirmation("all")} label="Todas"/><RadioRow name="confirmation" checked={confirmation==="confirmed"} onChange={()=>setConfirmation("confirmed")} label="Salida confirmada"/><RadioRow name="confirmation" checked={confirmation==="minimum"} onChange={()=>setConfirmation("minimum")} label="Sujeta a mínimo de pasajeros"/></div></details>

        <details open><summary>Beneficios incluidos <ChevronDown/></summary><div className={styles.filterContent}>{benefitOptions.length?benefitOptions.map(value=><CheckRow key={value} checked={benefits.has(value)} onChange={()=>toggleSet(setBenefits,value)} label={value}/>):<p className={styles.filterHint}>Los beneficios aparecerán según el inventario recibido.</p>}</div></details>

        <details open><summary>Puntuación <ChevronDown/></summary><div className={styles.filterContent}>{ratings.length?<><RadioRow name="rating" checked={ratingMin===0} onChange={()=>setRatingMin(0)} label="Todas"/><RadioRow name="rating" checked={ratingMin===4} onChange={()=>setRatingMin(4)} label="4.0 o más"/><RadioRow name="rating" checked={ratingMin===4.5} onChange={()=>setRatingMin(4.5)} label="4.5 o más"/></>:<p className={styles.filterHint}>No hay puntuaciones numéricas en estos resultados.</p>}</div></details>
      </aside>

      <section className={styles.results}>
        <div className={styles.resultsHeader}><div><p>Paquetes a {destinationName||destination}</p><h1>{loading?"Buscando opciones…":`${filtered.length} ${filtered.length===1?"opción encontrada":"opciones encontradas"}`}</h1>{message?<small className={mode==="live"?styles.liveMessage:""}>{message}</small>:null}</div><label>Ordenar por<select value={sort} onChange={e=>setSort(e.target.value as SortMode)}><option value="recommended">Recomendados</option><option value="price-asc">Menor precio</option><option value="price-desc">Mayor precio</option><option value="rating-desc">Mejor puntuación</option></select></label></div>

        {loading?<div className={styles.state}><LoaderCircle className={styles.spinner}/><strong>Consultando disponibilidad y tarifas</strong><span>Estamos buscando opciones para tu viaje.</span></div>:error?<div className={styles.state}><Package/><strong>No pudimos cargar los resultados</strong><span>{error}</span><a href="/">Volver al buscador</a></div>:filtered.length===0?<div className={styles.state}><Search/><strong>No hay opciones con estos filtros</strong><span>{items.length?"Prueba limpiando algunos filtros.":"No recibimos inventario disponible para esta búsqueda."}</span>{items.length?<button type="button" onClick={clearFilters}>Limpiar filtros</button>:<a href="/">Modificar búsqueda</a>}</div>:<div className={styles.list}>{filtered.map(item=><ResultCard key={`${item.id}-${item.variantId||"default"}`} item={item} onOpen={()=>setSelected(item)}/>)}</div>}
      </section>
    </section>

    {selected?<div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label={`Detalle de ${selected.destination}`} onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><article className={styles.modal}><button className={styles.modalClose} type="button" onClick={()=>setSelected(null)}><X/></button><img src={selected.image} alt=""/><div><span className={styles.modalTag}>{selected.tag}</span><h2>{selected.destination}</h2><p>{selected.country} · {selected.duration}</p><div className={styles.modalFacts}><span><CalendarDays/>{dateLabel(selected.departureDate)} – {dateLabel(selected.returnDate)}</span><span><Users/>{typeof selected.capacity==="number"?`${selected.capacity} cupos disponibles`:"Consultar disponibilidad"}</span><span><Package/>{providerLabel(selected)}</span></div><h3>Incluye</h3><ul>{(selected.included||[]).map(value=><li key={value}><Check/>{value}</li>)}</ul><div className={styles.modalPrice}><span>Precio por persona</span><strong>{selected.price}</strong></div><p className={styles.modalNote}>La selección y el pago se conectarán al mismo flujo de reserva nativo de Rumbo; esta pantalla no inventa disponibilidad adicional.</p></div></article></div>:null}
  </main>;
}

function CheckRow({checked,onChange,label}:{checked:boolean;onChange:(checked:boolean)=>void;label:string}){return <label className={styles.checkRow}><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><span>{label}</span></label>}
function RadioRow({name,checked,onChange,label}:{name:string;checked:boolean;onChange:()=>void;label:string}){return <label className={styles.checkRow}><input type="radio" name={name} checked={checked} onChange={onChange}/><span>{label}</span></label>}

function ResultCard({item,onOpen}:{item:TravelPackage;onOpen:()=>void}){
  const rating=numericRating(item);
  return <article className={styles.card}>
    <div className={styles.imageWrap}><img src={item.image} alt=""/><span>{item.tag}</span><button type="button" aria-label={`Guardar ${item.destination}`}><Heart/></button></div>
    <div className={styles.cardBody}><div className={styles.cardTop}><div><small>{item.country} · {providerLabel(item)}</small><h2>{item.destination}</h2></div>{rating!=null?<span className={styles.rating}><Star/>{rating.toFixed(1)}</span>:null}</div><p className={styles.duration}><Clock3/>{item.duration}{item.departureDate?` · ${dateLabel(item.departureDate)}`:""}</p><ul>{(item.included||[]).slice(0,3).map(value=><li key={value}><Check/>{value}</li>)}</ul>{item.lowStock?<p className={styles.lowStock}>Quedan pocos cupos</p>:null}</div>
    <div className={styles.cardPrice}><small>Precio por persona</small>{item.previousPrice?<s>{item.previousPrice}</s>:null}<strong>{item.price}</strong><span>{item.bookable?"Disponible para reservar":"Consulta condiciones"}</span><button type="button" onClick={onOpen}>Ver detalle</button></div>
  </article>;
}
