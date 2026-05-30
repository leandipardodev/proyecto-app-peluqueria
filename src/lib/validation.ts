import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const shopIdSchema = z.string().min(1, "shop_id requerido");

export const emailSchema = z.string().email("Email inválido").max(255);

const argentinePhoneRegex = /^(\+?54\s?)?(\d{2,5}[\s-]?)?\d{6,8}$/;

export const phoneSchema = z.string().regex(argentinePhoneRegex, "Teléfono argentino inválido (ej: +54 11 1234 5678)").optional();

export function formatArgentinePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+54 ${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("9")) {
    return `+54 9 ${digits.slice(1, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 12 && digits.startsWith("54")) {
    const rest = digits.slice(2);
    if (rest.startsWith("9")) {
      return `+54 9 ${rest.slice(1, 3)} ${rest.slice(3, 7)} ${rest.slice(7)}`;
    }
    return `+54 ${rest.slice(0, 2)} ${rest.slice(2, 6)} ${rest.slice(6)}`;
  }
  if (digits.length === 13 && digits.startsWith("549")) {
    return `+54 9 ${digits.slice(3, 5)} ${digits.slice(5, 9)} ${digits.slice(9)}`;
  }
  return raw;
}

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
