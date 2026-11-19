export interface Env {
  META_VERIFY_TOKEN: string;
  META_APP_SECRET: string;
  WA_ID_HASH_SECRET: string;
  INGEST_QUEUE: Queue<IncomingFoodPhoto>;
}

export interface IncomingFoodPhoto {
  sender_hash: string;
  whatsapp_message_id: string;
  whatsapp_timestamp: string;
  media_id: string;
  mime_type: string;
  media_sha256?: string;
  caption?: string;
}

type WhatsAppImage = {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
};

type WhatsAppMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  image?: WhatsAppImage;
};

type WhatsAppWebhook = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppMessage[];
      };
    }>;
  }>;
};

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function hmacSha256(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return bytesToHex(signature);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const supplied = hexToBytes(signatureHeader.slice("sha256=".length));
  if (!supplied) return false;

  const expectedHex = await hmacSha256(appSecret, rawBody);
  const expected = hexToBytes(expectedHex);
  return expected !== null && constantTimeEqual(supplied, expected);
}

function extractImageMessages(payload: WhatsAppWebhook): WhatsAppMessage[] {
  const messages: WhatsAppMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (
          message.type === "image" &&
          message.id &&
          message.from &&
          message.image?.id
        ) {
          messages.push(message);
        }
      }
    }
  }
  return messages;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Meta webhook subscription verification.
    if (request.method === "GET" && url.pathname === "/webhooks/whatsapp") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === env.META_VERIFY_TOKEN && challenge) {
        return new Response(challenge, { status: 200 });
      }
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method === "POST" && url.pathname === "/webhooks/whatsapp") {
      const rawBody = await request.text();
      const valid = await verifyMetaSignature(
        rawBody,
        request.headers.get("x-hub-signature-256"),
        env.META_APP_SECRET,
      );
      if (!valid) return new Response("Invalid signature", { status: 401 });

      let payload: WhatsAppWebhook;
      try {
        payload = JSON.parse(rawBody) as WhatsAppWebhook;
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }

      const messages = extractImageMessages(payload);
      for (const message of messages) {
        const image = message.image!;
        const senderHash = await hmacSha256(env.WA_ID_HASH_SECRET, message.from!);

        const event: IncomingFoodPhoto = {
          sender_hash: senderHash,
          whatsapp_message_id: message.id!,
          whatsapp_timestamp: message.timestamp ?? "",
          media_id: image.id!,
          mime_type: image.mime_type ?? "image/jpeg",
          ...(image.sha256 ? { media_sha256: image.sha256 } : {}),
          ...(image.caption ? { caption: image.caption } : {}),
        };

        await env.INGEST_QUEUE.send(event);
      }

      // Do not log raw payloads, phone numbers, names, captions or image data.
      return Response.json({ received: true, queued_images: messages.length });
    }

    return new Response("Not found", { status: 404 });
  },
};
