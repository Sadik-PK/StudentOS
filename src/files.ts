import { apiRequest } from "./api";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";
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
  purpose: "note" | "assignment" | "profile" | "study-document";
}

interface SignedUpload {
  id: string;
  uploadUrl: string;
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
      file.purpose === "profile" ||
      file.purpose === "study-document")
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

  const signed = await apiRequest<SignedUpload>("/api/files/upload-url", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      purpose,
    }),
  });

  try {
    const upload = await fetch(`${API_BASE_URL}${signed.uploadUrl}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": file.type },
      body: file,
    });
    const result: unknown = await upload.json().catch(() => null);
    if (!upload.ok) {
      const message =
        typeof result === "object" &&
        result !== null &&
        "error" in result &&
        typeof result.error === "string"
          ? result.error
          : `File upload failed with status ${upload.status}.`;
      throw new Error(message);
    }
    if (!isCloudFile(result)) {
      throw new Error("The server returned invalid uploaded-file metadata.");
    }
    return result;
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
