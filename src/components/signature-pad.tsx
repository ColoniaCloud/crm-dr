"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Un recuadro para firmar con el dedo, el lápiz o el mouse. Sin dependencias.
 *
 * El canvas se dibuja a 1000×400 (proporción 5:2, la misma caja que ocupa la
 * firma en el PDF) y se escala por CSS al ancho disponible: así el PNG sale
 * igual en un celular que en un monitor. `touch-action: none` para que firmar
 * en el celular no haga scroll de la página.
 *
 * Avisa con `onChange(dataUrl)` al terminar cada trazo, y `onChange(null)` al
 * borrar. Un toque suelto no cuenta como firma: hace falta recorrer al menos
 * MIN_LENGTH (en unidades del canvas). Por distancia y no por cantidad de
 * eventos: un trazo rápido en un celular lento manda pocos eventos largos.
 */

const W = 1000;
const H = 400;
const MIN_LENGTH = 120;

export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const length = useRef(0);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0A0A0A";
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    length.current += Math.hypot(p.x - last.current.x, p.y - last.current.y);
    last.current = p;
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (length.current >= MIN_LENGTH && canvasRef.current) {
      setEmpty(false);
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  }

  function clear() {
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, W, H);
    length.current = 0;
    setEmpty(true);
    onChange(null);
  }

  return (
    <div>
      <div className="relative rounded-md border border-dashed border-[#B8B8B5] bg-[#FCFCFB]">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block w-full aspect-[5/2] cursor-crosshair touch-none select-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
          aria-label="Recuadro para firmar"
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-[#9A9A97]">
            Firmá acá
          </span>
        )}
        <div className="pointer-events-none absolute bottom-[22%] left-[6%] right-[6%] h-px bg-[#D6D6D3]" />
      </div>
      <div className="flex justify-end pt-1.5">
        <button type="button" onClick={clear} className="text-[12px] text-[#5C5C5C] underline disabled:opacity-40" disabled={empty}>
          Borrar y volver a firmar
        </button>
      </div>
    </div>
  );
}
