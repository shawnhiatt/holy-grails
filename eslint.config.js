import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Lint config with two jobs:
 *   1. Baseline correctness (eslint + typescript-eslint recommended, react-hooks)
 *   2. Mechanical enforcement of the CLAUDE.md guardrails — the "never do X"
 *      rules that used to live only in documentation. Each guardrail cites
 *      the CLAUDE.md section it enforces; if you need an exception, that's a
 *      CLAUDE.md discussion, not an eslint-disable.
 */
export default tseslint.config(
  {
    ignores: ["dist/", "convex/_generated/", "node_modules/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Classic hooks rules only. The v6 compiler-era rules (refs,
      // set-state-in-effect, purity, static-components, …) flag ~80
      // long-standing deliberate patterns (anchorRefs render-sync, hydration
      // effects); enabling them is a dedicated refactor pass, not a lint
      // config change.
      "react-hooks/rules-of-hooks": "error",
      // Warn, not error: several dep arrays are hand-tuned on purpose
      // (documented once-per-session effects). New code should still listen.
      "react-hooks/exhaustive-deps": "warn",

      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // 46 pre-existing `any`s (catch clauses, Discogs API payloads).
      // Cleaning them is backlog work; blocking CI on them now would just
      // invite `any`-shaped suppressions.
      "@typescript-eslint/no-explicit-any": "off",

      /* ── CLAUDE.md guardrails ── */

      // Tech Stack: icons come from the shim, motion from "motion/react",
      // zxing-wasm is dynamically imported by the barcode scanner only.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lucide-react",
              message: "lucide-react was removed. Import icons from src/app/components/icons.ts.",
            },
            {
              name: "framer-motion",
              message: 'Import motion APIs from "motion/react" (see Tech Stack in CLAUDE.md).',
            },
            {
              name: "zxing-wasm",
              message: "zxing-wasm must be lazy-loaded via dynamic import in the barcode scanner only (see Tech Stack in CLAUDE.md).",
            },
          ],
          patterns: [
            {
              group: ["@phosphor-icons/react", "@phosphor-icons/react/*"],
              message: "Import icons from the shim src/app/components/icons.ts, never from @phosphor-icons/react directly (see Tech Stack in CLAUDE.md).",
            },
          ],
        },
      ],

      // Data Architecture: no localStorage/sessionStorage outside the
      // whitelisted uses (overrides below).
      "no-restricted-globals": [
        "error",
        {
          name: "localStorage",
          message: "localStorage is only permitted for hg_session_token + hg_accounts (app-context) and hg_install_nudge_dismissed (install-nudge). See CLAUDE.md.",
        },
        {
          name: "sessionStorage",
          message: "sessionStorage is only permitted for hg_oauth_token_secret in oauth-helpers/auth-callback. See CLAUDE.md.",
        },
      ],

      "no-restricted-syntax": [
        "error",
        // Same storage rule for the window.* spelling
        {
          selector: 'MemberExpression[object.name="window"][property.name=/^(localStorage|sessionStorage)$/]',
          message: "Web storage is restricted to the whitelisted files. See CLAUDE.md.",
        },
        // Outbound Discogs links: every redirect strategy failed in the
        // installed iOS PWA. Absolute rule, no exceptions.
        {
          selector: 'JSXAttribute[name.name="href"] Literal[value=/discogs\\.com/]',
          message: "No discogs.com hrefs anywhere in the app — the Discogs Universal Link strands installed-PWA users. See 'Outbound Discogs links' in CLAUDE.md.",
        },
        // Biased shuffle: use shuffle()/pickRandom() from utils/shuffle.
        {
          selector: 'CallExpression[callee.property.name="sort"] CallExpression[callee.object.name="Math"][callee.property.name="random"]',
          message: "Math.random() in a sort comparator is a biased shuffle. Use shuffle() from src/app/utils/shuffle.ts.",
        },
        // iOS Safari: 100vh via h-screen includes the browser chrome.
        {
          selector: "Literal[value=/\\bh-screen\\b/]",
          message: "Never use h-screen — use 100dvh (or .app-viewport for the app root). See 'Full-Screen Viewport Height' in CLAUDE.md.",
        },
      ],
    },
  },
  // The icon shim is the ONE place @phosphor-icons/react may be imported.
  {
    files: ["src/app/components/icons.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  // localStorage whitelist (see CLAUDE.md "localStorage is permitted in three
  // places" — hg_session_token + hg_accounts here, hg_install_nudge_dismissed
  // in install-nudge). app-context also defensively clears the OAuth
  // sessionStorage key on sign-out/data-wipe, so both storages are allowed here.
  {
    files: ["src/app/components/app-context.tsx"],
    rules: {
      "no-restricted-globals": "off",
    },
  },
  {
    files: ["src/app/components/install-nudge.tsx"],
    rules: {
      "no-restricted-globals": ["error", { name: "sessionStorage", message: "sessionStorage is not permitted here." }],
    },
  },
  // Grandfathered exception to the no-discogs.com-hrefs rule: the pre-auth
  // "Sign up" link on the splash screen (users need a Discogs account to log
  // in at all). Everything post-auth stays banned.
  {
    files: ["src/app/components/splash-screen.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: 'CallExpression[callee.property.name="sort"] CallExpression[callee.object.name="Math"][callee.property.name="random"]',
          message: "Math.random() in a sort comparator is a biased shuffle. Use shuffle() from src/app/utils/shuffle.ts.",
        },
        {
          selector: "Literal[value=/\\bh-screen\\b/]",
          message: "Never use h-screen — use 100dvh. See 'Full-Screen Viewport Height' in CLAUDE.md.",
        },
      ],
    },
  },
  // sessionStorage whitelist (hg_oauth_token_secret during the OAuth redirect)
  {
    files: [
      "src/app/components/oauth-helpers.ts",
      "src/app/components/auth-callback.tsx",
    ],
    rules: {
      "no-restricted-globals": ["error", { name: "localStorage", message: "localStorage is not permitted here." }],
    },
  },
  // Convex functions and node scripts: no React hooks rules, storage APIs n/a
  {
    files: ["convex/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  }
);
