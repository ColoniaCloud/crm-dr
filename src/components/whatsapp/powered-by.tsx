import { Meta } from "@/components/icons";

/** El isotipo de Colonia Cloud: dos medios círculos (de colonia.cloud/icon.svg). */
export function ColoniaCloudIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="60 70 370 355"
      fill="currentColor"
      className={className}
      role="img"
      aria-label="Colonia Cloud"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M238.455 417.179C193.513 417.179 150.411 399.311 118.632 367.507C86.8532 335.703 69 292.567 69 247.589C69 202.611 86.8532 159.476 118.632 127.672C150.411 95.8674 193.513 78 238.455 78L238.455 417.179Z" />
      <path d="M421 417.179C376.058 417.179 332.956 399.311 301.177 367.507C269.398 335.703 251.545 292.567 251.545 247.589C251.545 202.611 269.398 159.476 301.177 127.672C332.956 95.8674 376.058 78 421 78V417.179Z" />
    </svg>
  );
}

/** "Con la tecnología de [Meta] y [Colonia Cloud]", para la cabecera de la pantalla de WhatsApp. */
export function PoweredBy({ className }: { className?: string }) {
  return (
    <p className={`flex items-center gap-2 text-xs text-muted-foreground ${className ?? ""}`}>
      <span>Con la tecnología de</span>
      <Meta className="size-6 text-[#0866FF]" aria-label="Meta" />
      <span>y</span>
      <ColoniaCloudIcon className="size-5 text-foreground" />
    </p>
  );
}
