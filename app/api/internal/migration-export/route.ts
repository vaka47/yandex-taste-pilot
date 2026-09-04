import { constants, createPublicKey, publicEncrypt, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function sameSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expected = process.env.MIGRATION_EXPORT_SECRET || "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || !supplied || !sameSecret(expected, supplied)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as { publicKey?: unknown } | null;
  if (typeof body?.publicKey !== "string" || body.publicKey.length > 10_000) {
    return NextResponse.json({ error: "INVALID_KEY" }, { status: 400 });
  }

  try {
    const publicKey = createPublicKey(body.publicKey);
    if (publicKey.asymmetricKeyType !== "rsa") throw new Error("RSA_REQUIRED");
    const value = process.env.TOKEN_ENCRYPTION_KEY;
    if (!value) return NextResponse.json({ error: "KEY_NOT_CONFIGURED" }, { status: 503 });
    const encrypted = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(value));
    const values = { TOKEN_ENCRYPTION_KEY: encrypted.toString("base64") };
    return NextResponse.json({ version: 1, values }, {
      headers: { "cache-control": "no-store, private", pragma: "no-cache" }
    });
  } catch {
    return NextResponse.json({ error: "INVALID_KEY" }, { status: 400 });
  }
}
