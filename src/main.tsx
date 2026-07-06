import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { IconContext } from "./app/components/icons";
import App from "./app/App.tsx";
import "./styles/index.css";

// Error monitoring boots lazily and only when a DSN is configured — the
// Sentry SDK stays out of the main bundle and out of DSN-less environments.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  import("./app/lib/monitoring").then((m) => m.initMonitoring(sentryDsn));
}

const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  document.getElementById("root")!.innerHTML =
    '<div style="padding:40px;font-family:monospace;color:#FF33B6">' +
    "<h2>Missing VITE_CONVEX_URL</h2>" +
    "<p>Set <code>VITE_CONVEX_URL</code> in your <code>.env.local</code> file to connect to Convex.</p>" +
    "<p>Run <code>npx convex dev</code> to start a deployment and get your URL.</p>" +
    "</div>";
  throw new Error("VITE_CONVEX_URL environment variable is required");
}

const convex = new ConvexReactClient(convexUrl);

createRoot(document.getElementById("root")!).render(
  <ConvexProvider client={convex}>
    {/* Phosphor defaults matching Lucide's implicit ones: 24px, regular weight.
        Phosphor's own default size is 1em — size 24 here is required for parity. */}
    <IconContext.Provider value={{ size: 24, weight: "regular" }}>
      <App />
    </IconContext.Provider>
  </ConvexProvider>
);
