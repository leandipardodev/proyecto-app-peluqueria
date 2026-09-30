import { describe, it, expect } from "vitest";
import { withImageVersion, productImageStoragePath } from "@/lib/dashboard/store/image-upload";

describe("withImageVersion", () => {
  it("agrega un parametro de version a una URL sin query", () => {
    expect(withImageVersion("https://cdn.example.com/a.png", 123)).toBe("https://cdn.example.com/a.png?v=123");
  });

  it("reutiliza & cuando la URL ya tiene query", () => {
    expect(withImageVersion("https://cdn.example.com/a.png?width=80", 123)).toBe(
      "https://cdn.example.com/a.png?width=80&v=123",
    );
  });

  it("devuelve una URL distinta en cada llamada (misma ruta de storage)", () => {
    const path = productImageStoragePath("shop-1", "prod-1");
    const first = withImageVersion(`https://cdn.example.com/${path}`, 1);
    const second = withImageVersion(`https://cdn.example.com/${path}`, 2);
    expect(first).not.toBe(second);
  });

  it("no rompe con url vacia", () => {
    expect(withImageVersion("")).toBe("");
  });
});
