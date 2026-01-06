# Design Guidelines - Pivotal B2B CRM

## Design Approach

**System Selection: Carbon Design System**
- Rationale: Enterprise-grade design system optimized for data-heavy applications, complex workflows, and productivity-focused interfaces
- Excellent support for tables, forms, dashboards, and multi-step processes
- Proven patterns for role-based enterprise software

## Core Design Principles

1. **Information Density & Clarity**: Maximize data visibility while maintaining readability
2. **Workflow Efficiency**: Minimize clicks, provide contextual actions, support keyboard navigation
3. **Role-Appropriate Complexity**: Surface relevant features based on user role
4. **Progressive Disclosure**: Show advanced options only when needed

## Color Palette

### Light Mode
- **Primary**: 220 90% 56% (Blue - trust, professionalism)
- **Surface**: 0 0% 100% (White backgrounds)
- **Surface Secondary**: 220 13% 97% (Light gray cards/panels)
- **Border**: 220 13% 91% (Subtle borders)
- **Text Primary**: 220 13% 18% (Near black)
- **Text Secondary**: 220 9% 46% (Gray text)

### Dark Mode  
- **Primary**: 220 90% 56% (Consistent blue)
- **Surface**: 220 13% 11% (Dark background)
- **Surface Secondary**: 220 13% 16% (Elevated surfaces)
- **Border**: 220 13% 23% (Borders)
- **Text Primary**: 220 13% 98% (Near white)
- **Text Secondary**: 220 9% 72% (Muted text)

### Semantic Colors
- **Success**: 142 76% 36% (Green for approved, completed)
- **Warning**: 38 92% 50% (Orange for review, pending)
- **Error**: 0 84% 60% (Red for rejected, errors)
- **Info**: 199 89% 48% (Cyan for notifications)

## Typography

**Font Family**: Inter (Google Fonts)
- Primary: Inter (system fallback: -apple-system, BlinkMacSystemFont, "Segoe UI")
- Monospace: 'JetBrains Mono' for data fields, IDs, technical content

**Scale & Usage**:
- **Display (2xl)**: 30px/36px, weight 600 - Dashboard headers
- **Heading 1 (xl)**: 24px/32px, weight 600 - Page titles
- **Heading 2 (lg)**: 20px/28px, weight 600 - Section headers
- **Heading 3 (base)**: 16px/24px, weight 600 - Card titles
- **Body Large**: 16px/24px, weight 400 - Primary content
- **Body**: 14px/20px, weight 400 - Standard text
- **Small**: 13px/18px, weight 400 - Helper text, labels
- **Caption**: 12px/16px, weight 400 - Metadata, timestamps

## Layout System

**Spacing Scale**: Use Tailwind units 1, 2, 3, 4, 6, 8, 12, 16, 20, 24
- Component padding: p-4, p-6, p-8
- Section margins: mt-8, mb-12
- Card spacing: gap-6
- Dense layouts (tables): p-2, gap-2

**Grid System**:
- Page container: max-w-[1600px] mx-auto px-6
- Sidebar: w-64 (fixed)
- Main content: flex-1 with responsive padding
- Right drawer: w-96 (contextual)

**Responsive Breakpoints**:
- Mobile: < 768px (stack all, hide sidebar)
- Tablet: 768px - 1024px (collapsible sidebar)
- Desktop: 1024px+ (full layout)

## Component Library

### Navigation
- **Left Sidebar**: Fixed 64px width icons + labels, grouped by function, active state with primary color accent
- **Top Bar**: 64px height, search (grow), notifications (badge), profile dropdown
- **Breadcrumbs**: Show hierarchy with chevron separators

### Data Display
- **Tables**: Dense rows (h-12), sortable headers, row hover states, inline actions, sticky header
- **Cards**: White/dark surface, rounded-lg (8px), border, p-6, elevation on hover
- **Stat Cards**: Large number (text-3xl), label below, trend indicator (↑↓)
- **Empty States**: Centered icon (text-6xl muted), title, description, primary CTA

### Forms
- **Input Fields**: h-10, border, rounded-md, focus ring (primary), label above (text-sm font-medium)
- **Select Dropdowns**: Chevron icon, max-height dropdown with search for long lists
- **Multi-select**: Pills with × remove, "Add more" trigger
- **Date Pickers**: Calendar popover, range selection support
- **File Upload**: Drag-drop zone with dashed border, file list below

### Actions
- **Primary Button**: bg-primary text-white, h-10 px-6, rounded-md, hover:brightness-110
- **Secondary Button**: border border-current, text-primary, h-10 px-6
- **Ghost Button**: text-primary, h-10 px-4, hover:bg-surface-secondary
- **Icon Button**: size-10, rounded-md, hover:bg-surface-secondary
- **FAB (Floating)**: fixed bottom-6 right-6, size-14, rounded-full, shadow-lg

### Feedback
- **Toast**: Top-right, auto-dismiss 5s, close button, icon + message
- **Modal**: max-w-2xl, backdrop blur, rounded-lg, header + content + footer
- **Alert Banner**: Full-width, dismissible, contextual color (info/warning/error)
- **Loading**: Spinner for async actions, skeleton for initial load, progress bar for bulk operations

### Specialized Components
- **Audience Builder**: Visual filter chips (pill shape), AND/OR group containers (border, rounded), "Preview Count" badge
- **Domain Set Upload**: Dropzone card, progress indicator, match stats cards (3-column grid)
- **QA Checklist**: Checkbox list with status icons, expandable sections
- **Call Panel**: 3-column layout (softphone | script | qualification form), fixed disposition bar at bottom
- **Order Wizard**: Stepper header, step content area, navigation footer (Back | Next/Submit)

## Page Layouts

### Dashboard
- KPI cards grid (grid-cols-4, gap-6)
- Chart area (2/3 width), recent activity (1/3 width)
- Quick actions FAB menu

### Data Tables (Accounts, Contacts, Leads)
- Filters sidebar (w-72, collapsible)
- Table with bulk actions toolbar
- Row click → right drawer details

### Campaign Builder
- Wizard layout with progress stepper
- Form sections with clear boundaries (border-t)
- Review screen with edit links per section

### Client Portal
- Simplified top nav (logo, orders, downloads, profile)
- Order cards grid with status badges
- Detail view with tabs (overview, audience, reports, leads)

## Animations

**Minimal & Purposeful**:
- Page transitions: None (instant)
- Modal/drawer: Slide-in (200ms ease-out)
- Dropdown: Fade + slide (150ms)
- Toast: Slide from right (300ms ease-out)
- Loading: Spinner rotation only
- Avoid: Parallax, excessive hover effects, decorative animations

## Accessibility

- WCAG AA contrast ratios (4.5:1 text, 3:1 UI)
- Focus visible: 2px ring with 2px offset in primary color
- Keyboard nav: Tab order, Escape to close, Arrow keys in lists/tables
- Screen reader: Proper ARIA labels, live regions for status updates
- Dark mode: Consistent implementation across all components including form inputs

## Images

**Usage Strategy**:
- Marketing/public pages: Hero images for emotional appeal
- Application interior: Data visualization over decorative images
- User profiles: Avatar placeholders (initials)
- Empty states: Illustrative icons (Heroicons outline, size-16)

**No large hero images** in this enterprise application - focus is on data and functionality.

---

**Critical Success Metrics**:
- 2-click access to primary actions (Create, Import, Launch)
- Tables render 10k+ rows with virtual scrolling
- Forms autosave every 3 seconds
- Filter results update in <200ms
- Keyboard shortcuts for power users (documented in help)