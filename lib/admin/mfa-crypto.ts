import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

/**
 * Protects the two-step secrets stored in the database. The authenticator secret is encrypted (AES-256-GCM)
 * and tied to the admin it belongs to, so a copied database row cannot be moved to another account.
 * Backup codes are stored only as keyed hashes.
 *
 * The key comes from ADMIN_MFA_ENCRYPTION_KEY (32 random bytes, base64) or, when that is not set, is derived
 * from BETTER_AUTH_SECRET. With neither, two-step cannot work and the portal stays closed rather than open.
 */

type Env = Record<string, string | undefined>;

export class MfaConfigError extends Error {}

function masterKey(env: Env): Buffer {
  const dedicated = env.ADMIN_MFA_ENCRYPTION_KEY?.trim();
  if (dedicated) {
    const key = Buffer.from(dedicated, "base64");
    if (key.length !== 32) throw new MfaConfigError("ADMIN_MFA_ENCRYPTION_KEY must be 32 bytes, base64 encoded.");
    return key;
  }
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 16) throw new MfaConfigError("Set ADMIN_MFA_ENCRYPTION_KEY (or BETTER_AUTH_SECRET) to use two-step sign-in.");
  return Buffer.from(secret, "utf8");
}

function derive(env: Env, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey(env), "txmate-admin-two-step", purpose, 32));
}

/** `v1.<iv>.<tag>.<ciphertext>`, each part base64. `owner` is authenticated but not stored. */
export function encryptSecret(plain: string, owner: string, env: Env = process.env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derive(env, "secret-encryption"), iv);
  cipher.setAAD(Buffer.from(owner, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

/** The secret, or null when the value is damaged, belongs to someone else, or was made with another key. */
export function decryptSecret(stored: string, owner: string, env: Env = process.env): string | null {
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", derive(env, "secret-encryption"), Buffer.from(parts[1], "base64"));
    decipher.setAAD(Buffer.from(owner, "utf8"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64")), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof MfaConfigError) throw error;
    return null;
  }
}

/** Keyed hash of a normalised backup code, as stored. */
export function hashBackupCode(code: string, env: Env = process.env): string {
  return createHmac("sha256", derive(env, "backup-code-hash")).update(code).digest("hex");
}
