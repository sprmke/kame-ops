# KameOps Design System

Distinct **finance & automation** branding — warm amber/orange primary, money-green success, and warm stone neutrals. Intentionally separate from property-management (emerald/teal) aesthetics.

## Brand identity

| Element          | Value                                                         |
| ---------------- | ------------------------------------------------------------- |
| Product name     | **KameOps** — "Ops" highlighted in primary orange             |
| Tone             | Professional SaaS, trustworthy, action-oriented               |
| Primary metaphor | Money in motion — automation that pays attention to due dates |

## Color tokens (HSL CSS variables)

Defined in `apps/web/src/app/globals.css`. Always use semantic classes in components.

| Token            | Light                      | Purpose                                |
| ---------------- | -------------------------- | -------------------------------------- |
| `--primary`      | Orange `28 92% 52%`        | CTAs, active nav, brand accents        |
| `--primary-deep` | `22 88% 42%`               | Gradients, depth                       |
| `--chart-2`      | Gold `42 96% 55%`          | Secondary chart / gradient stops       |
| `--success`      | Green `152 52% 36%`        | Paid, completed — **not** brand orange |
| `--background`   | Warm ivory `38 45% 97%`    | Page canvas                            |
| `--foreground`   | Warm charcoal `24 28% 11%` | Body text                              |
| `--accent`       | Light gold wash            | Hover surfaces, highlights             |

Dark mode uses warmer near-black backgrounds (`22 18% 7%`) with brighter primary (`32 95% 58%`).

## Typography

| Role    | Font                        | Usage                          |
| ------- | --------------------------- | ------------------------------ |
| Body    | **DM Sans** (`--font-sans`) | UI, forms, tables              |
| Display | **Sora** (`--font-display`) | Headings, stats, logo wordmark |

Load via `apps/web/src/lib/fonts.ts` and `next/font/google`.

## Components

| Component             | Path                                      |
| --------------------- | ----------------------------------------- |
| Brand mark (monogram) | `@/components/brand/BrandMark`            |
| Brand logo (wordmark) | `@/components/brand/BrandLogo`            |
| Auth shell            | `@/components/layout/AuthPageShell`       |
| Dashboard page header | `@/components/shared/DashboardPageHeader` |

## Utility classes

| Class                          | Use                                         |
| ------------------------------ | ------------------------------------------- |
| `brand-page-bg`                | Subtle grid + radial glow (auth, dashboard) |
| `gradient-primary`             | Primary buttons, marks                      |
| `gradient-primary-subtle`      | CTA sections, highlights                    |
| `text-gradient`                | Hero emphasis text                          |
| `shadow-glow` / `glow-primary` | Primary button emphasis                     |
| `font-display`                 | Heading override                            |

## Rules

1. **Theme**: All UI must support light and dark (`bg-background`, `text-foreground`, etc.).
2. **No hardcoded emerald/teal** — use `--success` for positive states.
3. **No Kame Homes copy** — product is KameOps only.
4. **Charts**: Use `chart-1` … `chart-5` Tailwind colors for Recharts.

## References

- Tokens: `apps/web/src/app/globals.css`
- Tailwind: `apps/web/tailwind.config.ts`
- UI rules: `.cursor/rules/13-ui-ux-design.mdc`
