import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { ScraperApp } from "./components/ScraperApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ScraperApp />
    <Toaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        style: {
          background: "#161614",
          color: "#eceae4",
          border: "1px solid #2a2a26",
          fontFamily: "IBM Plex Sans, sans-serif",
        },
      }}
    />
  </StrictMode>,
);
