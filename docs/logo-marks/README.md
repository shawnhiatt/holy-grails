# Logo marks — exploration

Six candidate **marks** for Holy Grails. Exploration only — nothing here is adopted, and
nothing in `src/imports/` has been touched. The script wordmark remains the brand asset of
record (see CLAUDE.md: "the wordmark is a fixed brand asset, not themed chrome; revisit only
on an explicit brand-mark pass").

## The gap this addresses

The wordmark can't do the jobs a mark does: a 16px favicon, a maskable PWA tile, a home-screen
icon, an avatar-sized lockup. Today `public/` ships raster icons with no vector source and no
symbol behind them.

## Constraints every mark here satisfies

| Constraint | Why |
|---|---|
| One colour, `currentColor` | Inherits the theme; no gradient or two-tone dependency |
| 100×100 viewBox, art within r=40 | Exactly the 80% safe circle a maskable icon requires |
| True knockouts (`fill-rule="evenodd"` / masks) | Spindle holes stay holes on any ground, never a filled dot |
| No cross, fish, dove, praying hands | The brief: holy, not religious |

## The six

| Mark | Family | Religious read | Verdict |
|---|---|---|---|
| `nimbus.svg` | Light | Medium | **Develop.** Only mark whose silhouette is unmistakable at 16px |
| `arch.svg` | Architecture | Medium | **Develop.** Only mark built for a square tile; jukebox alibi |
| `shaft.svg` | Light | Low | **Dark horse.** Best idea, rays currently read as damage |
| `aureole.svg` | Light | Low | Drop — reads as a bullseye |
| `rose-window.svg` | Architecture | Medium | Drop — becomes a gear; needs a second small-size drawing |
| `chalice.svg` | Object | High | Drop — legible, but crosses the line the brief drew |

## Second pass: glass

A stained-glass treatment, on a rationale that isn't decorative: tilt vinyl under a light and
the grooves diffract it into this exact spectrum. Stained glass and a record are the same
object — a circle divided into concentric bands, read by light.

Palette is the condition-grade spectrum from `src/lib/condition-colors.ts` (the ramp used to
grade copies), with brand yellow anchoring the centre so the mark still reads yellow when the
cells collapse at small sizes.

**How it stays one colour.** Cells are inset so the *ground* shows through as the lead line —
there is no stroke colour to choose and it works on any background. The one-colour cut is the
identical geometry with a single fill. Nothing is redrawn.

| Set | Files | Notes |
|---|---|---|
| Rosette | `glass-rosette{,-light,-mono}.svg` | Record as rose window. Best at 128px, weakest at 16px |
| Lancet | `glass-lancet{,-light,-mono}.svg` | Solid tracery, glass in the opening. Best small-size holder |
| Nimbus in glass | `glass-nimbus-glass{,-light,-mono}.svg` | Mono reverts exactly to `nimbus.svg` |

`-light` variants use the light-mode spectrum. One constraint worth knowing: that ramp
collapses P/F and G onto a single value, so it has five distinct steps where dark has six — a
six-cell design repeats one on light grounds.

The mono variants of Rosette and Lancet reference `var(--lead, #0A0C0F)` for the knocked-out
groove; set `--lead` to the surface the mark sits on.

**Nimbus in glass is the one to build.** It reverts to plain Nimbus with one fill swapped, so
the simple mark can be the system default while the spectrum comes out for splash, install,
share cards, and About — one identity, two dresses.

## Using them

Each file is a standalone SVG with `fill="currentColor"`, so colour comes from CSS:

```tsx
import mark from "../../docs/logo-marks/nimbus.svg";
// or inline it and let it inherit:
<span style={{ color: "var(--c-link)" }}><NimbusMark /></span>
```

They open directly in Figma and Illustrator. Geometry is generated, not hand-drawn — the
source is the `MARKS` dict in the build script referenced by the review sheet, so weights and
radii are adjustable in one place.

## Open decision

The v0.7 retheme moved the app off navy to cool near-neutral gray, but the wordmark SVGs kept
navy `#0C284A`. If a mark ships, navy becomes a colour that exists only in the logo lockup and
nowhere else in the product. That's defensible — brand assets often outlive a UI palette — but
it should be decided, not inherited. The alternative is retiring navy to `#16181C` and letting
yellow be the sole brand colour, which is closer to where the app already sits.
