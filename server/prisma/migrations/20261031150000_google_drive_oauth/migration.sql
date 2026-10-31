CREATE TABLE "GoogleDriveCredential" (
    "id" TEXT NOT NULL,
    "refreshTokenCiphertext" TEXT,
    "refreshTokenIv" TEXT,
    "refreshTokenTag" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoogleDriveCredential_pkey" PRIMARY KEY ("id")
);
