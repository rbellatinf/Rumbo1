"use client";

import { ArrowLeft, CheckCircle2, Image as ImageIcon, LoaderCircle, PackagePlus, Save } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import styles from "./catalogo.module.css";

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
  departure_date?: string;
  return_date?: string;
  capacity?: number;
  available_capacity?: number;
  image_url?: string;
};

const statusLabel = { draft: "Borrador", published: "Publicado", archived: "Archivado" };

export default function CatalogAdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      name: String(form.get("name") || ""),
      slug: String(form.get("slug") || ""),
      short_description: String(form.get("short_description") || ""),
      description: String(form.get("description") || ""),
      country: String(form.get("country") || ""),
      city: String(form.get("city") || ""),
      destination_iata: String(form.get("destination_iata") || "").toUpperCase(),
      duration_label: String(form.get("duration_label") || ""),
      tag: String(form.get("tag") || ""),
      included: String(form.get("included") || "").split("\n").map((x) => x.trim()).filter(Boolean),
      status: String(form.get("status") || "draft"),
      provider: String(form.get("provider") || "Rumbo"),
      provider_reference: String(form.get("provider_reference") || ""),
      currency: String(form.get("currency") || "USD"),
      price_amount: Number(form.get("price_amount") || 0),
      departure_date: String(form.get("departure_date") || ""),
      return_date: String(form.get("return_date") || ""),
      capacity: form.get("capacity") ? Number(form.get("capacity")) : null,
      image_url: String(form.get("image_url") || ""),
      image_alt: String(form.get("image_alt") || ""),
      featured: form.get("featured") === "on",
    };
    try {
      const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "No pudimos crear el producto.");
      event.currentTarget.reset();
      setSuccess("Producto guardado en el catálogo propio de Rumbo.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos crear el producto."); }
    finally { setSaving(false); }
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
        <div><p>Rumbo · Backoffice propio</p><h1>Catálogo</h1><span>Productos y paquetes administrados directamente en PostgreSQL.</span></div>
        <Link href="/admin"><ArrowLeft /> Volver a administración</Link>
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}><CheckCircle2 /> {success}</div> : null}

      <section className={styles.layout}>
        <form className={styles.formCard} onSubmit={submit}>
          <div className={styles.cardTitle}><PackagePlus /><div><h2>Nuevo producto</h2><p>Crea una oferta propia de Rumbo. Puedes dejarla en borrador hasta completar precio, salida e imagen.</p></div></div>

          <div className={styles.gridTwo}>
            <label>Nombre<input name="name" required placeholder="Cusco esencial" /></label>
            <label>Slug<input name="slug" required placeholder="cusco-esencial" /></label>
          </div>
          <label>Descripción corta<input name="short_description" placeholder="Paquete de 4 días con hotel y traslados" /></label>
          <label>Descripción<textarea name="description" rows={3} /></label>
          <div className={styles.gridThree}>
            <label>País<input name="country" placeholder="Perú" /></label>
            <label>Ciudad<input name="city" placeholder="Cusco" /></label>
            <label>IATA destino<input name="destination_iata" maxLength={3} placeholder="CUZ" /></label>
          </div>
          <div className={styles.gridTwo}>
            <label>Duración<input name="duration_label" placeholder="4 días / 3 noches" /></label>
            <label>Etiqueta<input name="tag" placeholder="Más elegido" /></label>
          </div>
          <label>Incluye <small>Un beneficio por línea</small><textarea name="included" rows={4} placeholder={'Vuelo ida y vuelta\nHotel con desayuno\nTraslados'} /></label>

          <div className={styles.sectionLabel}>Precio y salida</div>
          <div className={styles.gridThree}>
            <label>Moneda<select name="currency" defaultValue="USD"><option>USD</option><option>PEN</option><option>EUR</option></select></label>
            <label>Precio<input name="price_amount" min="0" step="0.01" type="number" /></label>
            <label>Cupos<input name="capacity" min="0" type="number" /></label>
          </div>
          <div className={styles.gridTwo}>
            <label>Fecha salida<input name="departure_date" type="date" /></label>
            <label>Fecha regreso<input name="return_date" type="date" /></label>
          </div>

          <div className={styles.sectionLabel}>Imagen y publicación</div>
          <label>URL de imagen<div className={styles.iconInput}><ImageIcon /><input name="image_url" placeholder="https://..." /></div></label>
          <label>Texto alternativo<input name="image_alt" /></label>
          <div className={styles.gridTwo}>
            <label>Proveedor<input name="provider" defaultValue="Rumbo" /></label>
            <label>Referencia proveedor<input name="provider_reference" /></label>
          </div>
          <div className={styles.gridTwo}>
            <label>Estado<select name="status" defaultValue="draft"><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select></label>
            <label className={styles.check}><input name="featured" type="checkbox" /><span>Destacar en la portada</span></label>
          </div>

          <button className={styles.primary} disabled={saving} type="submit">{saving ? <LoaderCircle className={styles.spin} /> : <Save />}{saving ? "Guardando…" : "Guardar producto"}</button>
        </form>

        <section className={styles.listCard}>
          <div className={styles.cardTitle}><div><h2>Productos de Rumbo</h2><p>Publicar hace que el producto pueda aparecer en el storefront cuando tenga una salida activa.</p></div></div>
          {loading ? <p className={styles.loading}><LoaderCircle className={styles.spin} /> Cargando catálogo…</p> : null}
          {!loading && products.length === 0 ? <p className={styles.empty}>Todavía no hay productos propios.</p> : null}
          <div className={styles.productList}>{products.map((product) => (
            <article key={product.id} className={styles.product}>
              <div className={styles.thumb}>{product.image_url ? <img alt="" src={product.image_url} /> : <ImageIcon />}</div>
              <div className={styles.productCopy}><div><strong>{product.name}</strong><span>{product.city || product.country || "Sin destino"} {product.destination_iata ? `· ${product.destination_iata}` : ""}</span></div><small>{product.departure_date || "Sin salida"} · {product.price_amount ? `${product.currency} ${product.price_amount}` : "Sin precio"}</small></div>
              <select value={product.status} onChange={(e) => changeStatus(product, e.target.value as Product["status"])}><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select>
              <span className={styles.state}>{statusLabel[product.status]}</span>
            </article>
          ))}</div>
        </section>
      </section>
    </main>
  );
}
