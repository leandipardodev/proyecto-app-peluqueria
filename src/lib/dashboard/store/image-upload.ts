const MAX_DIMENSION = 800;
const MAX_OUTPUT_BYTES = 150 * 1024;
const MAX_INPUT_BYTES = 2 * 1024 * 1024;

export type ProcessedImage = {
  buffer: Buffer;
  contentType: string;
};

export type ProcessImageResult = { ok: true; data: ProcessedImage } | { ok: false; error: string };

export async function processProductImage(file: File): Promise<ProcessImageResult> {
  if (!file || file.size === 0) return { ok: false, error: "Selecciona una imagen" };
  if (file.size > MAX_INPUT_BYTES) return { ok: false, error: "La imagen supera 2MB" };
  if (!file.type.startsWith("image/")) return { ok: false, error: "Archivo de imagen invalido" };

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const sharp = (await import("sharp")).default;
    let output = await sharp(buffer)
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    if (output.length > MAX_OUTPUT_BYTES) {
      output = await sharp(buffer)
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 70 })
        .toBuffer();
    }

    if (output.length > MAX_OUTPUT_BYTES) {
      return { ok: false, error: "La imagen comprimida sigue superando el limite de 150KB" };
    }

    return { ok: true, data: { buffer: output, contentType: "image/webp" } };
  } catch {
    // Sharp no disponible en este runtime (binarios de otra plataforma, etc.):
    // subimos la imagen original sin procesar para no romper la carga.
    return { ok: true, data: { buffer, contentType: file.type || "application/octet-stream" } };
  }
}

export function productImageStoragePath(shopId: string, productId: string) {
  return `shops/${shopId}/stock/${productId}.webp`;
}
