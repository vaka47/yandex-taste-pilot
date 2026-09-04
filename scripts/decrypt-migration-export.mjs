import { chmod, readFile, writeFile } from "node:fs/promises";
import { constants, privateDecrypt } from "node:crypto";

const [endpoint, secretPath, privateKeyPath, publicKeyPath, outputPath] = process.argv.slice(2);
if (![endpoint, secretPath, privateKeyPath, publicKeyPath, outputPath].every(Boolean)) {
  throw new Error("Expected endpoint, secret, private key, public key and output paths");
}

const [secret, privateKey, publicKey] = await Promise.all([
  readFile(secretPath, "utf8").then(value => value.trim()),
  readFile(privateKeyPath, "utf8"),
  readFile(publicKeyPath, "utf8")
]);
const response = await fetch(endpoint, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
  body: JSON.stringify({ publicKey }),
  signal: AbortSignal.timeout(30_000)
});
if (!response.ok) throw new Error(`Migration export failed with ${response.status}`);
const payload = await response.json();
const values = Object.fromEntries(Object.entries(payload.values || {}).map(([key, encrypted]) => {
  if (!encrypted) return [key, null];
  const value = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(String(encrypted), "base64"));
  return [key, value.toString("utf8")];
}));
await writeFile(outputPath, `${JSON.stringify(values, null, 2)}\n`, { mode: 0o600 });
await chmod(outputPath, 0o600);
console.log(`Recovered ${Object.values(values).filter(Boolean).length} encrypted production settings.`);

