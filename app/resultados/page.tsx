import { Suspense } from "react";
import ResultsClient from "./ResultsClient";

export const dynamic="force-dynamic";

export default function ResultsPage(){
  return <Suspense fallback={<main style={{minHeight:"100vh",display:"grid",placeItems:"center",fontFamily:"var(--font-geist-sans)",color:"#667085"}}>Cargando resultados…</main>}><ResultsClient/></Suspense>;
}
