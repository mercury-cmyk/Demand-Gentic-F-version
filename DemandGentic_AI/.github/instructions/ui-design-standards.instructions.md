---
description: "Use when: creating UI components, pages, layouts, designing interfaces. Enforces VS Code-like editor experience with professional design patterns."
applyTo: "client/src/components/**"
---

# UI Design Standards — VS Code-Grade Interface Quality

## Design Philosophy

Every interface must feel like a professional development tool — purposeful, information-dense, and responsive. Never generic, never template-driven.

## Layout Architecture

### Panel System (VS Code Model)
| Zone | Purpose | Pattern |
|------|---------|---------|
| **Activity Bar** (left) | Icon-based top-level navigation | Fixed width, tooltips, badge counts |
| **Side Panel** | Collapsible tree views, filters, search | Resizable, remembers collapsed state |
| **Editor Area** | Tabbed primary content | Split-view, drag-and-drop tabs |
| **Bottom Panel** | Terminal, logs, problems | Collapsible, tabbed sub-views |
| **Status Bar** | Context info, notifications | Fixed bottom, left/right sections |

### Component Patterns
```tsx
// Panel with tabs (VS Code style)

  
    Output
    Terminal
    Problems
  
  
    {/* Log entries with virtualized scrolling for large lists */}
  

```

## Design Tokens

### Colors & Theme
- Use semantic Tailwind tokens: `bg-background`, `text-foreground`, `border-border`, `bg-muted`, `text-muted-foreground`.
- Never use raw color values (`bg-blue-500`) — always use the design system tokens.
- Support dark/light via Tailwind's `dark:` prefix on every color-bearing class.

### Spacing & Rhythm
- Consistent spacing scale: `gap-1` (4px), `gap-2` (8px), `gap-3` (12px), `gap-4` (16px).
- Section padding: `p-4` for cards, `p-6` for page sections, `p-2` for dense panels.
- Vertical rhythm: `space-y-2` inside forms, `space-y-4` between sections.

### Borders, Shadows & Elevation
- Cards: `border border-border rounded-lg shadow-sm`
- Modals/dialogs: `shadow-lg rounded-lg border`
- Dropdowns/popovers: `shadow-md rounded-md border`
- Active/selected: `ring-2 ring-ring`

### Motion & Transitions
- Default: `transition-colors duration-150` for hover/focus state changes.
- Panel open/close: `transition-all duration-200 ease-in-out`.
- Never animate layout-triggering properties (width/height) on large DOM — use `transform` and `opacity`.

## Micro-Interactions

### States — Every interactive element must have all four states:
| State | Pattern |
|-------|---------|
| **Default** | Base styling with clear affordance |
| **Hover** | `hover:bg-accent hover:text-accent-foreground` |
| **Focus** | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none` |
| **Disabled** | `disabled:opacity-50 disabled:pointer-events-none` |

### Loading & Empty States
- Use `Skeleton` components for loading — never blank screens or spinners alone.
- Every list must have an empty state with icon + message + optional action.
- Use the existing toast system for mutation feedback — success and error.

### Feedback Patterns
- Optimistic UI for common mutations (toggle, delete with undo).
- Debounce search inputs (300ms default).
- Show inline validation errors, not just toast messages.

## Performance Gates

### Render Efficiency
- Memoize with `React.memo` only when profiling shows wasted renders — don't pre-optimize.
- Use `useMemo` / `useCallback` for expensive computations or callbacks passed to child lists.
- Virtualize long lists (> 50 items) — use existing virtualization utilities or react-window.

### Bundle Discipline
- **Named icon imports only**: `import { Phone } from "lucide-react"` — never the full library.
- **No new component libraries** without explicit approval — use existing Radix UI primitives.
- **Lazy-load** all route-level pages: `React.lazy()` + `}>`.
- Keep component files under 300 lines — extract sub-components when exceeded.

### Image & Asset Rules
- Use WebP/AVIF where supported; always include `width` and `height` attributes.
- Lazy-load below-the-fold images with `loading="lazy"`.

## Accessibility — WCAG 2.1 AA Required

### Keyboard Navigation
- All interactive elements must be focusable and operable via keyboard.
- Implement focus trap in modals and dropdowns.
- Support `Escape` to close overlays, `Enter`/`Space` to activate buttons.
- Visible focus ring on all focusable elements (the `focus-visible` pattern above).

### Screen Readers
- All interactive elements need `aria-label` or a visible text label.
- Dynamic content changes must use `aria-live` regions for announcements.
- Icon-only buttons must have `aria-label` describing the action.
- Use semantic HTML: ``, ``, ``, ``, `` — not ``.

### Color & Contrast
- Text contrast ratio ≥ 4.5:1 (AA standard).
- Never convey information through color alone — pair with icons, text, or patterns.
- Test with color-blind simulation before marking UI work complete.

## Code Standards

- Use `cn()` from `client/src/lib/utils.ts` for all conditional class merging.
- Use data-fetching helpers from `client/src/lib/queryClient.ts` — never ad-hoc `fetch`.
- Use `client/src/lib/routes.ts` for navigation paths — no hardcoded strings.
- Follow responsive-first ordering: mobile base → `sm:` → `md:` → `lg:` → `xl:`.