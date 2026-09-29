const LIGHT_MUTED = /^text-(zinc|gray|slate)-400$/;
const DARK_TOO_DARK = /^dark:text-(zinc|gray|slate)-(500|600|700)$/;
const BOX_SIZE = /^[wh]-\d+$/;
const TEXT_SIZE = /^text-(xs|sm|base|lg|xl|[2-9]xl|\[[^\]]+\])$/;
const DISABLED = /^(cursor-not-allowed|disabled:|aria-disabled:)/;

/** Junta todo el texto estatico de un subarbol (literales y cuasis de template). */
function collectStrings(node) {
  const out = [];
  const stack = [node];
  while (stack.length > 0) {
    const n = stack.pop();
    if (!n || typeof n.type !== "string") continue;
    if (n.type === "Literal") {
      if (typeof n.value === "string") out.push(n.value);
      continue;
    }
    if (n.type === "TemplateElement") {
      out.push(n.value.raw);
      continue;
    }
    for (const key of Object.keys(n)) {
      if (key === "parent") continue;
      const v = n[key];
      if (Array.isArray(v)) {
        for (const c of v) if (c && typeof c.type === "string") stack.push(c);
      } else if (v && typeof v.type === "string") {
        stack.push(v);
      }
    }
  }
  return out;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Prohibe oscurecer el texto al activar dark mode (text-*-400 -> dark:text-*-500/600/700).",
    },
    schema: [],
    messages: {
      inverted:
        "`{{token}}` es mas oscuro que el `text-*-400` del light, asi que activar dark mode baja el contraste en vez de subirlo. Usar `dark:text-*-400` para texto, o `dark:text-*-500` para separadores decorativos.",
    },
  },
  create(context) {
    function inspect(node) {
      const parts = collectStrings(node);
      if (parts.length === 0) return;
      const raw = parts.join(" ");
      if (!raw.includes("dark:")) return;

      const tokens = [...new Set(raw.split(/\s+/).filter(Boolean))];
      if (!tokens.some((t) => LIGHT_MUTED.test(t))) return;

      const offenders = tokens.filter((t) => DARK_TOO_DARK.test(t));
      if (offenders.length === 0) return;

      // Exento: controles deshabilitados. WCAG no les exige contraste.
      if (tokens.some((t) => DISABLED.test(t))) return;

      // Exento: iconos sin etiqueta de texto. WCAG les pide 3:1, no 4.5:1.
      const hasBoxSize = tokens.some((t) => BOX_SIZE.test(t));
      const hasTextSize = tokens.some((t) => TEXT_SIZE.test(t));
      if (hasBoxSize && !hasTextSize) return;

      for (const token of offenders) {
        context.report({ node, messageId: "inverted", data: { token } });
      }
    }

    return {
      JSXAttribute(node) {
        const name = node.name && node.name.name;
        if (name !== "className" || !node.value) return;
        // Si el valor es un cn(...), lo cubre el visitor de CallExpression.
        if (node.value.type === "CallExpression") return;
        inspect(node.value);
      },
      CallExpression(node) {
        const callee = node.callee;
        const isCn = callee && callee.type === "Identifier" && callee.name === "cn";
        if (!isCn) return;
        for (const arg of node.arguments) inspect(arg);
      },
    };
  },
};

export default { rules: { "inverted-muted-text": rule } };
