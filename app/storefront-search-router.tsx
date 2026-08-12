"use client";

import { useEffect } from "react";

function airportCode(value:string){
  return value.match(/\(([A-Z]{3})\)/i)?.[1]?.toUpperCase()||"";
}
function airportName(value:string){
  return value.replace(/\s*\([A-Z]{3}\).*$/i,"").trim();
}

export default function StorefrontSearchRouter(){
  useEffect(()=>{
    const onClick=(event:MouseEvent)=>{
      const target=event.target as HTMLElement|null;
      const button=target?.closest?.(".search-button") as HTMLButtonElement|null;
      if(!button)return;
      const activeTab=document.querySelector(".product-tabs button.active");
      if(!activeTab?.textContent?.toLowerCase().includes("paquetes"))return;

      const originInput=document.getElementById("origin-airport") as HTMLInputElement|null;
      const destinationInput=document.getElementById("destination-airport") as HTMLInputElement|null;
      const departure=document.querySelector('input[aria-label="Fecha de salida"]') as HTMLInputElement|null;
      const returning=document.querySelector('input[aria-label="Fecha de regreso"]') as HTMLInputElement|null;
      const origin=airportCode(originInput?.value||"");
      const destination=airportCode(destinationInput?.value||"");
      if(!origin||!destination||!departure?.value||!returning?.value)return;

      event.preventDefault();
      event.stopPropagation();
      const params=new URLSearchParams({
        type:"packages",
        origin,
        originName:airportName(originInput?.value||origin),
        destination,
        destinationName:airportName(destinationInput?.value||destination),
        departureDate:departure.value,
        returnDate:returning.value,
        adults:"2",
        children:"0",
      });
      window.location.assign(`/resultados?${params.toString()}`);
    };
    document.addEventListener("click",onClick,true);
    return()=>document.removeEventListener("click",onClick,true);
  },[]);
  return null;
}
