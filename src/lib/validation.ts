import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const shopIdSchema = z.string().min(1, "shop_id requerido");

export const emailSchema = z.string().email("Email inválido").max(255);

export const phoneSchema = z.string().regex(/^[\d\s\-+()]{7,20}$/, "Teléfono inválido").optional();

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe ser YYYY-MM-DD");

export const timeStringSchema = z.string().regex(/^\d{2}:\d{2}$/, "Hora debe ser HH:MM");

export const positiveNumberSchema = z.coerce.number().min(0, "Debe ser un número positivo");

export const staffRoleSchema = z.enum(["owner", "admin", "staff", "viewer"]);

export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Validación fallida: ${messages}`);
  }
  return result.data;
}

export function validateOrReturn<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { success: false, error: messages };
  }
  return { success: true, data: result.data };
}
