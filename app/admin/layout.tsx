import type { ReactNode } from "react";
import AdminLayoutClient from "./AdminLayoutClient";
import AdminNavGuard from "./AdminNavGuard";

export default function AdminLayout({children}:{children:ReactNode}){
  return <AdminLayoutClient><AdminNavGuard/>{children}</AdminLayoutClient>;
}
