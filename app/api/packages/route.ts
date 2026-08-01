import { NextRequest, NextResponse } from "next/server";
import { searchPriceTravelPackages } from "../../../lib/pricetravel-packages";

export const dynamic = "force-dynamic";

const IATA_CODE = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const originIata = (params.get("origin") || "").toUpperCase();
  const destinationIata = (params.get("destination") || "").toUpperCase();
  const destinationName = (params.get("destinationName") || destinationIata)
    .trim()
    .slice(0, 100);
  const departureDate = params.get("departureDate") || "";
  const returnDate = params.get("returnDate") || "";
  const adults = Number(params.get("adults") || "2");

  if (
    !IATA_CODE.test(originIata) ||
    !IATA_CODE.test(destinationIata) ||
    !ISO_DATE.test(departureDate) ||
    !ISO_DATE.test(returnDate) ||
    !Number.isInteger(adults) ||
    adults < 1 ||
    adults > 9 ||
    Date.parse(returnDate) <= Date.parse(departureDate)
  ) {
    return NextResponse.json(
      {
        mode: "demo",
        provider: "PriceTravel",
        packages: [],
        message:
          "Selecciona aeropuertos válidos, fechas consecutivas y entre 1 y 9 viajeros.",
      },
      { status: 400 },
    );
  }

  const result = await searchPriceTravelPackages({
    originIata,
    destinationIata,
    destinationName,
    departureDate,
    returnDate,
    adults,
    currency: "USD",
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "private, max-age=30",
    },
  });
}
