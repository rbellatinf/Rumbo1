import fs from "node:fs/promises";

const path="app/page.tsx";
let source=await fs.readFile(path,"utf8");
function replaceExact(from,to,count=1){const parts=source.split(from);if(parts.length-1!==count)throw new Error(`Expected ${count} occurrence(s), found ${parts.length-1}: ${from.slice(0,90)}`);source=parts.join(to)}

replaceExact('import {\n  demoTravelPackages,\n  type TravelPackage,\n} from "../lib/travel-packages";','import type { TravelPackage } from "../lib/travel-packages";');
replaceExact('onModeChange: (mode: "demo" | "live") => void;','onModeChange: (mode: "error" | "live") => void;');
replaceExact('  const [hasResolved, setHasResolved] = useState(false);','  const [hasResolved, setHasResolved] = useState(false);\n  const [lookupError, setLookupError] = useState("");');
replaceExact('        .then((response) => {\n          if (!response.ok) throw new Error("No se pudo buscar aeropuertos");\n          return response.json() as Promise<AirportSearchResult>;\n        })','        .then(async (response) => {\n          const result = (await response.json()) as AirportSearchResult;\n          if (!response.ok) throw new Error(result.message || `AirLabs respondió HTTP ${response.status}`);\n          return result;\n        })');
replaceExact('          setOptions(result.airports);\n          setHasResolved(true);\n          onModeChange(result.mode);','          setOptions(result.airports);\n          setHasResolved(true);\n          setLookupError("");\n          onModeChange(result.mode);');
replaceExact('          setOptions([]);\n          setHasResolved(true);\n        })','          setOptions([]);\n          setHasResolved(true);\n          setLookupError(error instanceof Error ? error.message : "AirLabs no respondió.");\n          onModeChange("error");\n        })');
replaceExact('      {isOpen && (options.length > 0 || isLoading || hasResolved) ? (','      {isOpen && (options.length > 0 || isLoading || hasResolved || lookupError) ? (');
replaceExact('          {!isLoading && hasResolved && options.length === 0 ? (\n            <p>No encontramos aeropuertos para esa búsqueda.</p>\n          ) : null}','          {!isLoading && hasResolved && options.length === 0 ? (\n            <p role={lookupError ? "alert" : undefined}>{lookupError || "No encontramos aeropuertos para esa búsqueda."}</p>\n          ) : null}');
replaceExact('  const [deals, setDeals] = useState<TravelPackage[]>(demoTravelPackages);','  const [deals, setDeals] = useState<TravelPackage[]>([]);');
replaceExact('useState<"demo" | "live">("demo")','useState<"error" | "live">("error")',3);
replaceExact('    "Modo demostración: estas referencias no admiten reservas ni cobros.",','    "Consultando el catálogo nativo de Rumbo…",');
replaceExact('          mode: "demo" | "live";','          mode: "error" | "live";',1);
replaceExact('      .catch(() => {\n        if (!isActive) return;\n        setCatalogMode("demo");\n      });','      .catch((error) => {\n        if (!isActive) return;\n        setDeals([]);\n        setCatalogMode("error");\n        setCatalogMessage(error instanceof Error ? error.message : "No pudimos consultar el catálogo nativo de Rumbo.");\n      });');
replaceExact('        mode: "demo" | "live";','        mode: "error" | "live";',1);
replaceExact('export default function Home() {','const isNativeRumboDeal = (deal: TravelPackage) => deal.provider === "Rumbo" && Boolean(deal.providerReference?.startsWith("rumbo:"));\n\nexport default function Home() {');
replaceExact('if (deal.provider !== "Spree" || !deal.providerReference) {','if (!isNativeRumboDeal(deal) || !deal.providerReference) {');
replaceExact('      selectedDeal.provider !== "Spree" ||','      !isNativeRumboDeal(selectedDeal) ||');
replaceExact('{airportMode === "live" ? "aeropuertos conectados" : "respaldo local"}','{airportMode === "live" ? "aeropuertos conectados" : "no conectado"}');
replaceExact('{packageMode === "live" ? "paquetes conectados" : "sandbox pendiente"}','{packageMode === "live" ? "paquetes conectados" : "no conectado"}');
replaceExact('{catalogMode === "live" ? "Catálogo conectado" : "Modo demostración"}','{catalogMode === "live" ? "Catálogo conectado" : "Error de catálogo"}');
replaceExact('deal.provider === "Spree" && typeof deal.capacity === "number"','isNativeRumboDeal(deal) && typeof deal.capacity === "number"');
replaceExact('deal.provider === "Spree" && deal.bookable','isNativeRumboDeal(deal) && deal.bookable');
replaceExact('                        selectedDeal.provider !== "Spree" ||','                        !isNativeRumboDeal(selectedDeal) ||');

if(source.includes('"Spree"'))throw new Error('Spree runtime alias still present in app/page.tsx');
await fs.writeFile(path,source);
console.log('Native home cutover applied successfully.');
