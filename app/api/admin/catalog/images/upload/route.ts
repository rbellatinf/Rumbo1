import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  accessConfiguration,
  demoMode,
  noStoreJson,
  providerHeaders,
  RUMBO_SESSION_COOKIE,
} from "@/lib/rumbo-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_ACCOUNT_ID = "b0c9535ffd40623838c8b025cc4bcda9";
const DEFAULT_BUCKET = "rumbo-images";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

type CloudflareEnvelope<T> = {
  success?: boolean;
  result?: T;
  errors?: Array<{ message?: string }>;
};

type CustomDomain = {
  domain?: string;
  enabled?: boolean;
  status?: { ownership?: string; ssl?: string };
};

let cachedPublicBaseUrl = "";

function normalizeBaseUrl(value: string) {
  const clean = value.trim().replace(/\/$/, "");
  if (!clean) return "";
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

function cloudflareMessage(payload: CloudflareEnvelope<unknown>, fallback: string) {
  return payload.errors?.find((item) => item?.message)?.message || fallback;
}

async function cloudflareJson<T>(path: string, token: string) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as CloudflareEnvelope<T>;
  if (!response.ok || payload.success === false) {
    throw new Error(cloudflareMessage(payload, `Cloudflare respondió ${response.status}.`));
  }
  return payload.result;
}

async function resolvePublicBaseUrl(accountId: string, bucket: string, token: string) {
  const configured = normalizeBaseUrl(process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL || "");
  if (configured) return configured;
  if (cachedPublicBaseUrl) return cachedPublicBaseUrl;

  const custom = await cloudflareJson<{ domains?: CustomDomain[] }>(
    `/accounts/${accountId}/r2/buckets/${bucket}/domains/custom`,
    token,
  ).catch(() => undefined);
  const activeCustom = custom?.domains?.find(
    (item) =>
      item.enabled &&
      item.domain &&
      (!item.status?.ownership || item.status.ownership === "active") &&
      (!item.status?.ssl || item.status.ssl === "active"),
  );
  if (activeCustom?.domain) {
    cachedPublicBaseUrl = normalizeBaseUrl(activeCustom.domain);
    return cachedPublicBaseUrl;
  }

  const managed = await cloudflareJson<{ domain?: string; enabled?: boolean }>(
    `/accounts/${accountId}/r2/buckets/${bucket}/domains/managed`,
    token,
  ).catch(() => undefined);
  if (managed?.enabled && managed.domain) {
    cachedPublicBaseUrl = normalizeBaseUrl(managed.domain);
    return cachedPublicBaseUrl;
  }

  throw new Error(
    "El bucket rumbo-images no tiene un dominio público activo. Activa su dominio R2.dev/custom o configura CLOUDFLARE_R2_PUBLIC_BASE_URL.",
  );
}

async function hasAdminSession(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") return false;
  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (!token && !demoMode()) return false;
  const response = await fetch(`${provider.apiUrl}/api/admin/overview`, {
    headers: providerHeaders(provider, {
      token,
      demoRole: "wholesaler_admin",
    }),
    cache: "no-store",
  }).catch(() => null);
  return Boolean(response?.ok);
}

function publicObjectUrl(baseUrl: string, objectKey: string) {
  const encodedKey = objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl.replace(/\/$/, "")}/${encodedKey}`;
}

export async function POST(request: NextRequest) {
  if (!(await hasAdminSession(request))) {
    return noStoreJson({ message: "Se requiere una sesión administrativa válida." }, 401);
  }

  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim() || "";
  if (!apiToken) {
    return noStoreJson(
      {
        message:
          "Falta CLOUDFLARE_API_TOKEN en el servicio rumbo-storefront de Render. La carga de imágenes está preparada, pero no puede autenticarse contra R2 todavía.",
      },
      503,
    );
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || DEFAULT_ACCOUNT_ID;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET?.trim() || DEFAULT_BUCKET;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return noStoreJson({ message: "Selecciona una imagen para subir." }, 422);
  }

  const extension = EXTENSION_BY_TYPE[file.type];
  if (!extension) {
    return noStoreJson(
      { message: "Formato no permitido. Usa JPG, PNG, WebP o GIF." },
      415,
    );
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return noStoreJson(
      { message: "La imagen debe pesar entre 1 byte y 10 MB." },
      413,
    );
  }

  try {
    const publicBaseUrl = await resolvePublicBaseUrl(accountId, bucket, apiToken);
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const objectKey = `catalog/${year}/${month}/${randomUUID()}.${extension}`;
    const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${objectKey}`;
    const cloudflareForm = new FormData();
    cloudflareForm.append("body", file, file.name || `rumbo-product.${extension}`);
    const upload = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
      body: cloudflareForm,
      cache: "no-store",
    });
    const payload = (await upload.json().catch(() => ({}))) as CloudflareEnvelope<unknown>;
    if (!upload.ok || payload.success === false) {
      return noStoreJson(
        { message: cloudflareMessage(payload, `Cloudflare no pudo guardar la imagen (${upload.status}).`) },
        upload.status >= 400 && upload.status < 600 ? upload.status : 502,
      );
    }

    return noStoreJson(
      {
        url: publicObjectUrl(publicBaseUrl, objectKey),
        storage_provider: "cloudflare-r2",
        storage_key: objectKey,
        bucket,
        content_type: file.type,
        size: file.size,
      },
      201,
    );
  } catch (error) {
    return noStoreJson(
      {
        message:
          error instanceof Error
            ? error.message
            : "No pudimos subir la imagen a Cloudflare R2.",
      },
      502,
    );
  }
}
