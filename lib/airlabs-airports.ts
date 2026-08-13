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
  provider: "AirLabs";
  airports: AirportOption[];
  message: string;
  upstreamStatus?: number;
};
