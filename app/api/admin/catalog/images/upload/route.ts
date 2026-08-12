import { NextRequest } from "next/server";
import { recordIntegrationCall } from "@/lib/integration-telemetry";
import {
  accessConfiguration,
  backendMessage,
  demoMode,
  noStoreJson,
  parseJson,
  providerHeaders,
  RUMBO_SESSION_COOKIE,
} from "@/lib/rumbo-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type PresignPayload = {
  upload_url?: string;
  public_url?: string;
  storage_key?: string;
  bucket?: string;
  content_type?: string;
  expires_in_seconds?: number;
  message?: string;
  error?: { message?: string };
};

async function adminContext(request: NextRequest) {
  const provider = accessConfiguration();
  if (!provider || provider.kind !== "rumbo") return null;
  const token = request.cookies.get(RUMBO_SESSION_COOKIE)?.value;
  if (!token && !demoMode()) return null;
  const response = await fetch(`${provider.apiUrl}/api/admin/overview`, {
    headers: providerHeaders(provider, { token, demoRole: "wholesaler_admin" }),
    cache: "no-store",
  }).catch(() => null);
  return response?.ok ? { provider, token } : null;
}

export async function POST(request: NextRequest) {
  const admin = await adminContext(request);
  if (!admin) return noStoreJson({ message: "Se requiere una sesión administrativa válida." }, 401);

  const started = Date.now();
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return noStoreJson({ message: "Selecciona una imagen para subir." }, 422);

  if (!ALLOWED_TYPES.has(file.type)) {
    return noStoreJson({ message: "Formato no permitido. Usa JPG, PNG, WebP o GIF." }, 415);
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return noStoreJson({ message: "La imagen debe pesar entre 1 byte y 10 MB." }, 413);
  }

  try {
    const presignResponse = await fetch(`${admin.provider.apiUrl}/api/admin/integration-configs/cloudflare-r2/presign-upload`, {
      method: "POST",
      headers: providerHeaders(admin.provider, { token: admin.token, json: true, demoRole: "wholesaler_admin" }),
      body: JSON.stringify({ content_type: file.type, size: file.size, file_name: file.name || null }),
      cache: "no-store",
    });
    const presign = (await parseJson(presignResponse)) as PresignPayload;
    if (!presignResponse.ok || !presign.upload_url || !presign.public_url || !presign.storage_key || !presign.bucket) {
      const message = backendMessage(presign, "Cloudflare R2 no está configurado con credenciales S3 válidas.");
      recordIntegrationCall({ integrationCode: "cloudflare-r2", serviceCode: "image-upload", source: "admin_catalog", success: false, httpStatus: presignResponse.status, durationMs: Date.now() - started, errorCode: "R2_PRESIGN_FAILED", errorMessage: message, requestSummary: { content_type: file.type, size: file.size } });
      return noStoreJson({ message }, presignResponse.status || 502);
    }

    const upload = await fetch(presign.upload_url, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
      cache: "no-store",
    });
    if (!upload.ok) {
      const responseText = (await upload.text().catch(() => "")).slice(0, 600);
      const message = `Cloudflare R2 no pudo guardar la imagen (${upload.status}).`;
      recordIntegrationCall({ integrationCode: "cloudflare-r2", serviceCode: "image-upload", source: "admin_catalog", success: false, httpStatus: upload.status, durationMs: Date.now() - started, errorCode: "R2_S3_UPLOAD_FAILED", errorMessage: message, requestSummary: { bucket: presign.bucket, content_type: file.type, size: file.size }, responseSummary: { provider_error: responseText || null } });
      return noStoreJson({ message }, upload.status >= 400 && upload.status < 600 ? upload.status : 502);
    }

    recordIntegrationCall({ integrationCode: "cloudflare-r2", serviceCode: "image-upload", source: "admin_catalog", success: true, httpStatus: upload.status, durationMs: Date.now() - started, requestSummary: { bucket: presign.bucket, content_type: file.type, size: file.size }, responseSummary: { storage_key: presign.storage_key, url_host: new URL(presign.public_url).host, auth_mode: "s3-presigned" } });
    return noStoreJson({
      url: presign.public_url,
      storage_provider: "cloudflare-r2",
      storage_key: presign.storage_key,
      bucket: presign.bucket,
      content_type: file.type,
      size: file.size,
      upload_auth: "s3-presigned",
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No pudimos subir la imagen a Cloudflare R2.";
    recordIntegrationCall({ integrationCode: "cloudflare-r2", serviceCode: "image-upload", source: "admin_catalog", success: false, httpStatus: null, durationMs: Date.now() - started, errorCode: "R2_UPLOAD_EXCEPTION", errorMessage: message, requestSummary: { content_type: file.type, size: file.size } });
    return noStoreJson({ message }, 502);
  }
}
