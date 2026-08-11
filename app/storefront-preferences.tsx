"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const LANGUAGES = {
  es: { label: "Español", locale: "es-PE" },
  en: { label: "English", locale: "en-US" },
  fr: { label: "Français", locale: "fr-FR" },
} as const;

type Language = keyof typeof LANGUAGES;
type Currency = "PEN" | "USD" | "EUR" | "GBP";

// Temporary MVP FX table. Units of each currency per 1 USD.
// This affects presentation only: source prices, bookings and commissions keep
// their contractual amount/currency until a real FX/provider quote is wired.
const FX_PER_USD: Record<Currency, number> = { USD: 1, PEN: 3.55, EUR: 0.86, GBP: 0.75 };

const EN: Record<string, string> = {
  "Vuelos":"Flights","Hoteles":"Hotels","Paquetes":"Packages","Ofertas":"Deals","Inspiración":"Inspiration",
  "Portal de asociados":"Partner portal","Mi cuenta":"My account","Viaja desde Perú":"Travel from Peru",
  "El Perú te espera.":"Peru is waiting for you.","Tú decides el rumbo.":"You choose the way.","Origen":"From","Destino":"To",
  "Fechas":"Dates","Viajeros":"Travelers","2 personas":"2 people","Buscar":"Search","Buscando":"Searching",
  "Reserva flexible":"Flexible booking","Cambia sin complicaciones":"Change without hassle","Pago seguro":"Secure payment",
  "Tus datos siempre protegidos":"Your data stays protected","Soporte local 24/7":"24/7 local support","Estamos para ayudarte":"We are here to help",
  "Precios claros":"Clear pricing","Sin sorpresas al pagar":"No surprises at checkout","Paga como prefieras":"Pay your way",
  "Tarjeta, cuotas o transferencia":"Card, installments or bank transfer","Te acompañamos":"We travel with you",
  "Antes, durante y después del viaje":"Before, during and after your trip","Viajes recomendados":"Recommended trips",
  "Escapadas que marcan el rumbo":"Trips worth taking","Ver todos":"See all","Desde":"From","por persona":"per person",
  "Reservar":"Book","Ver viaje":"View trip","Rumbo flexible":"Flexible Rumbo","¿Todavía no sabes adónde ir?":"Not sure where to go yet?",
  "Inspirarme":"Inspire me","Viajes simples, experiencias enormes.":"Simple travel, unforgettable experiences.",
  "Consultar reserva":"Find booking","Ayuda":"Help","Condiciones":"Terms","Privacidad":"Privacy","Vuelo incluido":"Flight included",
  "Estadía incluida":"Stay included","Tu viaje incluye":"Your trip includes","Precio por persona":"Price per person",
  "Reservar ahora":"Book now","Comprobando cupos…":"Checking availability…","No disponible para reserva":"Not available to book",
  "Reserva segura":"Secure booking","Revisa tu viaje":"Review your trip","Total de la reserva":"Booking total",
  "Cupos restantes":"Seats remaining","Ingresar datos de pasajeros":"Enter traveler details","Volver al detalle":"Back to trip details"
};

const FR: Record<string, string> = {
  "Vuelos":"Vols","Hoteles":"Hôtels","Paquetes":"Forfaits","Ofertas":"Offres","Inspiración":"Inspiration",
  "Portal de asociados":"Portail partenaires","Mi cuenta":"Mon compte","Viaja desde Perú":"Voyagez depuis le Pérou",
  "El Perú te espera.":"Le Pérou vous attend.","Tú decides el rumbo.":"À vous de choisir la route.","Origen":"Départ","Destino":"Destination",
  "Fechas":"Dates","Viajeros":"Voyageurs","2 personas":"2 personnes","Buscar":"Rechercher","Buscando":"Recherche",
  "Reserva flexible":"Réservation flexible","Cambia sin complicaciones":"Modifiez sans complications","Pago seguro":"Paiement sécurisé",
  "Tus datos siempre protegidos":"Vos données restent protégées","Soporte local 24/7":"Assistance locale 24/7","Estamos para ayudarte":"Nous sommes là pour vous aider",
  "Precios claros":"Prix transparents","Sin sorpresas al pagar":"Aucune surprise au paiement","Paga como prefieras":"Payez comme vous préférez",
  "Tarjeta, cuotas o transferencia":"Carte, échéances ou virement","Te acompañamos":"Nous vous accompagnons",
  "Antes, durante y después del viaje":"Avant, pendant et après le voyage","Viajes recomendados":"Voyages recommandés",
  "Escapadas que marcan el rumbo":"Escapades qui donnent le cap","Ver todos":"Voir tout","Desde":"À partir de","por persona":"par personne",
  "Reservar":"Réserver","Ver viaje":"Voir le voyage","Rumbo flexible":"Rumbo flexible","¿Todavía no sabes adónde ir?":"Vous ne savez pas encore où aller ?",
  "Inspirarme":"M'inspirer","Viajes simples, experiencias enormes.":"Voyages simples, expériences inoubliables.",
  "Consultar reserva":"Consulter une réservation","Ayuda":"Aide","Condiciones":"Conditions","Privacidad":"Confidentialité","Vuelo incluido":"Vol inclus",
  "Estadía incluida":"Séjour inclus","Tu viaje incluye":"Votre voyage comprend","Precio por persona":"Prix par personne",
  "Reservar ahora":"Réserver maintenant","Comprobando cupos…":"Vérification des disponibilités…","No disponible para reserva":"Non disponible à la réservation",
  "Reserva segura":"Réservation sécurisée","Revisa tu viaje":"Vérifiez votre voyage","Total de la reserva":"Total de la réservation",
  "Cupos restantes":"Places restantes","Ingresar datos de pasajeros":"Saisir les voyageurs","Volver al detalle":"Retour aux détails"
};

const LANGUAGE_TEXT: Record<Language, Record<string,string>> = { es: {}, en: EN, fr: FR };
const ORIGINAL_TEXT = new WeakMap<Text,string>();

function parseMoney(text:string): { amount:number; currency:Currency; prefix:string; suffix:string } | null {
  const match=text.match(/^(.*?)(US\$|S\/|€|£|\$)\s*([\d,.]+)(.*)$/);
  if(!match) return null;
  const symbol=match[2];
  const currency:Currency=symbol==="S/"?"PEN":symbol==="€"?"EUR":symbol==="£"?"GBP":"USD";
  const amount=Number(match[3].replace(/,/g,""));
  return Number.isFinite(amount)?{amount,currency,prefix:match[1],suffix:match[4]}:null;
}

function convert(amount:number,source:Currency,target:Currency){ return (amount/FX_PER_USD[source])*FX_PER_USD[target]; }
function formatCurrency(amount:number,currency:Currency,locale:string){ return new Intl.NumberFormat(locale,{style:"currency",currency,maximumFractionDigits:currency==="PEN"?0:2}).format(amount); }

function transformDocument(language:Language,currency:Currency){
  const locale=LANGUAGES[language].locale;
  document.documentElement.lang=language;
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let node=walker.nextNode() as Text|null;
  while(node){
    const parent=node.parentElement;
    if(parent&&!parent.closest("[data-rumbo-preferences]")&&!["SCRIPT","STYLE","NOSCRIPT","TEXTAREA","INPUT","OPTION"].includes(parent.tagName)){
      if(!ORIGINAL_TEXT.has(node)) ORIGINAL_TEXT.set(node,node.nodeValue||"");
      const original=ORIGINAL_TEXT.get(node)||"";
      const trimmed=original.trim();
      const translated=LANGUAGE_TEXT[language][trimmed]||trimmed;
      const money=parseMoney(translated);
      const output=money?`${money.prefix}${formatCurrency(convert(money.amount,money.currency,currency),currency,locale)}${money.suffix}`:translated;
      const next=`${original.match(/^\s*/)?.[0]||""}${output}${original.match(/\s*$/)?.[0]||""}`;
      if(node.nodeValue!==next) node.nodeValue=next;
    }
    node=walker.nextNode() as Text|null;
  }
}

export default function StorefrontPreferences(){
  const pathname=usePathname();
  const [language,setLanguage]=useState<Language>("es");
  const [currency,setCurrency]=useState<Currency>("PEN");
  const isStorefront=!pathname.startsWith("/admin")&&!pathname.startsWith("/panel")&&!pathname.startsWith("/agencia");

  useEffect(()=>{
    const savedLanguage=localStorage.getItem("rumbo_language") as Language|null;
    const savedCurrency=localStorage.getItem("rumbo_currency") as Currency|null;
    if(savedLanguage&&savedLanguage in LANGUAGES) setLanguage(savedLanguage);
    if(savedCurrency&&savedCurrency in FX_PER_USD) setCurrency(savedCurrency);
  },[]);

  useEffect(()=>{
    if(!isStorefront) return;
    localStorage.setItem("rumbo_language",language);
    localStorage.setItem("rumbo_currency",currency);
    const legacy=document.querySelector<HTMLButtonElement>('button[aria-label="Cambiar idioma"]');
    if(legacy) legacy.hidden=true;
    transformDocument(language,currency);
    const observer=new MutationObserver(()=>window.setTimeout(()=>transformDocument(language,currency),0));
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[language,currency,isStorefront]);

  const rateHint=useMemo(()=>`FX temporal · 1 USD = ${FX_PER_USD.PEN.toFixed(2)} PEN`,[]);
  if(!isStorefront) return null;

  return <div data-rumbo-preferences style={{position:"fixed",right:16,top:14,zIndex:10000,display:"flex",gap:8,alignItems:"center",padding:"7px 9px",borderRadius:14,background:"rgba(255,255,255,.96)",boxShadow:"0 8px 28px rgba(15,23,42,.16)",border:"1px solid rgba(15,23,42,.10)",fontFamily:"inherit"}}>
    <label style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"#475467"}}><span>🌐</span><select aria-label="Idioma" value={language} onChange={e=>setLanguage(e.target.value as Language)} style={{border:0,background:"transparent",fontWeight:700,outline:"none",cursor:"pointer"}}><option value="es">ES</option><option value="en">EN</option><option value="fr">FR</option></select></label>
    <span style={{width:1,height:18,background:"#d0d5dd"}} />
    <label title={rateHint} style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"#475467"}}><span>💱</span><select aria-label="Moneda" value={currency} onChange={e=>setCurrency(e.target.value as Currency)} style={{border:0,background:"transparent",fontWeight:700,outline:"none",cursor:"pointer"}}><option value="PEN">PEN</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></label>
  </div>;
}
