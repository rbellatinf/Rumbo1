import { NextResponse } from "next/server";

export const RUMBO_SESSION_COOKIE = "rumbo_session";
export const DEFAULT_RUMBO_API_URL = "https://rumbo-api-4twt.onrender.com";

export type AccessProvider = {
  kind: "rumbo";
  apiUrl: string;
  apiKey?: string;
};

export function demoMode() {
  return /^(1|true|yes)$/i.test(process.env.RUMBO_DEMO_MODE || "");
}

function normalizeServiceUrl(value: string | undefined) {
  const clean = value?.trim().replace(/\/$/, "");
  if (!clean) return "";
  return /^https?:\/\//i.test(clean) ? clean : `http://${clean}`;
}

export function accessConfiguration(): AccessProvider | null {
  const apiUrl = normalizeServiceUrl(process.env.RUMBO_API_URL) || DEFAULT_RUMBO_API_URL;
  if (!apiUrl) return null;
  return {
    kind: "rumbo",
    apiUrl,
    apiKey: process.env.RUMBO_API_KEY?.trim() || undefined,
  };
}

// Third arg kept temporarily for callers being simplified in this cutover.
// It is ignored: Rumbo API is the only runtime backend.
export function providerUrl(provider: AccessProvider, rumboPath: string, _removedLegacyPath?: string) {
  return `${provider.apiUrl}${rumboPath}`;
}

export function providerHeaders(
  provider: AccessProvider,
  options: { token?: string; json?: boolean; demoRole?: "wholesaler_admin" | "partner" | "retailer" } = {},
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (provider.apiKey) headers["X-Rumbo-API-Key"] = provider.apiKey;
  if (options.json) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (demoMode() && options.demoRole) headers["X-Rumbo-Demo-Role"] = options.demoRole;
  return headers;
}

export async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: { message: text.slice(0, 300) } };
  }
}

export function backendMessage(payload: Record<string, unknown>, fallback: string) {
  const error = payload.error;
  if (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string") {
    return (error as Record<string, string>).message;
  }
  if (typeof payload.message === "string") return payload.message;
  return fallback;
}

export function noStoreJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

export function sessionCookieOptions(remember = false) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: remember ? 60 * 60 * 24 * 30 : 60 * 60 * 12,
  };
}
