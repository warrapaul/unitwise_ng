import { HttpResponse } from '@angular/common/http';

/**
 * Saves a downloaded file under the name the server gave it (Content-Disposition), so a receipt is
 * "Acacia-Court-1-2-2026-11-receipt.pdf" rather than a name the page made up. The fallback is used
 * only when the server sent none.
 */
export function saveDownload(response: HttpResponse<Blob>, fallback: string): void {
  const header = response.headers.get('Content-Disposition') ?? '';
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(header);
  const name = match ? decodeURIComponent(match[1] ?? match[2]) : fallback;
  const url = URL.createObjectURL(response.body ?? new Blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
