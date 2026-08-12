import { recordIntegrationCall } from "./integration-telemetry.ts";

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

type AirLabsAirport = {
  iata_code?: string;
  icao_code?: string;
  name?: string;
  city?: string;
  city_code?: string;
  country_code?: string;
  popularity?: number;
  is_major?: boolean | number;
  is_international?: boolean | number;
};
type AirLabsCity = { city_code?: string; name?: string; country_code?: string };
type AirLabsCountry = { code?: string; name?: string };
type AirLabsSuggestions = {
  airports?: AirLabsAirport[];
  cities?: AirLabsCity[];
  countries?: AirLabsCountry[];
  airports_by_cities?: AirLabsAirport[];
  airports_by_countries?: AirLabsAirport[];
  cities_by_airports?: AirLabsCity[];
  cities_by_countries?: AirLabsCity[];
};
type AirLabsResponse = AirLabsSuggestions & { response?: AirLabsSuggestions; error?: { code?: string; message?: string } };
type AirLabsAirportListResponse = AirLabsAirport[] | { response?: AirLabsAirport[]; error?: { code?: string; message?: string } };

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
  { id:"CDG",iataCode:"CDG",name:"Paris Charles de Gaulle Airport",cityName:"París",countryName:"Francia",subType:"AIRPORT",label:"París (CDG) · Charles de Gaulle, Francia" },
  { id:"ORY",iataCode:"ORY",name:"Paris Orly Airport",cityName:"París",countryName:"Francia",subType:"AIRPORT",label:"París (ORY) · Orly, Francia" },
  { id:"NCE",iataCode:"NCE",name:"Nice Côte d’Azur Airport",cityName:"Niza",countryName:"Francia",subType:"AIRPORT",label:"Niza (NCE) · Côte d’Azur, Francia" },
  { id:"LYS",iataCode:"LYS",name:"Lyon-Saint Exupéry Airport",cityName:"Lyon",countryName:"Francia",subType:"AIRPORT",label:"Lyon (LYS) · Saint Exupéry, Francia" },
  { id:"MRS",iataCode:"MRS",name:"Marseille Provence Airport",cityName:"Marsella",countryName:"Francia",subType:"AIRPORT",label:"Marsella (MRS) · Provence, Francia" },
  { id:"TLS",iataCode:"TLS",name:"Toulouse-Blagnac Airport",cityName:"Toulouse",countryName:"Francia",subType:"AIRPORT",label:"Toulouse (TLS) · Blagnac, Francia" },
  { id:"BOD",iataCode:"BOD",name:"Bordeaux-Mérignac Airport",cityName:"Burdeos",countryName:"Francia",subType:"AIRPORT",label:"Burdeos (BOD) · Mérignac, Francia" },
];

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function demoSearch(keyword: string) {
  const query=normalize(keyword);
  return demoAirports.filter((airport)=>[airport.iataCode,airport.name,airport.cityName,airport.countryName].map(normalize).some((field)=>field.startsWith(query)||field.includes(query)||field.split(/[^a-z0-9]+/).some((word)=>word.startsWith(query)))).slice(0,30);
}
function regionName(countryCode?: string, providedName?: string) { if(providedName?.trim())return providedName.trim();const code=countryCode?.trim().toUpperCase();if(!code)return "";try{return new Intl.DisplayNames(["es"],{type:"region"}).of(code)||code}catch{return code} }
function mapAirport(airport:AirLabsAirport,countries:Map<string,string>):AirportOption|null{const iataCode=airport.iata_code?.trim().toUpperCase();if(!iataCode||iataCode.length!==3)return null;const name=airport.name?.trim()||iataCode,cityName=airport.city?.trim()||name,countryCode=airport.country_code?.trim().toUpperCase(),countryName=regionName(countryCode,countryCode?countries.get(countryCode):undefined);return{id:`AIRPORT-${airport.icao_code?.trim()||iataCode}`,iataCode,name,cityName,countryName,subType:"AIRPORT",label:`${cityName} (${iataCode}) · ${name}${countryName?`, ${countryName}`:""}`}}
function mapCity(city:AirLabsCity,countries:Map<string,string>):AirportOption|null{const iataCode=city.city_code?.trim().toUpperCase();if(!iataCode||iataCode.length!==3)return null;const cityName=city.name?.trim()||iataCode,countryCode=city.country_code?.trim().toUpperCase(),countryName=regionName(countryCode,countryCode?countries.get(countryCode):undefined);return{id:`CITY-${iataCode}`,iataCode,name:cityName,cityName,countryName,subType:"CITY",label:`${cityName} (${iataCode})${countryName?`, ${countryName}`:""}`}}
function uniqueOptions(options:AirportOption[]){const seen=new Set<string>();return options.filter(option=>{const key=`${option.subType}-${option.iataCode}`;if(seen.has(key))return false;seen.add(key);return true})}
function airportList(payload:AirLabsAirportListResponse){if(Array.isArray(payload))return payload;return Array.isArray(payload.response)?payload.response:[]}
function countryMatch(keyword:string,countries:AirLabsCountry[]){const q=normalize(keyword);return countries.find(country=>{const name=normalize(country.name||"");return Boolean(country.code)&&(name===q||name.startsWith(q)||q.startsWith(name))})||countries[0]||null}

export async function searchAirports(rawKeyword:string):Promise<AirportSearchResult>{
  const keyword=rawKeyword.trim().slice(0,80),apiKey=process.env.AIRLABS_API_KEY?.trim(),baseUrl=(process.env.AIRLABS_API_BASE_URL||"https://airlabs.co/api/v9").replace(/\/$/,"");
  if(!apiKey||keyword.length<3)return{mode:"demo",provider:"AirLabs",airports:demoSearch(keyword),message:apiKey?"Escribe al menos tres letras para consultar AirLabs.":"Catálogo local de respaldo. Añade la clave de AirLabs para consultar aeropuertos mundiales."};
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7000),started=Date.now();
  try{
    const query=new URLSearchParams({q:keyword,lang:"es",api_key:apiKey,_fields:"name,iata_code,icao_code,city,city_code,country_code,popularity,is_major,is_international"});
    const response=await fetch(`${baseUrl}/suggest?${query.toString()}`,{headers:{accept:"application/json"},cache:"no-store",signal:controller.signal});
    if(!response.ok)throw new Error(`AirLabs suggestions returned ${response.status}`);
    const payload=(await response.json()) as AirLabsResponse;if(payload.error)throw new Error(payload.error.message||payload.error.code||"AirLabs error");
    const suggestions=payload.response||payload;
    const countries=new Map((suggestions.countries??[]).filter(country=>country.code&&country.name).map(country=>[country.code!.trim().toUpperCase(),country.name!.trim()]));
    let providerAirports=[
      ...(suggestions.airports??[]),
      ...(suggestions.airports_by_cities??[]),
      ...(suggestions.airports_by_countries??[]),
    ];
    const matchedCountry=countryMatch(keyword,suggestions.countries??[]);
    if(matchedCountry?.code){
      const countryCode=matchedCountry.code.trim().toUpperCase();
      const countryQuery=new URLSearchParams({country_code:countryCode,api_key:apiKey,_fields:"name,iata_code,icao_code,city,city_code,country_code,popularity,is_major,is_international"});
      const countryResponse=await fetch(`${baseUrl}/airports?${countryQuery.toString()}`,{headers:{accept:"application/json"},cache:"no-store",signal:controller.signal});
      if(countryResponse.ok){
        const countryPayload=(await countryResponse.json()) as AirLabsAirportListResponse;
        providerAirports=[...providerAirports,...airportList(countryPayload)];
        if(matchedCountry.name) countries.set(countryCode,matchedCountry.name);
      }
    }
    providerAirports.sort((a,b)=>Number(b.is_major||0)-Number(a.is_major||0)||Number(b.is_international||0)-Number(a.is_international||0)||Number(b.popularity||0)-Number(a.popularity||0));
    const airports=uniqueOptions([
      ...(suggestions.cities??[]).map(city=>mapCity(city,countries)).filter((option):option is AirportOption=>option!==null),
      ...providerAirports.map(airport=>mapAirport(airport,countries)).filter((option):option is AirportOption=>option!==null),
    ]).slice(0,60);
    recordIntegrationCall({integrationCode:"airlabs",serviceCode:"airport-suggest",source:"storefront",success:true,httpStatus:response.status,durationMs:Date.now()-started,requestSummary:{query:keyword,country_code:matchedCountry?.code||null},responseSummary:{results:airports.length}});
    return{mode:"live",provider:"AirLabs",airports,message:matchedCountry?.code?`Aeropuertos de ${regionName(matchedCountry.code,matchedCountry.name)} consultados en AirLabs.`:"Aeropuertos consultados en AirLabs."};
  }catch(error){
    recordIntegrationCall({integrationCode:"airlabs",serviceCode:"airport-suggest",source:"storefront",success:false,httpStatus:null,durationMs:Date.now()-started,errorCode:"AIRLABS_FAILED",errorMessage:error instanceof Error?error.message:"AirLabs error",requestSummary:{query:keyword}});
    return{mode:"demo",provider:"AirLabs",airports:demoSearch(keyword),message:"AirLabs no respondió; se muestran aeropuertos del catálogo local de respaldo."};
  }finally{clearTimeout(timeout)}
}
