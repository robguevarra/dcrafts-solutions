# Design System

Dcrafts Ops Platform uses an **Industrial Control Room** aesthetic — dark, precise, data-dense. This is an internal operations tool, not a consumer product. Visual design prioritizes clarity and zero-ambiguity over decoration.

---

## Design Principles

1. **Signal over noise** — Every color carries meaning (status). No decorative color.
2. **Monospace for data** — All order IDs, timestamps, and specs use DM Mono.
3. **Amber = caution** — The primary active color references factory floor warning lights.
4. **Sharp geometry** — No rounded-corner softness. This is a production system.

---

## Color Tokens

Defined in `app/globals.css` as CSS custom properties.

### Base Colors

| Token | Value | Use |
|-------|-------|-----|
| `--color-bg-primary` | `#0D1117` | Page background |
| `--color-bg-secondary` | `#161B22` | Card / sidebar background |
| `--color-bg-tertiary` | `#21262D` | Input / hover background |
| `--color-border` | `#30363D` | All borders |
| `--color-text-primary` | `#E6EDF3` | Primary text |
| `--color-text-secondary` | `#8B949E` | Labels, secondary text |
| `--color-text-muted` | `#484F58` | Disabled, placeholder |

### Signal Colors

| Token | Value | Meaning |
|-------|-------|---------|
| `--color-signal-amber` | `#F0A500` | Primary action, active state |
| `--color-signal-green` | `#3FB950` | Success / complete |
| `--color-signal-red` | `#F85149` | Error / cancelled / alert |
| `--color-signal-blue` | `#58A6FF` | Info / in-progress |

---

## Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Body | Inter | 400 | 14px |
| Labels | Inter | 500 | 12px |
| Headings | Inter | 600 | 18–24px |
| Data / IDs | DM Mono | 400 | 12–14px |
| Status badges | Inter | 600 | 11px, tracking 0.06em |

**Font loading:** `app/layout.tsx` via `next/font/google`

---

## Status Badges

Semantic mapping used by `components/ui/StatusBadge.tsx`:

| Status | Color | Label shown |
|--------|-------|-------------|
| `pending_spec` | Amber | PENDING SPEC |
| `spec_collected` | Blue | SPEC COLLECTED |
| `in_production` | Blue | IN PRODUCTION |
| `qc_upload` | Amber | QC UPLOAD |
| `shipped` | Green | SHIPPED |
| `cancelled` | Red | CANCELLED |
| `queued` | Amber | QUEUED |
| `in_progress` | Blue | IN PROGRESS |
| `done` | Green | DONE |

---

## Platform Badges

| Platform | Color | Style |
|----------|-------|-------|
| TikTok | `#F85149` (signal-red) | Solid fill |
| Shopee | `#F0A500` (signal-amber) | Solid fill |

---

## Component Patterns

### Cards
```css
background: var(--color-bg-secondary);
border: 1px solid var(--color-border);
border-radius: 0; /* no rounding — industrial */
padding: 16px;
```

### Tables
- Header row: `var(--color-bg-tertiary)` background, muted text
- Body rows: divider `1px solid var(--color-border)`
- Hover: `var(--color-bg-tertiary)` row highlight

### Sidebar
- Width: `240px` fixed
- Active item: left `3px` solid amber border + amber text

### KDS Job Cards
- Grid: `repeat(auto-fill, minmax(320px, 1fr))`
- Status bar: top `3px` solid — amber (queued), blue (in progress), green (done)
- Entry animation: `y: 20px → 0`, `opacity: 0 → 1`, 300ms spring

---

## Spacing Scale

| Token | Value | Use |
|-------|-------|-----|
| `--spacing-xs` | `4px` | Icon gaps |
| `--spacing-sm` | `8px` | Tight groups |
| `--spacing-md` | `16px` | Component padding |
| `--spacing-lg` | `24px` | Section gaps |
| `--spacing-xl` | `32px` | Page-level margins |

---

## Adding New Components

1. Follow existing patterns — no inline styles, CSS custom properties only
2. Status colors must come from the token table above — no raw hex in TSX
3. Use `DM Mono` for any numeric or ID data
4. Framer Motion for any element that can appear/disappear (use `AnimatePresence`)
5. All interactive elements need focus-visible rings: `outline: 2px solid var(--color-signal-amber)`
