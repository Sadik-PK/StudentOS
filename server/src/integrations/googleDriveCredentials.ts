import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../env.js";
import { prisma } from "../db.js";

const CREDENTIAL_ID = "app-owned-drive";

function encryptionKey() {
  const key = Buffer.from(env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) {
    throw new Error("Google Drive token encryption is not configured correctly.");
  }
  return key;
}

function encryptRefreshToken(refreshToken: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ]);
  return {
    refreshTokenCiphertext: ciphertext.toString("base64"),
    refreshTokenIv: iv.toString("base64"),
    refreshTokenTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptRefreshToken(record: {
  refreshTokenCiphertext: string | null;
  refreshTokenIv: string | null;
  refreshTokenTag: string | null;
}) {
  if (
    !record.refreshTokenCiphertext ||
    !record.refreshTokenIv ||
    !record.refreshTokenTag
  ) {
    return null;
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(record.refreshTokenIv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(record.refreshTokenTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(record.refreshTokenCiphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export async function getGoogleDriveRefreshToken() {
  const stored = await prisma.googleDriveCredential.findUnique({
    where: { id: CREDENTIAL_ID },
  });
  if (stored) {
    if (!stored.enabled) return null;
    return decryptRefreshToken(stored);
  }
  return env.GOOGLE_DRIVE_REFRESH_TOKEN || null;
}

export async function assertGoogleDriveEncryptionConfigured() {
  encryptionKey();
}

export async function saveGoogleDriveRefreshToken(
  refreshToken: string,
  adminUserId: string,
) {
  const encrypted = encryptRefreshToken(refreshToken);
  await prisma.googleDriveCredential.upsert({
    where: { id: CREDENTIAL_ID },
    create: {
      id: CREDENTIAL_ID,
      ...encrypted,
      enabled: true,
      updatedBy: adminUserId,
    },
    update: {
      ...encrypted,
      enabled: true,
      updatedBy: adminUserId,
    },
  });
}

export async function disableGoogleDriveCredentials(adminUserId: string) {
  await prisma.googleDriveCredential.upsert({
    where: { id: CREDENTIAL_ID },
    create: {
      id: CREDENTIAL_ID,
      enabled: false,
      updatedBy: adminUserId,
    },
    update: {
      refreshTokenCiphertext: null,
      refreshTokenIv: null,
      refreshTokenTag: null,
      enabled: false,
      updatedBy: adminUserId,
    },
  });
}
