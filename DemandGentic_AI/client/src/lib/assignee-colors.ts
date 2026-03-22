export interface AssigneeColorTheme {
  cardClass: string;
  badgeClass: string;
  accentClass: string;
}

const DEFAULT_THEME: AssigneeColorTheme = {
  cardClass: "border-l-slate-300 bg-slate-50/40",
  badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
  accentClass: "text-slate-600",
};

const ASSIGNEE_THEMES: AssigneeColorTheme[] = [
  {
    cardClass: "border-l-blue-400 bg-blue-50/40",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-300",
    accentClass: "text-blue-700",
  },
  {
    cardClass: "border-l-emerald-400 bg-emerald-50/40",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
    accentClass: "text-emerald-700",
  },
  {
    cardClass: "border-l-amber-400 bg-amber-50/40",
    badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
    accentClass: "text-amber-700",
  },
  {
    cardClass: "border-l-rose-400 bg-rose-50/40",
    badgeClass: "bg-rose-100 text-rose-800 border-rose-300",
    accentClass: "text-rose-700",
  },
  {
    cardClass: "border-l-cyan-400 bg-cyan-50/40",
    badgeClass: "bg-cyan-100 text-cyan-800 border-cyan-300",
    accentClass: "text-cyan-700",
  },
  {
    cardClass: "border-l-violet-400 bg-violet-50/40",
    badgeClass: "bg-violet-100 text-violet-800 border-violet-300",
    accentClass: "text-violet-700",
  },
];

function hashAssigneeName(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getAssigneeColorTheme(assigneeName?: string | null): AssigneeColorTheme {
  const normalized = assigneeName?.trim();
  if (!normalized) {
    return DEFAULT_THEME;
  }

  const normalizedLower = normalized.toLowerCase();

  if (normalizedLower === "zahid") {
    return {
      cardClass: "border-l-green-500 bg-green-50/50",
      badgeClass: "bg-green-100 text-green-800 border-green-300",
      accentClass: "text-green-700",
    };
  }

  if (normalizedLower.includes("tabasum")) {
    return {
      cardClass: "border-l-pink-300 bg-pink-50/60",
      badgeClass: "bg-pink-50 text-pink-600 border-pink-200",
      accentClass: "text-pink-500",
    };
  }

  const paletteIndex = hashAssigneeName(normalizedLower) % ASSIGNEE_THEMES.length;
  return ASSIGNEE_THEMES[paletteIndex];
}