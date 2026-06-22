---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use when building web components, pages, or applications (landing pages, dashboards, React components, layouts) or when styling/beautifying UI. Generates creative, polished code that avoids generic AI aesthetics while respecting the KameOps design system where applicable.
---

# Frontend Design Skill

This skill guides creation of **distinctive, production-grade** frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with strong attention to aesthetic detail and intentional creative choices, while staying consistent with the project when working inside the app.

## When to Use

- User asks to build or redesign: components, pages, landing pages, dashboards, or full interfaces
- Styling, beautifying, or elevating existing UI
- Marketing pages, guest-facing pages, or any surface where memorable design matters
- When the ask implies "make it look great" or "professional and distinctive"

**Within KameOps app (dashboard, all modules):** Respect the design system (`docs/product/design-system.md`). Use semantic tokens (`bg-background`, `text-foreground`, `primary`), DM Sans + Sora, warm amber/orange brand palette, and light/dark support. Apply this skill for _elevating_ those constraints (motion, composition, micro-interactions, visual hierarchy), not for replacing the system.

**Marketing, landing, or net-new pages:** Full creative freedom within brand (amber/orange money theme, professional, approachable). Commit to a clear aesthetic direction and execute it boldly.

## Design Thinking (Before Coding)

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Choose a clear direction: minimal and refined, maximalist and bold, editorial, luxury, playful, brutalist, organic, etc. Execute that direction consistently.
- **Constraints**: Framework (Next.js, React), performance, accessibility (WCAG 2.1 AA), and for app pages – design system tokens and theme support.
- **Differentiation**: What makes this screen or component **memorable**? One strong idea executed well beats many weak ones.

Choose a clear conceptual direction and implement it with precision. Bold and minimal both work; the key is **intentionality**.

## Aesthetics Guidelines

- **Typography**: Prefer distinctive, characterful fonts. Avoid generic defaults (Arial, Inter) when you have freedom; for KameOps app use **Plus Jakarta Sans** and the type scale in the design system. For marketing/landing, pair a distinctive display font with a refined body font.
- **Color & theme**: Cohesive palette. Use CSS variables. In app: `--primary`, `--background`, `--muted`, etc. and **always support light and dark**. For net-new pages, dominant colors with sharp accents outperform timid, even palettes.
- **Motion**: Use animation for impact. Prefer CSS for simple effects; Framer Motion for React when available. One well-orchestrated load (e.g. staggered reveals with `animation-delay`) often beats scattered micro-interactions. Add scroll- and hover-driven motion where it adds clarity or delight.
- **Spatial composition**: Consider asymmetry, overlap, grid-breaking elements, generous negative space or controlled density. Match layout to the chosen tone.
- **Backgrounds & depth**: Prefer atmosphere over flat solids. Use gradients, subtle texture, geometric patterns, layered transparencies, or shadows when they support the aesthetic. In app, stay within design system shadows and radii unless the brief asks for a one-off hero or marketing block.

**Avoid**: Overused font stacks (Inter, Roboto, system-only), clichéd purple-on-white gradients, predictable layouts, and cookie-cutter patterns that ignore context. Vary choices; don’t converge on the same “safe” look every time.

Match implementation complexity to the vision: maximalist designs need more elaborate code and effects; minimalist ones need restraint, precision, and care in spacing and type.

## KameOps Context

- **UI copy**: Default to **no** page descriptions, helper paragraphs, or `CardDescription` unless the user asks for copy. See `.cursor/rules/21-minimal-ui-copy.mdc`.
- **Design system**: `docs/product/design-system.md` – colors (amber/orange primary, money-green success), typography (DM Sans + Sora), spacing, radius, shadows, component patterns.
- **Theme**: All app UI must work in **light and dark**. Use semantic classes: `bg-background`, `text-foreground`, `border-border`, `bg-card`, `text-muted-foreground`, and `dark:` only when necessary.
- **Stack**: Next.js 16+, React 19, Tailwind CSS, shadcn/ui, Lucide icons. Optional: Framer Motion.
- **Accessibility**: WCAG 2.1 AA; semantic HTML, focus states, contrast. See **accessibility** skill and `.cursor/rules/15-accessibility.mdc`.

For **dashboard and app screens**: Stay on-design-system and use this skill to refine hierarchy, motion, and polish. For **marketing and landing**: Align with brand (professional, approachable, amber/orange) but push creative boundaries within that.

## Output

Deliver **working code** (React/TSX, Tailwind, shadcn where appropriate) that is:

- Production-grade and functional
- Visually distinctive and coherent with the chosen direction
- Respectful of the design system when in-app; bold and memorable when marketing/landing
- Refined in typography, spacing, color, and motion

Commit fully to a clear vision rather than hedging with generic, forgettable UI.
