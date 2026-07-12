"use client";

import { useEffect } from "react";
import { useAppState } from "@/lib/store";

/**
 * Reads the current user's Looks preferences (theme + background)
 * from the local store and applies them to the document. Mounted
 * once at the layout root so every page picks up the settings.
 *
 * Applies:
 *   - `data-theme="dark"` on <html> when theme=dark; removed for
 *     light so the CSS in globals.css picks the right variable set.
 *   - background-color / background-image inline on <body>:
 *       * bgImage (if set) wins — used for uploads + presets
 *       * bgColor comes next
 *       * both cleared → CSS var default from globals.css
 *
 * Runs client-only so SSR doesn't try to touch document.
 */
export default function LooksApplier() {
  const { profile } = useAppState();

  useEffect(() => {
    if (typeof document === "undefined") return;

    // Theme
    if (profile.theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    // Background — reset then apply whichever knob is set.
    // profile.bgImage is stored as a full CSS `background-image`
    // value (linear-gradient(...) for presets, url("data:...") for
    // uploads), so we assign it directly without wrapping. The Looks
    // tab is responsible for producing a valid CSS value.
    const body = document.body;
    body.style.backgroundColor = "";
    body.style.backgroundImage = "";
    body.style.backgroundSize = "";
    body.style.backgroundPosition = "";
    body.style.backgroundAttachment = "";
    if (profile.bgImage) {
      body.style.backgroundImage = profile.bgImage;
      body.style.backgroundSize = "cover";
      body.style.backgroundPosition = "center";
      body.style.backgroundAttachment = "fixed";
    } else if (profile.bgColor) {
      body.style.backgroundColor = profile.bgColor;
    }
  }, [profile.theme, profile.bgColor, profile.bgImage]);

  return null;
}
