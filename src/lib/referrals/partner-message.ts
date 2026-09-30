/**
 * Mensaje de bienvenida para un vendedor.
 *
 * Va aparte de la UI y sin "use client" a proposito: el texto que Klip le
 * manda a un partner es parte del contrato con esa persona (el PIN vive ahi y
 * no se vuelve a mostrar), asi que tiene que ser testeable y tener una sola
 * fuente de verdad. Si se arma dentro del componente, el unico modo de
 * comprobar que no le falta el codigo es leerlo a ojo.
 */

export type PartnerWelcomeMessageInput = {
  name: string;
  referralCode: string;
  pin: string;
  /** Origen publico de Klip, sin barra final. */
  baseUrl: string;
  commissionPercent: number;
  commissionMonths: number;
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "";
}

/** Agrupa el PIN de a uno para que no se lea mal de un vistazo. */
export function formatPin(pin: string): string {
  return pin.replace(/\D/g, "").split("").join(" ");
}

export function buildPartnerReferralLink(baseUrl: string, referralCode: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/r/${referralCode}`;
}

export function buildPartnerPortalLink(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/vendedores`;
}

/**
 * Texto listo para pegar en WhatsApp. Neutro en genero a proposito: el mismo
 * texto sirve para vendedoras y vendedores, y las variables de hoy ya mezclan
 * los dos (referidas, partner, vendedor) asi que no conviene forzar uno.
 */
export function buildPartnerWelcomeMessage(input: PartnerWelcomeMessageInput): string {
  const greeting = firstName(input.name);
  const link = buildPartnerReferralLink(input.baseUrl, input.referralCode);
  const portal = buildPartnerPortalLink(input.baseUrl);
  const plural = input.commissionMonths === 1 ? "mes" : "meses";

  return [
    `Hola ${greeting}, ya tenés tu acceso de Klip.`,
    "",
    `Tu link:   ${link}`,
    `Tu código: ${input.referralCode}`,
    `Tu PIN:    ${formatPin(input.pin)}`,
    "",
    `Para ver tus comisiones entrá a ${portal} con ese código y ese PIN.`,
    "",
    `Compartí el link con las peluquerías y barberías que conozcas. Cada local que se registre por tu link te corresponde el ${input.commissionPercent}% de lo que Klip recibe, durante los primeros ${input.commissionMonths} ${plural}.`,
  ].join("\n");
}

/** Abre WhatsApp con el mensaje ya escrito. No necesita API ni sesion. */
export function buildWhatsAppShareLink(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
