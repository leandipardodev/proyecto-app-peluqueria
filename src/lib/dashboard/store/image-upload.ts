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
    // subimos la imagen original sin procesar para no romper la carga,
    // PERO rechazamos dimensiones absurdas que tumbarian /book.
    if (isTooLargeWithoutProcessing(buffer)) {
      return { ok: false, error: "La imagen es demasiado grande. Reducila a menos de 6000px por lado e intenta de nuevo." };
    }
    return { ok: true, data: { buffer, contentType: file.type || "application/octet-stream" } };
  }
}

export function productImageStoragePath(shopId: string, productId: string) {
  return `shops/${shopId}/stock/${productId}.webp`;
}

// Dimensiones sin decodificar la imagen (headers PNG/JPEG/WebP).
// Devuelve null si el formato es desconocido.
export function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  try {
    // PNG
    if (
      buffer.length > 24 &&
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    ) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    // JPEG
    if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      let off = 2;
      while (off + 9 < buffer.length) {
        if (buffer[off] !== 0xff) { off++; continue; }
        const marker = buffer[off + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buffer.readUInt16BE(off + 5), width: buffer.readUInt16BE(off + 7) };
        }
        off += 2 + buffer.readUInt16BE(off + 2);
      }
      return null;
    }
    // WebP
    if (buffer.length > 30 && buffer.toString("ascii", 8, 12) === "WEBP") {
      const chunk = buffer.toString("ascii", 12, 16);
      if (chunk === "VP8X") {
        return {
          width: 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)),
          height: 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)),
        };
      }
      if (chunk === "VP8 " && buffer.length > 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
        return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Cuando sharp no esta disponible no podemos redimensionar: rechazamos
// imagenes gigantes que tardarian eternidades en cargar en /book.
export const MAX_UNPROCESSED_DIMENSION = 6000;

export function isTooLargeWithoutProcessing(buffer: Buffer): boolean {
  const dims = getImageDimensions(buffer);
  if (!dims) return false; // formato desconocido: dejar pasar
  return dims.width > MAX_UNPROCESSED_DIMENSION || dims.height > MAX_UNPROCESSED_DIMENSION;
}
