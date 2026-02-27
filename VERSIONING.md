# Holy Grails — Versioning Guidelines

Version numbers follow `MAJOR.MINOR.PATCH`. The app launched into production at `0.2.4`, inheriting the iteration count from the Figma Make prototype phase.

---

## What Each Number Means

### MAJOR — `X.0.0`
A fundamental shift in what the app is or does. The kind of thing you'd describe as "Holy Grails can now do something it couldn't do before" at a high level.

Examples:
- Phase 5 shipping (write operations) — app goes from read-only to two-way
- Phase 7 shipping (Look Up) — adds a wholly new mode of use
- A complete visual redesign or rebrand

You'll bump this rarely. `1.0.0` is a reasonable target once the app feels genuinely complete for daily use by both you and Tyler.

### MINOR — `0.X.0`
A meaningful feature addition or behavior change a user would notice and remember. New screens, new settings, new interactions that change how the app works.

Examples:
- Nav restructure (Following/Insights swap)
- Color mode setting
- Want list write operations
- A new screen or major new section within an existing screen
- Any Phase from the transition plan shipping in full

### PATCH — `0.0.X`
Bug fixes, copy corrections, polish, and small UI tweaks. The kind of work that makes the app feel more right without adding anything new.

Examples:
- Stuck "Connecting..." button fix
- Loading screen text alignment
- Toast copy corrections
- Safe area or iOS Safari edge case fixes
- Swapping an icon, adjusting spacing, fixing a truncation bug

---

## When to Bump

Bump the version at the end of a Claude Code session or a logical group of sessions — not mid-session, and not mid-feature. A good gut check: if you'd describe it to someone as "I shipped X," it's worth a version bump.

Don't overthink it. Going `0.2.4 → 0.2.5` after a round of QA fixes is completely appropriate. The number is for you, not an audience.

The version lives in the About section of `settings-screen.tsx`. Update it there and commit with a message like `bump to 0.2.5`.

---

## Roadmap Reference

| Version | What it represents |
|---|---|
| `0.2.4` | Current — post-deploy, all infrastructure phases complete |
| `0.2.5` | QA round: loading screen, nav swap, wantlist copy, color mode, bug fixes |
| `0.3.0` | Phase 5 — write operations ship |
| `0.4.0` | Phase 6 — want list writes ship |
| `0.5.0` | Phase 7 — Look Up feature ships |
| `1.0.0` | App feels complete for daily use — no known bugs, all core phases done |

Adjust as judgment dictates. If Phase 5 ships and it feels like a bigger deal than a minor bump, call it `1.0.0`. These are guidelines, not rules.

---

## Commit Message Convention

Keep it simple:

```
bump to 0.2.5
fix: stuck connecting button on splash screen
feat: color mode setting in appearance
chore: wantlist copy audit
```

No rigid enforcement — just be consistent enough that the git log tells a story.
