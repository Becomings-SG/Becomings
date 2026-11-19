export interface IncomingFoodPhoto {
  sender_hash: string;
  whatsapp_message_id: string;
  whatsapp_timestamp: string;
  media_id: string;
  mime_type: string;
  media_sha256?: string;
  caption?: string;
}

export interface Env {
  DB: D1Database;
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  META_GRAPH_API_VERSION: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GOOGLE_OAUTH_REFRESH_TOKEN: string;
}

type ClientRow = {
  client_code: string;
  drive_folder_id: string | null;
};

type DriveFile = {
  id: string;
  name?: string;
  webViewLink?: string;
};

type MetaMediaInfo = {
  url?: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

function safeDate(timestamp: string): Date {
  const seconds = Number(timestamp);
  const parsed = Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

async function getGoogleAccessToken(env: Env): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error("GOOGLE_TOKEN_REFRESH_FAILED");

  const result = await response.json() as { access_token?: string };
  if (!result.access_token) throw new Error("GOOGLE_ACCESS_TOKEN_MISSING");
  return result.access_token;
}

async function driveRequest<T>(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`GOOGLE_DRIVE_HTTP_${response.status}`);
  return await response.json() as T;
}

async function findOrCreateFolder(
  token: string,
  name: string,
  appPropertyKey: string,
  appPropertyValue: string,
  parentId?: string,
): Promise<DriveFile> {
  const clauses = [
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
    `appProperties has { key='${appPropertyKey}' and value='${appPropertyValue}' }`,
  ];
  if (parentId) clauses.push(`'${parentId}' in parents`);

  const query = encodeURIComponent(clauses.join(" and "));
  const list = await driveRequest<{ files?: DriveFile[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=10&fields=files(id,name,webViewLink)`,
    token,
  );
  if (list.files?.length) return list.files[0];

  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    ...(parentId ? { parents: [parentId] } : {}),
    appProperties: { [appPropertyKey]: appPropertyValue },
  };

  return await driveRequest<DriveFile>(
    "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink",
    token,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metadata),
    },
  );
}

async function ensureClientFolder(
  env: Env,
  token: string,
  client: ClientRow,
): Promise<string> {
  if (client.drive_folder_id) return client.drive_folder_id;

  // Root and client folders are created by this OAuth app, making the
  // narrow drive.file scope practical without exposing the user's whole Drive.
  const root = await findOrCreateFolder(
    token,
    "Becomings Food Photo Records",
    "becomingsRoot",
    "true",
  );
  const folder = await findOrCreateFolder(
    token,
    client.client_code,
    "becomingsClientCode",
    client.client_code,
    root.id,
  );

  await env.DB.prepare(
    "UPDATE clients SET drive_folder_id = ? WHERE client_code = ? AND drive_folder_id IS NULL",
  ).bind(folder.id, client.client_code).run();

  const refreshed = await env.DB.prepare(
    "SELECT drive_folder_id FROM clients WHERE client_code = ?",
  ).bind(client.client_code).first<{ drive_folder_id: string | null }>();

  return refreshed?.drive_folder_id ?? folder.id;
}

async function retrieveWhatsAppMedia(
  env: Env,
  mediaId: string,
): Promise<{ bytes: ArrayBuffer; mimeType: string; sha256?: string }> {
  const version = env.META_GRAPH_API_VERSION;
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("META_GRAPH_VERSION_INVALID");

  const infoResponse = await fetch(
    `https://graph.facebook.com/${version}/${encodeURIComponent(mediaId)}?phone_number_id=${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID)}`,
    { headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` } },
  );
  if (!infoResponse.ok) throw new Error(`WHATSAPP_MEDIA_LOOKUP_HTTP_${infoResponse.status}`);

  const info = await infoResponse.json() as MetaMediaInfo;
  if (!info.url) throw new Error("WHATSAPP_MEDIA_URL_MISSING");
  if (info.file_size && info.file_size > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");

  const mediaUrl = new URL(info.url);
  const allowedHost =
    mediaUrl.protocol === "https:" &&
    (mediaUrl.hostname === "lookaside.fbsbx.com" ||
      mediaUrl.hostname.endsWith(".fbcdn.net") ||
      mediaUrl.hostname.endsWith(".whatsapp.net"));
  if (!allowedHost) throw new Error("WHATSAPP_MEDIA_HOST_NOT_ALLOWED");

  const download = await fetch(mediaUrl.toString(), {
    headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
    redirect: "manual",
  });
  if (!download.ok) throw new Error(`WHATSAPP_MEDIA_DOWNLOAD_HTTP_${download.status}`);

  const mimeType = (download.headers.get("content-type") ?? info.mime_type ?? "")
    .split(";")[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) throw new Error("IMAGE_TYPE_NOT_ALLOWED");

  const bytes = await download.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("IMAGE_SIZE_INVALID");
  }

  return { bytes, mimeType, ...(info.sha256 ? { sha256: info.sha256 } : {}) };
}

async function findExistingPhoto(
  token: string,
  folderId: string,
  fileName: string,
): Promise<DriveFile | null> {
  const escapedName = fileName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `name='${escapedName}' and '${folderId}' in parents and trashed=false`,
  );
  const result = await driveRequest<{ files?: DriveFile[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1&fields=files(id,name,webViewLink)`,
    token,
  );
  return result.files?.[0] ?? null;
}

async function uploadPhoto(
  token: string,
  folderId: string,
  fileName: string,
  mimeType: string,
  bytes: ArrayBuffer,
): Promise<DriveFile> {
  const existing = await findExistingPhoto(token, folderId, fileName);
  if (existing) return existing;

  const boundary = `becomings_${crypto.randomUUID().replace(/-/g, "")}`;
  const metadata = JSON.stringify({
    name: fileName,
    mimeType,
    parents: [folderId],
  });

  const prefix = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const suffix = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(prefix.byteLength + bytes.byteLength + suffix.byteLength);
  body.set(prefix, 0);
  body.set(new Uint8Array(bytes), prefix.byteLength);
  body.set(suffix, prefix.byteLength + bytes.byteLength);

  return await driveRequest<DriveFile>(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    token,
    {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
}

async function processOne(
  event: IncomingFoodPhoto,
  env: Env,
): Promise<void> {
  const client = await env.DB.prepare(
    "SELECT client_code, drive_folder_id FROM clients WHERE whatsapp_sender_hash = ? AND active = 1",
  ).bind(event.sender_hash).first<ClientRow>();

  // Unknown or inactive senders are not downloaded or retained.
  if (!client) return;

  const consent = await env.DB.prepare(
    "SELECT status FROM client_consents WHERE client_code = ? ORDER BY COALESCE(consented_at, created_at) DESC LIMIT 1",
  ).bind(client.client_code).first<{ status: string }>();

  // No photo processing without current explicit consent.
  if (!consent || consent.status !== "granted") return;

  const submissionId = crypto.randomUUID();
  const submittedAt = safeDate(event.whatsapp_timestamp).toISOString();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO food_photo_submissions
      (submission_id, client_code, whatsapp_message_id, submitted_at, caption, processing_status)
     VALUES (?, ?, ?, ?, ?, 'queued')`,
  ).bind(
    submissionId,
    client.client_code,
    event.whatsapp_message_id,
    submittedAt,
    event.caption ?? null,
  ).run();

  const submission = await env.DB.prepare(
    "SELECT submission_id, drive_file_id FROM food_photo_submissions WHERE whatsapp_message_id = ?",
  ).bind(event.whatsapp_message_id).first<{ submission_id: string; drive_file_id: string | null }>();

  if (!submission) throw new Error("SUBMISSION_RECORD_MISSING");
  if (submission.drive_file_id) return;

  const token = await getGoogleAccessToken(env);
  const folderId = await ensureClientFolder(env, token, client);
  const media = await retrieveWhatsAppMedia(env, event.media_id);

  const date = safeDate(event.whatsapp_timestamp);
  const datePart = date.toISOString().replace(/[:.]/g, "-");
  const extension = media.mimeType === "image/png" ? "png" : "jpg";
  const messagePart = safeFilePart(event.whatsapp_message_id);
  const fileName = `${datePart}_${messagePart}.${extension}`;

  const driveFile = await uploadPhoto(
    token,
    folderId,
    fileName,
    media.mimeType,
    media.bytes,
  );

  await env.DB.prepare(
    `UPDATE food_photo_submissions
       SET drive_file_id = ?, drive_web_view_link = ?, processing_status = 'stored', failure_code = NULL
     WHERE whatsapp_message_id = ?`,
  ).bind(
    driveFile.id,
    driveFile.webViewLink ?? null,
    event.whatsapp_message_id,
  ).run();
}

export async function processIncomingFoodPhotos(
  batch: MessageBatch<IncomingFoodPhoto>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await processOne(message.body, env);
      message.ack();
    } catch (error) {
      // Avoid logging any personal data or upstream response bodies.
      console.error("Food photo processing failed", {
        code: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });
      message.retry({ delaySeconds: 60 });
    }
  }
}
