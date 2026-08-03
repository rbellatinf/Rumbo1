"use client";

import {
  ArrowRight,
  ArrowRightLeft,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleUserRound,
  Clock3,
  CreditCard,
  Globe2,
  Headphones,
  Heart,
  Hotel,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Menu,
  Package,
  Plane,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  AirportOption,
  AirportSearchResult,
} from "../lib/airlabs-airports";
import type {
  BookingRecord,
  ContactChannel,
  OfferAvailability,
} from "../lib/booking-requests";
import {
  demoTravelPackages,
  type TravelPackage,
} from "../lib/travel-packages";

const products = [
  { id: "flights", label: "Vuelos", icon: Plane },
  { id: "hotels", label: "Hoteles", icon: Building2 },
  { id: "packages", label: "Paquetes", icon: Package },
] as const;

function createIdempotencyKey() {
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof window.crypto?.getRandomValues === "function") {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));

  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

const trustItems = [
  {
    title: "Reserva flexible",
    description: "Cambia sin complicaciones",
    icon: ShieldCheck,
  },
  {
    title: "Pago seguro",
    description: "Tus datos siempre protegidos",
    icon: LockKeyhole,
  },
  {
    title: "Soporte local 24/7",
    description: "Estamos para ayudarte",
    icon: Headphones,
  },
];

type AirportFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string, iataCode: string) => void;
  onModeChange: (mode: "demo" | "live") => void;
};

function AirportField({
  id,
  label,
  value,
  onChange,
  onModeChange,
}: AirportFieldProps) {
  const [options, setOptions] = useState<AirportOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasResolved, setHasResolved] = useState(false);
  const requestId = useRef(0);
  const listId = `${id}-airport-options`;

  useEffect(() => {
    if (!isOpen) return;

    const keyword = value.replace(/\s*\([A-Z]{3}\).*$/i, "").trim();
    if (keyword.length < 2) {
      return;
    }

    const controller = new AbortController();
    const currentRequest = ++requestId.current;
    const timeout = window.setTimeout(() => {
      setIsLoading(true);
      fetch(`/api/airports?q=${encodeURIComponent(keyword)}`, {
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error("No se pudo buscar aeropuertos");
          return response.json() as Promise<AirportSearchResult>;
        })
        .then((result) => {
          if (requestId.current !== currentRequest) return;
          setOptions(result.airports);
          setHasResolved(true);
          onModeChange(result.mode);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          if (requestId.current !== currentRequest) return;
          setOptions([]);
          setHasResolved(true);
        })
        .finally(() => {
          if (requestId.current === currentRequest) setIsLoading(false);
        });
    }, 260);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isOpen, onModeChange, value]);

  const chooseAirport = (airport: AirportOption) => {
    onChange(`${airport.cityName} (${airport.iataCode})`, airport.iataCode);
    setOptions([]);
    setIsOpen(false);
  };

  return (
    <div className="search-field location airport-field">
      <label htmlFor={id}>
        <span>{label}</span>
        <div>
          <MapPin aria-hidden="true" />
          <input
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={isOpen}
            autoComplete="off"
            id={id}
            onBlur={() => window.setTimeout(() => setIsOpen(false), 140)}
            onChange={(event) => {
              requestId.current += 1;
              onChange(event.target.value, "");
              setOptions([]);
              setHasResolved(false);
              setIsLoading(false);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setIsOpen(false);
              if (event.key === "Enter" && options[0]) {
                event.preventDefault();
                chooseAirport(options[0]);
              }
            }}
            role="combobox"
            value={value}
          />
          {isLoading ? (
            <LoaderCircle
              aria-label="Buscando aeropuertos"
              className="field-loader"
            />
          ) : null}
        </div>
      </label>

      {isOpen && (options.length > 0 || isLoading || hasResolved) ? (
        <div className="airport-dropdown" id={listId} role="listbox">
          {options.map((airport) => (
            <button
              key={airport.id}
              aria-selected="false"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseAirport(airport)}
              role="option"
              type="button"
            >
              <span className="airport-code">{airport.iataCode}</span>
              <span>
                <strong>{airport.cityName}</strong>
                <small>
                  {airport.name}
                  {airport.countryName ? ` · ${airport.countryName}` : ""}
                </small>
              </span>
            </button>
          ))}
          {isLoading && options.length === 0 ? (
            <p>Consultando aeropuertos…</p>
          ) : null}
          {!isLoading && hasResolved && options.length === 0 ? (
            <p>No encontramos aeropuertos para esa búsqueda.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function dateFromNow(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatHoldExpiry(value?: string | null) {
  if (!value) return "15 minutos";

  return new Intl.DateTimeFormat("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export default function Home() {
  const [activeProduct, setActiveProduct] =
    useState<(typeof products)[number]["id"]>("packages");
  const [origin, setOrigin] = useState("Lima (LIM)");
  const [originCode, setOriginCode] = useState("LIM");
  const [destination, setDestination] = useState("Cusco (CUZ)");
  const [destinationCode, setDestinationCode] = useState("CUZ");
  const [departureDate, setDepartureDate] = useState(() => dateFromNow(45));
  const [returnDate, setReturnDate] = useState(() => dateFromNow(52));
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [deals, setDeals] = useState<TravelPackage[]>(demoTravelPackages);
  const [airportMode, setAirportMode] = useState<"demo" | "live">("demo");
  const [packageMode, setPackageMode] = useState<"demo" | "live">("demo");
  const [catalogMode, setCatalogMode] = useState<"demo" | "live">("demo");
  const [catalogMessage, setCatalogMessage] = useState(
    "Modo demostración: estas referencias no admiten reservas ni cobros.",
  );
  const [selectedDeal, setSelectedDeal] = useState<TravelPackage | null>(null);
  const [bookingStep, setBookingStep] = useState<0 | 1 | 2 | 3>(0);
  const [travellerName, setTravellerName] = useState("");
  const [travellerEmail, setTravellerEmail] = useState("");
  const [travellerPhone, setTravellerPhone] = useState("");
  const [contactChannel, setContactChannel] =
    useState<ContactChannel>("whatsapp");
  const [adultCount, setAdultCount] = useState(2);
  const [childCount, setChildCount] = useState(0);
  const [referralCode, setReferralCode] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [bookingWebsite, setBookingWebsite] = useState("");
  const [bookingIdempotencyKey, setBookingIdempotencyKey] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState<BookingRecord | null>(null);
  const [offerAvailability, setOfferAvailability] =
    useState<OfferAvailability | null>(null);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);

  useEffect(() => {
    let isActive = true;

    fetch("/api/catalog")
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo consultar el catálogo");
        return response.json() as Promise<{
          mode: "demo" | "live";
          packages: TravelPackage[];
          message: string;
        }>;
      })
      .then((catalog) => {
        if (!isActive) return;
        setDeals(catalog.packages);
        setCatalogMode(catalog.mode);
        setCatalogMessage(catalog.message);
      })
      .catch(() => {
        if (!isActive) return;
        setCatalogMode("demo");
      });

    return () => {
      isActive = false;
    };
  }, []);

  const swapLocations = () => {
    setOrigin(destination);
    setOriginCode(destinationCode);
    setDestination(origin);
    setDestinationCode(originCode);
  };

  const runSearch = async () => {
    if (activeProduct !== "packages") {
      setSearchError(
        "En esta entrega la consulta API está activa para Paquetes. Selecciona esa pestaña para buscar.",
      );
      return;
    }

    if (!originCode || !destinationCode) {
      setSearchError(
        "Selecciona un aeropuerto de la lista para el origen y el destino.",
      );
      return;
    }

    if (Date.parse(returnDate) <= Date.parse(departureDate)) {
      setSearchError("La fecha de regreso debe ser posterior a la salida.");
      return;
    }

    setSearchError("");
    setIsSearching(true);

    try {
      const query = new URLSearchParams({
        origin: originCode,
        destination: destinationCode,
        destinationName: destination.replace(/\s*\([A-Z]{3}\).*$/i, ""),
        departureDate,
        returnDate,
        adults: "2",
      });
      const response = await fetch(`/api/packages?${query.toString()}`);
      const result = (await response.json()) as {
        mode: "demo" | "live";
        packages: TravelPackage[];
        message: string;
      };

      if (!response.ok) throw new Error(result.message);

      setDeals(result.packages);
      setCatalogMode(result.mode);
      setPackageMode(result.mode);
      setCatalogMessage(result.message);
      setHasSearched(true);
      window.setTimeout(() => {
        document
          .getElementById("ofertas")
          ?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    } catch (error) {
      setSearchError(
        error instanceof Error
          ? error.message
          : "No se pudo completar la búsqueda.",
      );
    } finally {
      setIsSearching(false);
    }
  };

  const closeModal = () => {
    setSelectedDeal(null);
    setBookingStep(0);
    setTravellerName("");
    setTravellerEmail("");
    setTravellerPhone("");
    setContactChannel("whatsapp");
    setAdultCount(2);
    setChildCount(0);
    setReferralCode("");
    setBookingNotes("");
    setPrivacyConsent(false);
    setBookingWebsite("");
    setBookingIdempotencyKey("");
    setBookingError("");
    setIsSubmittingBooking(false);
    setBookingResult(null);
    setOfferAvailability(null);
    setIsCheckingAvailability(false);
  };

  const checkAvailability = async (
    deal: TravelPackage,
    requestedDepartureDate: string,
    requestedReturnDate: string,
  ) => {
    if (deal.provider !== "Spree" || !deal.providerReference) {
      setOfferAvailability(null);
      return;
    }

    setIsCheckingAvailability(true);
    setBookingError("");

    try {
      const query = new URLSearchParams({
        productId: deal.providerReference,
        departureDate: requestedDepartureDate,
        returnDate: requestedReturnDate,
      });
      const response = await fetch(`/api/availability?${query.toString()}`);
      const result = (await response.json()) as {
        availability?: OfferAvailability;
        message?: string;
      };

      if (!response.ok || !result.availability) {
        throw new Error(
          result.message || "No pudimos comprobar los cupos de esta oferta.",
        );
      }

      setOfferAvailability(result.availability);
      setDepartureDate(result.availability.departure_date);
      setReturnDate(result.availability.return_date);
      setSelectedDeal((current) =>
        current
          ? {
              ...current,
              capacity: result.availability?.remaining_capacity,
              price: result.availability?.price_display ?? current.price,
              priceAmount: result.availability?.price_amount,
              currency: result.availability?.currency,
              bookable: result.availability?.bookable,
              variantId: result.availability?.variant_id ?? current.variantId,
            }
          : current,
      );
    } catch (error) {
      setOfferAvailability(null);
      setBookingError(
        error instanceof Error
          ? error.message
          : "No pudimos comprobar los cupos de esta oferta.",
      );
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  const openDeal = (deal: TravelPackage) => {
    const offerDepartureDate = deal.departureDate ?? departureDate;
    const offerReturnDate = deal.returnDate ?? returnDate;
    setSelectedDeal(deal);
    setDepartureDate(offerDepartureDate);
    setReturnDate(offerReturnDate);
    setBookingIdempotencyKey(createIdempotencyKey());
    setBookingError("");
    setBookingResult(null);
    setOfferAvailability(null);
    void checkAvailability(deal, offerDepartureDate, offerReturnDate);
  };

  const submitBooking = async () => {
    if (!selectedDeal) return;
    if (
      selectedDeal.provider !== "Spree" ||
      !offerAvailability?.bookable ||
      offerAvailability.remaining_capacity < adultCount + childCount
    ) {
      setBookingError(
        "No quedan suficientes cupos para todos los viajeros seleccionados.",
      );
      return;
    }

    setBookingError("");
    setIsSubmittingBooking(true);

    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: bookingIdempotencyKey,
          product: {
            id: selectedDeal.providerReference ?? selectedDeal.id,
            variantId: selectedDeal.variantId,
            slug: selectedDeal.id,
            name: selectedDeal.destination,
            provider: selectedDeal.provider,
            providerReference: selectedDeal.providerReference,
            country: selectedDeal.country,
            price: selectedDeal.price,
            image: selectedDeal.image,
            duration: selectedDeal.duration,
            tag: selectedDeal.tag,
            included: selectedDeal.included,
          },
          trip: {
            originIata: hasSearched ? originCode : undefined,
            destinationIata: hasSearched ? destinationCode : undefined,
            departureDate,
            returnDate,
            adults: adultCount,
            children: childCount,
          },
          contact: {
            fullName: travellerName,
            email: travellerEmail,
            phone: travellerPhone,
            channel: contactChannel,
          },
          referralCode,
          notes: bookingNotes,
          consent: privacyConsent,
          website: bookingWebsite,
        }),
      });
      const result = (await response.json()) as {
        booking?: BookingRecord;
        message?: string;
      };

      if (!response.ok || !result.booking) {
        throw new Error(
          result.message || "No pudimos crear la reserva.",
        );
      }

      setBookingResult(result.booking);
      setBookingStep(3);
    } catch (error) {
      setBookingError(
        error instanceof Error
          ? error.message
          : "No pudimos crear la reserva.",
      );
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const travellerCount = adultCount + childCount;
  const liveUnitPrice =
    offerAvailability?.price_amount ?? selectedDeal?.priceAmount;
  const liveCurrency = offerAvailability?.currency ?? selectedDeal?.currency;
  const bookingTotal =
    typeof liveUnitPrice === "number" && liveCurrency
      ? formatMoney(liveUnitPrice * travellerCount, liveCurrency)
      : selectedDeal?.price ?? "Por calcular";

  return (
    <main>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-overlay" />
        <header className="site-header">
          <a className="brand" href="#" aria-label="Rumbo, inicio">
            rumbo<span>.</span>
          </a>

          <nav className="desktop-nav" aria-label="Navegación principal">
            <a href="#vuelos">Vuelos</a>
            <a href="#hoteles">Hoteles</a>
            <a href="#paquetes">Paquetes</a>
            <a href="#ofertas">Ofertas</a>
            <a href="#inspiracion">Inspiración</a>
            <a href="/panel">Portal de asociados</a>
          </nav>

          <div className="header-actions">
            <button className="header-action" type="button" aria-label="Cambiar idioma">
              <Globe2 aria-hidden="true" />
              <span>ES</span>
              <ChevronDown aria-hidden="true" />
            </button>
            <span className="header-divider" aria-hidden="true" />
            <a className="header-action account" href="/panel">
              <CircleUserRound aria-hidden="true" />
              <span>Mi cuenta</span>
              <ChevronDown aria-hidden="true" />
            </a>
            <button className="mobile-menu" type="button" aria-label="Abrir menú">
              <Menu aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="hero-content">
          <div className="hero-copy">
            <p className="eyebrow">Viaja desde Perú</p>
            <h1 id="hero-title">
              El Perú te espera.
              <br />
              Tú decides el rumbo.
            </h1>
            <p>
              Encuentra vuelos, hoteles y paquetes para descubrir destinos
              inolvidables, dentro y fuera del país.
            </p>
          </div>

          <div className="search-shell" aria-label="Buscador de viajes">
            <div className="product-tabs" role="tablist" aria-label="Tipo de viaje">
              {products.map(({ id, label, icon: Icon }) => (
                <button
                  aria-selected={activeProduct === id}
                  className={activeProduct === id ? "active" : ""}
                  key={id}
                  onClick={() => setActiveProduct(id)}
                  role="tab"
                  type="button"
                >
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div className="search-fields">
              <AirportField
                id="origin-airport"
                label="Origen"
                onChange={(value, iataCode) => {
                  setOrigin(value);
                  setOriginCode(iataCode);
                }}
                onModeChange={setAirportMode}
                value={origin}
              />

              <button
                aria-label="Intercambiar origen y destino"
                className="swap-button"
                onClick={swapLocations}
                type="button"
              >
                <ArrowRightLeft aria-hidden="true" />
              </button>

              <AirportField
                id="destination-airport"
                label="Destino"
                onChange={(value, iataCode) => {
                  setDestination(value);
                  setDestinationCode(iataCode);
                }}
                onModeChange={setAirportMode}
                value={destination}
              />

              <label className="search-field date-field">
                <span>Fechas</span>
                <div className="date-inputs">
                  <CalendarDays aria-hidden="true" />
                  <input
                    aria-label="Fecha de salida"
                    min={dateFromNow(1)}
                    onChange={(event) => setDepartureDate(event.target.value)}
                    type="date"
                    value={departureDate}
                  />
                  <span aria-hidden="true">–</span>
                  <input
                    aria-label="Fecha de regreso"
                    min={departureDate}
                    onChange={(event) => setReturnDate(event.target.value)}
                    type="date"
                    value={returnDate}
                  />
                </div>
              </label>

              <button className="search-field field-button" type="button">
                <span>Viajeros</span>
                <div>
                  <Users aria-hidden="true" />
                  <strong>2 personas</strong>
                  <ChevronDown aria-hidden="true" />
                </div>
              </button>

              <button
                className="search-button"
                disabled={isSearching}
                onClick={runSearch}
                type="button"
              >
                {isSearching ? (
                  <LoaderCircle aria-hidden="true" className="button-loader" />
                ) : (
                  <Search aria-hidden="true" />
                )}
                <span>{isSearching ? "Buscando" : "Buscar"}</span>
              </button>
            </div>

            <div className="integration-strip" aria-label="Fuentes del buscador">
              <span className={airportMode === "live" ? "is-live" : ""}>
                <Plane aria-hidden="true" />
                <strong>AirLabs</strong>
                {airportMode === "live" ? "aeropuertos conectados" : "respaldo local"}
              </span>
              <span className={packageMode === "live" ? "is-live" : ""}>
                <Package aria-hidden="true" />
                <strong>PriceTravel</strong>
                {packageMode === "live" ? "paquetes conectados" : "sandbox pendiente"}
              </span>
            </div>

            {searchError ? (
              <p className="search-error" role="alert">
                {searchError}
              </p>
            ) : null}
          </div>

          <div className="trust-row">
            {trustItems.map(({ title, description, icon: Icon }) => (
              <div className="trust-item" key={title}>
                <Icon aria-hidden="true" />
                <div>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="value-strip" aria-label="Beneficios de reservar en Rumbo">
        <div>
          <Sparkles aria-hidden="true" />
          <p>
            <strong>Precios claros</strong>
            <span>Sin sorpresas al pagar</span>
          </p>
        </div>
        <div>
          <CreditCard aria-hidden="true" />
          <p>
            <strong>Paga como prefieras</strong>
            <span>Tarjeta, cuotas o transferencia</span>
          </p>
        </div>
        <div>
          <Headphones aria-hidden="true" />
          <p>
            <strong>Te acompañamos</strong>
            <span>Antes, durante y después del viaje</span>
          </p>
        </div>
      </section>

      <section className="offers-section" id="ofertas" aria-labelledby="offers-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">
              {hasSearched ? `Resultados desde ${origin}` : "Viajes recomendados"}
            </p>
            <h2 id="offers-title">
              {hasSearched
                ? `Encontramos buenas opciones para ${destination}`
                : "Escapadas que marcan el rumbo"}
            </h2>
            <p>
              Paquetes seleccionados con vuelo, estadía y beneficios para viajar
              sin complicaciones.
            </p>
          </div>
          <button className="text-link" type="button">
            Ver todos
            <ArrowRight aria-hidden="true" />
          </button>
        </div>

        <div
          className={`catalog-status ${catalogMode === "live" ? "is-live" : ""}`}
          role="status"
        >
          <span aria-hidden="true" />
          <strong>
            {catalogMode === "live" ? "Catálogo conectado" : "Modo demostración"}
          </strong>
          <p>{catalogMessage}</p>
        </div>

        <div className="deal-grid">
          {deals.map((deal) => (
            <article className="deal-card" key={deal.id}>
              <div
                className="deal-image"
                style={{
                  backgroundImage: `linear-gradient(180deg, transparent 52%, rgba(6,28,51,.48)), url("${deal.image}")`,
                  backgroundPosition: deal.imagePosition,
                }}
              >
                <span className="deal-tag">{deal.tag}</span>
                <button
                  aria-label={`Guardar ${deal.destination}`}
                  className="favorite-button"
                  type="button"
                >
                  <Heart aria-hidden="true" />
                </button>
              </div>
              <div className="deal-content">
                <div className="deal-meta">
                  <span>
                    {deal.country}
                    {deal.provider ? <small> · {deal.provider}</small> : null}
                  </span>
                  <span>
                    <Star aria-hidden="true" />
                    {deal.rating} ({deal.reviews})
                  </span>
                </div>
                <h3>{deal.destination}</h3>
                <p className="deal-duration">
                  <Clock3 aria-hidden="true" />
                  {deal.duration}
                </p>
                {deal.provider === "Spree" && typeof deal.capacity === "number" ? (
                  <p className="deal-capacity">
                    <Users aria-hidden="true" />
                    {deal.capacity > 0
                      ? `${deal.capacity} cupos configurados`
                      : "Agotado"}
                  </p>
                ) : null}
                <ul>
                  {deal.included.slice(0, 2).map((item) => (
                    <li key={item}>
                      <Check aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="deal-footer">
                  <div>
                    <span>Desde</span>
                    {deal.previousPrice ? <s>{deal.previousPrice}</s> : null}
                    <strong>{deal.price}</strong>
                    <small>por persona</small>
                  </div>
                  <button
                    onClick={() => openDeal(deal)}
                    type="button"
                  >
                    {deal.provider === "Spree" && deal.bookable
                      ? "Reservar"
                      : "Ver viaje"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="inspiration-section" id="inspiracion">
        <div className="inspiration-card">
          <div>
            <p className="section-kicker">Rumbo flexible</p>
            <h2>¿Todavía no sabes adónde ir?</h2>
            <p>
              Cuéntanos cuánto quieres gastar y cuántos días tienes. Nosotros te
              mostramos destinos que sí encajan contigo.
            </p>
          </div>
          <button type="button">
            Inspirarme
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </section>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#">
          rumbo<span>.</span>
        </a>
        <p>Viajes simples, experiencias enormes.</p>
        <nav aria-label="Enlaces del pie de página">
          <a href="/panel">Portal de asociados</a>
          <a href="/reservas">Consultar reserva</a>
          <a href="#ayuda">Ayuda</a>
          <a href="#condiciones">Condiciones</a>
          <a href="#privacidad">Privacidad</a>
        </nav>
        <small>© 2026 Rumbo. MVP 1 en desarrollo.</small>
      </footer>

      {selectedDeal && (
        <div
          aria-label={`Detalle de ${selectedDeal.destination}`}
          aria-modal="true"
          className="modal-backdrop"
          role="dialog"
        >
          <div className="deal-modal">
            <button
              aria-label="Cerrar detalle"
              className="modal-close"
              onClick={closeModal}
              type="button"
            >
              <X aria-hidden="true" />
            </button>

            {bookingStep === 0 ? (
              <>
                <div
                  className="modal-image"
                  style={{
                    backgroundImage: `linear-gradient(180deg, transparent, rgba(6,28,51,.55)), url("${selectedDeal.image}")`,
                    backgroundPosition: selectedDeal.imagePosition,
                  }}
                >
                  <span>{selectedDeal.country}</span>
                  <h2>{selectedDeal.destination}</h2>
                </div>
                <div className="modal-body">
                  <div className="modal-summary">
                    <span>
                      <Plane aria-hidden="true" />
                      Vuelo incluido
                    </span>
                    <span>
                      <Hotel aria-hidden="true" />
                      Estadía incluida
                    </span>
                    <span>
                      <CalendarDays aria-hidden="true" />
                      {selectedDeal.duration}
                    </span>
                  </div>
                  <h3>Tu viaje incluye</h3>
                  <ul>
                    {selectedDeal.included.map((item) => (
                      <li key={item}>
                        <Check aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="modal-price">
                    <div>
                      <span>Precio por persona</span>
                      <strong>{selectedDeal.price}</strong>
                      <small>por persona · tasas incluidas</small>
                    </div>
                    <button
                      disabled={
                        isCheckingAvailability ||
                        selectedDeal.provider !== "Spree" ||
                        !offerAvailability?.bookable ||
                        offerAvailability.remaining_capacity < travellerCount
                      }
                      onClick={() => setBookingStep(1)}
                      type="button"
                    >
                      {isCheckingAvailability
                        ? "Comprobando cupos…"
                        : offerAvailability?.bookable &&
                            offerAvailability.remaining_capacity >= travellerCount
                          ? "Reservar ahora"
                          : "No disponible para reserva"}
                      <ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                  {offerAvailability ? (
                    <p className="booking-availability" role="status">
                      <Check aria-hidden="true" />
                      Precio vigente · {offerAvailability.remaining_capacity} cupo
                      {offerAvailability.remaining_capacity === 1 ? "" : "s"} disponible
                      {offerAvailability.remaining_capacity === 1 ? "" : "s"}
                    </p>
                  ) : null}
                  {bookingError ? (
                    <p className="booking-error" role="alert">
                      {bookingError}
                    </p>
                  ) : null}
                </div>
              </>
            ) : bookingStep === 1 ? (
              <div className="booking-step">
                <span className="booking-icon">
                  <ShieldCheck aria-hidden="true" />
                </span>
                <p className="section-kicker">Reserva segura</p>
                <h2>Revisa tu viaje</h2>
                <p>
                  Reservarás <strong>{selectedDeal.destination}</strong> con el
                  precio y los cupos comprobados en este momento.
                </p>
                <div className="booking-summary">
                  <span>Precio por persona</span>
                  <strong>{selectedDeal.price}</strong>
                  <span>Viajeros</span>
                  <strong>{travellerCount}</strong>
                  <span>Total de la reserva</span>
                  <strong>{bookingTotal}</strong>
                  <span>Cupos restantes</span>
                  <strong>{offerAvailability?.remaining_capacity ?? "—"}</strong>
                </div>
                <button
                  className="booking-primary"
                  onClick={() => setBookingStep(2)}
                  type="button"
                >
                  Ingresar datos de pasajeros
                  <ArrowRight aria-hidden="true" />
                </button>
                <button
                  className="booking-back"
                  onClick={() => setBookingStep(0)}
                  type="button"
                >
                  Volver al detalle
                </button>
                <small>
                  Al finalizar, el sistema bloqueará los cupos durante 15 minutos
                  sin intervención de un asesor.
                </small>
              </div>
            ) : bookingStep === 2 ? (
              <form
                className="booking-step traveller-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitBooking();
                }}
              >
                <p className="section-kicker">Reserva automática</p>
                <h2>Datos del viajero principal</h2>
                <p>
                  Completa la información para bloquear el precio y los cupos
                  antes del pago.
                </p>

                <div className="traveller-fields">
                  <label>
                    <span>Nombre completo</span>
                    <input
                      autoComplete="name"
                      onChange={(event) => setTravellerName(event.target.value)}
                      placeholder="Nombre y apellidos"
                      required
                      value={travellerName}
                    />
                  </label>
                  <label>
                    <span>Correo</span>
                    <input
                      autoComplete="email"
                      onChange={(event) => setTravellerEmail(event.target.value)}
                      placeholder="nombre@correo.com"
                      required
                      type="email"
                      value={travellerEmail}
                    />
                  </label>
                  <label>
                    <span>Teléfono o WhatsApp</span>
                    <input
                      autoComplete="tel"
                      inputMode="tel"
                      onChange={(event) => setTravellerPhone(event.target.value)}
                      placeholder="+51 999 999 999"
                      required
                      type="tel"
                      value={travellerPhone}
                    />
                  </label>
                  <label>
                    <span>Canal de contacto</span>
                    <select
                      onChange={(event) =>
                        setContactChannel(event.target.value as ContactChannel)
                      }
                      value={contactChannel}
                    >
                      <option value="whatsapp">WhatsApp</option>
                      <option value="phone">Llamada</option>
                      <option value="email">Correo</option>
                    </select>
                  </label>
                  <label>
                    <span>Fecha de salida preferida</span>
                    <input
                      min={dateFromNow(1)}
                      onChange={(event) => setDepartureDate(event.target.value)}
                      required
                      type="date"
                      value={departureDate}
                    />
                  </label>
                  <label>
                    <span>Fecha de regreso preferida</span>
                    <input
                      min={departureDate}
                      onChange={(event) => setReturnDate(event.target.value)}
                      required
                      type="date"
                      value={returnDate}
                    />
                  </label>
                  <label>
                    <span>Adultos</span>
                    <input
                      max="9"
                      min="1"
                      onChange={(event) => setAdultCount(Number(event.target.value))}
                      required
                      type="number"
                      value={adultCount}
                    />
                  </label>
                  <label>
                    <span>Niños</span>
                    <input
                      max="9"
                      min="0"
                      onChange={(event) => setChildCount(Number(event.target.value))}
                      required
                      type="number"
                      value={childCount}
                    />
                  </label>
                  <label>
                    <span>Código de asociado (opcional)</span>
                    <input
                      autoCapitalize="characters"
                      onChange={(event) =>
                        setReferralCode(event.target.value.toUpperCase())
                      }
                      placeholder="RUMBO-RBF"
                      value={referralCode}
                    />
                  </label>
                  <label className="traveller-field-wide">
                    <span>Comentarios (opcional)</span>
                    <textarea
                      maxLength={1500}
                      onChange={(event) => setBookingNotes(event.target.value)}
                      placeholder="Habitaciones, edades de los niños o alguna necesidad especial"
                      rows={3}
                      value={bookingNotes}
                    />
                  </label>
                </div>

                <label className="booking-honeypot" aria-hidden="true">
                  Sitio web
                  <input
                    autoComplete="off"
                    onChange={(event) => setBookingWebsite(event.target.value)}
                    tabIndex={-1}
                    value={bookingWebsite}
                  />
                </label>

                <label className="booking-consent">
                  <input
                    checked={privacyConsent}
                    onChange={(event) => setPrivacyConsent(event.target.checked)}
                    required
                    type="checkbox"
                  />
                  <span>
                    Acepto que Rumbo use estos datos para crear la reserva
                    temporal y contactarme sobre el viaje. No se realizará ningún
                    cobro hasta ingresar a la pasarela de pago.
                  </span>
                </label>

                {bookingError ? (
                  <p className="booking-error" role="alert">
                    {bookingError}
                  </p>
                ) : null}

                <button
                  className="booking-primary"
                  disabled={isSubmittingBooking}
                  type="submit"
                >
                  {isSubmittingBooking ? "Bloqueando cupos…" : "Reservar cupos"}
                  {isSubmittingBooking ? (
                    <LoaderCircle aria-hidden="true" className="button-loader" />
                  ) : (
                    <ArrowRight aria-hidden="true" />
                  )}
                </button>
                <button
                  className="booking-back"
                  onClick={() => setBookingStep(1)}
                  type="button"
                >
                  Volver al resumen
                </button>
                <small>
                  El precio final se calcula en el servidor; el navegador no puede
                  modificarlo.
                </small>
              </form>
            ) : (
              <div className="booking-step booking-confirmation">
                <span className="booking-icon">
                  <Check aria-hidden="true" />
                </span>
                <p className="section-kicker">Cupos reservados</p>
                <h2>Tu reserva temporal está creada</h2>
                <p>
                  Los cupos de <strong>{travellerName}</strong> para{" "}
                  <strong>{selectedDeal.destination}</strong> quedaron bloqueados
                  automáticamente. No requieren aprobación de Rumbo.
                </p>
                <div className="booking-reference">
                  <span>Referencia</span>
                  <strong>{bookingResult?.reference}</strong>
                  <span>Total bloqueado</span>
                  <strong>
                    {bookingResult?.total_amount && bookingResult.currency
                      ? formatMoney(
                          bookingResult.total_amount,
                          bookingResult.currency,
                        )
                      : bookingTotal}
                  </strong>
                  <span>Reserva válida hasta</span>
                  <strong>{formatHoldExpiry(bookingResult?.hold_expires_at)}</strong>
                  <span>Asociado</span>
                  <strong>{referralCode || "Venta directa"}</strong>
                </div>
                <button className="booking-primary" onClick={closeModal} type="button">
                  Finalizar
                  <Check aria-hidden="true" />
                </button>
                <small>
                  Guarda la referencia. El pago online se habilitará al conectar
                  la pasarela; mientras tanto puedes consultar el estado desde{" "}
                  <a href="/reservas">Mis reservas</a>.
                </small>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
