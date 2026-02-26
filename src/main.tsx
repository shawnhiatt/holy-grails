import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./app/App.tsx";
import "./styles/index.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

function Root() {
  if (convex) {
    return (
      <ConvexProvider client={convex}>
        <App />
      </ConvexProvider>
    );
  }
  // No Convex URL configured — render app without Convex (demo mode still works)
  return <App />;
}

createRoot(document.getElementById("root")!).render(<Root />);
