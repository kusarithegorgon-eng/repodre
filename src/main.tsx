import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { StudioPage } from "./pages/StudioPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="dark">
      <StudioPage />
    </div>
  </StrictMode>,
);
