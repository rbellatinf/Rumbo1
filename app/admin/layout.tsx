import Link from "next/link";
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <nav
        aria-label="Módulos administrativos de Rumbo"
        style={{
          position: "fixed",
          left: 18,
          bottom: 48,
          width: 224,
          zIndex: 40,
          display: "grid",
          gap: 5,
          paddingTop: 10,
          borderTop: "1px solid #e4e7ec",
          background: "#fff",
        }}
      >
        <span style={{ color: "#98a2b3", fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", padding: "0 12px 2px" }}>
          Módulos
        </span>
        <Link href="/admin/usuarios" style={navItem}>👥 Usuarios</Link>
        <Link href="/admin/pricing" style={navItem}>🏷️ Pricing</Link>
      </nav>
    </>
  );
}

const navItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  color: "#667085",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: 700,
};
