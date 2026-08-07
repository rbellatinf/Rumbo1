import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function PartnerPanelLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  if (!cookieStore.get("rumbo_session")) redirect("/acceso");
  return children;
}
