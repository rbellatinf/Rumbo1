/* eslint-disable @next/next/no-img-element */
"use client";

import { ArrowLeft, CalendarPlus, CheckCircle2, Image as ImageIcon, LoaderCircle, PackagePlus, Save } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import styles from "./catalogo.module.css";

type Departure = {
  id: string;
  origin_iata?: string | null;
  departure_date?: string | null;
  return_date?: string | null;
  currency?: string;
  price_amount?: number;
  capacity?: number | null;
  available_capacity?: number | null;
  low_stock_threshold?: number | null;
};

type Product = {
  id: string;
  slug: string;
  name: string;
  country?: string;
  city?: string;
  destination_iata?: string;
  status: "draft" | "published" | "archived";
  provider?: string;
  duration_label?: string;
  tag?: string;
  currency?: string;
  price_amount?: number;
  from_price_amount?: number;
  departure_date?: string;
  return_date?: string;
  origin_iata?: string;
  capacity?: number;
  available_capacity?: number;
  active_departure_count?: number;
  departures?: Departure[];
  image_url?: string;
};

const statusLabel = { draft: "Borrador", published: "Publicado", archived: "Archivado" };

export default function CatalogAdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [departureSaving, setDepartureSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/catalog", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "No pudimos cargar el catálogo.");
    setProducts(payload.products || []);
    setLoading(false);
  }

  useEffect(() => { load().catch((e) => { setError(e instanceof Error ? e.message : "Error de carga"); setLoading(false); }); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || ""), slug: String(form.get("slug") || ""),
      short_description: String(form.get("short_description") || ""), description: String(form.get("description") || ""),
      country: String(form.get("country") || ""), city: String(form.get("city") || ""),
      destination_iata: String(form.get("destination_iata") || "").toUpperCase(),
      duration_label: String(form.get("duration_label") || ""), tag: String(form.get("tag") || ""),
      included: String(form.get("included") || "").split("\n").map((x) => x.trim()).filter(Boolean),
      status: String(form.get("status") || "draft"), provider: String(form.get("provider") || "Rumbo"),
      provider_reference: String(form.get("provider_reference") || ""), currency: String(form.get("currency") || "USD"),
      price_amount: Number(form.get("price_amount") || 0), origin_iata: String(form.get("origin_iata") || "").toUpperCase(),
      departure_date: String(form.get("departure_date") || ""), return_date: String(form.get("return_date") || ""),
      capacity: form.get("capacity") ? Number(form.get("capacity")) : null,
      low_stock_threshold: Number(form.get("low_stock_threshold") || 5),
      image_url: String(form.get("image_url") || ""), image_alt: String(form.get("image_alt") || ""),
      featured: form.get("featured") === "on",
    };
    try {
      const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No pudimos crear el producto.");
      event.currentTarget.reset();
      setSuccess("Producto guardado. Puedes añadir más salidas desde la lista de productos.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos crear el producto."); }
    finally { setSaving(false); }
  }

  async function addDeparture(event: FormEvent<HTMLFormElement>, product: Product) {
    event.preventDefault();
    setDepartureSaving(product.id); setError(""); setSuccess("");
    const form = new FormData(event.currentTarget);
    const payload = {
      origin_iata: String(form.get("origin_iata") || "").toUpperCase(),
      departure_date: String(form.get("departure_date") || ""), return_date: String(form.get("return_date") || ""),
      currency: String(form.get("currency") || "USD"), price_amount: Number(form.get("price_amount") || 0),
      capacity: form.get("capacity") ? Number(form.get("capacity")) : null,
      low_stock_threshold: Number(form.get("low_stock_threshold") || 5),
    };
    try {
      const response = await fetch(`/api/admin/catalog/${product.id}/departures`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No pudimos agregar la salida.");
      event.currentTarget.reset();
      setSuccess(`Nueva salida agregada a ${product.name}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos agregar la salida."); }
    finally { setDepartureSaving(null); }
  }

  async function changeStatus(product: Product, status: Product["status"]) {
    setError("");
    const response = await fetch(`/api/admin/catalog/${product.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const payload = await response.json();
    if (!response.ok) { setError(payload.message || "No pudimos actualizar el producto."); return; }
    await load();
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div><p>Rumbo · Backoffice propio</p><h1>Catálogo</h1><span>Productos, salidas, precios y cupos administrados directamente en PostgreSQL.</span></div>
        <Link href="/admin"><ArrowLeft /> Volver a administración</Link>
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}><CheckCircle2 /> {success}</div> : null}

      <section className={styles.layout}>
        <form className={styles.formCard} onSubmit={submit}>
          <div className={styles.cardTitle}><PackagePlus /><div><h2>Nuevo producto</h2><p>El producto se crea una sola vez; luego puedes agregarle tantas salidas como necesites.</p></div></div>
          <div className={styles.gridTwo}><label>Nombre<input name="name" required placeholder="Cusco esencial" /></label><label>Slug<input name="slug" required placeholder="cusco-esencial" /></label></div>
          <label>Descripción corta<input name="short_description" placeholder="Paquete de 4 días con hotel y traslados" /></label>
          <label>Descripción<textarea name="description" rows={3} /></label>
          <div className={styles.gridThree}><label>País<input name="country" placeholder="Perú" /></label><label>Ciudad<input name="city" placeholder="Cusco" /></label><label>IATA destino<input name="destination_iata" maxLength={3} placeholder="CUZ" /></label></div>
          <div className={styles.gridTwo}><label>Duración<input name="duration_label" placeholder="4 días / 3 noches" /></label><label>Etiqueta<input name="tag" placeholder="Más elegido" /></label></div>
          <label>Incluye <small>Un beneficio por línea</small><textarea name="included" rows={4} placeholder={'Vuelo ida y vuelta\nHotel con desayuno\nTraslados'} /></label>

          <div className={styles.sectionLabel}>Primera salida</div>
          <div className={styles.gridThree}><label>Origen IATA<input name="origin_iata" maxLength={3} placeholder="LIM" /></label><label>Moneda<select name="currency" defaultValue="USD"><option>USD</option><option>PEN</option><option>EUR</option></select></label><label>Precio<input name="price_amount" min="0" step="0.01" type="number" /></label></div>
          <div className={styles.gridThree}><label>Cupos<input name="capacity" min="0" type="number" /></label><label>Alerta últimos cupos<input name="low_stock_threshold" min="0" type="number" defaultValue="5" /></label><span /></div>
          <div className={styles.gridTwo}><label>Fecha salida<input name="departure_date" type="date" /></label><label>Fecha regreso<input name="return_date" type="date" /></label></div>

          <div className={styles.sectionLabel}>Imagen y publicación</div>
          <label>URL de imagen<div className={styles.iconInput}><ImageIcon /><input name="image_url" placeholder="https://..." /></div></label>
          <label>Texto alternativo<input name="image_alt" /></label>
          <div className={styles.gridTwo}><label>Proveedor<input name="provider" defaultValue="Rumbo" /></label><label>Referencia proveedor<input name="provider_reference" /></label></div>
          <div className={styles.gridTwo}><label>Estado<select name="status" defaultValue="draft"><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select></label><label className={styles.check}><input name="featured" type="checkbox" /><span>Destacar en la portada</span></label></div>
          <button className={styles.primary} disabled={saving} type="submit">{saving ? <LoaderCircle className={styles.spin} /> : <Save />}{saving ? "Guardando…" : "Guardar producto"}</button>
        </form>

        <section className={styles.listCard}>
          <div className={styles.cardTitle}><div><h2>Productos de Rumbo</h2><p>El storefront mostrará precio “Desde” cuando existan varias salidas y avisará automáticamente cuando queden pocos cupos.</p></div></div>
          {loading ? <p className={styles.loading}><LoaderCircle className={styles.spin} /> Cargando catálogo…</p> : null}
          {!loading && products.length === 0 ? <p className={styles.empty}>Todavía no hay productos propios.</p> : null}
          <div className={styles.productList}>{products.map((product) => (
            <article key={product.id} className={styles.product}>
              <div className={styles.thumb}>{product.image_url ? <img alt="" src={product.image_url} /> : <ImageIcon />}</div>
              <div className={styles.productCopy}>
                <div><strong>{product.name}</strong><span>{product.city || product.country || "Sin destino"} {product.destination_iata ? `· ${product.destination_iata}` : ""}</span></div>
                <small>{product.active_departure_count || 0} salida(s) · {product.from_price_amount ? `Desde ${product.currency || "USD"} ${product.from_price_amount}` : "Sin precio"}</small>
                <div>{(product.departures || []).slice(0, 4).map((departure) => <small key={departure.id}>{departure.origin_iata || "Cualquier origen"} · {departure.departure_date || "Sin fecha"} → {departure.return_date || ""} · {departure.currency} {departure.price_amount} · {departure.available_capacity ?? "∞"} cupos</small>)}</div>
              </div>
              <select value={product.status} onChange={(e) => changeStatus(product, e.target.value as Product["status"])}><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select>
              <span className={styles.state}>{statusLabel[product.status]}</span>

              <form onSubmit={(event) => addDeparture(event, product)} style={{ gridColumn: "1 / -1", display: "grid", gap: 8 }}>
                <div className={styles.sectionLabel}><CalendarPlus /> Agregar otra salida</div>
                <div className={styles.gridThree}><label>Origen<input name="origin_iata" maxLength={3} placeholder="LIM" /></label><label>Salida<input name="departure_date" type="date" required /></label><label>Regreso<input name="return_date" type="date" required /></label></div>
                <div className={styles.gridThree}><label>Moneda<select name="currency" defaultValue="USD"><option>USD</option><option>PEN</option><option>EUR</option></select></label><label>Precio<input name="price_amount" min="0" step="0.01" type="number" required /></label><label>Cupos<input name="capacity" min="0" type="number" /></label></div>
                <div className={styles.gridTwo}><label>Umbral últimos cupos<input name="low_stock_threshold" min="0" type="number" defaultValue="5" /></label><button className={styles.primary} disabled={departureSaving === product.id} type="submit">{departureSaving === product.id ? <LoaderCircle className={styles.spin} /> : <CalendarPlus />}{departureSaving === product.id ? "Agregando…" : "Agregar salida"}</button></div>
              </form>
            </article>
          ))}</div>
        </section>
      </section>
    </main>
  );
}
