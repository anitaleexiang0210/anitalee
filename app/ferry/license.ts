const STORAGE_KEY = "ferry_word_license_v1";

const PUBLIC_KEY: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "Tv0jHObqNAJgFYjpneibJoNtwuTf1yqTwlzz1HmN2aM",
  y: "wqtpHnD0YgS8PZlXWZnwzkAjkrQ5eLgN7Zq0pISlVHk",
  ext: true,
  key_ops: ["verify"],
};

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

export async function verifyFerryLicense(value: string): Promise<boolean> {
  const code = value.trim();
  const parts = code.split(".");
  if (parts.length !== 3 || parts[0] !== "FD1" || code.length > 512) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    if (payload.v !== 1 || payload.product !== "ferry-word" || !/^[0-9a-f]{18}$/.test(payload.id)) return false;
    const key = await crypto.subtle.importKey("jwk", PUBLIC_KEY, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      decodeBase64Url(parts[2]) as BufferSource,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return false;
  }
}

export async function hasFerryLicense(): Promise<boolean> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? await verifyFerryLicense(saved) : false;
  } catch {
    return false;
  }
}

export async function saveFerryLicense(value: string): Promise<boolean> {
  if (!await verifyFerryLicense(value)) return false;
  localStorage.setItem(STORAGE_KEY, value.trim());
  return true;
}
