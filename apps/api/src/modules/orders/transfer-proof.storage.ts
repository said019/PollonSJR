import crypto from "crypto";
import fs from "fs";
import path from "path";
import { uploadsDir } from "../../plugins/uploads";

export type TransferProofKind = "jpg" | "png" | "webp" | "heic" | "pdf";
export type TransferProofStorageMode = "local" | "drive";

const DRIVE_REFERENCE_PREFIX = "gdrive:";
const LEGACY_LOCAL_PREFIX = "/uploads/transfer-proofs/";
const MAX_PROOF_BYTES = 8 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const DRIVE_REQUEST_TIMEOUT_MS = 15_000;

const MIME_BY_KIND: Record<TransferProofKind, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
};

const EXT_BY_KIND: Record<TransferProofKind, string> = {
  jpg: ".jpg",
  png: ".png",
  webp: ".webp",
  heic: ".heic",
  pdf: ".pdf",
};

type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

type DriveConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderId: string;
};

export type LoadedTransferProof = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
};

export class TransferProofStorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransferProofStorageUnavailableError";
  }
}

export class TransferProofNotFoundError extends Error {
  constructor(message = "Transfer proof not found") {
    super(message);
    this.name = "TransferProofNotFoundError";
  }
}

let cachedAccessToken:
  | { configKey: string; value: string; expiresAt: number }
  | undefined;
let accessTokenInFlight:
  | { configKey: string; promise: Promise<string> }
  | undefined;

function envValue(env: NodeJS.ProcessEnv, key: string): string {
  return env[key]?.trim() ?? "";
}

export function getTransferProofStorageMode(
  env: NodeJS.ProcessEnv = process.env
): TransferProofStorageMode {
  const raw = envValue(env, "TRANSFER_PROOFS_STORAGE").toLowerCase();
  if (!raw) {
    if (envValue(env, "NODE_ENV") === "production") {
      throw new TransferProofStorageUnavailableError(
        "TRANSFER_PROOFS_STORAGE is required in production"
      );
    }
    return "local";
  }
  if (raw === "local") return "local";
  if (raw === "drive") return "drive";
  throw new TransferProofStorageUnavailableError(
    "TRANSFER_PROOFS_STORAGE must be local or drive"
  );
}

export function normalizeDriveFolderId(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) return null;

  const folderUrlMatch = value.match(/\/folders\/([A-Za-z0-9_-]+)/);
  const candidate = folderUrlMatch?.[1] ?? value;
  return /^[A-Za-z0-9_-]{10,}$/.test(candidate) ? candidate : null;
}

function driveConfig(env: NodeJS.ProcessEnv): DriveConfig {
  const clientId = envValue(env, "GOOGLE_DRIVE_OAUTH_CLIENT_ID");
  const clientSecret = envValue(env, "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET");
  const refreshToken = envValue(env, "GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN");
  const folderId = normalizeDriveFolderId(
    envValue(env, "GOOGLE_DRIVE_TRANSFER_PROOFS_FOLDER_ID")
  );

  if (!clientId || !clientSecret || !refreshToken || !folderId) {
    throw new TransferProofStorageUnavailableError(
      "Google Drive OAuth or transfer-proof folder configuration is incomplete"
    );
  }

  return { clientId, clientSecret, refreshToken, folderId };
}

function configKey(config: DriveConfig): string {
  return crypto
    .createHash("sha256")
    .update(`${config.clientId}\0${config.refreshToken}`)
    .digest("hex");
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  input: string | URL,
  init: RequestInit,
  unavailableMessage: string
): Promise<Response> {
  try {
    // AbortSignal.timeout sigue activo también mientras se consume el body;
    // no sólo hasta recibir headers.
    const signal = AbortSignal.timeout(DRIVE_REQUEST_TIMEOUT_MS);
    return await fetchImpl(input, { ...init, signal });
  } catch {
    throw new TransferProofStorageUnavailableError(unavailableMessage);
  }
}

async function driveAccessToken(
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike
): Promise<string> {
  const config = driveConfig(env);
  const key = configKey(config);
  const now = Date.now();

  if (
    cachedAccessToken?.configKey === key &&
    cachedAccessToken.expiresAt > now + 60_000
  ) {
    return cachedAccessToken.value;
  }

  if (accessTokenInFlight?.configKey === key) {
    return accessTokenInFlight.promise;
  }

  const promise = (async () => {
    const response = await fetchWithTimeout(
      fetchImpl,
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: config.refreshToken,
          grant_type: "refresh_token",
        }),
      },
      "Google OAuth token service is unavailable"
    );

    const payload = (await response.json().catch(() => null)) as
      | { access_token?: string; expires_in?: number }
      | null;
    if (!response.ok || !payload?.access_token) {
      throw new TransferProofStorageUnavailableError(
        `Google OAuth token request failed (${response.status})`
      );
    }

    cachedAccessToken = {
      configKey: key,
      value: payload.access_token,
      expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000,
    };
    return payload.access_token;
  })();

  accessTokenInFlight = { configKey: key, promise };
  try {
    return await promise;
  } finally {
    if (accessTokenInFlight?.promise === promise) {
      accessTokenInFlight = undefined;
    }
  }
}

function invalidateCachedAccessToken(env: NodeJS.ProcessEnv): void {
  const key = configKey(driveConfig(env));
  if (cachedAccessToken?.configKey === key) cachedAccessToken = undefined;
}

async function authenticatedDriveFetch(
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
  input: string | URL,
  init: RequestInit,
  unavailableMessage: string
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const accessToken = await driveAccessToken(env, fetchImpl);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    const response = await fetchWithTimeout(
      fetchImpl,
      input,
      { ...init, headers },
      unavailableMessage
    );
    if (response.status !== 401 || attempt === 1) return response;
    await response.body?.cancel().catch(() => undefined);
    invalidateCachedAccessToken(env);
  }

  throw new TransferProofStorageUnavailableError(unavailableMessage);
}

export function createDriveProofReference(
  fileId: string,
  kind: TransferProofKind
): string {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) {
    throw new Error("Invalid Google Drive file id");
  }
  return `${DRIVE_REFERENCE_PREFIX}${fileId}:${kind}`;
}

export function parseDriveProofReference(
  reference: string
): { fileId: string; kind: TransferProofKind } | null {
  const match = reference.match(
    /^gdrive:([A-Za-z0-9_-]{10,}):(jpg|png|webp|heic|pdf)$/
  );
  if (!match) return null;
  return {
    fileId: match[1],
    kind: match[2] as TransferProofKind,
  };
}

function extensionForReference(reference: string): string {
  const driveReference = parseDriveProofReference(reference);
  if (driveReference) return EXT_BY_KIND[driveReference.kind];

  const extension = path.extname(reference.split("?", 1)[0]).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".pdf"].includes(
    extension
  )
    ? extension
    : ".bin";
}

function mimeForExtension(extension: string): string {
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".heic") return "image/heic";
  if (extension === ".pdf") return "application/pdf";
  return "application/octet-stream";
}

export async function storeTransferProof(
  input: {
    buffer: Buffer;
    fileName: string;
    kind: TransferProofKind;
  },
  options: {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: FetchLike;
  } = {}
): Promise<string> {
  const env = options.env ?? process.env;
  const mode = getTransferProofStorageMode(env);
  if (input.buffer.length === 0 || input.buffer.length > MAX_PROOF_BYTES) {
    throw new TransferProofStorageUnavailableError(
      "Transfer proof size is outside the allowed range"
    );
  }

  if (mode === "local") {
    const destinationDirectory = path.join(uploadsDir, "transfer-proofs");
    await fs.promises.mkdir(destinationDirectory, { recursive: true });
    await fs.promises.writeFile(
      path.join(destinationDirectory, path.basename(input.fileName)),
      input.buffer
    );
    return `${LEGACY_LOCAL_PREFIX}${path.basename(input.fileName)}`;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const config = driveConfig(env);
  const boundary = `pollon-${crypto.randomBytes(12).toString("hex")}`;
  const metadata = Buffer.from(
    JSON.stringify({
      name: path.basename(input.fileName),
      parents: [config.folderId],
      mimeType: MIME_BY_KIND[input.kind],
    })
  );
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`
    ),
    metadata,
    Buffer.from(
      `\r\n--${boundary}\r\nContent-Type: ${MIME_BY_KIND[input.kind]}\r\n\r\n`
    ),
    input.buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const response = await authenticatedDriveFetch(
    env,
    fetchImpl,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,parents,size,md5Checksum",
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    },
    "Google Drive upload service is unavailable"
  );

  const payload = (await response.json().catch(() => null)) as
    | {
        id?: string;
        name?: string;
        mimeType?: string;
        parents?: string[];
        size?: string;
        md5Checksum?: string;
      }
    | null;
  if (!response.ok || !payload?.id) {
    throw new TransferProofStorageUnavailableError(
      `Google Drive upload failed (${response.status})`
    );
  }

  const expectedName = path.basename(input.fileName);
  const expectedMimeType = MIME_BY_KIND[input.kind];
  const expectedChecksum = crypto
    .createHash("md5")
    .update(input.buffer)
    .digest("hex");
  const uploadIsVerified =
    payload.name === expectedName &&
    payload.mimeType === expectedMimeType &&
    payload.parents?.includes(config.folderId) === true &&
    payload.size === String(input.buffer.length) &&
    payload.md5Checksum?.toLowerCase() === expectedChecksum;

  if (!uploadIsVerified) {
    // La API no debe asociar a un pedido un objeto incompleto o ubicado en
    // otra carpeta. El borrado es best-effort: el error original sigue siendo
    // el de integridad y no expone la respuesta de Google ni credenciales.
    try {
      await authenticatedDriveFetch(
        env,
        fetchImpl,
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          payload.id
        )}?supportsAllDrives=true`,
        {
          method: "DELETE",
        },
        "Google Drive cleanup service is unavailable"
      );
    } catch {
      // Un barrido posterior puede retirar este huérfano; nunca se guarda en DB.
    }
    throw new TransferProofStorageUnavailableError(
      "Google Drive upload integrity verification failed"
    );
  }

  return createDriveProofReference(payload.id, input.kind);
}

async function readLocalFileBounded(filePath: string): Promise<Buffer> {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_PROOF_BYTES) {
      throw new TransferProofStorageUnavailableError(
        "Stored transfer proof exceeds the allowed size"
      );
    }

    const buffer = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        buffer.length - offset,
        offset
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== buffer.length) {
      throw new TransferProofStorageUnavailableError(
        "Stored transfer proof changed while it was being read"
      );
    }
    return buffer;
  } finally {
    await handle.close();
  }
}

async function readDriveResponseBounded(response: Response): Promise<Buffer> {
  if (!response.body) {
    throw new TransferProofStorageUnavailableError(
      "Google Drive returned an empty download response"
    );
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PROOF_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new TransferProofStorageUnavailableError(
          "Stored transfer proof exceeds the allowed size"
        );
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof TransferProofStorageUnavailableError) throw error;
    throw new TransferProofStorageUnavailableError(
      "Google Drive download stream failed"
    );
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

export async function loadTransferProof(
  reference: string,
  options: {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: FetchLike;
  } = {}
): Promise<LoadedTransferProof> {
  const driveReference = parseDriveProofReference(reference);
  if (!driveReference) {
    if (!reference.startsWith(LEGACY_LOCAL_PREFIX)) {
      throw new TransferProofNotFoundError();
    }

    const fileName = path.basename(reference);
    const destinationDirectory = path.join(uploadsDir, "transfer-proofs");
    try {
      const buffer = await readLocalFileBounded(
        path.join(destinationDirectory, fileName)
      );
      const extension = extensionForReference(reference);
      return { buffer, extension, mimeType: mimeForExtension(extension) };
    } catch (error: any) {
      if (error?.code === "ENOENT") throw new TransferProofNotFoundError();
      throw error;
    }
  }

  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await authenticatedDriveFetch(
    env,
    fetchImpl,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      driveReference.fileId
    )}?alt=media&supportsAllDrives=true`,
    {},
    "Google Drive download service is unavailable"
  );

  if (response.status === 404) throw new TransferProofNotFoundError();
  if (!response.ok) {
    throw new TransferProofStorageUnavailableError(
      `Google Drive download failed (${response.status})`
    );
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PROOF_BYTES) {
    throw new TransferProofStorageUnavailableError(
      "Stored transfer proof exceeds the allowed size"
    );
  }

  const buffer = await readDriveResponseBounded(response);

  return {
    buffer,
    extension: EXT_BY_KIND[driveReference.kind],
    // Nunca confiamos en un Content-Type mutable de Drive. La referencia se
    // creó después de validar magic bytes y obliga un MIME no ejecutable.
    mimeType: MIME_BY_KIND[driveReference.kind],
  };
}

export async function deleteTransferProof(
  reference: string,
  options: {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: FetchLike;
  } = {}
): Promise<void> {
  const driveReference = parseDriveProofReference(reference);
  if (!driveReference) {
    if (!reference.startsWith(LEGACY_LOCAL_PREFIX)) return;
    const destinationDirectory = path.join(uploadsDir, "transfer-proofs");
    await fs.promises
      .unlink(path.join(destinationDirectory, path.basename(reference)))
      .catch((error: any) => {
        if (error?.code !== "ENOENT") throw error;
      });
    return;
  }

  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await authenticatedDriveFetch(
    env,
    fetchImpl,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      driveReference.fileId
    )}?supportsAllDrives=true`,
    { method: "DELETE" },
    "Google Drive delete service is unavailable"
  );

  if (response.status !== 204 && response.status !== 404) {
    throw new TransferProofStorageUnavailableError(
      `Google Drive delete failed (${response.status})`
    );
  }
}

function signingSecret(env: NodeJS.ProcessEnv): string {
  const configured =
    envValue(env, "TRANSFER_PROOFS_URL_SIGNING_SECRET") ||
    envValue(env, "JWT_SECRET");
  const secret =
    configured ||
    (envValue(env, "NODE_ENV") === "production"
      ? ""
      : "dev-only-transfer-proof-signing-secret-change-me");
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new TransferProofStorageUnavailableError(
      "Transfer-proof URL signing secret must contain at least 32 bytes"
    );
  }
  return secret;
}

export function validateTransferProofStorageConfiguration(
  env: NodeJS.ProcessEnv = process.env
): void {
  const mode = getTransferProofStorageMode(env);
  signingSecret(env);
  if (mode === "drive") driveConfig(env);
}

function proofSignature(
  orderId: string,
  reference: string,
  expires: number,
  env: NodeJS.ProcessEnv
): string {
  const referenceHash = crypto
    .createHash("sha256")
    .update(reference)
    .digest("base64url");
  return crypto
    .createHmac("sha256", signingSecret(env))
    .update(`${orderId}.${referenceHash}.${expires}`)
    .digest("base64url");
}

export function buildTransferProofDeliveryUrl(
  orderId: string,
  reference: string | null,
  options: { env?: NodeJS.ProcessEnv; nowMs?: number } = {}
): string | null {
  if (!reference) return null;
  const env = options.env ?? process.env;
  const nowMs = options.nowMs ?? Date.now();
  const expires = Math.floor(nowMs / 1000) + SIGNED_URL_TTL_SECONDS;
  const signature = proofSignature(orderId, reference, expires, env);
  const extension = extensionForReference(reference);
  return `/api/orders/${encodeURIComponent(
    orderId
  )}/transfer-proof/comprobante${extension}?expires=${expires}&signature=${encodeURIComponent(
    signature
  )}`;
}

export function verifyTransferProofDeliverySignature(
  input: {
    orderId: string;
    reference: string;
    expires: string | number | undefined;
    signature: string | undefined;
  },
  options: { env?: NodeJS.ProcessEnv; nowMs?: number } = {}
): boolean {
  const expires = Number(input.expires);
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (
    !Number.isSafeInteger(expires) ||
    expires < nowSeconds ||
    expires > nowSeconds + SIGNED_URL_TTL_SECONDS + 60 ||
    !input.signature
  ) {
    return false;
  }

  const expected = proofSignature(
    input.orderId,
    input.reference,
    expires,
    options.env ?? process.env
  );
  const actualBuffer = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function resetDriveTokenCacheForTests() {
  cachedAccessToken = undefined;
  accessTokenInFlight = undefined;
}
