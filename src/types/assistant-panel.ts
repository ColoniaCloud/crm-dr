/** Tipos del panel derecho de la página del asistente (ticker y agenda). */

export type FeedCategory = "sales" | "leads" | "warranty" | "stock";

export interface FeedEvent {
  id: string;
  category: FeedCategory;
  /** Matiz del evento: algo que salió bien, o algo que pide atención. */
  tone?: "success" | "warning";
  title: string;
  detail: string;
  at: string;
  link: string | null;
  /** Pregunta que se le manda al asistente al hacer clic en el evento. */
  ask: string;
}

export type AgendaKind = "call" | "visit" | "task" | "quote" | "purchase" | "installment";

export interface AgendaItem {
  id: string;
  kind: AgendaKind;
  title: string;
  detail?: string;
  at: string;
  /** Sin hora (vencimientos): se dibuja arriba del día, no en la grilla horaria. */
  allDay: boolean;
  done: boolean;
  link: string | null;
  /** Nombre de la persona responsable cuando no es quien mira (vista de equipo). */
  owner?: string | null;
}
