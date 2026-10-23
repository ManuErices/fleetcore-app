/**
 * transicion.jsx — Paso animado entre dos versiones (original ⇄ propuesta).
 * Lo usan la pantalla Propuestas y el modo propuesta del flujo de caja.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Boton } from "./cuaderno";

export const lerp = (a, b, t) => a + (b - a) * t;

// ─── Transición Original ⇄ Propuesta ──────────────────────────────────────────
// t = 0 es el original, t = 1 la propuesta. Los botones animan t con una curva
// suave; el deslizador lo fija a mano. Con "reducir movimiento" salta directo.
export function useTransicion(inicial = 0) {
  const [t, setT] = useState(inicial);
  const anim = useRef(null);
  const tRef = useRef(inicial);
  tRef.current = t;

  const cancelar = () => { if (anim.current) cancelAnimationFrame(anim.current); anim.current = null; };

  const irA = useCallback((destino, duracion = 1100) => {
    cancelar();
    const reducir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const desde = tRef.current;
    if (reducir || desde === destino) { setT(destino); return; }
    const inicio = performance.now();
    const paso = (ahora) => {
      const x = Math.min(1, (ahora - inicio) / (duracion * Math.abs(destino - desde)));
      const suave = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      setT(lerp(desde, destino, suave));
      if (x < 1) anim.current = requestAnimationFrame(paso);
    };
    anim.current = requestAnimationFrame(paso);
  }, []);

  const fijar = useCallback((valor) => { cancelar(); setT(valor); }, []);
  useEffect(() => cancelar, []);
  return { t, irA, fijar };
}

export function ControlTransicion({ t, irA, fijar, etiquetas = ["Original", "Propuesta"], pistas = ["lo que hay", "lo que se propone"] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Boton variante={t < 0.5 ? "primario" : "secundario"} onClick={() => irA(0)}>{etiquetas[0]}</Boton>
      <label className="flex-1 min-w-[10rem] flex flex-col gap-1">
        <span className="sr-only">Mezcla entre original y propuesta</span>
        <input type="range" min="0" max="1000" value={Math.round(t * 1000)} onChange={e => fijar(Number(e.target.value) / 1000)}
          className="deslizador-cuaderno w-full" aria-valuetext={`${Math.round(t * 100)}% propuesta`} />
        <span className="flex justify-between text-[13px] text-cuaderno-grafito"><span>{pistas[0]}</span><span>{pistas[1]}</span></span>
      </label>
      <Boton variante={t >= 0.5 ? "primario" : "secundario"} onClick={() => irA(1)}>{etiquetas[1]}</Boton>
    </div>
  );
}
