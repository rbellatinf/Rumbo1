"use client";

import {
  ArrowRightLeft,
  Building2,
  CalendarDays,
  ChevronDown,
  LoaderCircle,
  Package,
  Plane,
  Search,
  Users,
} from "lucide-react";
import AirportField, { type SourceState } from "./AirportField";

export type ProductType = "flights" | "hotels" | "packages";

type Props = {
  activeProduct: ProductType;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  travellers: number;
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
  onAirportState: (state: SourceState) => void;
  onSearch: () => void;
};

const products: Array<{
  id: ProductType;
  label: string;
  icon: typeof Plane;
}> = [
  { id: "flights", label: "Vuelos", icon: Plane },
  { id: "hotels", label: "Hoteles", icon: Building2 },
  { id: "packages", label: "Paquetes", icon: Package },
];

export default function SearchPanel(p: Props) {
  return (
    <div className="search-shell" id="buscador">
      <div className="product-tabs" role="tablist" aria-label="Tipo de viaje">
        {products.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={p.activeProduct === id ? "active" : ""}
            aria-selected={p.activeProduct === id}
            role="tab"
            type="button"
            onClick={() => p.onProductChange(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="search-fields">
        <AirportField
          id="origin-airport"
          label="Origen"
          value={p.origin}
          onChange={p.onOrigin}
          onSourceChange={p.onAirportState}
        />
        <button className="swap-button" onClick={p.onSwap} type="button" aria-label="Intercambiar origen y destino">
          <ArrowRightLeft />
        </button>
        <AirportField
          id="destination-airport"
          label="Destino"
          value={p.destination}
          onChange={p.onDestination}
          onSourceChange={p.onAirportState}
        />
        <label className="search-field date-field">
          <span>Fechas</span>
          <div className="date-inputs">
            <CalendarDays />
            <input aria-label="Fecha de salida" type="date" value={p.departureDate} onChange={(e) => p.onDeparture(e.target.value)} />
            <span>–</span>
            <input aria-label="Fecha de regreso" type="date" value={p.returnDate} onChange={(e) => p.onReturn(e.target.value)} />
          </div>
        </label>
        <button className="search-field field-button" type="button">
          <span>Viajeros</span>
          <div>
            <Users />
            <strong>{p.travellers} personas</strong>
            <ChevronDown />
          </div>
        </button>
        <button className="search-button" disabled={p.searching} onClick={p.onSearch} type="button">
          {p.searching ? <LoaderCircle className="button-loader" /> : <Search />}
          <span>{p.searching ? "Buscando" : "Buscar"}</span>
        </button>
      </div>

      <div className="integration-strip">
        <span className={p.airportState === "live" ? "is-live" : ""}>
          <Plane />
          <strong>AirLabs</strong>
          {p.airportState === "live" ? "conectado" : p.airportState === "error" ? "error visible" : "por consultar"}
        </span>
        <span className={p.packageState === "live" ? "is-live" : ""}>
          <Package />
          <strong>{p.packageProvider || "Rumbo / PriceTravel"}</strong>
          {p.packageState === "live" ? "conectado" : p.packageState === "error" ? "error visible" : "por consultar"}
        </span>
      </div>
      {p.error ? <p className="search-error" role="alert">{p.error}</p> : null}
    </div>
  );
}
