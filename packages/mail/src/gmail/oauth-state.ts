async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Buffer.from(signature).toString("base64url");
}

export async function signOauthState(secret: string, payload: Record<string, string>) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = await hmac(secret, body);
  return `${body}.${signature}`;
}

export async function parseOauthState(secret: string, value: string) {
  const [body, signature] = value.split(".");
  const expected = await hmac(secret, body ?? "");
  if (expected !== signature) {
    throw new Error("Invalid OAuth state signature");
  }

  return JSON.parse(Buffer.from(body ?? "", "base64url").toString("utf8")) as Record<string, string>;
}
