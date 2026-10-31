import { beforeEach, describe, expect, test, vi } from "vitest";

const database = vi.hoisted(() => ({
  record: null as Record<string, unknown> | null,
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("../src/db.js", () => ({
  prisma: {
    googleDriveCredential: {
      findUnique: database.findUnique,
      upsert: database.upsert,
    },
  },
}));

describe("encrypted Google Drive credentials", () => {
  let disableGoogleDriveCredentials: typeof import("../src/integrations/googleDriveCredentials").disableGoogleDriveCredentials;
  let getGoogleDriveRefreshToken: typeof import("../src/integrations/googleDriveCredentials").getGoogleDriveRefreshToken;
  let saveGoogleDriveRefreshToken: typeof import("../src/integrations/googleDriveCredentials").saveGoogleDriveRefreshToken;

  beforeEach(async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("DIRECT_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-with-more-than-thirty-two-characters");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3001");
    vi.stubEnv("FRONTEND_ORIGINS", "http://localhost:8443");
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_DRIVE_REFRESH_TOKEN", "env-fallback-token");
    vi.stubEnv(
      "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY",
      Buffer.alloc(32, 8).toString("base64"),
    );
    database.record = null;
    database.findUnique.mockImplementation(async () => database.record);
    database.upsert.mockImplementation(
      async ({ where, create, update }: {
        where: { id: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        database.record = {
          ...(database.record ?? create),
          ...(database.record ? update : {}),
          id: where.id,
        };
        return database.record;
      },
    );
    vi.resetModules();
    ({
      disableGoogleDriveCredentials,
      getGoogleDriveRefreshToken,
      saveGoogleDriveRefreshToken,
    } = await import("../src/integrations/googleDriveCredentials"));
  });

  test("stores refresh tokens encrypted and can decrypt them for the server adapter", async () => {
    const secret = "private-refresh-token-value";

    await saveGoogleDriveRefreshToken(secret, "admin-user");

    expect(database.record).not.toHaveProperty("refreshToken", secret);
    expect(database.record?.refreshTokenCiphertext).not.toContain(secret);
    expect(database.record?.enabled).toBe(true);
    await expect(getGoogleDriveRefreshToken()).resolves.toBe(secret);
  });

  test("rejects tampered encrypted token records instead of falling back", async () => {
    await saveGoogleDriveRefreshToken("refresh-token", "admin-user");
    database.record = {
      ...database.record,
      refreshTokenTag: Buffer.alloc(16, 1).toString("base64"),
    };

    await expect(getGoogleDriveRefreshToken()).rejects.toThrow();
  });

  test("disconnect disables database and environment token fallback", async () => {
    await saveGoogleDriveRefreshToken("refresh-token", "admin-user");

    await disableGoogleDriveCredentials("admin-user");

    expect(database.record?.enabled).toBe(false);
    expect(database.record?.refreshTokenCiphertext).toBeNull();
    await expect(getGoogleDriveRefreshToken()).resolves.toBeNull();
  });
});
