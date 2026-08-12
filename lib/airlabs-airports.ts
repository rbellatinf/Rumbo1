import { recordIntegrationCall } from "./integration-telemetry";

export type AirportOption = {
  id: string;
  iataCode: string;
  name: string;
  cityName: string;
  countryName: string;
  subType: "AIRPORT" | "CITY";
  label: string;
};

export type AirportSearchResult = {
  mode: "demo" | "live";
  provider: "AirLabs";
  airports: AirportOption[];
  message: string;
};

type AirLabsAirport = { iata_code?: string; icao_code?: string; name?: string; city?: string; city_code?: string; country_code?: string };
type AirLabsCity = { city_code?: string; name?: string; country_code?: string };
type AirLabsCountry = { code?: string; name?: string };
type AirLabsSuggestions = { airports?: AirLabsAirport[]; cities?: AirLabsCity[]; countries?: AirLabsCountry[] };
type AirLabsResponse = AirLabsSuggestions & { response?: AirLabsSuggestions; error?: { code?: string; message?: string } };

const demoAirports: AirportOption[] = [
  { id:"LIM",iataCode:"LIM",name:"Aeropuerto Internacional Jorge Chávez",cityName:"Lima",countryName:"Perú",subType:"AIRPORT",label:"Lima (LIM) · Jorge Chávez, Perú" },
  { id:"CUZ",iataCode:"CUZ",name:"Aeropuerto Internacional Alejandro Velasco Astete",cityName:"Cusco",countryName:"Perú",subType:"AIRPORT",label:"Cusco (CUZ) · Alejandro Velasco Astete, Perú" },
  { id:"AQP",iataCode:"AQP",name:"Aeropuerto Internacional Alfredo Rodríguez Ballón",cityName:"Arequipa",countryName:"Perú",subType:"AIRPORT",label:"Arequipa (AQP) · Rodríguez Ballón, Perú" },
  { id:"PTY",iataCode:"PTY",name:"Aeropuerto Internacional de Tocumen",cityName:"Ciudad de Panamá",countryName:"Panamá",subType:"AIRPORT",label:"Ciudad de Panamá (PTY) · Tocumen, Panamá" },
  { id:"CUN",iataCode:"CUN",name:"Aeropuerto Internacional de Cancún",cityName:"Cancún",countryName:"México",subType:"AIRPORT",label:"Cancún (CUN) · Internacional, México" },
  { id:"PUJ",iataCode:"PUJ",name:"Aeropuerto Internacional de Punta Cana",cityName:"Punta Cana",countryName:"República Dominicana",subType:"AIRPORT",label:"Punta Cana (PUJ) · Internacional, República Dominicana" },
  { id:"CTG",iataCode:"CTG",name:"Aeropuerto Internacional Rafael Núñez",cityName:"Cartagena",countryName:"Colombia",subType:"AIRPORT",label:"Cartagena (CTG) · Rafael Núñez, Colombia" },
  { id:"MAD",iataCode:"MAD",name:"Aeropuerto Adolfo Suárez Madrid-Barajas",cityName:"Madrid",countryName:"España",subType:"AIRPORT",label:"Madrid (MAD) · Barajas, España" },
  { id:"MIA",iataCode:"MIA",name:"Miami International Airport",cityName:"Miami",countryName:"Estados Unidos",subType:"AIRPORT",label:"Miami (MIA) · International, Estados Unidos" },
];

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function demoSearch(keyword: string) { const query=normalize(keyword);return demoAirports.filter((airport)=>[airport.iataCode,airport.name,airport.cityName,airport.countryName].map(normalize).some((field)=>field.startsWith(query)||field.split(/[^a-z0-9]+/).some((word)=>word.startsWith(query)))).slice(0,8); }
function regionName(countryCode?: string, providedName?: string) { if(providedName?.trim())return providedName.trim();const code=countryCode?.trim().toUpperCase();if(!code)return "";try{return new Intl.DisplayNames(["es"],{type:"region"}).of(code)||code}catch{return code} }
function mapAirport(airport:AirLabsAirport,countries:Map<string,string>):AirportOption|null{const iataCode=airport.iata_code?.trim().toUpperCase();if(!iataCode||iataCode.length!==3)return null;const name=airport.name?.trim()||iataCode,cityName=airport.city?.trim()||name,countryCode=airport.country_code?.trim().toUpperCase(),countryName=regionName(countryCode,countryCode?countries.get(countryCode):undefined);return{id:`AIRPORT-${airport.icao_code?.trim()||iataCode}`,iataCode,name,cityName,countryName,subType:"AIRPORT",label:`${cityName} (${iataCode}) · ${name}${countryName?`, ${countryName}`:""}`}}
function mapCity(city:AirLabsCity,countries:Map<string,string>):AirportOption|null{const iataCode=city.city_code?.trim().toUpperCase();if(!iataCode||iataCode.length!==3)return null;const cityName=city.name?.trim()||iataCode,countryCode=city.country_code?.trim().toUpperCase(),countryName=regionName(countryCode,countryCode?countries.get(countryCode):undefined);return{id:`CITY-${iataCode}`,iataCode,name:cityName,cityName,countryName,subType:"CITY",label:`${cityName} (${iataCode})${countryName?`, ${countryName}`:""}`}}
function uniqueOptions(options:AirportOption[]){const seen=new Set<string>();return options.filter(option=>{const key=`${option.subType}-${option.iataCode}`;if(seen.has(key))return false;seen.add(key);return true})}

export async function searchAirports(rawKeyword:string):Promise<AirportSearchResult>{
  const keyword=rawKeyword.trim().slice(0,80),apiKey=process.env.AIRLABS_API_KEY?.trim(),baseUrl=(process.env.AIRLABS_API_BASE_URL||"https://airlabs.co/api/v9").replace(/\/$/,"");
  if(!apiKey||keyword.length<3)return{mode:"demo",provider:"AirLabs",airports:demoSearch(keyword),message:apiKey?"Escribe al menos tres letras para consultar AirLabs.":"Catálogo local de respaldo. Añade la clave de AirLabs para consultar aeropuertos mundiales."};
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000),started=Date.now();
  try{
    const query=new URLSearchParams({q:keyword,lang:"es",api_key:apiKey,_fields:"name,iata_code,icao_code,city,city_code,country_code"});
    const response=await fetch(`${baseUrl}/suggest?${query.toString()}`,{headers:{accept:"application/json"},cache:"no-store",signal:controller.signal});
    if(!response.ok)throw new Error(`AirLabs suggestions returned ${response.status}`);
    const payload=(await response.json()) as AirLabsResponse;if(payload.error)throw new Error(payload.error.message||payload.error.code||"AirLabs error");
    const suggestions=payload.response||payload,countries=new Map((suggestions.countries??[]).filter(country=>country.code&&country.name).map(country=>[country.code!.trim().toUpperCase(),country.name!.trim()]));
    const airports=uniqueOptions([...(suggestions.cities??[]).map(city=>mapCity(city,countries)).filter((option):option is AirportOption=>option!==null),...(suggestions.airports??[]).map(airport=>mapAirport(airport,countries)).filter((option):option is AirportOption=>option!==null)]).slice(0,10);
    recordIntegrationCall({integrationCode:"airlabs",serviceCode:"airport-suggest",source:"storefront",success:true,httpStatus:response.status,durationMs:Date.now()-started,requestSummary:{query:keyword},responseSummary:{results:airports.length}});
    return{mode:"live",provider:"AirLabs",airports,message:"Aeropuertos consultados en AirLabs."};
  }catch(error){
    recordIntegrationCall({integrationCode:"airlabs",serviceCode:"airport-suggest",source:"storefront",success:false,httpStatus:null,durationMs:Date.now()-started,errorCode:"AIRLABS_FAILED",errorMessage:error instanceof Error?error.message:"AirLabs error",requestSummary:{query:keyword}});
    return{mode:"demo",provider:"AirLabs",airports:demoSearch(keyword),message:"AirLabs no respondió; se muestran aeropuertos del catálogo local de respaldo."};
  }finally{clearTimeout(timeout)}
}
