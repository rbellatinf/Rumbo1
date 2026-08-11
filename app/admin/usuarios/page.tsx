import { redirect } from "next/navigation";

export default function RumboUsersRedirect(){
  redirect("/admin?module=users");
}
