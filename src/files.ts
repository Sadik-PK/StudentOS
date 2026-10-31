import { apiRequest } from "./api";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

export interface CloudFile {
  id: string;
  fileName: string;
  contentType: string;
  purpose: "note" | "assignment" | "profile";
}

interface SignedUpload {
  id: string;
  url: string;
  fields: Record<string, string>;
  completeUrl: string;
}

function isCloudFile(value: unknown): value is CloudFile {
  if (typeof value !== "object" || value === null) return false;
  const file = value as Record<string, unknown>;
  return (
    typeof file.id === "string" &&
    typeof file.fileName === "string" &&
    typeof file.contentType === "string" &&
    (file.purpose === "note" ||
      file.purpose === "assignment" ||
      file.purpose === "profile")
  );
}

function isSignedUpload(value: unknown): value is SignedUpload {
  if (typeof value !== "object" || value === null) return false;
  const upload = value as Record<string, unknown>;
  return (
    typeof upload.id === "string" &&
    typeof upload.url === "string" &&
    typeof upload.completeUrl === "string" &&
    typeof upload.fields === "object" &&
    upload.fields !== null &&
    Object.values(upload.fields).every((field) => typeof field === "string")
  );
}

export async function uploadStudentFile(
  file: File,
  purpose: CloudFile["purpose"],
): Promise<CloudFile> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error("Choose a supported PDF, document, image, spreadsheet, presentation, or text file.");
  }
  if (file.size < 1 || file.size > MAX_FILE_BYTES) {
    throw new Error("Files must be smaller than 20 MiB.");
  }

  const signedResponse = await apiRequest<unknown>("/api/files/upload-url", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      purpose,
    }),
  });

  if (!isSignedUpload(signedResponse)) {
    throw new Error("The server returned invalid upload details.");
  }

  const signed = signedResponse;

  try {
    const form = new FormData();
    for (const [key, value] of Object.entries(signed.fields)) form.append(key, value);
    form.append("file", file);

    const upload = await fetch(signed.url, { method: "POST", body: form });
    if (!upload.ok) throw new Error(`File upload failed with status ${upload.status}.`);

    const fileResponse = await apiRequest<unknown>(signed.completeUrl, {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type,
        purpose,
      }),
    });
    if (!isCloudFile(fileResponse)) {
      throw new Error("The server returned invalid uploaded-file metadata.");
    }

    return fileResponse;
  } catch (error) {
    try {
      await apiRequest<void>(`/api/files/${signed.id}`, { method: "DELETE" });
    } catch (cleanupError) {
      console.error("Could not clean up an incomplete file upload:", cleanupError);
    }
    throw error;
  }
}

export async function openStudentFile(fileId: string) {
  const opened = window.open("about:blank", "_blank");
  if (!opened) throw new Error("Allow pop-ups to open this private file.");
  opened.opener = null;
  try {
    const download = await apiRequest<{ url: string }>(`/api/files/${fileId}/download-url`);
    opened.location.href = download.url;
  } catch (error) {
    opened.close();
    throw error;
  }
}
