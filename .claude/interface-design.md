# 87 Studio — Design System

## Direction: The Editing Suite

Warm, professional creative workspace. The interface recedes so images and prompts lead. Like sitting at an editing suite at night — amber desk lamp glow, matte equipment surfaces, calibration-gray neutrals that let generated images speak truthfully.

## Intent

**Who:** A creator crafting AI-generated character art in focused desk sessions. Power user who iterates on prompts, generates batches, curates results.

**What:** Craft prompts, generate image batches, curate and rate results.

**Feel:** Dense where tools live (parameters, prompts), spacious where images breathe (gallery, lightbox). Warm but professional. A tool, not a consumer app.

## Signature

The `{{placeholder}}` system — amber-tinted variable slots that appear in CodeMirror editors, scene configuration fields, and badges throughout the UI. A visual thread unique to this product.

## Color Palette (Dark Only)

All values in OKLCH. Hue ~70 (warm amber territory).

| Token | Value | Purpose |
|-------|-------|---------|
| background | `0.14 0.006 70` | Deep warm charcoal canvas |
| foreground | `0.93 0.01 80` | Warm off-white text |
| card | `0.18 0.006 70` | Slightly lifted surface |
| popover | `0.20 0.008 70` | Floating surface |
| primary | `0.72 0.14 70` | Amber accent — the signature |
| primary-foreground | `0.16 0.01 70` | Dark on amber |
| secondary | `0.22 0.008 70` | Warm mid surface |
| muted-foreground | `0.55 0.02 70` | Warm gray text |
| accent | `0.26 0.012 70` | Hover/active surface |
| destructive | `0.62 0.17 25` | Dusty rose |
| border | `1 0.03 70 / 8%` | Warm white at low opacity |
| input | `1 0.03 70 / 12%` | Slightly more visible |
| ring | `0.72 0.14 70 / 50%` | Amber focus ring |

## Depth Strategy

**Borders-only.** No shadows. This is a tool — clean, technical. Borders use low-opacity warm-tinted white (`oklch(1 0.03 70 / 8%)`). Elevation is communicated through subtle lightness shifts in background color.

## Spacing

4px base (Tailwind default). Key spacings: `gap-1.5` (6px) for tight grids, `gap-2` (8px) for inline elements, `gap-4` (16px) for sections, `gap-6` (24px) for page sections.

## Typography

- **Font:** Figtree Variable (humanist sans, readable)
- **Page title:** `text-xl font-semibold tracking-tight`
- **Section heading:** `text-xs font-medium text-muted-foreground uppercase tracking-wider`
- **Card title:** `text-base font-medium`
- **Body:** `text-sm` (default)
- **Metadata/labels:** `text-xs text-muted-foreground`
- **Monospace (prompts):** `font-mono text-sm` / `text-xs`

## Border Radius

Inherited from shadcn maia — pill-shaped buttons (`rounded-4xl`), `rounded-2xl` cards, `rounded-xl` containers, `rounded-lg` for smaller elements.

## Component Patterns

### Empty States
Dashed border container, centered text. Two lines: what's empty + what to do.
```
rounded-xl border border-border border-dashed py-16 text-center
```

### Section Headers (Dashboard)
Uppercase tracking labels, no cards — direct content beneath.
```
text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3
```

### Active Job Indicators
Amber-tinted container with pulse dot, progress bar, count.
```
rounded-xl border border-primary/20 bg-primary/5 px-4 py-3
```

### Progress Bars
Thin amber bar on warm secondary track.
```
h-1.5 rounded-full bg-secondary (track)
h-1.5 rounded-full bg-primary transition-all duration-500 (fill)
```

### Sidebar Navigation
Same background as canvas. Active state: `bg-primary/10 text-primary font-medium`. Inactive: `text-muted-foreground hover:bg-accent hover:text-foreground`.

### Gallery Grid
Tight gaps (`gap-1.5`), rounded corners (`rounded-lg`), `aspect-square`. Favorite overlay on hover. Rating stars in amber (`text-primary`).

### Lightbox
`bg-black/90` overlay. Side panel with `bg-card`. Navigation arrows in `text-white/40 hover:text-white/80`. Rating stars in amber.

### CodeMirror Editor
Background matches `card` token. Border matches `border` token. Focus ring in amber. `{{placeholder}}` highlighting uses amber at 15% opacity with 30% border.

## Anti-Patterns

- No neutral grays — every gray has warm undertone (hue 70-80)
- No shadows — borders only
- No identical card grids for varied content — vary density per content type
- No native `<select>` — use Select component from shadcn
- No `text-yellow-400` — use `text-primary` for stars/ratings (amber)
- No `accent-primary` on range inputs — styled globally in CSS
