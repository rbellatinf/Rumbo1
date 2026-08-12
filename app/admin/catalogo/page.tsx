import { redirect } from "next/navigation";

export default function LegacyCatalogPage() {
  redirect("/admin?module=catalog");
}
