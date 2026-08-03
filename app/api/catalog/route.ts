import { NextResponse } from "next/server";
import { getTravelCatalog } from "../../../lib/spree-catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = await getTravelCatalog();

  return NextResponse.json(catalog, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
