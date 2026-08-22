export const C = {
  surface: "#F8FAFC",
  onSurface: "#0F172A",
  card: "#FFFFFF",
  surfaceTertiary: "#F1F5F9",
  onSurfaceSecondary: "#1E293B",
  muted: "#64748B",
  mutedLight: "#94A3B8",
  brand: "#0B2447",
  brandSecondary: "#19376D",
  brandTertiary: "#E0E7FF",
  onBrand: "#FFFFFF",
  success: "#059669",
  successBg: "#D1FAE5",
  warning: "#D97706",
  warningBg: "#FEF3C7",
  error: "#DC2626",
  errorBg: "#FEE2E2",
  info: "#2563EB",
  infoBg: "#DBEAFE",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  divider: "#F1F5F9",
};

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const R = { sm: 6, md: 12, lg: 20, pill: 999 };

export const STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  pending: { fg: C.warning, bg: C.warningBg },
  requested: { fg: C.warning, bg: C.warningBg },
  submitted: { fg: C.warning, bg: C.warningBg },
  scheduled: { fg: C.info, bg: C.infoBg },
  acknowledged: { fg: C.info, bg: C.infoBg },
  "in-progress": { fg: C.info, bg: C.infoBg },
  open: { fg: C.info, bg: C.infoBg },
  completed: { fg: C.success, bg: C.successBg },
  resolved: { fg: C.success, bg: C.successBg },
  approved: { fg: C.success, bg: C.successBg },
  present: { fg: C.success, bg: C.successBg },
  active: { fg: C.success, bg: C.successBg },
  cancelled: { fg: C.error, bg: C.errorBg },
  rejected: { fg: C.error, bg: C.errorBg },
  absent: { fg: C.error, bg: C.errorBg },
  escalated: { fg: C.error, bg: C.errorBg },
  "on-leave": { fg: C.warning, bg: C.warningBg },
  closed: { fg: C.muted, bg: C.surfaceTertiary },
};

export const URGENCY_COLORS: Record<string, { fg: string; bg: string }> = {
  low: { fg: C.muted, bg: C.surfaceTertiary },
  medium: { fg: C.warning, bg: C.warningBg },
  high: { fg: C.error, bg: C.errorBg },
};

export const CATEGORY_ICONS: Record<string, string> = {
  electrical: "flash-outline",
  plumbing: "water-outline",
  carpentry: "hammer-outline",
  "wifi-network": "wifi-outline",
  furniture: "bed-outline",
  "pest-control": "bug-outline",
  other: "build-outline",
};

export function fmtDate(isoStr?: string | null): string {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) +
    ", " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function fmtDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
