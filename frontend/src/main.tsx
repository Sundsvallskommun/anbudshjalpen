// Order is cascade order: the layer statement, Astryx's reset and components, the built theme, then ours.
import "./layers.css";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "./theme/built/eneo.css";
import "./app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { AppProviders } from "./AppProviders";
import { createQueryClient } from "./queryClient";

const root = document.getElementById("root");
if (!root) throw new Error("Element #root saknas i index.html");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders queryClient={createQueryClient()}>
        <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);
