CREATE TABLE "GoogleDriveOAuthState" (
    "stateHash" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoogleDriveOAuthState_pkey" PRIMARY KEY ("stateHash")
);

CREATE INDEX "GoogleDriveOAuthState_expiresAt_idx"
ON "GoogleDriveOAuthState"("expiresAt");
