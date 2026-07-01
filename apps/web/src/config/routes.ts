export const ROUTES = {
  home: '/',
  login: '/login',
  register: '/register',
  dashboard: {
    root: '/dashboard',
    overview: '/dashboard',
    creditCards: '/dashboard/credit-cards',
    creditCardDetail: (id: string) => `/dashboard/credit-cards/${id}` as const,
    soa: '/dashboard/soa',
    soaPeriod: (id: string) => `/dashboard/soa/${id}` as const,
    soaStatement: (periodId: string, statementId: string) =>
      `/dashboard/soa/${periodId}/${statementId}` as const,
    reminders: '/dashboard/reminders',
    automations: '/dashboard/automations',
    receipts: '/dashboard/receipts',
    settings: '/dashboard/settings',
  },
} as const;

export const DASHBOARD_NAV = [
  {
    title: 'Overview',
    href: ROUTES.dashboard.overview,
    icon: 'LayoutDashboard',
  },
  {
    title: 'Credit Cards',
    href: ROUTES.dashboard.creditCards,
    icon: 'CreditCard',
  },
  { title: 'SOA', href: ROUTES.dashboard.soa, icon: 'FileText' },
  { title: 'Reminders', href: ROUTES.dashboard.reminders, icon: 'Bell' },
  { title: 'Receipts', href: ROUTES.dashboard.receipts, icon: 'Receipt' },
  { title: 'Settings', href: ROUTES.dashboard.settings, icon: 'Settings' },
] as const;
