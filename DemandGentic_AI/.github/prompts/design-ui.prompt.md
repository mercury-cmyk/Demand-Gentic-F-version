---
description: "AgentC UI design — build a VS Code-inspired component with professional polish, performance, accessibility, and micro-interactions."
agent: "orchestrator"
tools: [read, edit, search]
argument-hint: "Describe the UI component or page to design..."
---

Design and implement a VS Code-grade UI component using the AgentC design pipeline. The result must be professional, accessible, and performant.

## Phase 1: Research
- Search `client/src/components/ui/*` for existing primitives that solve the need.
- Search `client/src/components/` for similar feature components to follow patterns.
- Check if React Query hooks already exist for the data this component needs.
- Verify the component will stay under 300 lines — plan extraction upfront.

## Phase 2: Design
- Follow VS Code layout patterns: panels, tabs, sidebars, status bars, log viewers.
- Use semantic Tailwind tokens (`bg-background`, `text-foreground`, `border-border`) — never raw colors.
- Support both dark and light modes via `dark:` prefix.
- Plan all four interaction states: default, hover, focus-visible, disabled.

## Phase 3: Implement
- Build with Tailwind + Radix UI primitives + Lucide icons (named imports only).
- Use `cn()` from `client/src/lib/utils.ts` for conditional classes.
- Wire data fetching through `client/src/lib/queryClient.ts` — never ad-hoc `fetch`.
- Include: loading skeleton, empty state, error state with retry.

## Phase 4: Performance
- Lazy-load route-level pages with `React.lazy()` + ``.
- Virtualize lists > 50 items.
- Debounce search/filter inputs (300ms).
- `React.memo` only when profiling justifies it.
- No barrel icon imports.

## Phase 5: Accessibility (WCAG 2.1 AA — mandatory)
- Keyboard navigation: Tab, Enter, Escape, Arrow keys.
- Focus trap in modals and dropdowns.
- `aria-label` on icon-only buttons, `aria-live` on dynamic regions.
- Semantic HTML: ``, ``, ``, `` — not ``.
- Color contrast ≥ 4.5:1 for all text.

## Phase 6: Quality Gate
- Run `npm run check` — TypeScript must compile.
- Verify component reuses existing UI primitives.
- Confirm responsive layout: mobile base → `sm:` → `md:` → `lg:`.

The AgentC result must feel like a native VS Code panel — professional, distinctive, and intuitive.