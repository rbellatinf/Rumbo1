import { NextRequest } from "next/server";
import {
  accessConfiguration,
  noStoreJson,
  providerHeaders,
  providerUrl,
  RUMBO_SESSION_COOKIE,
} from "../../../../lib/rumbo-access";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const provider = accessConfiguration();
  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;

  if (provider && token) {
    try {
      await fetch(
        providerUrl(provider, "/api/access/logout", "/api/v3/store/access/logout"),
        {
          method: "POST",
          headers: providerHeaders(provider, { token }),
          cache: "no-store",
        },
      );
    } catch {
      // Clear the local cookie even if the backend is temporarily unavailable.
    }
  }

  const response = noStoreJson({ ok: true });
  response.cookies.delete(RUMBO_SESSION_COOKIE);
  return response;
}
