import { redirect } from "next/navigation";

export default function AgenciesAdminRedirect(){
  redirect("/admin?tab=retailers");
}
