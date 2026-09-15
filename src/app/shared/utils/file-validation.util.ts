/**
 * Mirrors the backend's `FileUploadContext.validate()` for immediate feedback.
 * The server remains the authority — this is UX only.
 */
export function validateFile(file: File, options: { maxSizeMB: number; allowedTypes: readonly string[] }): string | null {
  if (file.size > options.maxSizeMB * 1024 * 1024) {
    return `File exceeds the ${options.maxSizeMB}MB limit`;
  }

  if (!options.allowedTypes.includes(file.type)) {
    return `File type "${file.type || 'unknown'}" is not allowed`;
  }

  return null;
}
