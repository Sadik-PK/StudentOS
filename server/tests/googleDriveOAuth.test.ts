import { createServer, type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  generateAuthUrl: vi.fn(),
  getToken: vi.fn(),
  setCredentials: vi.fn(),
  getAccessToken: vi.fn(),
  saveRefreshToken: vi.fn(),
  getRefreshToken: vi.fn(),
  disableCredentials: vi.fn(),
  clearAccessToken: vi.fn(),
  oauthConstructor: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    credentials: Record<string, unknown> = {};

    constructor(...args: unknown[]) {
      mocks.oauthConstructor(...args);
    }

    generateAuthUrl(options: Record<string, unknown>) {
      return mocks.generateAuthUrl(options);
    }

    getToken(code: string) {
      return mocks.getToken(code);
    }

    setCredentials(credentials: Record<string, unknown>) {
      this.credentials = credentials;
      mocks.setCredentials(credentials);
    }

    getAccessToken() {
      return mocks.getAccessToken();
    }
  },
}));

vi.mock("../src/db.js", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
  },
}));

vi.mock("../src/middleware/requireAuth.js", () => ({
  requireAuth: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.userId = req.get("x-user-id") ?? undefined;
    next();
  },
}));

vi.mock("../src/integrations/googleDriveCredentials.js", () => ({
  assertGoogleDriveEncryptionConfigured: vi.fn(),
  disableGoogleDriveCredentials: mocks.disableCredentials,
  getGoogleDriveRefreshToken: mocks.getRefreshToken,
  saveGoogleDriveRefreshToken: mocks.saveRefreshToken,
}));

vi.mock("../src/storage/googleDrive.js", () => ({
  clearGoogleDriveAccessToken: mocks.clearAccessToken,
}));

const redirectUri =
  "https://studentos-api-hkml.onrender.com/api/integrations/google-drive/callback";
let driveVerificationStatus = 200;

describe("Google Drive OAuth integration", () => {
  let server: Server;
  let baseUrl: string;
  let nativeFetch: typeof fetch;

  beforeEach(async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("DIRECT_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-with-more-than-thirty-two-characters");
    vi.stubEnv("BETTER_AUTH_URL", "https://studentos-api-hkml.onrender.com");
    vi.stubEnv("FRONTEND_ORIGINS", "https://student-os-phi-bice.vercel.app");
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_DRIVE_REFRESH_TOKEN", "");
    vi.stubEnv("GOOGLE_DRIVE_REDIRECT_URI", redirectUri);
    vi.stubEnv(
      "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY",
      Buffer.alloc(32, 7).toString("base64"),
    );
    vi.stubEnv("GOOGLE_DRIVE_ADMIN_EMAIL", "admin@example.com");
    vi.stubEnv("GOOGLE_DRIVE_FOLDER_ID", "");

    vi.resetModules();
    vi.clearAllMocks();
    driveVerificationStatus = 200;
    mocks.userFindUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where.id === "admin"
          ? { email: "admin@example.com", emailVerified: true }
          : { email: "student@example.com", emailVerified: true },
    );
    mocks.generateAuthUrl.mockImplementation(
      (options: Record<string, unknown>) => {
        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        url.searchParams.set("client_id", "client-id");
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("access_type", String(options.access_type));
        url.searchParams.set("prompt", String(options.prompt));
        url.searchParams.set("scope", String((options.scope as string[])[0]));
        url.searchParams.set("state", String(options.state));
        return url.toString();
      },
    );
    mocks.getToken.mockResolvedValue({
      tokens: {
        access_token: "access-token-secret",
        refresh_token: "refresh-token-secret",
      },
    });
    mocks.getAccessToken.mockResolvedValue({ token: "verified-access-token" });
    mocks.getRefreshToken.mockResolvedValue(null);

    const { integrationsRouter } = await import("../src/routes/integrations");
    const app = express();
    app.use("/api/integrations", integrationsRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not start the test HTTP server.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    nativeFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("https://www.googleapis.com/drive/")) {
          return Promise.resolve(
            new Response('{"files":[]}', { status: driveVerificationStatus }),
          );
        }
        return nativeFetch(input, init);
      }),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  async function beginAuthorization(userId = "admin") {
    const response = await fetch(
      `${baseUrl}/api/integrations/google-drive/connect`,
      { headers: { "x-user-id": userId }, redirect: "manual" },
    );
    return response;
  }

  async function callbackWith(response: Response, stateOverride?: string) {
    const authorization = new URL(response.headers.get("location")!);
    const state = stateOverride ?? authorization.searchParams.get("state")!;
    const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
    const callback = new URL(
      `${baseUrl}/api/integrations/google-drive/callback`,
    );
    callback.searchParams.set("state", state);
    callback.searchParams.set("code", "one-time-authorization-code");
    return fetch(callback, {
      headers: { cookie, "x-user-id": "admin" },
      redirect: "manual",
    });
  }

  test("generates an offline drive.file authorization URL and secure state cookie", async () => {
    const response = await beginAuthorization();
    const authorization = new URL(response.headers.get("location")!);
    const cookie = response.headers.get("set-cookie")!;

    expect(response.status).toBe(302);
    expect(authorization.searchParams.get("response_type")).toBe("code");
    expect(authorization.searchParams.get("access_type")).toBe("offline");
    expect(authorization.searchParams.get("prompt")).toBe("consent");
    expect(authorization.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/drive.file",
    );
    expect(authorization.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(authorization.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/api/integrations/google-drive");
    expect(mocks.oauthConstructor).toHaveBeenCalledWith(
      "client-id",
      "client-secret",
      redirectUri,
    );
  });

  test("rejects non-admin users and unverified allowlisted email addresses", async () => {
    const student = await beginAuthorization("student");
    expect(student.status).toBe(403);

    mocks.userFindUnique.mockResolvedValueOnce({
      email: "admin@example.com",
      emailVerified: false,
    });
    const unverifiedAdmin = await beginAuthorization();
    expect(unverifiedAdmin.status).toBe(403);
  });

  test("rejects invalid callback state without exchanging the code", async () => {
    const connect = await beginAuthorization();
    const authorization = new URL(connect.headers.get("location")!);
    const invalid = await callbackWith(
      connect,
      `${authorization.searchParams.get("state")}x`,
    );

    expect(invalid.status).toBe(400);
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(invalid.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("exchanges code, verifies Drive access, and never returns tokens", async () => {
    const connect = await beginAuthorization();
    const response = await callbackWith(connect);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("Google Drive connected successfully");
    expect(body).not.toContain("refresh-token-secret");
    expect(body).not.toContain("access-token-secret");
    expect(mocks.getToken).toHaveBeenCalledWith(
      "one-time-authorization-code",
    );
    expect(mocks.setCredentials).toHaveBeenCalledWith({
      access_token: "access-token-secret",
      refresh_token: "refresh-token-secret",
    });
    expect(mocks.saveRefreshToken).toHaveBeenCalledWith(
      "refresh-token-secret",
      "admin",
    );
    expect(mocks.clearAccessToken).toHaveBeenCalled();
  });

  test("preserves an existing refresh token when Google omits a new one", async () => {
    mocks.getToken.mockResolvedValueOnce({
      tokens: { access_token: "access-token-secret" },
    });
    mocks.getRefreshToken.mockResolvedValueOnce("existing-refresh-token");
    const connect = await beginAuthorization();

    const response = await callbackWith(connect);

    expect(response.status).toBe(200);
    expect(mocks.setCredentials).toHaveBeenCalledWith({
      access_token: "access-token-secret",
      refresh_token: "existing-refresh-token",
    });
    expect(mocks.saveRefreshToken).toHaveBeenCalledWith(
      "existing-refresh-token",
      "admin",
    );
  });

  test("rejects callbacks with no refresh token and does not persist credentials", async () => {
    mocks.getToken.mockResolvedValueOnce({
      tokens: { access_token: "access-token-secret" },
    });
    mocks.getRefreshToken.mockResolvedValueOnce(null);
    const connect = await beginAuthorization();

    const response = await callbackWith(connect);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("did not provide a refresh token");
    expect(mocks.saveRefreshToken).not.toHaveBeenCalled();
  });

  test("disconnect is admin-only and does not delete Drive files", async () => {
    const denied = await fetch(
      `${baseUrl}/api/integrations/google-drive/disconnect`,
      {
        method: "POST",
        headers: {
          "x-user-id": "student",
          origin: "https://student-os-phi-bice.vercel.app",
        },
      },
    );
    expect(denied.status).toBe(403);

    const crossSite = await fetch(
      `${baseUrl}/api/integrations/google-drive/disconnect`,
      {
        method: "POST",
        headers: {
          "x-user-id": "admin",
          origin: "https://attacker.example",
        },
      },
    );
    expect(crossSite.status).toBe(403);
    expect(mocks.disableCredentials).not.toHaveBeenCalled();

    const response = await fetch(
      `${baseUrl}/api/integrations/google-drive/disconnect`,
      {
        method: "POST",
        headers: {
          "x-user-id": "admin",
          origin: "https://student-os-phi-bice.vercel.app",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(mocks.disableCredentials).toHaveBeenCalledWith("admin");
    expect(mocks.clearAccessToken).toHaveBeenCalled();
    expect(await response.text()).toContain("Existing Drive files were not deleted");
  });

  test("does not save a token if Drive access verification fails", async () => {
    driveVerificationStatus = 403;
    const connect = await beginAuthorization();

    const response = await callbackWith(connect);
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).not.toContain("refresh-token-secret");
    expect(mocks.saveRefreshToken).not.toHaveBeenCalled();
  });
});
