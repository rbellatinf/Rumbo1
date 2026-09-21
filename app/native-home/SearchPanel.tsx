"use client";

import {
  ArrowRightLeft,
  Building2,
  CalendarDays,
  ChevronDown,
  LoaderCircle,
  Minus,
  Package,
  Plane,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { useState } from "react";
import AirportField, { type SourceState } from "./AirportField";

export type ProductType = "flights" | "hotels" | "packages";

type Props = {
  activeProduct: ProductType;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  adults: number;
  children: number;
  searching: boolean;
  airportState: SourceState;
  packageState: SourceState;
  packageProvider: string;
  error: string;
  onProductChange: (product: ProductType) => void;
  onOrigin: (value: string, code: string) => void;
  onDestination: (value: string, code: string) => void;
  onSwap: () => void;
  onDeparture: (value: string) => void;
  onReturn: (value: string) => void;
  onAdults: (value: number) => void;
  onChildren: (value: number) => void;
  onAirportState: (state: SourceState) => void;
  onSearch: () => void;
};

const products: Array<{ id: ProductType; label: string; icon: typeof Plane }> = [
  { id: "flights", label: "Vuelos", icon: Plane },
  { id: "hotels", label: "Hoteles", icon: Building2 },
  { id: "packages", label: "Paquetes", icon: Package },
];

export default function SearchPanel(p: Props) {
  const [travellerOpen,setTravellerOpen]=useState(false);
  const travellers=p.adults+p.children;
  const setAdults=(delta:number)=>p.onAdults(Math.max(1,Math.min(18-p.children,p.adults+delta)));
  const setChildren=(delta:number)=>p.onChildren(Math.max(0,Math.min(18-p.adults,p.children+delta)));

  return (
    <div className="search-shell" id="buscador">
      <div className="product-tabs" role="tablist" aria-label="Tipo de viaje">
        {products.map(({ id, label, icon: Icon }) => (
          <button key={id} className={p.activeProduct === id ? "active" : ""} aria-selected={p.activeProduct === id} role="tab" type="button" onClick={() => p.onProductChange(id)}>
            <Icon /><span>{label}</span>
          </button>
        ))}
      </div>

      <div className="search-fields">
        <AirportField id="origin-airport" label="Origen" value={p.origin} onChange={p.onOrigin} onSourceChange={p.onAirportState} />
        <button className="swap-button" onClick={p.onSwap} type="button" aria-label="Intercambiar origen y destino"><ArrowRightLeft /></button>
        <AirportField id="destination-airport" label="Destino" value={p.destination} onChange={p.onDestination} onSourceChange={p.onAirportState} />
        <label className="search-field date-field">
          <span>Fechas</span>
          <div className="date-inputs">
            <CalendarDays />
            <input aria-label="Fecha de salida" type="date" value={p.departureDate} onChange={(e) => p.onDeparture(e.target.value)} />
            <span>–</span>
            <input aria-label="Fecha de regreso" type="date" value={p.returnDate} onChange={(e) => p.onReturn(e.target.value)} />
          </div>
        </label>
        <div className="traveller-picker">
          <button className="search-field field-button" type="button" aria-expanded={travellerOpen} onClick={()=>setTravellerOpen(value=>!value)}>
            <span>Viajeros</span>
            <div><Users /><strong>{travellers} {travellers===1?"persona":"personas"}</strong><ChevronDown /></div>
          </button>
          {travellerOpen ? (
            <div className="traveller-popover">
              <div><span><strong>Adultos</strong><small>18 años o más</small></span><div className="traveller-stepper"><button type="button" onClick={()=>setAdults(-1)} disabled={p.adults<=1}><Minus/></button><strong>{p.adults}</strong><button type="button" onClick={()=>setAdults(1)} disabled={travellers>=18}><Plus/></button></div></div>
              <div><span><strong>Niños</strong><small>0 a 17 años</small></span><div className="traveller-stepper"><button type="button" onClick={()=>setChildren(-1)} disabled={p.children<=0}><Minus/></button><strong>{p.children}</strong><button type="button" onClick={()=>setChildren(1)} disabled={travellers>=18}><Plus/></button></div></div>
              <button className="traveller-done" type="button" onClick={()=>setTravellerOpen(false)}>Listo</button>
            </div>
          ) : null}
        </div>
        <button className="search-button" disabled={p.searching} onClick={p.onSearch} type="button">
          {p.searching ? <LoaderCircle className="button-loader" /> : <Search />}<span>{p.searching ? "Buscando" : "Buscar"}</span>
        </button>
      </div>

      <div className="integration-strip">
        <span className={p.airportState === "live" ? "is-live" : ""}><Plane /><strong>AirLabs</strong>{p.airportState === "live" ? "conectado" : p.airportState === "error" ? "error visible" : "por consultar"}</span>
        <span className={p.packageState === "live" ? "is-live" : ""}><Package /><strong>{p.packageProvider || "Rumbo / PriceTravel"}</strong>{p.packageState === "live" ? "conectado" : p.packageState === "error" ? "error visible" : "por consultar"}</span>
      </div>
      {p.error ? <p className="search-error" role="alert">{p.error}</p> : null}
    </div>
  );
}
