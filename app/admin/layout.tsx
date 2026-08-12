import type { ReactNode } from "react";
import AdminLayoutClient from "./AdminLayoutClient";

export default function AdminLayout({children}:{children:ReactNode}){
  return <div className="rumbo-admin-root">
    <style>{`
      /* AdminLayoutClient used to hide the complete page until it found the
         sidebar in the DOM. When overview/API initialization failed or was
         slow, that turned a recoverable loading state into a blank screen. */
      .rumbo-admin-root [style*="visibility: hidden"][style*="height: 0"] {
        visibility: visible !important;
        height: auto !important;
        overflow: visible !important;
      }
    `}</style>
    <AdminLayoutClient>{children}</AdminLayoutClient>
  </div>;
}
