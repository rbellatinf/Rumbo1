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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const COLD_START_DELAYS = [900, 1800, 3200, 5000, 7000, 9000, 12000];
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);

function retryAfterMs(response: Response) {
  const raw = response.headers.get("retry-after")?.trim();
  if (!raw) return 0;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30000);

  const retryAt = Date.parse(raw);
  if (!Number.isNaN(retryAt)) return Math.min(Math.max(retryAt - Date.now(), 0), 30000);

  return 0;
}

/**
 * Server-side fetch for the Render-hosted Rumbo API.
 * Retries transient infrastructure responses, including Render rate limits,
 * so cold starts do not make the storefront look as if the catalog vanished.
 */
export async function fetchRumboApi(
  provider: AccessProvider,
  path: string,
  init: RequestInit = {},
  options: { attempts?: number; timeoutMs?: number } = {},
) {
  const attempts = Math.max(1, options.attempts ?? 8);
  const timeoutMs = Math.max(1000, options.timeoutMs ?? 15000);
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const headers = new Headers(init.headers);
      for (const [key, value] of Object.entries(providerHeaders(provider))) {
        if (!headers.has(key)) headers.set(key, value);
      }

      const response = await fetch(`${provider.apiUrl}${path}`, {
        ...init,
        headers,
        cache: init.cache ?? "no-store",
        signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      });

      if (!TRANSIENT_STATUSES.has(response.status) || attempt === attempts - 1) return response;

      const baseDelay = COLD_START_DELAYS[Math.min(attempt, COLD_START_DELAYS.length - 1)];
      const delay = response.status === 429 ? Math.max(baseDelay, retryAfterMs(response)) : baseDelay;
      await response.body?.cancel().catch(() => undefined);
      await sleep(delay);
      continue;
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }

    await sleep(COLD_START_DELAYS[Math.min(attempt, COLD_START_DELAYS.length - 1)]);
  }

  throw lastError instanceof Error ? lastError : new Error("Rumbo API no respondió.");
}

function upstreamTextMessage(text: string, status: number) {
  const compact = text.trim();
  const isHtml = /^\s*<!doctype\s+html/i.test(compact) || /^\s*<html[\s>]/i.test(compact);
  if (isHtml) {
    return status >= 500
      ? `Rumbo API está iniciando o temporalmente no disponible (HTTP ${status}).`
      : `El servicio respondió en un formato inesperado (HTTP ${status}).`;
  }
  return compact.replace(/\s+/g, " ").slice(0, 300) || `El servicio respondió HTTP ${status}.`;
}

export async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: { message: upstreamTextMessage(text, response.status) } };
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
