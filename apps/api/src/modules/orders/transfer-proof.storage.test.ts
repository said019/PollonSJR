import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  buildTransferProofDeliveryUrl,
  createDriveProofReference,
  deleteTransferProof,
  getTransferProofStorageMode,
  loadTransferProof,
  normalizeDriveFolderId,
  parseDriveProofReference,
  resetDriveTokenCacheForTests,
  storeTransferProof,
  TransferProofNotFoundError,
  TransferProofStorageUnavailableError,
  validateTransferProofStorageConfiguration,
  verifyTransferProofDeliverySignature,
} from "./transfer-proof.storage";

const DRIVE_ENV: NodeJS.ProcessEnv = {
  TRANSFER_PROOFS_STORAGE: "drive",
  GOOGLE_DRIVE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: "client-secret",
  GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN: "refresh-token",
  GOOGLE_DRIVE_TRANSFER_PROOFS_FOLDER_ID: "1234567890folder",
  TRANSFER_PROOFS_URL_SIGNING_SECRET:
    "test-signing-secret-with-at-least-32-bytes",
};

test("storage mode is local by default and drive only when explicit", () => {
  assert.equal(getTransferProofStorageMode({}), "local");
  assert.equal(
    getTransferProofStorageMode({ TRANSFER_PROOFS_STORAGE: "drive" }),
    "drive"
  );
  assert.throws(
    () => getTransferProofStorageMode({ TRANSFER_PROOFS_STORAGE: "unknown" }),
    TransferProofStorageUnavailableError
  );
  assert.throws(
    () => getTransferProofStorageMode({ NODE_ENV: "production" }),
    TransferProofStorageUnavailableError
  );
  assert.throws(
    () =>
      validateTransferProofStorageConfiguration({
        NODE_ENV: "production",
        TRANSFER_PROOFS_STORAGE: "local",
        TRANSFER_PROOFS_URL_SIGNING_SECRET: "short",
      }),
    TransferProofStorageUnavailableError
  );
});

test("normalizes a raw Drive folder id or folder URL", () => {
  assert.equal(
    normalizeDriveFolderId("1234567890folder"),
    "1234567890folder"
  );
  assert.equal(
    normalizeDriveFolderId(
      "https://drive.google.com/drive/folders/1234567890folder?usp=sharing"
    ),
    "1234567890folder"
  );
  assert.equal(normalizeDriveFolderId("not a folder"), null);
});

test("Drive references are opaque and round-trip their validated kind", () => {
  const reference = createDriveProofReference("1234567890file", "pdf");
  assert.equal(reference, "gdrive:1234567890file:pdf");
  assert.deepEqual(parseDriveProofReference(reference), {
    fileId: "1234567890file",
    kind: "pdf",
  });
  assert.equal(parseDriveProofReference("https://drive.google.com/public"), null);
});

test("signed delivery URL is short-lived and bound to the current DB reference", () => {
  const nowMs = 1_800_000_000_000;
  const reference = "gdrive:1234567890file:pdf";
  const url = buildTransferProofDeliveryUrl("order-1", reference, {
    env: DRIVE_ENV,
    nowMs,
  });
  assert.ok(url);
  assert.match(url, /\/transfer-proof\/comprobante\.pdf\?/);

  const parsed = new URL(url, "https://api.example.test");
  const input = {
    orderId: "order-1",
    reference,
    expires: parsed.searchParams.get("expires") ?? undefined,
    signature: parsed.searchParams.get("signature") ?? undefined,
  };
  assert.equal(
    verifyTransferProofDeliverySignature(input, { env: DRIVE_ENV, nowMs }),
    true
  );
  assert.equal(
    verifyTransferProofDeliverySignature(
      { ...input, reference: "gdrive:0987654321file:pdf" },
      { env: DRIVE_ENV, nowMs }
    ),
    false
  );
  assert.equal(
    verifyTransferProofDeliverySignature(input, {
      env: DRIVE_ENV,
      nowMs: nowMs + 16 * 60 * 1000,
    }),
    false
  );
});

test("Drive upload uses OAuth once, targets the configured folder, and never changes permissions", async () => {
  resetDriveTokenCacheForTests();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let uploadSequence = 0;
  const fetchImpl = async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(
        JSON.stringify({ access_token: "access-token", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    uploadSequence += 1;
    const requestBody = init?.body;
    assert.ok(Buffer.isBuffer(requestBody));
    const bodyText = requestBody.toString();
    const isFirstProof = bodyText.includes("\r\n\r\none\r\n--");
    const proof = Buffer.from(isFirstProof ? "one" : "two");
    const name = isFirstProof ? "one.pdf" : "two.jpg";
    const mimeType = isFirstProof ? "application/pdf" : "image/jpeg";
    return new Response(
      JSON.stringify({
        id: `1234567890file${uploadSequence}`,
        name,
        mimeType,
        parents: ["1234567890folder"],
        size: String(proof.length),
        md5Checksum: crypto.createHash("md5").update(proof).digest("hex"),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const [first, second] = await Promise.all([
    storeTransferProof(
      { buffer: Buffer.from("one"), fileName: "one.pdf", kind: "pdf" },
      { env: DRIVE_ENV, fetchImpl }
    ),
    storeTransferProof(
      { buffer: Buffer.from("two"), fileName: "two.jpg", kind: "jpg" },
      { env: DRIVE_ENV, fetchImpl }
    ),
  ]);

  assert.equal(first, "gdrive:1234567890file1:pdf");
  assert.equal(second, "gdrive:1234567890file2:jpg");
  assert.equal(
    calls.filter((call) => call.url === "https://oauth2.googleapis.com/token")
      .length,
    1
  );
  assert.equal(calls.some((call) => call.url.includes("permissions")), false);

  const uploadCalls = calls.filter((call) =>
    call.url.includes("upload/drive/v3/files")
  );
  assert.equal(uploadCalls.length, 2);
  for (const call of uploadCalls) {
    assert.match(call.url, /fields=.*size,md5Checksum/);
    const body = call.init?.body;
    assert.ok(Buffer.isBuffer(body));
    assert.match(body.toString(), /1234567890folder/);
  }
});

test("Drive upload is rejected and cleaned up when its checksum is not verified", async () => {
  resetDriveTokenCacheForTests();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(
        JSON.stringify({ access_token: "access-token", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    return new Response(
      JSON.stringify({
        id: "1234567890corrupt",
        name: "proof.pdf",
        mimeType: "application/pdf",
        parents: ["1234567890folder"],
        size: "5",
        md5Checksum: "00000000000000000000000000000000",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  await assert.rejects(
    storeTransferProof(
      { buffer: Buffer.from("proof"), fileName: "proof.pdf", kind: "pdf" },
      { env: DRIVE_ENV, fetchImpl }
    ),
    (error: unknown) => {
      assert.ok(error instanceof TransferProofStorageUnavailableError);
      assert.match(error.message, /integrity verification failed/);
      return true;
    }
  );
  assert.equal(
    calls.some(
      (call) =>
        call.init?.method === "DELETE" &&
        call.url.includes("1234567890corrupt")
    ),
    true
  );
});

test("drive mode fails closed when OAuth is unavailable", async () => {
  resetDriveTokenCacheForTests();
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: "invalid_grant" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(
    storeTransferProof(
      {
        buffer: Buffer.from("proof"),
        fileName: "proof.pdf",
        kind: "pdf",
      },
      { env: DRIVE_ENV, fetchImpl }
    ),
    (error: unknown) => {
      assert.ok(error instanceof TransferProofStorageUnavailableError);
      assert.equal(error.message.includes("invalid_grant"), false);
      return true;
    }
  );
});

test("Drive request invalidates a rejected token and retries exactly once", async () => {
  resetDriveTokenCacheForTests();
  let tokenRequests = 0;
  let uploadRequests = 0;
  const proof = Buffer.from("proof");
  const fetchImpl = async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      tokenRequests += 1;
      return new Response(
        JSON.stringify({
          access_token: `access-token-${tokenRequests}`,
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    uploadRequests += 1;
    const authorization = new Headers(init?.headers).get("Authorization");
    if (authorization === "Bearer access-token-1") {
      return new Response(null, { status: 401 });
    }
    return new Response(
      JSON.stringify({
        id: "1234567890retry",
        name: "proof.pdf",
        mimeType: "application/pdf",
        parents: ["1234567890folder"],
        size: String(proof.length),
        md5Checksum: crypto.createHash("md5").update(proof).digest("hex"),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const reference = await storeTransferProof(
    { buffer: proof, fileName: "proof.pdf", kind: "pdf" },
    { env: DRIVE_ENV, fetchImpl }
  );
  assert.equal(reference, "gdrive:1234567890retry:pdf");
  assert.equal(tokenRequests, 2);
  assert.equal(uploadRequests, 2);
});

test("private Drive download uses the opaque file id and bounded response", async () => {
  resetDriveTokenCacheForTests();
  const calls: string[] = [];
  const fetchImpl = async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    if (url === "https://oauth2.googleapis.com/token") {
      return new Response(
        JSON.stringify({ access_token: "access-token", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(Buffer.from("private-proof"), {
      status: 200,
      headers: { "Content-Type": "text/html", "Content-Length": "13" },
    });
  };

  const proof = await loadTransferProof("gdrive:1234567890file:pdf", {
    env: DRIVE_ENV,
    fetchImpl,
  });
  assert.equal(proof.buffer.toString(), "private-proof");
  assert.equal(proof.mimeType, "application/pdf");
  assert.equal(proof.extension, ".pdf");
  assert.equal(calls.some((url) => url.includes("alt=media")), true);
});

test("chunked Drive download is cancelled before it can exceed 8 MB", async () => {
  resetDriveTokenCacheForTests();
  let cancelled = false;
  let chunk = 0;
  const oversizedResponse = {
    status: 200,
    ok: true,
    headers: new Headers(),
    body: {
      getReader: () => ({
        async read() {
          chunk += 1;
          if (chunk <= 2) {
            return {
              done: false as const,
              value: new Uint8Array(5 * 1024 * 1024),
            };
          }
          return { done: true as const, value: undefined };
        },
        async cancel() {
          cancelled = true;
        },
        releaseLock() {},
      }),
    },
  } as unknown as Response;
  const fetchImpl = async (input: string | URL) => {
    if (String(input) === "https://oauth2.googleapis.com/token") {
      return new Response(
        JSON.stringify({ access_token: "access-token", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return oversizedResponse;
  };

  await assert.rejects(
    loadTransferProof("gdrive:1234567890file:pdf", {
      env: DRIVE_ENV,
      fetchImpl,
    }),
    TransferProofStorageUnavailableError
  );
  assert.equal(cancelled, true);
});

test("storage rejects a buffer larger than 8 MB before writing", async () => {
  await assert.rejects(
    storeTransferProof(
      {
        buffer: Buffer.alloc(8 * 1024 * 1024 + 1),
        fileName: "too-large.pdf",
        kind: "pdf",
      },
      { env: { TRANSFER_PROOFS_STORAGE: "local" } }
    ),
    TransferProofStorageUnavailableError
  );
});

test("local mode keeps the legacy reference readable and deletable", async () => {
  const fileName = `test-${crypto.randomUUID()}.pdf`;
  const reference = await storeTransferProof(
    { buffer: Buffer.from("local-proof"), fileName, kind: "pdf" },
    { env: { TRANSFER_PROOFS_STORAGE: "local" } }
  );

  try {
    assert.equal(reference, `/uploads/transfer-proofs/${fileName}`);
    const proof = await loadTransferProof(reference);
    assert.equal(proof.buffer.toString(), "local-proof");
    assert.equal(proof.mimeType, "application/pdf");
  } finally {
    await deleteTransferProof(reference);
  }

  await assert.rejects(loadTransferProof(reference), TransferProofNotFoundError);
});
