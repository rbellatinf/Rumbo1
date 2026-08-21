"use client";

import { CreditCard, Headphones, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { TravelPackage } from "../../lib/travel-packages";
import BookingModal from "./BookingModal";
import OffersGrid from "./OffersGrid";
import SearchPanel, { type ProductType } from "./SearchPanel";
import type { SourceState } from "./AirportField";

function dateFromNow(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export default function NativeHome() {
  const [activeProduct, setActiveProduct] = useState<ProductType>("packages");
  const [origin, setOrigin] = useState("Lima (LIM)");
  const [originCode, setOriginCode] = useState("LIM");
  const [destination, setDestination] = useState("Cusco (CUZ)");
  const [destinationCode, setDestinationCode] = useState("CUZ");
  const [departure, setDeparture] = useState(() => dateFromNow(45));
  const [returnDate, setReturnDate] = useState(() => dateFromNow(52));
  const [deals, setDeals] = useState<TravelPackage[]>([]);
  const [state, setState] = useState<SourceState>("loading");
  const [airportState, setAirportState] = useState<SourceState>("idle");
  const [provider, setProvider] = useState("");
  const [message, setMessage] = useState("Consultando el catálogo nativo de Rumbo…");
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<TravelPackage | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadCatalog() {
      let lastError = "No pudimos consultar el catálogo.";
      for (let attempt = 0; attempt < 4 && active; attempt += 1) {
        if (attempt > 0) {
          setState("loading");
          setMessage("Rumbo API está iniciando; reconectando al catálogo real…");
          await sleep([2500, 4500, 7000][Math.min(attempt - 1, 2)]);
        }
        try {
          const response = await fetch("/api/catalog", { cache: "no-store" });
          const body = (await response.json()) as { packages?: TravelPackage[]; message?: string };
          if (!response.ok) throw new Error(body.message || `Catálogo respondió HTTP ${response.status}`);
          if (!active) return;
          setDeals(Array.isArray(body.packages) ? body.packages : []);
          setState("live");
          setProvider("Rumbo");
          setMessage(body.message || "Catálogo nativo conectado.");
          setError("");
          return;
        } catch (reason) {
          lastError = reason instanceof Error ? reason.message : "No pudimos consultar el catálogo.";
        }
      }
      if (!active) return;
      setState("error");
      setMessage(lastError);
      setError(lastError);
    }

    void loadCatalog();
    return () => {
      active = false;
    };
  }, []);

  const swap = () => {
    setOrigin(destination);
    setOriginCode(destinationCode);
    setDestination(origin);
    setDestinationCode(originCode);
  };

  const changeProduct = (product: ProductType) => {
    setActiveProduct(product);
    setError("");
  };

  async function search() {
    if (activeProduct !== "packages") {
      setError(
        activeProduct === "flights"
          ? "El apartado de Vuelos ya está visible; la búsqueda en vivo se habilitará cuando conectemos el proveedor aéreo."
          : "El apartado de Hoteles ya está visible; la búsqueda en vivo se habilitará cuando conectemos el proveedor hotelero.",
      );
      return;
    }
    if (!originCode || !destinationCode) {
      setError("Selecciona un aeropuerto de la lista para origen y destino.");
      return;
    }
    if (Date.parse(returnDate) <= Date.parse(departure)) {
      setError("La fecha de regreso debe ser posterior a la salida.");
      return;
    }

    setSearching(true);
    setState("loading");
    setError("");
    try {
      const query = new URLSearchParams({
        origin: originCode,
        destination: destinationCode,
        destinationName: destination.replace(/\s*\([A-Z]{3}\).*$/i, ""),
        departureDate: departure,
        returnDate,
        adults: "2",
      });
      const response = await fetch(`/api/packages?${query}`, { cache: "no-store" });
      const body = (await response.json()) as { provider?: string; packages?: TravelPackage[]; message?: string };
      if (!response.ok) throw new Error(body.message || `Búsqueda respondió HTTP ${response.status}`);
      setDeals(Array.isArray(body.packages) ? body.packages : []);
      setProvider(body.provider || "Rumbo");
      setMessage(body.message || "Búsqueda completada.");
      setState("live");
      setSearched(true);
      window.setTimeout(() => document.getElementById("ofertas")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : "No pudimos completar la búsqueda.";
      setMessage(text);
      setError(text);
      setState(deals.length ? "live" : "error");
    } finally {
      setSearching(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <div className="hero-overlay" />
        <header className="site-header">
          <a className="brand" href="#">rumbo<span>.</span></a>
          <nav className="desktop-nav" aria-label="Navegación principal">
            <a href="#buscador" onClick={() => changeProduct("flights")}>Vuelos</a>
            <a href="#buscador" onClick={() => changeProduct("hotels")}>Hoteles</a>
            <a href="#buscador" onClick={() => changeProduct("packages")}>Paquetes</a>
            <a href="/reservas">Mis reservas</a>
          </nav>
          <div className="header-actions" aria-label="Acceso a la cuenta" />
        </header>

        <div className="hero-content">
          <div className="hero-copy">
            <p className="eyebrow">Viaja desde Perú</p>
            <h1>Tú decides el rumbo.</h1>
            <p>Encuentra vuelos, hoteles y paquetes para descubrir destinos inolvidables, dentro y fuera del país.</p>
          </div>

          <SearchPanel
            activeProduct={activeProduct}
            origin={origin}
            destination={destination}
            departureDate={departure}
            returnDate={returnDate}
            travellers={2}
            searching={searching}
            airportState={airportState}
            packageState={state}
            packageProvider={provider}
            error={error}
            onProductChange={changeProduct}
            onOrigin={(value, code) => {
              setOrigin(value);
              setOriginCode(code);
            }}
            onDestination={(value, code) => {
              setDestination(value);
              setDestinationCode(code);
            }}
            onSwap={swap}
            onDeparture={setDeparture}
            onReturn={setReturnDate}
            onAirportState={setAirportState}
            onSearch={search}
          />

          <div className="trust-row">
            <div className="trust-item"><ShieldCheck /><div><strong>Reserva segura</strong><span>Cupos validados en Rumbo</span></div></div>
            <div className="trust-item"><CreditCard /><div><strong>Pago seguro</strong><span>Izipay desde Rumbo API</span></div></div>
            <div className="trust-item"><Headphones /><div><strong>Soporte local</strong><span>Antes, durante y después</span></div></div>
          </div>
        </div>
      </section>

      <OffersGrid
        deals={deals}
        state={state}
        message={message}
        heading={searched ? `Opciones para ${destination}` : "Escapadas que marcan el rumbo"}
        onOpen={setSelected}
      />

      <footer className="site-footer">
        <a className="brand footer-brand" href="#">rumbo<span>.</span></a>
        <p>Viajes simples, experiencias enormes.</p>
        <nav><a href="/reservas">Consultar reserva</a><a href="/panel">Portal Partner</a><a href="/agencia">Portal Agencia</a></nav>
        <small>© 2026 Rumbo.</small>
      </footer>

      {selected ? (
        <BookingModal
          deal={selected}
          origin={originCode}
          destination={destinationCode}
          departure={departure}
          returnDate={returnDate}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </main>
  );
}
