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
import { useState } from "react";

const products = [
  { id: "flights", label: "Vuelos", icon: Plane },
  { id: "hotels", label: "Hoteles", icon: Building2 },
  { id: "packages", label: "Paquetes", icon: Package },
] as const;

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

const deals = [
  {
    id: "cusco",
    destination: "Cusco esencial",
    country: "Perú",
    image: "/images/rumbo-hero.jpg",
    imagePosition: "70% 58%",
    duration: "4 días / 3 noches",
    rating: "4.9",
    reviews: "328",
    price: "S/ 1,249",
    previousPrice: "S/ 1,490",
    tag: "Más elegido",
    included: ["Vuelo ida y vuelta", "Hotel con desayuno", "Traslados incluidos"],
  },
  {
    id: "punta-cana",
    destination: "Punta Cana total",
    country: "República Dominicana",
    image: "/images/rumbo-beach.jpg",
    imagePosition: "center",
    duration: "6 días / 5 noches",
    rating: "4.8",
    reviews: "214",
    price: "US$ 749",
    previousPrice: "US$ 920",
    tag: "Todo incluido",
    included: ["Vuelo ida y vuelta", "Resort all inclusive", "Traslado al aeropuerto"],
  },
  {
    id: "cartagena",
    destination: "Cartagena con encanto",
    country: "Colombia",
    image: "/images/rumbo-city.jpg",
    imagePosition: "center",
    duration: "5 días / 4 noches",
    rating: "4.7",
    reviews: "189",
    price: "US$ 579",
    previousPrice: "US$ 699",
    tag: "Precio especial",
    included: ["Vuelo ida y vuelta", "Hotel boutique", "City tour histórico"],
  },
] as const;

type Deal = (typeof deals)[number];

export default function Home() {
  const [activeProduct, setActiveProduct] =
    useState<(typeof products)[number]["id"]>("flights");
  const [origin, setOrigin] = useState("Lima");
  const [destination, setDestination] = useState("Cusco");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [bookingStep, setBookingStep] = useState(false);

  const swapLocations = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const runSearch = () => {
    setHasSearched(true);
    window.setTimeout(() => {
      document.getElementById("ofertas")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const closeModal = () => {
    setSelectedDeal(null);
    setBookingStep(false);
  };

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
            <a href="#ayuda">Ayuda</a>
          </nav>

          <div className="header-actions">
            <button className="header-action" type="button" aria-label="Cambiar idioma">
              <Globe2 aria-hidden="true" />
              <span>ES</span>
              <ChevronDown aria-hidden="true" />
            </button>
            <span className="header-divider" aria-hidden="true" />
            <button className="header-action account" type="button">
              <CircleUserRound aria-hidden="true" />
              <span>Mi cuenta</span>
              <ChevronDown aria-hidden="true" />
            </button>
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
              <label className="search-field location">
                <span>Origen</span>
                <div>
                  <MapPin aria-hidden="true" />
                  <input
                    aria-label="Ciudad de origen"
                    onChange={(event) => setOrigin(event.target.value)}
                    value={origin}
                  />
                </div>
              </label>

              <button
                aria-label="Intercambiar origen y destino"
                className="swap-button"
                onClick={swapLocations}
                type="button"
              >
                <ArrowRightLeft aria-hidden="true" />
              </button>

              <label className="search-field location">
                <span>Destino</span>
                <div>
                  <MapPin aria-hidden="true" />
                  <input
                    aria-label="Ciudad de destino"
                    onChange={(event) => setDestination(event.target.value)}
                    value={destination}
                  />
                </div>
              </label>

              <button className="search-field field-button" type="button">
                <span>Fechas</span>
                <div>
                  <CalendarDays aria-hidden="true" />
                  <strong>12 – 19 oct</strong>
                  <ChevronDown aria-hidden="true" />
                </div>
              </button>

              <button className="search-field field-button" type="button">
                <span>Viajeros</span>
                <div>
                  <Users aria-hidden="true" />
                  <strong>2 personas</strong>
                  <ChevronDown aria-hidden="true" />
                </div>
              </button>

              <button className="search-button" onClick={runSearch} type="button">
                <Search aria-hidden="true" />
                <span>Buscar</span>
              </button>
            </div>
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
                  <span>{deal.country}</span>
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
                    <s>{deal.previousPrice}</s>
                    <strong>{deal.price}</strong>
                    <small>por persona</small>
                  </div>
                  <button
                    onClick={() => setSelectedDeal(deal)}
                    type="button"
                  >
                    Ver viaje
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
          <a href="#ayuda">Ayuda</a>
          <a href="#condiciones">Condiciones</a>
          <a href="#privacidad">Privacidad</a>
        </nav>
        <small>© 2026 Rumbo. Prototipo de experiencia digital.</small>
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

            {!bookingStep ? (
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
                      <span>Precio final desde</span>
                      <strong>{selectedDeal.price}</strong>
                      <small>por persona · tasas incluidas</small>
                    </div>
                    <button onClick={() => setBookingStep(true)} type="button">
                      Continuar reserva
                      <ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="booking-step">
                <span className="booking-icon">
                  <ShieldCheck aria-hidden="true" />
                </span>
                <p className="section-kicker">Reserva segura</p>
                <h2>Revisa tu viaje</h2>
                <p>
                  Estás reservando <strong>{selectedDeal.destination}</strong>{" "}
                  para 2 personas.
                </p>
                <div className="booking-summary">
                  <span>Paquete</span>
                  <strong>{selectedDeal.price}</strong>
                  <span>Impuestos y tasas</span>
                  <strong>Incluidos</strong>
                  <span>Total referencial</span>
                  <strong>{selectedDeal.price}</strong>
                </div>
                <button className="booking-primary" type="button">
                  Ingresar datos de pasajeros
                  <ArrowRight aria-hidden="true" />
                </button>
                <button
                  className="booking-back"
                  onClick={() => setBookingStep(false)}
                  type="button"
                >
                  Volver al detalle
                </button>
                <small>
                  Este prototipo no realiza cobros ni genera una reserva real.
                </small>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
