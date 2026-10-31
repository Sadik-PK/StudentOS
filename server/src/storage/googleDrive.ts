import { randomUUID } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { env } from "../env.js";
import { getGoogleDriveRefreshToken } from "../integrations/googleDriveCredentials.js";

const DRIVE_API_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const REQUEST_TIMEOUT_MS = 90_000;

let cachedAccessToken: { value: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;

function getDriveConfig() {
  const { GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET } = env;
  if (!GOOGLE_DRIVE_CLIENT_ID || !GOOGLE_DRIVE_CLIENT_SECRET) {
    throw new Error("Google Drive file storage is not configured.");
  }
  return {
    clientId: GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: GOOGLE_DRIVE_CLIENT_SECRET,
    folderId: env.GOOGLE_DRIVE_FOLDER_ID,
  };
}

export function clearGoogleDriveAccessToken() {
  cachedAccessToken = null;
  tokenRequest = null;
}

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }
  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    const config = getDriveConfig();
    const refreshToken = await getGoogleDriveRefreshToken();
    if (!refreshToken) {
      throw new Error("Google Drive is not connected. Complete the admin OAuth setup.");
    }
    const oauthClient = new OAuth2Client(config.clientId, config.clientSecret);
    oauthClient.setCredentials({ refresh_token: refreshToken });
    const { token } = await oauthClient.getAccessToken();
    if (!token) throw new Error("Google Drive could not authorize file storage.");
    cachedAccessToken = {
      value: token,
      expiresAt:
        oauthClient.credentials.expiry_date ?? Date.now() + 50 * 60_000,
    };
    return token;
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

async function driveRequest(
  url: string,
  init: RequestInit,
  action: string,
  acceptNotFound = false,
): Promise<Response> {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      ...Object.fromEntries(new Headers(init.headers).entries()),
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok && !(acceptNotFound && response.status === 404)) {
    console.error(`Google Drive ${action} failed (${response.status}).`);
    throw new Error("Google Drive could not complete the file operation.");
  }
  return response;
}

export async function uploadDriveFile(
  fileId: string,
  ownerUserId: string,
  fileName: string,
  contentType: string,
  bytes: Uint8Array,
) {
  const { folderId } = getDriveConfig();
  const boundary = `studentos_${randomUUID().replaceAll("-", "")}`;
  const metadata = {
    name: fileName,
    ...(folderId ? { parents: [folderId] } : {}),
    appProperties: { studentOsFileId: fileId, studentOsOwnerId: ownerUserId },
  };
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const url = new URL(DRIVE_UPLOAD_URL);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("fields", "id,mimeType,size");
  const response = await driveRequest(
    url.toString(),
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    },
    "upload",
  );
  const result: unknown = await response.json();
  if (
    typeof result !== "object" ||
    result === null ||
    !("id" in result) ||
    typeof result.id !== "string" ||
    !("mimeType" in result) ||
    result.mimeType !== contentType ||
    !("size" in result) ||
    Number(result.size) !== bytes.length
  ) {
    console.error("Google Drive upload returned unexpected file metadata.");
    throw new Error("Google Drive returned invalid uploaded-file metadata.");
  }
  return result.id;
}

export async function downloadDriveFile(fileId: string) {
  const response = await driveRequest(
    `${DRIVE_API_URL}/${encodeURIComponent(fileId)}?alt=media`,
    { method: "GET" },
    "download",
  );
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type")?.split(";")[0] ?? null,
  };
}

export async function deleteDriveFile(fileId: string) {
  await driveRequest(
    `${DRIVE_API_URL}/${encodeURIComponent(fileId)}`,
    { method: "DELETE" },
    "delete",
    true,
  );
}
