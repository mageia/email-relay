const IV_BYTES = 12;

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function importKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealValue(secret: string, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await importKey(secret);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );

  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function openValue(secret: string, sealed: string) {
  const [ivText, payloadText] = sealed.split(".");
  const key = await importKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivText ?? "") },
    key,
    fromBase64(payloadText ?? ""),
  );

  return new TextDecoder().decode(decrypted);
}
