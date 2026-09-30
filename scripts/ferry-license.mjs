import { createPrivateKey, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [action, keyPath, outputPath, countArg] = process.argv.slice(2);

if (!keyPath || !["init", "issue"].includes(action)) {
  console.error("Usage: node scripts/ferry-license.mjs init <private.pem> | issue <private.pem> <codes.txt> [count]");
  process.exit(1);
}

if (action === "init") {
  if (existsSync(keyPath)) throw new Error("Private key already exists; refusing to overwrite it.");
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify(publicKey.export({ format: "jwk" })));
} else {
  const count = Number(countArg ?? 1);
  if (!outputPath || !Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error("Provide an output path and a count from 1 to 100.");
  }
  if (existsSync(outputPath)) throw new Error("Output file already exists; refusing to overwrite it.");
  const privateKey = createPrivateKey(readFileSync(keyPath));
  const lines = Array.from({ length: count }, () => {
    const payload = Buffer.from(JSON.stringify({
      v: 1,
      product: "ferry-word",
      id: randomBytes(9).toString("hex"),
      issuedAt: new Date().toISOString().slice(0, 10),
    })).toString("base64url");
    const message = `FD1.${payload}`;
    const signature = sign("sha256", Buffer.from(message), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url");
    return `${message}.${signature}`;
  });
  writeFileSync(outputPath, `${lines.join("\n")}\n`, { mode: 0o600, flag: "wx" });
  console.log(`Created ${count} codes at ${outputPath}`);
}
