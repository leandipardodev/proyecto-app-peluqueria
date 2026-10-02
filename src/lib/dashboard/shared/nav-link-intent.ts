/**
 * Cuando se decide cerrar el menu lateral del dashboard.
 *
 * El menu se cierra en `onClick`, nunca en `onMouseDown`. Motivo: el navegador
 * solo despacha `click` cuando mousedown y mouseup caen sobre el mismo elemento
 * (si no, lo despacha sobre el ancestro comun). Cerrar en mousedown hacia que
 * `AnimatePresence` empezara a deslizar el panel (x: 0 -> -340, 260ms) antes de
 * que llegara el mouseup de un click normal de 60-150ms: el `click` se perdia
 * sobre un ancestro, `Link.onClick` de Next no corria y la navegacion se
 * perdia con el menu ya cerrado. Un `requestAnimationFrame` entre medio no lo
 * arregla, solo lo esconde para los taps de menos de un frame.
 *
 * Estos helpers son puros a proposito: el repo corre los tests en `environment:
 * "node"` y sin testing-library, asi que la decision queda testeada aca y el
 * componente la consume.
 */

type NavClickLike = {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  button?: number;
  currentTarget?: { getAttribute?: (name: string) => string | null } | null;
};

/**
 * Espejo de `isModifiedEvent` de Next 16
 * (`next/dist/client/link.js`): con cualquiera de estos modificadores el
 * `Link` no navega, deja que el navegador abra una pestana nueva o descargue el
 * recurso. El menu tampoco deberia cerrarse en ese caso, porque la pagina de
 * destino se abre aparte y el usuario sigue en la de siempre.
 */
export function isModifiedNavClick(event: NavClickLike): boolean {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return true;
  if (event.button === 1) return true;

  const target = event.currentTarget?.getAttribute?.("target");
  return Boolean(target && target !== "_self");
}

/**
 * El menu se cierra en cuanto el click llega al link, que es el mismo evento en
 * el que Next pide la ruta: cerrar aca no puede tragarse la navegacion.
 */
export function shouldCloseNavDrawer(event: NavClickLike): boolean {
  return !isModifiedNavClick(event);
}