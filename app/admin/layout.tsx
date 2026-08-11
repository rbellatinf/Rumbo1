import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,padding:"8px 22px",background:"#fff",borderBottom:"1px solid #e4e7ec",fontSize:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Link href="/admin" style={navItem}>Backoffice</Link>
          <Link href="/admin/usuarios" style={navItem}>Usuarios</Link>
          <Link href="/admin/pricing" style={navItem}>Pricing</Link>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <Link href="/admin/agencias/nueva" style={actionItem}>+ Nueva agencia</Link>
          <Link href="/admin/partners/nuevo" style={actionItem}>+ Nuevo partner</Link>
        </div>
      </div>
      {children}
    </>
  );
}

const navItem: CSSProperties = {
  padding:"6px 10px",
  borderRadius:7,
  color:"#475467",
  textDecoration:"none",
  fontWeight:700,
  background:"#f7f8fa",
};

const actionItem: CSSProperties = {
  padding:"6px 10px",
  borderRadius:7,
  color:"#fff",
  textDecoration:"none",
  fontWeight:800,
  background:"#10223f",
};
