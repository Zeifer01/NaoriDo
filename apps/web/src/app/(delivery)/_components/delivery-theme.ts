/** Paleta orgânica do cardápio delivery */
export const deliveryTheme = {
  bg: "#FAF7F2",
  bgSand: "#F0EBE3",
  bgMoss: "#EDF3E8",
  moss: "#7A9B7E",
  mossDark: "#5C7A5F",
  text: "#3A3F38",
  textDark: "#2F342E",
  textMuted: "#6B7268",
  border: "#EDE8DF",
} as const;

export const deliveryClasses = {
  page: "min-h-[100dvh] bg-[#FAF7F2] text-[#3A3F38]",
  card: "rounded-2xl border border-[#EDE8DF] bg-white/80 shadow-[0_2px_16px_-4px_rgba(58,63,56,0.08)]",
  cardInner: "rounded-xl border border-[#EDE8DF] bg-white/90 p-4",
  input:
    "h-11 w-full rounded-xl border border-[#EDE8DF] bg-white px-3 text-[#3A3F38] placeholder:text-[#9A9F96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A9B7E]/40",
  btnPrimary:
    "inline-flex items-center justify-center rounded-2xl bg-[#7A9B7E] font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60",
  btnSecondary:
    "inline-flex items-center justify-center rounded-full border border-[#EDE8DF] bg-white/80 text-[#5C7A5F] transition active:scale-95",
  btnGhost: "inline-flex items-center gap-1.5 text-sm text-[#5C7A5F] transition active:opacity-70",
  label: "text-sm font-medium text-[#3A3F38]",
  muted: "text-sm text-[#6B7268]",
  error: "text-sm text-[#B85C5C]",
} as const;
