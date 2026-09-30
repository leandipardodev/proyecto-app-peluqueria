const LIGHT_MUTED = /^text-(zinc|gray|slate)-400$/;
const DARK_TOO_DARK = /^dark:text-(zinc|gray|slate)-(500|600|700)$/;
const BOX_SIZE = /^[wh]-\d+$/;
const TEXT_SIZE = /^text-(xs|sm|base|lg|xl|[2-9]xl|\[[^\]]+\])$/;
const DISABLED = /^(cursor-not-allowed|disabled:|aria-disabled:)/;

/*
 * ---------------------------------------------------------------------------
 * Falta la variante dark:
 * ---------------------------------------------------------------------------
 * La regla de arriba solo ve el error opuesto: usage de dark: que oscurece. No
 * detecta el fallo mas comun, que es usar un color del light sin su dark: y que
 * por lo tanto se ve igual en los dos modos. Ese fallo se escapo de lint
 * durante meses justamente porque la mayoria de los strings ni siquiera
 * mencionan "dark:".
 */

/**
 * Tokens que solo existen para el modo claro y por lo tanto necesitan contraparte
 * en dark. Se listan por propiedad (bg/text/border/...) con los shades que en
 * este repo nunca son intencionalmente invariantes al modo.
 *
 * OJO: text-*-400 queda fuera a proposito. En este repo se usa como muted en los
 * dos modos (ver CONTEXT-DESIGN.md y los ~40 "text-zinc-400 dark:text-zinc-400"),
 * asi que exigirle dark: seria ruido.
 */
const NEEDS_DARK = {
  bg: [
    [/^bg-white$/, "dark:bg-zinc-900"],
    [/^bg-(zinc|gray|slate)-50$/, "dark:bg-zinc-800/50"],
    [/^bg-(zinc|gray|slate)-100$/, "dark:bg-zinc-800"],
    [/^bg-(zinc|gray|slate)-200$/, "dark:bg-zinc-700"],
  ],
  text: [
    [/^text-(gray|zinc)-900$/, "dark:text-zinc-100"],
    [/^text-(gray|zinc)-800$/, "dark:text-zinc-200"],
    [/^text-(gray|zinc)-700$/, "dark:text-zinc-300"],
    [/^text-(gray|zinc|slate)-600$/, "dark:text-zinc-300"],
    [/^text-(gray|zinc|slate)-500$/, "dark:text-zinc-400"],
    [/^text-slate-900$/, "dark:text-zinc-100"],
    [/^text-black$/, "dark:text-white"],
  ],
  border: [
    [/^border-(gray|zinc)-300$/, "dark:border-zinc-700"],
    [/^border-(gray|zinc|slate)-200$/, "dark:border-zinc-800"],
    [/^border-black\/10$/, "dark:border-white/10"],
  ],
};

/** hover:bg-50 -> hover:bg, para agrupar por la propiedad real. */
const STATE_PREFIX = /^(?:hover|focus|focus-visible|active|disabled|group-hover):/;

function propOf(token) {
  const bare = token.replace(STATE_PREFIX, "");
  const m = bare.match(/^(bg|text|border)-/);
  return m ? m[1] : null;
}

const missingDarkVariant = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Avisa cuando un color del modo claro se usa sin su contraparte en dark mode.",
    },
    schema: [],
    messages: {
      missing:
        "`{{token}}` es un color del modo claro y no tiene variante `dark:`, asi que en dark mode se ve igual que en light (o al reves). Agregar `{{suggestion}}`.",
    },
  },
  create(context) {
    function inspect(node) {
      const parts = collectStrings(node);
      if (parts.length === 0) return;

      const raw = parts.join(" ");
      const tokens = [...new Set(raw.split(/\s+/).filter(Boolean))];

      // Si el elemento ya tiene cualquier dark:, el autor esta escribiendo el
      // par a proposito y no le vamos a exigir uno para cada token.
      if (tokens.some((t) => t.startsWith("dark:"))) return;

      // Exento: controles deshabilitados (WCAG no les exige contraste).
      if (tokens.some((t) => DISABLED.test(t))) return;

      // Exento: iconos sin etiqueta. WCAG les pide 3:1, no 4.5:1.
      const hasBoxSize = tokens.some((t) => BOX_SIZE.test(t));
      const hasTextSize = tokens.some((t) => TEXT_SIZE.test(t));
      if (hasBoxSize && !hasTextSize) return;

      for (const token of tokens) {
        const prop = propOf(token);
        if (!prop) continue;
        for (const [pattern, suggestion] of NEEDS_DARK[prop]) {
          if (pattern.test(token)) {
            context.report({ node, messageId: "missing", data: { token, suggestion } });
            break;
          }
        }
      }
    }

    return {
      JSXAttribute(node) {
        const name = node.name && node.name.name;
        if (name !== "className" || !node.value) return;
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

export default {
  rules: {
    "inverted-muted-text": rule,
    "missing-dark-variant": missingDarkVariant,
  },
};
