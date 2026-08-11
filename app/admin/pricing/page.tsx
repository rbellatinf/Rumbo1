import { redirect } from "next/navigation";

export default function PricingRedirect(){
  redirect("/admin?module=pricing");
}
