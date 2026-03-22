import { initProductionGuard } from "./lib/production-guard";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Activate production guards before React renders.
// Blocks accidental localhost requests and neutralizes any stale Vite HMR artifacts.
initProductionGuard();

createRoot(document.getElementById("root")!).render();