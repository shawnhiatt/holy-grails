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

You'll bump this rarely. `1.0.0` is a reasonable target once the app feels genuinely complete for daily use.

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

## How to cut a release

1. **`package.json` is the single source of truth.** Settings → About and the bug-report diagnostics both import `version` from it, so bumping it there updates the app. Run `npm install --package-lock-only` so the lockfile matches. Also update the version in the `CLAUDE.md` title and the README Status line.
2. **Rename `## [Unreleased]` in `CHANGELOG.md`** to `## [X.Y.Z] — YYYY-MM-DD` and open a fresh empty `[Unreleased]` above it.
3. **Merge to `main`, then tag the merge commit** with an annotated tag and push it:
   ```bash
   git tag -a vX.Y.Z -m "Holy Grails X.Y.Z" && git push origin vX.Y.Z
   ```
   Tags started at `v0.8.0` (`v0.7.0` was tagged retroactively on the commit that bumped it). Tag every release from here on — bug reports carry the version string, and a tag is what turns "0.8.0" back into a commit.

---

## Roadmap Reference

| Version | What it represents |
|---|---|
| `0.2.4` | Post-deploy, all infrastructure phases complete |
| `0.3.0` | Wantlist writes ship |
| `0.4.0` | Security, performance & polish |
| `0.5.x` | Add/remove from collection, Insights rankings, Holy Grails social layer |
| `0.6.0` | Strict TypeScript and CI |
| `0.6.1` | All formats, cover scan, gray retheme |
| `0.7.0` | In-app bug reports |
| `0.8.0` | Session Builder, desktop layout pass, September bug hunt — first tagged release |
| `1.0.0` | App feels complete for daily use, validated by the beta (see `docs/BETA-PLAYBOOK.md`). Also the gate for starting the native app (`docs/native-app-plan.md`). |

These are guidelines, not rules. `CHANGELOG.md` is the full record.

---

## Commit Messages

Imperative sentence-case subject that says what changed and, where it fits, why ("Expire sessions after 90 days without use, not 90 days after login"), with a body that explains the reasoning. Version bumps ride in the release commit rather than a separate `bump to` commit.
