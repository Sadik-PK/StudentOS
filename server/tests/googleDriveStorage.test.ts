import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../src/integrations/googleDriveCredentials", () => ({
  getGoogleDriveRefreshToken: async () => "refresh-token",
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    credentials: Record<string, unknown> = {};

    constructor() {}

    setCredentials(credentials: Record<string, unknown>) {
      this.credentials = credentials;
    }

    async getAccessToken() {
      return { token: "access-token" };
    }
  },
}));

const fileBytes = Buffer.from("%PDF-test document");

describe("Google Drive file storage", () => {
  let uploadDriveFile: typeof import("../src/storage/googleDrive").uploadDriveFile;
  let downloadDriveFile: typeof import("../src/storage/googleDrive").downloadDriveFile;
  let deleteDriveFile: typeof import("../src/storage/googleDrive").deleteDriveFile;

  beforeEach(async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("DIRECT_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-with-more-than-thirty-two-characters");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3001");
    vi.stubEnv("FRONTEND_ORIGINS", "http://localhost:8443");
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "client-id");
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("GOOGLE_DRIVE_REFRESH_TOKEN", "refresh-token");
    vi.stubEnv("GOOGLE_DRIVE_FOLDER_ID", "folder-id");
    vi.resetModules();

    ({ uploadDriveFile, downloadDriveFile, deleteDriveFile } = await import(
      "../src/storage/googleDrive"
    ));
  });

  test("uploads private file content and records its StudentOS owner", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async (_input, init) => {
        expect(init?.method).toBe("POST");
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer access-token",
        );
        expect(new Headers(init?.headers).get("content-type")).toContain(
          "multipart/related",
        );
        const requestBody = Buffer.from(init?.body as Uint8Array).toString();
        expect(requestBody).toContain('"studentOsFileId":"app-file-id"');
        expect(requestBody).toContain('"studentOsOwnerId":"student-id"');
        expect(requestBody).toContain('"parents":["folder-id"]');
        expect(requestBody).toContain(fileBytes.toString());
        return new Response(
          JSON.stringify({
            id: "drive-file-id",
            mimeType: "application/pdf",
            size: String(fileBytes.length),
          }),
          { status: 200 },
        );
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadDriveFile(
        "app-file-id",
        "student-id",
        "lecture.pdf",
        "application/pdf",
        fileBytes,
      ),
    ).resolves.toBe("drive-file-id");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("downloads and deletes using the stored Drive file ID", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(fileBytes, {
          status: 200,
          headers: { "content-type": "application/pdf" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadDriveFile("drive-file-id")).resolves.toEqual({
      bytes: new Uint8Array(fileBytes),
      contentType: "application/pdf",
    });
    await expect(deleteDriveFile("drive-file-id")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "/drive/v3/files/drive-file-id?alt=media",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://www.googleapis.com/drive/v3/files/drive-file-id",
    );
  });
});
