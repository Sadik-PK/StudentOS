ALTER TABLE "UserSettings"
  ADD COLUMN "activeDashboardWorkspaceId" TEXT;

CREATE TABLE "DashboardWorkspace" (
  "userId" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "preset" TEXT NOT NULL DEFAULT 'student',
  "layout" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DashboardWorkspace_pkey" PRIMARY KEY ("userId", "id"),
  CONSTRAINT "DashboardWorkspace_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DashboardWorkspace_userId_updatedAt_idx"
  ON "DashboardWorkspace"("userId", "updatedAt");
