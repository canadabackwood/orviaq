"use client";

import { useEffect, useRef } from "react";

const SHELL_URL = "/legacy/orvia-shell.html";
const SCRIPT_URL = "/legacy/app.js";

export default function LegacyOrviaApp() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let script: HTMLScriptElement | null = null;

    async function boot() {
      try {
        const response = await fetch(SHELL_URL, { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load Orvia interface.");
        const markup = await response.text();
        if (cancelled || !rootRef.current) return;

        rootRef.current.innerHTML = markup;
        script = document.createElement("script");
        script.src = SCRIPT_URL;
        script.async = false;
        script.dataset.orviaRuntime = "legacy-compat";
        rootRef.current.appendChild(script);
      } catch (error) {
        if (cancelled || !rootRef.current) return;
        rootRef.current.innerHTML = `
          <main class="next-boot">
            <div class="next-boot-mark">
              <strong>Orvia could not start</strong>
              <span>${error instanceof Error ? error.message : "Unknown startup error."}</span>
            </div>
          </main>
        `;
      }
    }

    boot();

    return () => {
      cancelled = true;
      script?.remove();
    };
  }, []);

  return <div id="orvia-next-root" ref={rootRef} />;
}
