/* eslint-disable @next/next/no-img-element */
"use client";

import { Pencil } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Departure = {
  id: string;
  origin_iata?: string | null;
  departure_date?: string | null;
  return_date?: string | null;
  currency: string;
  price_amount: number;
  cost_amount?: number | null;
  margin_amount?: number | null;
  margin_pct?: number | null;
  capacity?: number | null;
  available_capacity?: number | null;
  status: string;
};

type Product = {
  id: string;
  slug: string;
  name: string;
  short_description?: string | null;
  description?: string | null;
  country?: string | null;
  city?: string | null;
  destination_iata?: string | null;
  product_type?: string | null;
  provider?: string | null;
  provider_reference?: string | null;
  duration_label?: string | null;
  tag?: string | null;
  included?: string[];
  status: string;
  featured?: boolean;
  sort_order?: number;
  from_price_amount?: number | null;
  active_departure_count?: number;
  departures?: Departure[];
  image_url?: string | null;
};

type UploadResult = {
  url: string;
  storage_provider: "cloudflare-r2";
  storage_key: string;
  bucket?: string;
};

const field: React.CSSProperties = { padding: "9px 10px", border: "1px solid #cfd5df", borderRadius: 7, width: "100%", background: "white" };
const label: React.CSSProperties = { display: "grid", gap: 5, fontSize: 12, color: "#475467" };
const th: React.CSSProperties = { textAlign: "left", padding: "7px 9px", border: "1px solid #dfe4ea", background: "#eef2f5", fontSize: 10, textTransform: "uppercase", color: "#536273" };
const td: React.CSSProperties = { padding: "7px 9px", border: "1px solid #e3e7eb", fontSize: 12, verticalAlign: "middle" };
const primary: React.CSSProperties = { background: "#102b50", color: "white", padding: "9px 12px", borderRadius: 8, border: 0, fontWeight: 800, cursor: "pointer" };
const secondary: React.CSSProperties = { background: "white", color: "#102b50", padding: "8px 11px", borderRadius: 8, border: "1px solid #b8c3d1", fontWeight: 800, cursor: "pointer" };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 2000, background: "rgba(15,23,42,.62)", display: "grid", placeItems: "center", padding: 20, overflowY: "auto" };
const modal: React.CSSProperties = { position: "relative", width: "min(940px,100%)", maxHeight: "calc(100vh - 40px)", overflowY: "auto", background: "white", borderRadius: 16, padding: 22, boxShadow: "0 28px 80px rgba(0,0,0,.3)" };
const closeButton: React.CSSProperties = { position: "absolute", right: 14, top: 10, border: 0, background: "transparent", fontSize: 28, cursor: "pointer", color: "#667085" };
const statusLabel: Record<string, string> = { draft: "Borrador", published: "Publicado", archived: "Archivado" };

function money(value?: number | null, currency = "USD") {
  return value == null ? "—" : new Intl.NumberFormat("es-PE", { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(value);
}

async function uploadToCloudflare(file: File): Promise<UploadResult> {
  const data = new FormData();
  data.append("file", file);
  const response = await fetch("/api/admin/catalog/images/upload", { method: "POST", body: data });
  const payload = (await response.json().catch(() => ({}))) as Partial<UploadResult> & { message?: string };
  if (!response.ok || !payload.url || !payload.storage_key) throw new Error(payload.message || "No pudimos subir la imagen a Cloudflare R2.");
  return payload as UploadResult;
}

async function attachPrimaryImage(productId: string, uploaded: UploadResult, altText: string) {
  const response = await fetch(`/api/admin/catalog/${encodeURIComponent(productId)}/images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: uploaded.url, alt_text: altText, is_primary: true, sort_order: 0, storage_provider: uploaded.storage_provider, storage_key: uploaded.storage_key, bucket_name: uploaded.bucket || "rumbo-images" }),
  });
  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) throw new Error(payload.message || "La imagen subió a Cloudflare, pero no pudimos asociarla al producto.");
}

export default function CatalogPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [provider, setProvider] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Creando…");
  const [newImage, setNewImage] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImageBusy, setSelectedImageBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/catalog", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "No pudimos cargar el catálogo.");
    const list = (payload.products || []) as Product[];
    setProducts(list);
    return list;
  }

  useEffect(() => { load().catch((e) => setError(e instanceof Error ? e.message : "No pudimos cargar el catálogo.")); }, []);

  const providers = useMemo(() => Array.from(new Set(products.map((item) => item.provider).filter(Boolean))) as string[], [products]);
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((item) => (!query || [item.name,item.slug,item.city,item.country,item.destination_iata,item.provider,item.tag].some((value) => String(value || "").toLowerCase().includes(query))) && (status === "all" || item.status === status) && (provider === "all" || item.provider === provider));
  }, [products, search, status, provider]);

  const perPage = 10;
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const paged = rows.slice((page - 1) * perPage, page * perPage);

  function chooseNewImage(file: File | null) {
    setNewImage(file); setNewImagePreview("");
    if (!file) return;
    const reader = new FileReader(); reader.onload = () => setNewImagePreview(typeof reader.result === "string" ? reader.result : ""); reader.readAsDataURL(file);
  }

  function openEditor(product: Product) {
    setSelected(product);
    setError("");
    setSuccess("");
    setEditOpen(true);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget;
    setBusy(true); setBusyLabel("Creando producto…"); setError(""); setSuccess("");
    let createdProduct: Product | null = null;
    try {
      const form = new FormData(formElement); const body: Record<string, unknown> = Object.fromEntries(form.entries());
      body.included = String(form.get("included") || "").split("\n").map((item) => item.trim()).filter(Boolean);
      delete body.image_alt;
      const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = (await response.json().catch(() => ({}))) as { product?: Product; message?: string };
      if (!response.ok || !payload.product) throw new Error(payload.message || "No pudimos crear el producto.");
      createdProduct = payload.product;
      if (newImage) {
        try {
          setBusyLabel("Subiendo imagen a Cloudflare…"); const uploaded = await uploadToCloudflare(newImage);
          setBusyLabel("Asociando imagen al producto…"); await attachPrimaryImage(createdProduct.id, uploaded, String(form.get("image_alt") || createdProduct.name));
        } catch (imageError) {
          setOpen(false); chooseNewImage(null); formElement.reset(); const refreshed = await load(); setSelected(refreshed.find((item) => item.id === createdProduct?.id) || createdProduct);
          setError(`El producto ${createdProduct.name} sí fue creado, pero su imagen no quedó asociada: ${imageError instanceof Error ? imageError.message : "error de carga"}. Puedes reintentar abajo en la ficha del producto.`); return;
        }
      }
      setOpen(false); chooseNewImage(null); formElement.reset(); const refreshed = await load(); setSelected(refreshed.find((item) => item.id === createdProduct?.id) || createdProduct);
      setSuccess(newImage ? "Producto creado e imagen principal guardada en Cloudflare R2." : "Producto creado. Puedes agregar su imagen principal desde la ficha inferior.");
    } catch (createError) { setError(createError instanceof Error ? createError.message : "No pudimos crear el producto."); }
    finally { setBusy(false); setBusyLabel("Creando…"); }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    setEditBusy(true); setError(""); setSuccess("");
    try {
      const form = new FormData(event.currentTarget);
      const body = {
        name: String(form.get("name") || "").trim(),
        short_description: String(form.get("short_description") || "").trim(),
        description: String(form.get("description") || "").trim(),
        country: String(form.get("country") || "").trim(),
        city: String(form.get("city") || "").trim(),
        destination_iata: String(form.get("destination_iata") || "").trim().toUpperCase(),
        duration_label: String(form.get("duration_label") || "").trim(),
        tag: String(form.get("tag") || "").trim(),
        status: String(form.get("status") || "draft"),
        featured: form.get("featured") === "on",
        sort_order: Number(form.get("sort_order") || 0),
      };
      const response = await fetch(`/api/admin/catalog/${encodeURIComponent(selected.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = (await response.json().catch(() => ({}))) as { product?: Product; message?: string };
      if (!response.ok) throw new Error(payload.message || "No pudimos actualizar el producto.");
      const refreshed = await load(); const updated = refreshed.find((item) => item.id === selected.id) || { ...selected, ...body };
      setSelected(updated as Product); setEditOpen(false); setSuccess(`${updated.name} actualizado correctamente.`);
    } catch (editError) { setError(editError instanceof Error ? editError.message : "No pudimos actualizar el producto."); }
    finally { setEditBusy(false); }
  }

  async function uploadSelectedImage() {
    if (!selected || !selectedImage) return;
    setSelectedImageBusy(true); setError(""); setSuccess("");
    try {
      const uploaded = await uploadToCloudflare(selectedImage); await attachPrimaryImage(selected.id, uploaded, selected.name);
      const refreshed = await load(); setSelected(refreshed.find((item) => item.id === selected.id) || selected); setSelectedImage(null); setSuccess(`Imagen principal de ${selected.name} actualizada en Cloudflare R2.`);
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "No pudimos actualizar la imagen."); }
    finally { setSelectedImageBusy(false); }
  }

  return <div style={{ maxWidth: 1400, margin: "0 auto", color: "#17233b" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", marginBottom: 14 }}>
      <div><p style={{ margin: 0, color: "#e9573b", fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }}>Rumbo · Administración mayorista</p><h1 style={{ fontSize: 32, margin: "4px 0" }}>Catálogo</h1><p style={{ margin: 0, color: "#667085" }}>Productos, imágenes Cloudflare R2, salidas, precios base, costos, margen y disponibilidad.</p></div>
      <button style={primary} onClick={() => { setError(""); setSuccess(""); setOpen(true); }}>+ Nuevo producto</button>
    </div>

    {error ? <div style={{ padding: 10, border: "1px solid #fecaca", background: "#fff5f5", color: "#991b1b", borderRadius: 8, marginBottom: 10 }}>{error}</div> : null}
    {success ? <div style={{ padding: 10, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534", borderRadius: 8, marginBottom: 10 }}>{success}</div> : null}

    <section style={{ background: "white", border: "1px solid #e4e7ec", borderRadius: 12, padding: 15 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar producto, destino, proveedor o código…" style={{ ...field, flex: "1 1 420px" }} />
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} style={{ ...field, width: 170 }}><option value="all">Todos los estados</option><option value="published">Publicado</option><option value="draft">Borrador</option><option value="archived">Archivado</option></select>
        <select value={provider} onChange={(event) => { setProvider(event.target.value); setPage(1); }} style={{ ...field, width: 180 }}><option value="all">Todos los proveedores</option>{providers.map((item) => <option key={item}>{item}</option>)}</select>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#667085", marginBottom: 6 }}><span>{rows.length} productos encontrados</span><span>Página {page} de {pages}</span></div>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}><thead><tr>{["Producto","Destino","Proveedor","Salidas","Precio desde","Costo","Margen","Cupos","Estado",""].map((heading,index) => <th key={`${heading}-${index}`} style={{...th,width:index===9?46:undefined}}>{heading}</th>)}</tr></thead><tbody>
        {paged.map((productRow) => { const departure=productRow.departures?.[0],currency=departure?.currency||"USD",isSelected=selected?.id===productRow.id; return <tr key={productRow.id} onClick={() => { setSelected(productRow); setSelectedImage(null); }} style={{ cursor: "pointer", background: isSelected ? "#eef5fb" : "transparent" }}>
          <td style={td}><div style={{ display:"flex",alignItems:"center",gap:8 }}>{productRow.image_url?<img src={productRow.image_url} alt="" style={{width:46,height:34,objectFit:"cover",borderRadius:6,border:"1px solid #e4e7ec"}}/>:<div style={{width:46,height:34,borderRadius:6,background:"#eef2f5",display:"grid",placeItems:"center",color:"#98a2b3",fontSize:9}}>Sin foto</div>}<span><b>{productRow.name}</b><small style={{display:"block",color:"#7d8796"}}>{productRow.slug}</small></span></div></td>
          <td style={td}>{[productRow.city,productRow.country,productRow.destination_iata].filter(Boolean).join(" · ")||"—"}</td><td style={td}>{productRow.provider||"Rumbo"}</td><td style={td}>{productRow.active_departure_count||0}</td><td style={td}>{money(productRow.from_price_amount??departure?.price_amount,currency)}</td><td style={td}>{money(departure?.cost_amount,currency)}</td><td style={td}>{departure?.margin_pct!=null?`${departure.margin_pct.toFixed(1)}%`:money(departure?.margin_amount,currency)}</td><td style={td}>{departure?.available_capacity??"—"}</td><td style={td}><span style={{padding:"4px 7px",borderRadius:999,background:"#eef3f7",fontWeight:800,fontSize:10}}>{statusLabel[productRow.status]||productRow.status}</span></td>
          <td style={{...td,textAlign:"center",padding:4}}>{isSelected?<button type="button" title="Editar producto" aria-label={`Editar ${productRow.name}`} onClick={(event)=>{event.stopPropagation();openEditor(productRow)}} style={{width:30,height:30,border:"1px solid #cfd8e3",borderRadius:7,background:"white",color:"#102b50",display:"grid",placeItems:"center",cursor:"pointer"}}><Pencil size={15}/></button>:null}</td>
        </tr>})}
      </tbody></table></div>
      <div style={{ display:"flex",justifyContent:"flex-end",gap:8,marginTop:9 }}><button disabled={page<=1} onClick={()=>setPage(v=>v-1)}>‹ Anterior</button><button disabled={page>=pages} onClick={()=>setPage(v=>v+1)}>Siguiente ›</button></div>
    </section>

    <section style={{ background:"white",border:"1px solid #e4e7ec",borderRadius:12,padding:15,marginTop:14,minHeight:180 }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
        <div><p style={{margin:0,color:"#e9573b",fontSize:10,fontWeight:800,textTransform:"uppercase"}}>Producto y salidas</p><div style={{display:"flex",alignItems:"center",gap:9}}><h2 style={{margin:"4px 0"}}>{selected?selected.name:"Selecciona un producto"}</h2>{selected?<button type="button" onClick={()=>openEditor(selected)} style={{...secondary,padding:"6px 9px",display:"inline-flex",alignItems:"center",gap:6}}><Pencil size={14}/> Editar</button>:null}</div>{selected?<small style={{color:"#667085"}}>{selected.city||selected.country||"Sin destino"} · {selected.slug}</small>:null}</div>
        {selected?<div style={{display:"flex",alignItems:"center",gap:10,padding:9,border:"1px solid #e4e7ec",borderRadius:10,minWidth:390}}>{selected.image_url?<img src={selected.image_url} alt={selected.name} style={{width:72,height:52,objectFit:"cover",borderRadius:7}}/>:<div style={{width:72,height:52,borderRadius:7,background:"#eef2f5",display:"grid",placeItems:"center",color:"#98a2b3",fontSize:10}}>Sin imagen</div>}<div style={{flex:1,display:"grid",gap:5}}><strong style={{fontSize:12}}>Imagen principal · Cloudflare R2</strong><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event)=>setSelectedImage(event.target.files?.[0]||null)} style={{fontSize:11}}/><small style={{color:"#667085"}}>JPG, PNG, WebP o GIF · máximo 10 MB.</small></div><button type="button" style={{...secondary,opacity:!selectedImage||selectedImageBusy?.55:1}} disabled={!selectedImage||selectedImageBusy} onClick={()=>void uploadSelectedImage()}>{selectedImageBusy?"Subiendo…":selected.image_url?"Reemplazar":"Agregar"}</button></div>:null}
      </div>
      {selected?<div style={{overflowX:"auto",marginTop:12}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}><thead><tr>{["Origen","Salida","Retorno","Precio","Costo","Margen","Capacidad","Disponibles","Estado"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{(selected.departures||[]).map(departure=><tr key={departure.id}><td style={td}>{departure.origin_iata||"—"}</td><td style={td}>{departure.departure_date||"—"}</td><td style={td}>{departure.return_date||"—"}</td><td style={td}>{money(departure.price_amount,departure.currency)}</td><td style={td}>{money(departure.cost_amount,departure.currency)}</td><td style={td}>{departure.margin_pct!=null?`${departure.margin_pct.toFixed(1)}%`:money(departure.margin_amount,departure.currency)}</td><td style={td}>{departure.capacity??"—"}</td><td style={td}>{departure.available_capacity??"—"}</td><td style={td}>{departure.status}</td></tr>)}</tbody></table>{!(selected.departures||[]).length?<p style={{color:"#667085"}}>Este producto todavía no tiene salidas.</p>:null}</div>:<p style={{color:"#667085"}}>Haz clic en una fila para ver sus salidas, disponibilidad e imagen principal.</p>}
    </section>

    {open?<div onMouseDown={(event)=>{if(event.target===event.currentTarget&&!busy)setOpen(false)}} style={overlay}><form onSubmit={create} onMouseDown={(event)=>event.stopPropagation()} style={modal}><button type="button" disabled={busy} onClick={()=>setOpen(false)} style={closeButton}>×</button><p style={{margin:0,color:"#e9573b",fontSize:10,fontWeight:800,textTransform:"uppercase"}}>Catálogo</p><h2 style={{margin:"4px 0"}}>Nuevo producto</h2><p style={{color:"#667085",marginTop:0}}>El producto queda en PostgreSQL y la imagen se almacena en Cloudflare R2.</p><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}><L n="name" t="Nombre" req/><L n="slug" t="Código / slug" req/><label style={label}>País<input name="country" placeholder="Panamá" style={field}/><small style={{color:"#98a2b3"}}>Rumbo deriva automáticamente región y subregión desde el país.</small></label><L n="city" t="Ciudad"/><L n="destination_iata" t="IATA destino"/><L n="provider" t="Proveedor" dv="Rumbo"/><L n="duration_label" t="Duración"/><L n="tag" t="Etiqueta comercial"/><label style={label}>Estado<select name="status" defaultValue="draft" style={field}><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select></label><label style={{...label,gridColumn:"1/-1"}}>Descripción<textarea name="description" rows={3} style={{...field,resize:"vertical"}}/></label><label style={{...label,gridColumn:"1/-1"}}>Incluye · un concepto por línea<textarea name="included" rows={3} placeholder={"Vuelo ida y vuelta\nHotel\nTraslados"} style={{...field,resize:"vertical"}}/></label><div style={{gridColumn:"1/-1",borderTop:"1px solid #e4e7ec",paddingTop:12}}><strong style={{fontSize:12}}>Imagen principal · Cloudflare R2</strong><div style={{display:"grid",gridTemplateColumns:newImagePreview?"150px 1fr":"1fr",gap:12,marginTop:8,alignItems:"center"}}>{newImagePreview?<img src={newImagePreview} alt="Vista previa" style={{width:150,height:96,borderRadius:9,objectFit:"cover",border:"1px solid #e4e7ec"}}/>:null}<div style={{border:"1px dashed #aeb9c7",borderRadius:10,padding:14,background:"#f8fafc"}}><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event)=>chooseNewImage(event.target.files?.[0]||null)}/><small style={{display:"block",color:"#667085",marginTop:5}}>JPG, PNG, WebP o GIF · máximo 10 MB.</small></div></div></div><L n="image_alt" t="Texto alternativo de la imagen"/><div style={{gridColumn:"1/-1",borderTop:"1px solid #e4e7ec",paddingTop:12}}><strong style={{fontSize:12}}>Primera salida · opcional</strong></div><L n="origin_iata" t="IATA origen"/><L n="departure_date" t="Fecha salida" type="date"/><L n="return_date" t="Fecha retorno" type="date"/><label style={label}>Moneda<select name="currency" defaultValue="USD" style={field}><option>USD</option><option>PEN</option><option>EUR</option><option>GBP</option></select></label><L n="price_amount" t="Precio base" type="number" step="0.01"/><L n="cost_amount" t="Costo" type="number" step="0.01"/><L n="capacity" t="Capacidad" type="number"/><L n="low_stock_threshold" t="Alerta de pocos cupos" type="number" dv="5"/></div><button disabled={busy} style={{...primary,marginTop:14,opacity:busy?.7:1}}>{busy?busyLabel:"Crear producto"}</button></form></div>:null}

    {editOpen&&selected?<div onMouseDown={(event)=>{if(event.target===event.currentTarget&&!editBusy)setEditOpen(false)}} style={overlay}><form onSubmit={saveEdit} onMouseDown={(event)=>event.stopPropagation()} style={{...modal,width:"min(780px,100%)"}}><button type="button" disabled={editBusy} onClick={()=>setEditOpen(false)} style={closeButton}>×</button><p style={{margin:0,color:"#e9573b",fontSize:10,fontWeight:800,textTransform:"uppercase"}}>Catálogo · Edición</p><h2 style={{margin:"4px 0"}}>Editar producto</h2><p style={{color:"#667085",marginTop:0}}><b>{selected.slug}</b> · Los cambios se guardan en PostgreSQL.</p><div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}><L n="name" t="Nombre" req dv={selected.name}/><L n="country" t="País" dv={selected.country||""}/><L n="city" t="Ciudad" dv={selected.city||""}/><L n="destination_iata" t="IATA destino" dv={selected.destination_iata||""}/><L n="duration_label" t="Duración" dv={selected.duration_label||""}/><L n="tag" t="Etiqueta comercial" dv={selected.tag||""}/><label style={label}>Estado<select name="status" defaultValue={selected.status} style={field}><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select></label><L n="sort_order" t="Orden" type="number" dv={String(selected.sort_order||0)}/><label style={{...label,gridColumn:"1/-1"}}>Descripción corta<input name="short_description" defaultValue={selected.short_description||""} style={field}/></label><label style={{...label,gridColumn:"1/-1"}}>Descripción<textarea name="description" defaultValue={selected.description||""} rows={4} style={{...field,resize:"vertical"}}/></label><label style={{...label,gridColumn:"1/-1",display:"flex",alignItems:"center",gap:8}}><input name="featured" type="checkbox" defaultChecked={Boolean(selected.featured)} style={{width:16,height:16}}/> Producto destacado</label></div><div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:15}}><button type="button" disabled={editBusy} onClick={()=>setEditOpen(false)} style={secondary}>Cancelar</button><button disabled={editBusy} style={{...primary,opacity:editBusy?.7:1}}>{editBusy?"Guardando…":"Guardar cambios"}</button></div></form></div>:null}
  </div>;
}

function L({n,t,type="text",req=false,dv,step}:{n:string;t:string;type?:string;req?:boolean;dv?:string;step?:string}) { return <label style={label}>{t}<input name={n} type={type} required={req} defaultValue={dv} step={step} style={field}/></label>; }
