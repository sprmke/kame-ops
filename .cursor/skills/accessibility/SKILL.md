---
name: accessibility
description: Accessibility skill for WCAG 2.1 AA compliance. Use when building or reviewing UI: semantic HTML, ARIA, keyboard navigation, focus management, and screen reader support.
---

# Accessibility Skill (WCAG 2.1 AA)

KameOps requires WCAG 2.1 AA compliance. Use this skill whenever you implement or review UI.

## Principles

- **Semantic HTML**: Use correct elements (`button`, `nav`, `main`, `header`, headings in order).
- **Labels**: Every form control has a visible or programmatic label (`<Label htmlFor="id">`, `aria-label` for icon-only).
- **Keyboard**: All interactive elements focusable and operable with keyboard (Tab, Enter, Space, arrows where appropriate).
- **Focus**: Visible focus indicators in both light and dark themes (`focus-visible:ring-2 focus-visible:ring-ring`).
- **Contrast**: Text contrast ≥ 4.5:1 (normal), ≥ 3:1 (large); use `text-foreground`, `text-muted-foreground`, avoid low-contrast grays without checking.

## Patterns

### Buttons and icons

```tsx
<button type="button" aria-label="Delete booking">
  <TrashIcon aria-hidden="true" />
</button>
```

### Form fields

```tsx
<Label htmlFor="guestName">Guest name</Label>
<Input id="guestName" aria-describedby={errors.guestName ? 'guestName-error' : undefined} />
{errors.guestName && <p id="guestName-error" className="text-destructive text-sm" role="alert">{errors.guestName.message}</p>}
```

### Modals and focus

- Trap focus inside open modal/dialog.
- Return focus to trigger on close.
- Use `aria-modal="true"` and `role="dialog"` (or rely on shadcn Dialog which provides this).

### Skip link

- Provide “Skip to main content” for keyboard users (e.g. `sr-only focus:not-sr-only focus:absolute focus:p-4`).

### Lists and roles

- Use `role="listbox"` and `aria-selected` for custom select/list components; handle Arrow keys and Enter.

## Testing

- Navigate with Tab and Shift+Tab; use Enter/Space on buttons and links.
- Use one screen reader (e.g. VoiceOver, NVDA) for critical flows.
- Check contrast with devtools or a contrast checker.

## Reference

- `.cursor/rules/05-components.mdc` – Accessibility section
- `.cursor/rules/13-ui-ux-design.mdc` – Theme support, accessibility checklist
- Design system: `docs/product/design-system.md`
