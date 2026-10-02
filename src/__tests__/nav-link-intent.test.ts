import { describe, it, expect } from "vitest";
import { isModifiedNavClick, shouldCloseNavDrawer } from "@/lib/dashboard/shared/nav-link-intent";

const target = (attr: string | null) => ({ getAttribute: () => attr });
const plainClick = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, button: 0 };

describe("isModifiedNavClick", () => {
  it("un click normal no esta modificado", () => {
    expect(isModifiedNavClick(plainClick)).toBe(false);
  });

  it("ctrl+click, cmd+click, shift+click y alt+click estan modificados", () => {
    expect(isModifiedNavClick({ ...plainClick, ctrlKey: true })).toBe(true);
    expect(isModifiedNavClick({ ...plainClick, metaKey: true })).toBe(true);
    expect(isModifiedNavClick({ ...plainClick, shiftKey: true })).toBe(true);
    expect(isModifiedNavClick({ ...plainClick, altKey: true })).toBe(true);
  });

  it("el click del boton del medio esta modificado", () => {
    expect(isModifiedNavClick({ ...plainClick, button: 1 })).toBe(true);
  });

  it("un target distinto de _self esta modificado", () => {
    expect(isModifiedNavClick({ ...plainClick, currentTarget: target("_blank") })).toBe(true);
    expect(isModifiedNavClick({ ...plainClick, currentTarget: target("_self") })).toBe(false);
    expect(isModifiedNavClick({ ...plainClick, currentTarget: target(null) })).toBe(false);
  });

  it("no explota sin currentTarget", () => {
    expect(isModifiedNavClick({ ...plainClick, currentTarget: null })).toBe(false);
    expect(isModifiedNavClick({ ...plainClick, currentTarget: undefined })).toBe(false);
  });
});

describe("shouldCloseNavDrawer", () => {
  // El menu lateral se cierra en onClick, nunca en onMouseDown. Cerrarlo en
  // mousedown hacia que AnimatePresence despegara el panel antes del mouseup de
  // un click normal de 60-150ms: el click se perdia sobre un ancestro,
  // Link.onClick de Next no corria y no se navegaba con el menu ya cerrado.
  // Estos tests son el contrato de esa decision.
  it("cierra con click normal, que es el unico evento que puede navegar", () => {
    expect(shouldCloseNavDrawer(plainClick)).toBe(true);
    expect(shouldCloseNavDrawer({ ...plainClick, currentTarget: target(null) })).toBe(true);
  });

  it("no cierra con click modificado: la pagina se abre aparte", () => {
    expect(shouldCloseNavDrawer({ ...plainClick, metaKey: true })).toBe(false);
    expect(shouldCloseNavDrawer({ ...plainClick, ctrlKey: true })).toBe(false);
    expect(shouldCloseNavDrawer({ ...plainClick, button: 1 })).toBe(false);
    expect(shouldCloseNavDrawer({ ...plainClick, currentTarget: target("_blank") })).toBe(false);
  });
});