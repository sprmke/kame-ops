export const ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  dashboard: {
    root: "/dashboard",
    overview: "/dashboard",
    creditCards: "/dashboard/credit-cards",
    creditCardDetail: (id: string) => `/dashboard/credit-cards/${id}` as const,
    soa: "/dashboard/soa",
    reminders: "/dashboard/reminders",
    automations: "/dashboard/automations",
    integrations: "/dashboard/integrations",
    receipts: "/dashboard/receipts",
    analytics: "/dashboard/analytics",
    settings: "/dashboard/settings",
  },
} as const;

export const DASHBOARD_NAV = [
  {
    title: "Overview",
    href: ROUTES.dashboard.overview,
    icon: "LayoutDashboard",
  },
  {
    title: "Credit Cards",
    href: ROUTES.dashboard.creditCards,
    icon: "CreditCard",
  },
  { title: "SOA", href: ROUTES.dashboard.soa, icon: "FileText" },
  { title: "Reminders", href: ROUTES.dashboard.reminders, icon: "Bell" },
  { title: "Automations", href: ROUTES.dashboard.automations, icon: "Zap" },
  { title: "Integrations", href: ROUTES.dashboard.integrations, icon: "Plug" },
  { title: "Receipts", href: ROUTES.dashboard.receipts, icon: "Receipt" },
  { title: "Analytics", href: ROUTES.dashboard.analytics, icon: "BarChart3" },
  { title: "Settings", href: ROUTES.dashboard.settings, icon: "Settings" },
] as const;
