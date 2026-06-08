/** Sector badge colors — automotive and architectural verticals */
export const SECTOR_COLORS: Record<string, string> = {
  AUTO_TALLER:               "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  AUTO_CONCESIONARIO:        "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  AUTO_MAYORISTA:            "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  ARQUITECTURA_CONSTRUCTORA: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  ARQUITECTURA_VIDRIERIA:    "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  ARQUITECTURA_MAYORISTA:    "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300",
};

/** Quote status badge colors */
export const QUOTE_STATUS_COLORS: Record<string, string> = {
  DRAFT:     "bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300",
  SENT:      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  ACCEPTED:  "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  REJECTED:  "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  CONVERTED: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

/** Timeline dot colors for lead activity events */
export const LEAD_ACTIVITY_COLORS: Record<string, string> = {
  NOTE:          "bg-blue-500",
  EMAIL_SENT:    "bg-green-500",
  QUOTE_SENT:    "bg-purple-500",
  VISIT:         "bg-amber-500",
  CALL:          "bg-cyan-500",
  STATUS_CHANGE: "bg-rose-500",
  OTHER:         "bg-gray-500",
};

/** Calendar event dot colors, cycling per assigned user */
export const CALENDAR_USER_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-red-500",
];

/** Operator audit log action badge colors */
export const OPERATOR_ACTION_COLORS: Record<string, string> = {
  LEAD_CREATED:     "bg-emerald-100 text-emerald-700",
  INSTALLER_CREATED: "bg-emerald-100 text-emerald-700",
  CLIENT_CREATED:   "bg-blue-100 text-blue-700",
  LEAD_CONVERTED:   "bg-violet-100 text-violet-700",
  SALE_CREATED:     "bg-orange-100 text-orange-700",
  QUOTE_CREATED:    "bg-yellow-100 text-yellow-700",
  VISIT_SCHEDULED:  "bg-cyan-100 text-cyan-700",
  CALL_SCHEDULED:   "bg-teal-100 text-teal-700",
  CONTACT_ACTIVITY: "bg-zinc-100 text-zinc-700",
};

/** Interest level badge colors for activity logs */
export const INTEREST_COLORS: Record<string, string> = {
  BAJO:  "bg-zinc-100 text-zinc-700",
  MEDIO: "bg-amber-100 text-amber-700",
  ALTO:  "bg-emerald-100 text-emerald-700",
};

/** Activities counter card icon styles [bg, text] */
export const ACTIVITY_COUNTER_STYLES = {
  leads:    { bg: "bg-emerald-100", text: "text-emerald-700" },
  contacted: { bg: "bg-blue-100",   text: "text-blue-700" },
  records:  { bg: "bg-violet-100",  text: "text-violet-700" },
};
