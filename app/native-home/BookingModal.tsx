"use client";
import {ArrowLeft,ArrowRight,CalendarDays,Check,LoaderCircle,ShieldCheck,Users,X} from "lucide-react";
import {FormEvent,useEffect,useMemo,useState} from "react";
import type {BookingRecord,BookingTraveller,OfferAvailability} from "../../lib/booking-requests";
import type {TravelDepartureOption,TravelPackage,TravelPolicySet} from "../../lib/travel-packages";

const nativeDeal=(deal:TravelPackage)=>deal.provider==="Rumbo"&&Boolean(deal.providerReference?.startsWith("rumbo:"));
const key=()=>crypto.randomUUID();
const money=(amount:number,currency:string)=>new Intl.NumberFormat("es-PE",{style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(amount);
const dateLabel=(value?:string)=>value?new Intl.DateTimeFormat("es-PE",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(value+"T12:00:00")):"Por confirmar";
const emptyTraveller=(passengerType:"adult"|"child"):BookingTraveller=>({passengerType,firstName:"",lastName:"",documentType:"DNI",documentNumber:"",nationalityCode:"PE",dateOfBirth:""});
type Props={deal:TravelPackage;origin:string;destination:string;departure:string;returnDate:string;adults:number;childrenCount:number;onClose:()=>void};

function PolicyList({policies}:{policies?:TravelPolicySet}){
 const rows:[string,string|undefined|null][]=[["Cancelación",policies?.cancellation],["Cambios",policies?.changes],["Reembolsos",policies?.refund],["No show",policies?.noShow]];
 const visible=rows.filter((item):item is [string,string]=>Boolean(item[1]));
 if(!visible.length)return <p className="booking-muted">Las condiciones definitivas serán informadas antes de emitir los servicios.</p>;
 return <div className="booking-policy-list">{visible.map(([label,value])=><div key={label}><strong>{label}</strong><span>{value}</span></div>)}</div>;
}

function DepartureChoice({option,selected,onSelect}:{option:TravelDepartureOption;selected:boolean;onSelect:()=>void}){
 const remaining=option.availableCapacity;
 return <button type="button" onClick={onSelect} className={"departure-choice "+(selected?"selected":"")}>
  <span className="departure-radio" aria-hidden="true"/>
  <span><strong>{dateLabel(option.departureDate)} → {dateLabel(option.returnDate)}</strong><small>{(option.originIata?"Desde "+option.originIata+" · ":"")+(option.confirmationLabel||"Salida confirmada")}</small></span>
  <span><strong>{money(option.priceAmount,option.currency)}</strong><small>{"por persona"+(typeof remaining==="number"?" · "+remaining+" cupos":"")}</small></span>
 </button>;
}

export default function BookingModal({deal,origin,destination,departure,returnDate,adults,childrenCount,onClose}:Props){
 const[step,setStep]=useState(1);
 const departureOptions=useMemo(()=>deal.departures?.filter(item=>item.saleOpen!==false)??[],[deal.departures]);
 const[selectedDepartureId,setSelectedDepartureId]=useState(deal.variantId||departureOptions[0]?.id||"");
 const[availability,setAvailability]=useState<OfferAvailability|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState("");
 const[name,setName]=useState(""),[email,setEmail]=useState(""),[phone,setPhone]=useState(""),[accepted,setAccepted]=useState(false);
 const[result,setResult]=useState<BookingRecord|null>(null),[paymentUrl,setPaymentUrl]=useState("");
 const[travellers,setTravellers]=useState<BookingTraveller[]>(()=>[
  ...Array.from({length:adults},()=>emptyTraveller("adult")),
  ...Array.from({length:childrenCount},()=>emptyTraveller("child")),
 ]);

 useEffect(()=>{setTravellers(current=>[
  ...Array.from({length:adults},(_,index)=>current[index]?.passengerType==="adult"?current[index]:emptyTraveller("adult")),
  ...Array.from({length:childrenCount},(_,index)=>{const offset=adults+index;return current[offset]?.passengerType==="child"?current[offset]:emptyTraveller("child")}),
 ])},[adults,childrenCount]);

 useEffect(()=>{
  let active=true;
  if(!nativeDeal(deal)||!deal.providerReference){setError("Este resultado no pertenece al inventario reservable de Rumbo.");setBusy(false);return()=>{active=false}}
  setBusy(true);setError("");
  const selected=departureOptions.find(item=>item.id===selectedDepartureId);
  const query=new URLSearchParams({productId:deal.providerReference,departureId:selectedDepartureId||deal.variantId||"",departureDate:selected?.departureDate||deal.departureDate||departure,returnDate:selected?.returnDate||deal.returnDate||returnDate,adults:String(adults),children:String(childrenCount)});
  fetch("/api/availability?"+query,{cache:"no-store"})
   .then(async response=>{const body=await response.json() as {availability?:OfferAvailability;message?:string};if(!response.ok||!body.availability)throw new Error(body.message||"No pudimos comprobar cupos.");return body.availability})
   .then(value=>{if(active){setAvailability(value);setSelectedDepartureId(value.variant_id)}})
   .catch(reason=>{if(active){setAvailability(null);setError(reason instanceof Error?reason.message:"No pudimos comprobar cupos.")}})
   .finally(()=>{if(active)setBusy(false)});
  return()=>{active=false};
 },[deal,departure,returnDate,selectedDepartureId,departureOptions,adults,childrenCount]);

 const selectedOption=departureOptions.find(item=>item.id===selectedDepartureId);
 const effectivePolicies=availability?.policies||selectedOption?.policies||deal.policies;
 const party=adults+childrenCount;
 const updateTraveller=(index:number,patch:Partial<BookingTraveller>)=>setTravellers(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,...patch}:item));
 const travellersComplete=()=>travellers.length===party&&travellers.every(item=>Boolean(item.firstName.trim()&&item.lastName.trim()&&item.documentType?.trim()&&item.documentNumber?.trim()&&item.nationalityCode?.trim()&&item.dateOfBirth));

 async function submit(event:FormEvent){
  event.preventDefault();if(!availability?.bookable||!accepted||!travellersComplete())return;setBusy(true);setError("");
  try{
   const response=await fetch("/api/reservations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    idempotencyKey:key(),product:{id:deal.providerReference||deal.id,variantId:availability.variant_id,slug:deal.id,name:deal.destination,provider:"Rumbo",providerReference:deal.providerReference,country:deal.country,price:availability.price_display,image:deal.image,duration:deal.duration,tag:deal.tag,included:deal.included,details:deal.details,policies:effectivePolicies},
    trip:{originIata:origin,destinationIata:destination,departureDate:availability.departure_date,returnDate:availability.return_date,adults,children:childrenCount},travellers,
    contact:{fullName:name,email,phone,channel:"whatsapp"},consent:true,policiesAccepted:true,website:"",
   })});
   const body=await response.json() as {booking?:BookingRecord;message?:string};if(!response.ok||!body.booking)throw new Error(body.message||"No pudimos crear la reserva.");setResult(body.booking);
   const pay=await fetch("/api/payments/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reference:body.booking.reference,email})});
   const payBody=await pay.json() as {booking?:BookingRecord;message?:string};if(!pay.ok)throw new Error(payBody.message||"La reserva fue creada, pero no pudimos iniciar el pago.");if(payBody.booking?.payment_url)setPaymentUrl(payBody.booking.payment_url);
  }catch(reason){setError(reason instanceof Error?reason.message:"No pudimos crear la reserva.")}finally{setBusy(false)}
 }

 return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={"Reservar "+deal.destination}><div className="deal-modal booking-modal-v2">
  <button className="modal-close" type="button" onClick={onClose} aria-label="Cerrar"><X/></button>
  {result?<div className="booking-step booking-success"><span className="booking-icon"><Check/></span><p className="section-kicker">Reserva creada</p><h2>{deal.destination}</h2><p>Guardamos tus viajeros, la tarifa y las condiciones de esta salida. El cupo queda retenido mientras completas el pago.</p><div className="booking-reference"><span>Referencia</span><strong>{result.reference}</strong><span>Total</span><strong>{result.total_amount&&result.currency?money(result.total_amount,result.currency):result.price_display}</strong></div>{paymentUrl?<a className="booking-primary" href={paymentUrl}>Pagar con Izipay<ArrowRight/></a>:<a className="booking-primary" href="/reservas">Ir a Mis reservas<ArrowRight/></a>}{error?<p className="booking-error" role="alert">{error}</p>:null}</div>:
  <form className="booking-step" onSubmit={submit}>
   <div className="booking-progress" aria-label="Progreso de reserva">{[["1","Viaje"],["2","Viajeros"],["3","Revisión"]].map(([number,label],index)=><div key={number} className={step>=index+1?"active":""}><span>{step>index+1?<Check/>:number}</span><small>{label}</small></div>)}</div>
   {step===1?<><p className="section-kicker">Tu viaje</p><h2>{deal.destination}</h2>{deal.shortDescription?<p className="booking-lead">{deal.shortDescription}</p>:deal.description?<p className="booking-lead">{deal.description}</p>:null}
    {departureOptions.length>1?<div className="departure-list"><h3>Elige una salida</h3>{departureOptions.map(option=><DepartureChoice key={option.id} option={option} selected={option.id===selectedDepartureId} onSelect={()=>setSelectedDepartureId(option.id)}/>)}</div>:null}
    <div className="booking-summary-grid"><div><CalendarDays/><span><small>Fechas</small><strong>{dateLabel(availability?.departure_date||selectedOption?.departureDate||deal.departureDate)} → {dateLabel(availability?.return_date||selectedOption?.returnDate||deal.returnDate)}</strong></span></div><div><Users/><span><small>Viajeros</small><strong>{adults+" adulto"+(adults===1?"":"s")+(childrenCount?" · "+childrenCount+" niño"+(childrenCount===1?"":"s"):"")}</strong></span></div><div><ShieldCheck/><span><small>Confirmación</small><strong>{availability?.confirmation_label||selectedOption?.confirmationLabel||deal.rating}</strong></span></div></div>
    {deal.included.length?<div className="booking-included"><h3>Incluye</h3><ul>{deal.included.map(item=><li key={item}><Check/>{item}</li>)}</ul></div>:null}
    <div className="booking-price-box"><span><small>Precio final por persona</small><strong>{availability?money(availability.price_amount,availability.currency):deal.price}</strong>{availability?.taxes_amount!=null?<small>Incluye {money(availability.taxes_amount,availability.currency)} de impuestos/tasas por persona</small>:null}</span><span><small>{"Total "+party+" viajero"+(party===1?"":"s")}</small><strong>{availability?money(availability.total_amount,availability.currency):"Calculando…"}</strong></span></div>
    <div className="booking-policies"><h3>Condiciones importantes</h3><PolicyList policies={effectivePolicies}/></div>{error?<p className="booking-error" role="alert">{error}</p>:null}
    <button className="booking-primary" disabled={busy||!availability?.bookable} type="button" onClick={()=>setStep(2)}>{busy?<LoaderCircle className="button-loader"/>:"Continuar con viajeros"}<ArrowRight/></button>
   </>:null}
   {step===2?<><p className="section-kicker">Datos de viajeros</p><h2>¿Quiénes viajan?</h2><p className="booking-muted">Ingresa los datos tal como aparecen en el documento de viaje. El primer adulto será el pasajero principal.</p><div className="traveller-list">{travellers.map((traveller,index)=><fieldset key={index} className="traveller-card"><legend>{(traveller.passengerType==="adult"?"Adulto "+travellers.slice(0,index+1).filter(item=>item.passengerType==="adult").length:"Niño "+travellers.slice(0,index+1).filter(item=>item.passengerType==="child").length)+(index===0?" · principal":"")}</legend><div className="traveller-fields booking-fields-v2"><label><span>Nombres</span><input required value={traveller.firstName} onChange={e=>updateTraveller(index,{firstName:e.target.value})}/></label><label><span>Apellidos</span><input required value={traveller.lastName} onChange={e=>updateTraveller(index,{lastName:e.target.value})}/></label><label><span>Documento</span><select value={traveller.documentType} onChange={e=>updateTraveller(index,{documentType:e.target.value})}><option>DNI</option><option>PASSPORT</option><option>CE</option></select></label><label><span>Número</span><input required value={traveller.documentNumber} onChange={e=>updateTraveller(index,{documentNumber:e.target.value})}/></label><label><span>Nacionalidad</span><input required maxLength={2} value={traveller.nationalityCode} onChange={e=>updateTraveller(index,{nationalityCode:e.target.value.toUpperCase()})} placeholder="PE"/></label><label><span>Fecha de nacimiento</span><input required type="date" value={traveller.dateOfBirth} onChange={e=>updateTraveller(index,{dateOfBirth:e.target.value})}/></label></div></fieldset>)}</div><div className="booking-actions"><button className="booking-secondary" type="button" onClick={()=>setStep(1)}><ArrowLeft/>Volver</button><button className="booking-primary" disabled={!travellersComplete()} type="button" onClick={()=>setStep(3)}>Revisar reserva<ArrowRight/></button></div></>:null}
   {step===3?<><p className="section-kicker">Revisión y contacto</p><h2>Último paso antes de pagar</h2><div className="booking-review"><div><strong>{deal.destination}</strong><span>{dateLabel(availability?.departure_date)} → {dateLabel(availability?.return_date)}</span><span>{party+" viajero"+(party===1?"":"s")+" · "+(availability?.confirmation_label||"")}</span></div><div><small>Total a pagar</small><strong>{availability?money(availability.total_amount,availability.currency):"—"}</strong></div></div><div className="traveller-fields booking-fields-v2"><label><span>Nombre de contacto</span><input required value={name} onChange={e=>setName(e.target.value)}/></label><label><span>Correo</span><input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label><span>WhatsApp / teléfono</span><input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label></div><div className="booking-policies final"><h3>Políticas de esta reserva</h3><PolicyList policies={effectivePolicies}/></div><label className="booking-consent"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/><span>He revisado la tarifa, los viajeros y las condiciones de cancelación, cambios, reembolsos y no-show aplicables. Acepto continuar al pago y el tratamiento de mis datos para gestionar la reserva.</span></label>{error?<p className="booking-error" role="alert">{error}</p>:null}<div className="booking-actions"><button className="booking-secondary" type="button" onClick={()=>setStep(2)}><ArrowLeft/>Volver</button><button className="booking-primary" disabled={busy||!accepted||!availability?.bookable||!travellersComplete()} type="submit">{busy?<LoaderCircle className="button-loader"/>:"Reservar y pagar"}<ArrowRight/></button></div></>:null}
  </form>}
 </div></div>;
}
