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
  provider: "Amadeus";
  airports: AirportOption[];
  message: string;
};

type AmadeusLocation = {
  id?: string;
  subType?: string;
  name?: string;
  detailedName?: string;
  iataCode?: string;
  address?: {
    cityName?: string;
    countryName?: string;
  };
};

type AmadeusLocationsResponse = {
  data?: AmadeusLocation[];
};

type AmadeusTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

const demoAirports: AirportOption[] = [
  {
    id: "ALIM",
    iataCode: "LIM",
    name: "Aeropuerto Internacional Jorge Chávez",
    cityName: "Lima",
    countryName: "Perú",
    subType: "AIRPORT",
    label: "Lima (LIM) · Jorge Chávez, Perú",
  },
  {
    id: "ACUZ",
    iataCode: "CUZ",
    name: "Aeropuerto Internacional Alejandro Velasco Astete",
    cityName: "Cusco",
    countryName: "Perú",
    subType: "AIRPORT",
    label: "Cusco (CUZ) · Alejandro Velasco Astete, Perú",
  },
  {
    id: "AQP",
    iataCode: "AQP",
    name: "Aeropuerto Internacional Alfredo Rodríguez Ballón",
    cityName: "Arequipa",
    countryName: "Perú",
    subType: "AIRPORT",
    label: "Arequipa (AQP) · Rodríguez Ballón, Perú",
  },
  {
    id: "CUN",
    iataCode: "CUN",
    name: "Aeropuerto Internacional de Cancún",
    cityName: "Cancún",
    countryName: "México",
    subType: "AIRPORT",
    label: "Cancún (CUN) · Internacional, México",
  },
  {
    id: "PUJ",
    iataCode: "PUJ",
    name: "Aeropuerto Internacional de Punta Cana",
    cityName: "Punta Cana",
    countryName: "República Dominicana",
    subType: "AIRPORT",
    label: "Punta Cana (PUJ) · Internacional, República Dominicana",
  },
  {
    id: "CTG",
    iataCode: "CTG",
    name: "Aeropuerto Internacional Rafael Núñez",
    cityName: "Cartagena",
    countryName: "Colombia",
    subType: "AIRPORT",
    label: "Cartagena (CTG) · Rafael Núñez, Colombia",
  },
  {
    id: "MAD",
    iataCode: "MAD",
    name: "Aeropuerto Adolfo Suárez Madrid-Barajas",
    cityName: "Madrid",
    countryName: "España",
    subType: "AIRPORT",
    label: "Madrid (MAD) · Barajas, España",
  },
  {
    id: "MIA",
    iataCode: "MIA",
    name: "Miami International Airport",
    cityName: "Miami",
    countryName: "Estados Unidos",
    subType: "AIRPORT",
    label: "Miami (MIA) · International, Estados Unidos",
  },
];

let tokenCache: { value: string; expiresAt: number } | null = null;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function demoSearch(keyword: string) {
  const query = normalize(keyword);
  return demoAirports
    .filter((airport) =>
      normalize(
        `${airport.iataCode} ${airport.name} ${airport.cityName} ${airport.countryName}`,
      ).includes(query),
    )
    .slice(0, 8);
}

async function getAccessToken(
  baseUrl: string,
  apiKey: string,
  apiSecret: string,
) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.value;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: apiKey,
    client_secret: apiSecret,
  });

  const response = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Amadeus authentication returned ${response.status}`);
  }

  const payload = (await response.json()) as AmadeusTokenResponse;
  if (!payload.access_token) {
    throw new Error("Amadeus authentication did not return an access token");
  }

  tokenCache = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(payload.expires_in ?? 900, 60) * 1000,
  };

  return tokenCache.value;
}

function mapLocation(location: AmadeusLocation): AirportOption | null {
  const iataCode = location.iataCode?.trim().toUpperCase();
  if (!iataCode || iataCode.length !== 3) return null;

  const subType = location.subType === "CITY" ? "CITY" : "AIRPORT";
  const name = location.name?.trim() || location.detailedName?.trim() || iataCode;
  const cityName = location.address?.cityName?.trim() || name;
  const countryName = location.address?.countryName?.trim() || "";
  const place = cityName === name ? name : `${cityName} · ${name}`;

  return {
    id: location.id?.trim() || `${subType}-${iataCode}`,
    iataCode,
    name,
    cityName,
    countryName,
    subType,
    label: `${place} (${iataCode})${countryName ? `, ${countryName}` : ""}`,
  };
}

export async function searchAirports(
  rawKeyword: string,
): Promise<AirportSearchResult> {
  const keyword = rawKeyword.trim().slice(0, 80);
  const apiKey = process.env.AMADEUS_API_KEY;
  const apiSecret = process.env.AMADEUS_API_SECRET;
  const baseUrl = (
    process.env.AMADEUS_API_BASE_URL || "https://test.api.amadeus.com"
  ).replace(/\/$/, "");

  if (!apiKey || !apiSecret) {
    return {
      mode: "demo",
      provider: "Amadeus",
      airports: demoSearch(keyword),
      message:
        "Autocompletado demostrativo. Añade las credenciales de Amadeus para consultar su catálogo.",
    };
  }

  try {
    const token = await getAccessToken(baseUrl, apiKey, apiSecret);
    const query = new URLSearchParams({
      keyword,
      subType: "AIRPORT,CITY",
    });
    const response = await fetch(
      `${baseUrl}/v1/reference-data/locations?${query.toString()}`,
      {
        headers: {
          accept: "application/vnd.amadeus+json",
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Amadeus locations returned ${response.status}`);
    }

    const payload = (await response.json()) as AmadeusLocationsResponse;
    const airports = (payload.data ?? [])
      .map(mapLocation)
      .filter((airport): airport is AirportOption => airport !== null)
      .slice(0, 10);

    return {
      mode: "live",
      provider: "Amadeus",
      airports,
      message: "Aeropuertos consultados en Amadeus.",
    };
  } catch {
    return {
      mode: "demo",
      provider: "Amadeus",
      airports: demoSearch(keyword),
      message:
        "Amadeus no respondió; se muestran aeropuertos demostrativos sin exponer credenciales.",
    };
  }
}
