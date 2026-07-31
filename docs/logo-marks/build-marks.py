#!/usr/bin/env python3
"""Regenerate the Holy Grails logo-mark SVGs.

Exploration only — see README.md. Run: python3 docs/logo-marks/build-marks.py
All geometry (radii, stroke weights, ray angles, glass cell counts) lives here so a
mark can be retuned in one place rather than by editing path data by hand.
"""
import os, math, pathlib

SCRATCH = pathlib.Path(__file__).parent
OUT_SVG = SCRATCH
OUT_SVG.mkdir(parents=True, exist_ok=True)

# ---- shared geometry helpers -------------------------------------------------

def circle_path(cx, cy, r):
    """Two-arc circle idiom, safe for fill-rule knockouts."""
    return f"M{cx-r},{cy} a{r},{r} 0 1,0 {2*r},0 a{r},{r} 0 1,0 {-2*r},0 Z"

def disc_with_hole(cx, cy, r, hole):
    return (f'<path fill-rule="evenodd" d="{circle_path(cx,cy,r)} '
            f'{circle_path(cx,cy,hole)}"/>')

def ray(a0, a1, cx=50, cy=50, d=95):
    """Wedge from the spindle out past the record edge, angles in screen degrees."""
    p = []
    for a in (a0, a1):
        rad = math.radians(a)
        p.append(f"{cx + d*math.cos(rad):.1f},{cy + d*math.sin(rad):.1f}")
    return f'M{cx},{cy} L{p[0]} L{p[1]} Z'

def spokes(n, r0, r1, sw, cx=50, cy=50, start=-90):
    out = []
    for i in range(n):
        a = math.radians(start + i * 360 / n)
        x0, y0 = cx + r0*math.cos(a), cy + r0*math.sin(a)
        x1, y1 = cx + r1*math.cos(a), cy + r1*math.sin(a)
        out.append(f'<line x1="{x0:.2f}" y1="{y0:.2f}" x2="{x1:.2f}" y2="{y1:.2f}" '
                   f'stroke="currentColor" stroke-width="{sw}"/>')
    return "".join(out)

S = 'fill="none" stroke="currentColor"'

# ---- the six marks -----------------------------------------------------------

NIMBUS = (
    f'<ellipse cx="50" cy="22" rx="27" ry="9" {S} stroke-width="5"/>'
    '<mask id="cut-nimbus" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">'
    '<rect x="0" y="0" width="100" height="100" fill="#fff"/>'
    '<circle cx="50" cy="60" r="18" fill="none" stroke="#000" stroke-width="2"/>'
    '</mask>'
    f'<g mask="url(#cut-nimbus)">{disc_with_hole(50, 60, 26, 4.4)}</g>'
)

SHAFT_DEFS = (
    '<mask id="cut-shaft" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">'
    '<rect x="0" y="0" width="100" height="100" fill="#fff"/>'
    f'<path d="{ray(30,54)}" fill="#000"/>'
    f'<path d="{ray(62,78)}" fill="#000"/>'
    '</mask>'
)
SHAFT = (
    '<g mask="url(#cut-shaft)">'
    f'<circle cx="50" cy="50" r="37.5" {S} stroke-width="5"/>'
    f'<circle cx="50" cy="50" r="29" {S} stroke-width="2.5"/>'
    f'<circle cx="50" cy="50" r="20.5" {S} stroke-width="2.5"/>'
    + disc_with_hole(50, 50, 8.5, 3.4) +
    '</g>'
)

# Rings widen and thin as they travel out, so it decays like light rather than
# sitting there like a bullseye.
AUREOLE = (
    f'<circle cx="50" cy="50" r="39.6" {S} stroke-width="1.3"/>'
    f'<circle cx="50" cy="50" r="30.5" {S} stroke-width="2.2"/>'
    f'<circle cx="50" cy="50" r="22" {S} stroke-width="3.5"/>'
    f'<circle cx="50" cy="50" r="14.5" {S} stroke-width="5.2"/>'
    + disc_with_hole(50, 50, 8, 3.2)
)

ARCH = (
    f'<path d="M14,82 L14,48 A36,36 0 0,1 86,48 L86,82" {S} stroke-width="6"/>'
    + disc_with_hole(50, 52, 20, 3.6)
)

ROSE = (
    f'<circle cx="50" cy="50" r="39" {S} stroke-width="4.5"/>'
    + spokes(12, 25, 37, 3.5) +
    f'<circle cx="50" cy="50" r="24" {S} stroke-width="3"/>'
    f'<circle cx="50" cy="50" r="17" {S} stroke-width="2"/>'
    + disc_with_hole(50, 50, 9.5, 3.4)
)

CHALICE_DEFS = (
    '<clipPath id="bowl-chalice"><rect x="0" y="22" width="100" height="78"/></clipPath>'
    '<mask id="cut-chalice" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">'
    '<rect x="0" y="0" width="100" height="100" fill="#fff"/>'
    '<circle cx="50" cy="22" r="17" fill="none" stroke="#000" stroke-width="2.5"/>'
    '<circle cx="50" cy="22" r="9.5" fill="none" stroke="#000" stroke-width="2.5"/>'
    '<circle cx="50" cy="22" r="4.6" fill="#000"/>'
    '</mask>'
)
CHALICE = (
    '<g mask="url(#cut-chalice)">'
    '<circle cx="50" cy="22" r="26" clip-path="url(#bowl-chalice)"/>'
    '<rect x="45.5" y="46" width="9" height="24"/>'
    '<ellipse cx="50" cy="72" rx="25" ry="6"/>'
    '</g>'
)

MARKS = [
    dict(id="nimbus", name="Nimbus", family="light", defs="", body=NIMBUS, religious=2,
         holy="The halo, reduced to a single floating hoop — the oldest shorthand for sanctity, and the one that survived into cartoons, which is exactly why it can carry a music app.",
         music="Below it, a record — one groove knocked out of the disc and the spindle hole left open. Without that single groove the disc read as a balloon; with it, the record is unambiguous.",
         risk="Survives to 16px with its silhouette intact — a bar over a dot — which nothing else here manages as cleanly. The halo is borrowed goods, though. It only stays playful while the hoop keeps its perspective tilt; drawn flat it turns devotional fast."),
    dict(id="shaft", name="Shaft", family="light", defs=SHAFT_DEFS, body=SHAFT, religious=1,
         holy="Light through a high window. No icon, no figure — just the beam, which is how sacred space actually feels rather than how it's labelled.",
         music="The rays are cut out of the grooves, so the record is intact and the light is the absence. Two rays, not one, so it never reads as a prohibition slash.",
         risk="Drawn and rendered, it doesn’t yet do what it promises. The rays read as a chip knocked out of the disc rather than light leaving it, and by 32px it just looks like a damaged record. Widening them further starts eating the grooves. The idea is the best in the set; this execution isn’t there, and it may need a second element — a source, an edge glow — which costs it the one-colour simplicity."),
    dict(id="aureole", name="Aureole", family="light", defs="", body=AUREOLE, religious=1,
         holy="The aureole — radiance drawn as concentric emanation rather than a ring above a head. Fully secular in isolation.",
         music="These are grooves. The weights taper outward so the disc appears to be giving off light rather than receiving it.",
         risk="It reads as a bullseye. I tapered the weights and widened the spacing outward to make the rings decay like light, and it still reads as a dartboard first — the failure isn’t wifi or soundwave as I expected, it’s target. Concentric circles are simply spoken for. This is the weakest of the six and I’d drop it."),
    dict(id="arch", name="Arch", family="architecture", defs="", body=ARCH, religious=2,
         holy="Sacred architecture with none of the iconography — a niche, an apse, the shape you stand inside rather than kneel to.",
         music="It is also, precisely, the top of a Wurlitzer. That coincidence is the most valuable thing in this set: the same silhouette is a chapel and a jukebox, so the religious read has somewhere secular to land.",
         risk="Best fit for a square app tile by a distance — it fills the box instead of floating in it, and it is the only mark besides Nimbus still parsing at 16px. Two things to watch: close the arch with a baseline and it becomes a headstone, and the legs currently run long enough that at small sizes it edges toward a keyhole."),
    dict(id="rose-window", name="Rose Window", family="architecture", defs="", body=ROSE, religious=2,
         holy="Tracery. A rose window is radial, banded and circular — the only piece of church architecture already shaped like the product.",
         music="Read from across the room it is a record label with a starburst; up close the outer band resolves into stonework.",
         risk="Holds together at 32px better than expected, but what it holds is a gear — the spokes read as teeth once the stonework detail drops out, and by 16px the bands merge into mud. It would need a simplified six-spoke cut for small sizes, which means maintaining two drawings of one mark forever."),
    dict(id="chalice", name="Chalice", family="object", defs=CHALICE_DEFS, body=CHALICE, religious=3,
         holy="The grail itself, taken literally. The brief's namesake, and the only mark that says the word out loud.",
         music="The bowl is the bottom half of a record — grooves knocked out, and the spindle hole notched into the rim. The foot is a second disc seen edge-on.",
         risk="Technically the surprise of the set — the goblet silhouette is still perfectly clear at 16px, better than four of the others. The objection is entirely semantic: a stemmed cup with a notched rim is communion before it is anything else, and the grooves in the bowl read closer to a candelabra than a record. Included to mark where the line is, not to cross it."),
]

FAMILIES = [
    ("light", "Light", "Sanctity as illumination. Nothing depicted, only lit — the safest route to “holy” without imagery, and where three of the six landed."),
    ("architecture", "Architecture", "Sanctity as a place. Borrows the shape of the building rather than anything inside it, which keeps the reference structural instead of devotional."),
    ("object", "Object", "Sanctity as a thing you hold. The literal reading of the name, and the edge of the brief — worth drawing to see where the line actually is."),
]

# ---- glass: the second pass --------------------------------------------------
# Cells are inset so the GROUND shows through as the lead line. That keeps the
# leading ground-agnostic — no stroke colour to pick, works on any background,
# and mono is the identical geometry with one fill.

SPECTRUM_DARK  = ["#FF98DA", "#E88CC4", "#C9A0E0", "#ACDEF2", "#5FBFA0", "#3E9842"]
# The light ramp collapses F and G onto one value, so it has five distinct steps,
# not six — a real constraint of reusing the existing condition tokens.
SPECTRUM_LIGHT = ["#9A207C", "#7A3A9A", "#00527A", "#1A7A5A", "#2D7A31", "#7A3A9A"]
BRAND = {"dark": "#EBFD00", "light": "#8C6800"}

def polar(r, a, cx=50, cy=50):
    t = math.radians(a)
    return cx + r*math.cos(t), cy + r*math.sin(t)

def sector(r0, r1, a0, a1, cx=50, cy=50, gap=1.7):
    """Annular sector, inset on all four sides by `gap` so the ground reads as lead."""
    rm = (r0 + r1) / 2
    ga = math.degrees(gap / rm)
    r0, r1, a0, a1 = r0 + gap, r1 - gap, a0 + ga, a1 - ga
    large = 1 if (a1 - a0) % 360 > 180 else 0
    x1, y1 = polar(r1, a0, cx, cy); x2, y2 = polar(r1, a1, cx, cy)
    x3, y3 = polar(r0, a1, cx, cy); x4, y4 = polar(r0, a0, cx, cy)
    return (f"M{x1:.2f},{y1:.2f} A{r1:.2f},{r1:.2f} 0 {large},1 {x2:.2f},{y2:.2f} "
            f"L{x3:.2f},{y3:.2f} A{r0:.2f},{r0:.2f} 0 {large},0 {x4:.2f},{y4:.2f} Z")

def cell(d, tone, sw=None):
    return dict(d=d, tone=tone, sw=sw)

# A. Rosette — the record as a rose window.
def rosette():
    els = []
    for i in range(6):                      # inner ring of glass
        els.append(cell(sector(13, 25.5, -90 + i*60, -30 + i*60), i))
    for i in range(6):                      # outer ring, offset half a cell
        els.append(cell(sector(25.5, 39, -60 + i*60, i*60), (i + 3) % 6))
    els.append(cell(f'{circle_path(50,50,11.3)} {circle_path(50,50,3.6)}', "brand"))
    return els

# B. Lancet — solid stone tracery with the glass set into the opening, which is
# how a window is actually built. Glazing the frame itself read as a dashed
# outline and the arch lost its silhouette.
def lancet():
    els = []
    els.append(cell("M14,79 L14,48 A36,36 0 0,1 86,48 L86,79 L80,79 L80,48 "
                    "A30,30 0 0,0 20,48 L20,79 Z", "brand"))
    for i in range(6):
        els.append(cell(sector(9, 24, -90 + i*60, -30 + i*60, 50, 46, gap=1.5), i))
    els.append(cell(f'{circle_path(50,46,8.2)} {circle_path(50,46,3.2)}', "brand"))
    return els

# C. Nimbus in glass — the halo segmented, the record left whole.
def nimbus_glass():
    els, rx, ry, cx, cy = [], 27, 9, 50, 22
    n, gap = 7, 4.0
    for i in range(n):
        a0, a1 = i * 360/n + gap/2, (i + 1) * 360/n - gap/2
        x0, y0 = cx + rx*math.cos(math.radians(a0)), cy + ry*math.sin(math.radians(a0))
        x1, y1 = cx + rx*math.cos(math.radians(a1)), cy + ry*math.sin(math.radians(a1))
        large = 1 if (a1 - a0) % 360 > 180 else 0
        els.append(cell(f"M{x0:.2f},{y0:.2f} A{rx},{ry} 0 {large},1 {x1:.2f},{y1:.2f}",
                        i % 6, sw=5))
    els.append(cell(
        f'{circle_path(50,60,26)} {circle_path(50,60,4.4)}', "brand"))
    els.append(cell(f'{circle_path(50,60,18)}', "ground", sw=2))
    return els

def render_glass(els, palette=None, brand=None, mono=False):
    out = []
    for e in els:
        if e["tone"] == "ground":
            # the knocked-out groove: only meaningful in mono, where it reads against fill
            fill, stroke = "none", "var(--lead,#0A0C0F)"
        elif mono:
            fill = stroke = "currentColor"
        else:
            c = brand if e["tone"] == "brand" else palette[e["tone"]]
            fill = stroke = c
        if e["sw"]:
            out.append(f'<path d="{e["d"]}" fill="none" stroke="{stroke}" '
                       f'stroke-width="{e["sw"]}" stroke-linecap="butt"/>')
        else:
            out.append(f'<path d="{e["d"]}" fill="{fill}" fill-rule="evenodd"/>')
    return "".join(out)

GLASS = [
    dict(id="rosette", name="Rosette", els=rosette(),
         idea="The record as a rose window — two rings of glass around a yellow label, which is where the brand colour anchors so the mark still reads yellow when the detail collapses.",
         mono="Identical geometry, one fill. The inset gaps that were lead lines become the drawing, so the mono cut is a leaded disc rather than a different mark.",
         note="Redeems the mark I told you to drop. As a one-colour line drawing the rose window became a gear; as glass it has a reason for the spokes to exist."),
    dict(id="lancet", name="Lancet", els=lancet(),
         idea="Solid stone tracery with the glass set into the opening — how a window is actually built. The first version glazed the frame itself and it read as a dashed outline with the arch nowhere; making the frame solid gave the silhouette back and gave the interior something to hold.",
         mono="The strongest small-size performer of the three, because the solid arch carries the shape even after the glass cells inside have merged into a blob.",
         note="Keeps the Wurlitzer alibi and the square-tile fit from the first pass, and finally answers what the arch is supposed to contain."),
    dict(id="nimbus-glass", name="Nimbus in glass", els=nimbus_glass(),
         idea="The halo segmented into seven pieces of glass; the record below left whole. The only place the spectrum goes is the halo — the thing that is supposed to be made of light.",
         mono="Reverts exactly to the Nimbus mark from the first pass. Not an approximation of it: the same file with one fill swapped.",
         note="The important one. It means the glass idea doesn’t compete with the leading candidate — it’s a dress for it, so you can have both without maintaining two identities."),
]

# ---- standalone SVG files ----------------------------------------------------

for m in MARKS:
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" '
           f'width="100" height="100" fill="currentColor" role="img" '
           f'aria-label="Holy Grails {m["name"]} mark">'
           f'<title>Holy Grails — {m["name"]}</title>'
           + (f"<defs>{m['defs']}</defs>" if m["defs"] else "")
           + m["body"] + '</svg>\n')
    (OUT_SVG / f'{m["id"]}.svg').write_text(svg)

def wrap(body, label):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" '
            f'width="100" height="100" role="img" aria-label="Holy Grails {label}">'
            f'<title>Holy Grails — {label}</title>{body}</svg>\n')

for g in GLASS:
    (OUT_SVG / f'glass-{g["id"]}.svg').write_text(
        wrap(render_glass(g["els"], SPECTRUM_DARK, BRAND["dark"]), f'{g["name"]} (glass)'))
    (OUT_SVG / f'glass-{g["id"]}-light.svg').write_text(
        wrap(render_glass(g["els"], SPECTRUM_LIGHT, BRAND["light"]),
             f'{g["name"]} (glass, light ground)'))
    (OUT_SVG / f'glass-{g["id"]}-mono.svg').write_text(
        wrap(render_glass(g["els"], mono=True).replace('<svg', '<svg fill="currentColor"'),
             f'{g["name"]} (one colour)'))

print(f"regenerated {len(MARKS)} marks + {len(GLASS)} glass sets in {OUT_SVG}")
