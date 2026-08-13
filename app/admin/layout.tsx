import type { ReactNode } from "react";
import AdminRuntime from "./AdminRuntime";

export default function AdminLayout({children}:{children:ReactNode}){
  return <div className="rumbo-admin-root">
    <style>{`
      /* The base Admin must never disappear while client-side enhancements
         initialize. React serializes inline styles without guaranteed spaces,
         so do not depend on matching the literal style attribute. */
      .rumbo-admin-root > div > div:first-of-type {
        visibility: visible !important;
        height: auto !important;
        overflow: visible !important;
      }
      .rumbo-admin-root [style*="visibility:hidden"],
      .rumbo-admin-root [style*="visibility: hidden"] {
        visibility: visible !important;
      }
    `}</style>
    <AdminRuntime>{children}</AdminRuntime>
  </div>;
}
