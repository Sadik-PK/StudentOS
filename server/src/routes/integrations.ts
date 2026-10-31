import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { Router, type Request, type Response } from "express";
import { env } from "../env.js";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  assertGoogleDriveEncryptionConfigured,
  disableGoogleDriveCredentials,
  getGoogleDriveRefreshToken,
  saveGoogleDriveRefreshToken,
} from "../integrations/googleDriveCredentials.js";
import { clearGoogleDriveAccessToken } from "../storage/googleDrive.js";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const STATE_COOKIE = "studentos-drive-oauth-state";
const STATE_COOKIE_PATH = "/api/integrations/google-drive";
const STATE_TTL_SECONDS = 10 * 60;

export const integrationsRouter = Router();

function isAdminConfigured() {
  return Boolean(env.GOOGLE_DRIVE_ADMIN_EMAIL);
}

async function isDriveAdmin(userId: string) {
  if (!env.GOOGLE_DRIVE_ADMIN_EMAIL) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true },
  });
  return (
    user?.emailVerified === true &&
    user.email.toLowerCase() === env.GOOGLE_DRIVE_ADMIN_EMAIL.toLowerCase()
  );
}

function oauthClient() {
  const { GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REDIRECT_URI } =
    env;
  if (
    !GOOGLE_DRIVE_CLIENT_ID ||
    !GOOGLE_DRIVE_CLIENT_SECRET ||
    !GOOGLE_DRIVE_REDIRECT_URI
  ) {
    throw new Error("Google Drive OAuth client and redirect URI are not configured.");
  }
  return new OAuth2Client(
    GOOGLE_DRIVE_CLIENT_ID,
    GOOGLE_DRIVE_CLIENT_SECRET,
    GOOGLE_DRIVE_REDIRECT_URI,
  );
}

function oauthClientIsConfigured() {
  return Boolean(
    isAdminConfigured() &&
      env.GOOGLE_DRIVE_CLIENT_ID &&
      env.GOOGLE_DRIVE_CLIENT_SECRET &&
      env.GOOGLE_DRIVE_REDIRECT_URI,
  );
}

function isTrustedBrowserOrigin(req: Request) {
  const origin = req.get("origin");
  if (!origin) return false;
  try {
    const parsedOrigin = new URL(origin).origin;
    return env.FRONTEND_ORIGINS.some(
      (allowedOrigin) => new URL(allowedOrigin).origin === parsedOrigin,
    );
  } catch {
    return false;
  }
}

function setStateCookie(res: Response, state: string) {
  const secure = env.GOOGLE_DRIVE_REDIRECT_URI?.startsWith("https://");
  res.append(
    "Set-Cookie",
    [
      `${STATE_COOKIE}=${encodeURIComponent(state)}`,
      `Path=${STATE_COOKIE_PATH}`,
      `Max-Age=${STATE_TTL_SECONDS}`,
      "HttpOnly",
      "SameSite=Lax",
      ...(secure ? ["Secure"] : []),
    ].join("; "),
  );
}

function clearStateCookie(res: Response) {
  const secure = env.GOOGLE_DRIVE_REDIRECT_URI?.startsWith("https://");
  res.append(
    "Set-Cookie",
    [
      `${STATE_COOKIE}=`,
      `Path=${STATE_COOKIE_PATH}`,
      "Max-Age=0",
      "HttpOnly",
      "SameSite=Lax",
      ...(secure ? ["Secure"] : []),
    ].join("; "),
  );
}

function stateCookie(req: Request) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const prefix = `${STATE_COOKIE}=`;
  const cookie = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return null;
  }
}

function validState(received: unknown, cookieValue: string | null) {
  if (
    typeof received !== "string" ||
    !cookieValue ||
    received.length !== 43 ||
    cookieValue.length !== 43
  ) {
    return false;
  }
  const receivedBytes = Buffer.from(received);
  const cookieBytes = Buffer.from(cookieValue);
  return (
    receivedBytes.length === cookieBytes.length &&
    timingSafeEqual(receivedBytes, cookieBytes)
  );
}

async function consumeOAuthState(received: unknown, cookieValue: string | null) {
  if (typeof cookieValue !== "string" || !validState(received, cookieValue)) {
    return null;
  }

  const stateHash = createHash("sha256").update(cookieValue).digest("hex");
  const now = new Date();
  const record = await prisma.googleDriveOAuthState.findUnique({
    where: { stateHash },
  });
  if (!record || record.expiresAt <= now) return null;

  const consumed = await prisma.googleDriveOAuthState.deleteMany({
    where: { stateHash, expiresAt: { gt: now } },
  });
  return consumed.count === 1 ? record.adminUserId : null;
}

function callbackResponseHeaders(res: Response) {
  res.set({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
}

function callbackFailure(res: Response, status: number, message: string) {
  callbackResponseHeaders(res);
  res.status(status).type("text/plain").send(message);
}

async function verifyDriveAccess(accessToken: string) {
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    console.error(`Google Drive access verification failed (${response.status}).`);
    throw new Error("Google Drive access could not be verified.");
  }
}

integrationsRouter.get(
  "/google-drive/connect",
  requireAuth,
  async (req, res, next) => {
    try {
      if (!oauthClientIsConfigured() || !env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY) {
        res.status(503).json({
          error: "Google Drive OAuth setup is missing required server configuration.",
        });
        return;
      }
      if (!(await isDriveAdmin(req.userId!))) {
        res.status(403).json({ error: "Administrator access is required." });
        return;
      }

      const state = randomBytes(32).toString("base64url");
      const now = new Date();
      await prisma.googleDriveOAuthState.deleteMany({
        where: { expiresAt: { lte: now } },
      });
      await prisma.googleDriveOAuthState.create({
        data: {
          stateHash: createHash("sha256").update(state).digest("hex"),
          adminUserId: req.userId!,
          expiresAt: new Date(now.getTime() + STATE_TTL_SECONDS * 1000),
        },
      });
      setStateCookie(res, state);
      const authorizationUrl = oauthClient().generateAuthUrl({
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        scope: [DRIVE_SCOPE],
        state,
      });
      res.redirect(302, authorizationUrl);
    } catch (error) {
      next(error);
    }
  },
);

integrationsRouter.get(
  "/google-drive/callback",
  async (req, res, next) => {
    callbackResponseHeaders(res);
    clearStateCookie(res);
    try {
      if (!oauthClientIsConfigured() || !env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY) {
        callbackFailure(res, 503, "Google Drive OAuth setup is not configured.");
        return;
      }
      const adminUserId = await consumeOAuthState(
        req.query.state,
        stateCookie(req),
      );
      if (!adminUserId) {
        callbackFailure(res, 400, "Google Drive authorization state is invalid or expired.");
        return;
      }
      if (!(await isDriveAdmin(adminUserId))) {
        callbackFailure(res, 403, "Administrator access is required.");
        return;
      }
      if (typeof req.query.error === "string") {
        callbackFailure(res, 400, "Google Drive authorization was not completed.");
        return;
      }
      if (typeof req.query.code !== "string" || !req.query.code) {
        callbackFailure(res, 400, "Google Drive authorization code is missing.");
        return;
      }

      const client = oauthClient();
      const { tokens } = await client.getToken(req.query.code);
      const existingRefreshToken = await getGoogleDriveRefreshToken();
      const refreshToken = tokens.refresh_token ?? existingRefreshToken;
      if (!refreshToken) {
        callbackFailure(
          res,
          400,
          "Google did not provide a refresh token. Retry authorization and consent.",
        );
        return;
      }

      await assertGoogleDriveEncryptionConfigured();
      client.setCredentials({ ...tokens, refresh_token: refreshToken });
      const { token } = await client.getAccessToken();
      if (!token) throw new Error("Google Drive access token is unavailable.");
      await verifyDriveAccess(token);
      await saveGoogleDriveRefreshToken(refreshToken, adminUserId);
      clearGoogleDriveAccessToken();

      callbackFailure(
        res,
        200,
        "Google Drive connected successfully. You can close this page.",
      );
    } catch {
      console.error("Google Drive OAuth callback failed.");
      callbackFailure(res, 502, "Google Drive authorization could not be completed.");
    }
  },
);

integrationsRouter.post(
  "/google-drive/disconnect",
  requireAuth,
  async (req, res, next) => {
    try {
      if (!isTrustedBrowserOrigin(req)) {
        res.status(403).json({ error: "Request origin is not allowed." });
        return;
      }
      if (!isAdminConfigured()) {
        res.status(503).json({
          error: "Google Drive OAuth setup is missing required server configuration.",
        });
        return;
      }
      if (!(await isDriveAdmin(req.userId!))) {
        res.status(403).json({ error: "Administrator access is required." });
        return;
      }

      await disableGoogleDriveCredentials(req.userId!);
      clearGoogleDriveAccessToken();
      res.json({
        message:
          "Google Drive credentials are disabled. Existing Drive files were not deleted; new Drive operations are unavailable until reconnected.",
      });
    } catch (error) {
      next(error);
    }
  },
);
