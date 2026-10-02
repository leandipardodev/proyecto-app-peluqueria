"use client";

const READY_EVENT = "klip-app-ready";

let ready = false;

/**
 * Marca que la primera pantalla de la app termino de cargar sus datos.
 *
 * La usa el splash del arranque (`components/brand/klip-splash.tsx`) para
 * saber cuando puede dejar de tapar la pantalla. El evento es la unica forma de
 * que un componente del root layout se entere de algo que pasa adentro del
 * dashboard, que es un arbol aparte.
 *
 * Idempotente a proposito: lo puede llamar cualquiera y en cualquier orden.
 */
export function markAppReady(): void {
  if (ready) return;
  ready = true;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(READY_EVENT));
}

/** Si ya se disparo antes de que el splash llegara a suscribirse. */
export function isAppReady(): boolean {
  return ready;
}

export function getAppReadyEventName(): string {
  return READY_EVENT;
}