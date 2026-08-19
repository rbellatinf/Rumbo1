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
  mode: "live" | "error";
  provider: "AirLabs" | "Rumbo";
  source?: "live" | "cache" | "stale_cache" | "catalog";
  cached?: boolean;
  airports: AirportOption[];
  message: string;
  upstreamStatus?: number;
};
