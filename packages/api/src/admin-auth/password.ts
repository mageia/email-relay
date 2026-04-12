import { timingSafeEqual } from "node:crypto";

const PASSWORD_PREFIX = "pbkdf2";
const ITERATIONS = 210_000;
const HASH_BYTES = 32;
const SALT_BYTES = 16;

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function deriveBits(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: ITERATIONS,
      salt,
    },
    key,
    HASH_BYTES * 8,
  );

  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(password, salt);
  return [PASSWORD_PREFIX, String(ITERATIONS), toBase64(salt), toBase64(hash)].join(":");
}

export async function verifyPassword(password: string, encoded: string) {
  const [prefix, iterationText, saltText, hashText] = encoded.split(":");
  if (prefix !== PASSWORD_PREFIX || Number(iterationText) !== ITERATIONS) {
    return false;
  }

  const salt = fromBase64(saltText ?? "");
  const expected = fromBase64(hashText ?? "");
  const actual = await deriveBits(password, salt);

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
