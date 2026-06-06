"use client";

import { useState, useEffect, useRef } from "react";

const TAGS = [
  "#conecta",
  "#presencia",
  "#tuMarca",
  "#identidad",
  "#comunidad",
  "#visibilidad",
  "#difusion",
  "#conexion",
  "#vinculo",
  "#marcaViva",
  "#huellaDigital",
  "#vozDeMarca",
  "#alcance",
  "#contactoDirecto",
  "#canalesDigitales",
  "#creaContenido",
  "#contenidoQueInspira",
  "#tipsDeBelleza",
  "#transformacionCapilar",
  "#antesYDespues",
  "#lookDelDia",
  "#tendencias",
  "#colorimetria",
  "#peinadosProfesionales",
  "#cabelloSaludable",
  "#clientaFeliz",
  "#detallesQueImportan",
  "#rutinaCapilar",
  "#estiloProfesional",
  "#momentoPeluqueria",
  "#resultadosReales",
  "#contenidoAutentico",
  "#inspoCapilar",
  "#empoderamientoFemenino",
  "#amorPropio",
  "#brillaConConfianza",
  "#reinventate",
  "#nuevoLook",
  "#cambioDeLook",
  "#atreveteACambiar",
  "#colorDeModa",
  "#cabelloDelMomento",
  "#peinadoPerfecto",
  "#rizosDefinidos",
  "#ondasNaturales",
  "#alisadoProfesional",
  "#tratamientoCapilar",
  "#cuidadocapilar",
  "#consentite",
  "#experienciaUnica",
  "#talentoLocal",
  "#artesaniaCapilar",
  "#pasionPorLoQueHago",
  "#detrasDelCambio",
  "#elPoderDeUnLook",
  "#tuMejorVersion",
  "#brilloNatural",
  "#colorQueHabla",
  "#equipoCreativo",
  "#tijerasMagicas",
  "#hechoConAmor",
  "#dedicacionYArte",
  "#mujeresReales",
  "#confianza",
  "#actitudPositiva",
  "#energiaPositiva",
  "#genuino",
  "#autentico",
];

export default function SocialTagCycler() {
  const [text, setText] = useState("");
  const idxRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    const showInitial = TAGS[0].slice(1);
    setText(showInitial);

    const schedule = () => {
      if (!mounted) return;

      const currentText = TAGS[idxRef.current].slice(1);

      let deletePos = currentText.length;
      const deleteTimer = setInterval(() => {
        if (!mounted) { clearInterval(deleteTimer); return; }
        deletePos--;
        if (deletePos >= 0) {
          setText(currentText.slice(0, deletePos));
        } else {
          clearInterval(deleteTimer);

          const nextIdx = (idxRef.current + 1) % TAGS.length;
          idxRef.current = nextIdx;
          const nextWord = TAGS[nextIdx].slice(1);
          let typePos = 0;
          const typeTimer = setInterval(() => {
            if (!mounted) { clearInterval(typeTimer); return; }
            typePos++;
            if (typePos <= nextWord.length) {
              setText(nextWord.slice(0, typePos));
            } else {
              clearInterval(typeTimer);
            }
          }, 30);
        }
      }, 30);
    };

    const initialTimer = setTimeout(schedule, 30000);
    return () => { mounted = false; clearTimeout(initialTimer); };
  }, []);

  return (
    <span
      className="social-tag-hero ml-2 sm:ml-3 min-w-0 max-w-[34vw] sm:max-w-[260px] truncate text-[1rem] sm:text-[2rem] leading-snug pb-0.5 font-medium tracking-[-0.02em] select-none"
      style={{
        backgroundImage:
          "linear-gradient(112deg, rgba(15,23,42,0.9) 0%, rgba(71,85,105,0.82) 32%, rgba(59,130,246,0.74) 62%, rgba(125,211,252,0.8) 78%, rgba(14,165,233,0.68) 100%)",
        backgroundSize: "400% 100%",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        textShadow: "0 10px 28px rgba(15,23,42,0.12)",
      }}
    >
      #{text}
    </span>
  );
}
