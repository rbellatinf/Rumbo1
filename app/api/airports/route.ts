import { NextRequest, NextResponse } from "next/server";
import { searchAirports } from "../../../lib/amadeus-airports";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("q")?.trim() || "";

  if (keyword.length < 2) {
    return NextResponse.json(
      {
        mode: "demo",
        provider: "Amadeus",
        airports: [],
        message: "Escribe al menos dos letras para buscar un aeropuerto.",
      },
      { status: 400 },
    );
  }

  const result = await searchAirports(keyword);
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
    },
  });
}
