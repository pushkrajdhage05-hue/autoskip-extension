/**
 * AutoSkip — content script
 * Strategy: site-specific selectors first (fast, precise),
 * generic text matching as fallback (works on any streaming site).
 * Watches the DOM with a MutationObserver + a 1s interval safety net.
 */

(() => {
  "use strict";

  // ------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------
  const DEFAULTS = {
    enabled: true,       // master switch
    skipIntro: true,
    skipRecap: true,
    skipCredits: true,
    nextEpisode: false   // binge mode — user can flip it on
  };

  let settings = { ...DEFAULTS };

  chrome.storage.sync.get(DEFAULTS, (stored) => {
    settings = { ...DEFAULTS, ...stored };
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in settings) settings[key] = newValue;
    }
  });

  // ------------------------------------------------------------------
  // Feature categories
  // ------------------------------------------------------------------
  // Each detected button is mapped to one of these keys, which must be
  // enabled (along with the master switch) before we click it.
  const CATEGORY = {
    INTRO: "skipIntro",
    RECAP: "skipRecap",
    CREDITS: "skipCredits",
    NEXT: "nextEpisode"
  };

  // ------------------------------------------------------------------
  // Site-specific selectors (checked first)
  // ------------------------------------------------------------------
  const SITE_RULES = [
    {
      hosts: ["netflix.com"],
      rules: [
        { selector: '[data-uia="player-skip-intro"]', category: CATEGORY.INTRO },
        { selector: '[data-uia="player-skip-recap"]', category: CATEGORY.RECAP },
        { selector: '[data-uia="player-skip-preplay"]', category: CATEGORY.INTRO },
        { selector: '[data-uia="watch-credits-seamless-button"]', category: CATEGORY.CREDITS },
        { selector: '[data-uia="next-episode-seamless-button"]', category: CATEGORY.NEXT },
        { selector: '[data-uia="next-episode-seamless-button-draining"]', category: CATEGORY.NEXT }
      ]
    },
    {
      hosts: ["hotstar.com", "jiocinema.com", "jiohotstar.com"],
      rules: [
        // Hotstar/Jio class names churn often; rely mostly on text matching,
        // but these aria-label patterns have been stable.
        { selector: 'button[aria-label*="Skip" i]', category: "BY_TEXT" }
      ]
    },
    {
      hosts: ["primevideo.com", "amazon.com", "amazon.in"],
      rules: [
        { selector: ".atvwebplayersdk-skipelement-button", category: "BY_TEXT" },
        { selector: ".skipElement", category: "BY_TEXT" },
        { selector: ".atvwebplayersdk-nextupcard-button", category: CATEGORY.NEXT }
      ]
    },
    {
      hosts: ["disneyplus.com"],
      rules: [
        { selector: '[data-testid="skip-credits"]', category: CATEGORY.CREDITS },
        { selector: 'button[aria-label*="Skip" i]', category: "BY_TEXT" }
      ]
    },
    {
      hosts: ["max.com", "hbomax.com"],
      rules: [
        { selector: '[data-testid="player-ux-skip-button"]', category: "BY_TEXT" }
      ]
    },
    {
      hosts: ["sonyliv.com", "zee5.com", "aha.video", "sunnxt.com"],
      rules: [
        { selector: 'button[aria-label*="Skip" i]', category: "BY_TEXT" }
      ]
    }
  ];

  // ------------------------------------------------------------------
  // Generic text matching (fallback — makes it work everywhere)
  // ------------------------------------------------------------------
  // Deliberately curated phrases. We never match a bare "skip" to avoid
  // clicking unrelated UI (surveys, ad dialogs, tutorials).
  const TEXT_PATTERNS = [
    { re: /^skip\s*(intro|opening|song|title\s*sequence)$/i, category: CATEGORY.INTRO },
    { re: /^skip\s*recap$/i, category: CATEGORY.RECAP },
    { re: /^skip\s*(credits?|outro|preview)$/i, category: CATEGORY.CREDITS },
    { re: /^(next\s*episode|play\s*next)$/i, category: CATEGORY.NEXT },
    // Hindi (JioHotstar and friends)
    { re: /इंट्रो\s*(छोड़ें|स्किप)/i, category: CATEGORY.INTRO },
    { re: /रीकैप\s*(छोड़ें|स्किप)/i, category: CATEGORY.RECAP },
    { re: /अगला\s*एपिसोड/i, category: CATEGORY.NEXT }
  ];

  // Candidate elements for text matching — anything remotely clickable.
  const CLICKABLE_SELECTOR =
    'button, [role="button"], a, [tabindex], [class*="skip" i], [class*="Skip"]';

  // ------------------------------------------------------------------
  // Click machinery
  // ------------------------------------------------------------------
  const COOLDOWN_MS = 5000; // per category, prevents click spam
  const lastClick = {};      // category -> timestamp

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || +style.opacity === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    // Must be at least partially inside the viewport
    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
      rect.left < (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  function categoryFromText(el) {
    const text = (el.textContent || el.getAttribute("aria-label") || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || text.length > 40) return null; // real skip buttons are short
    for (const { re, category } of TEXT_PATTERNS) {
      if (re.test(text)) return category;
    }
    return null;
  }

  function tryClick(el, category) {
    if (!settings.enabled) return false;
    if (!category || !settings[category]) return false;

    const now = Date.now();
    if (lastClick[category] && now - lastClick[category] < COOLDOWN_MS) return false;
    if (!isVisible(el)) return false;

    lastClick[category] = now;
    try {
      el.click();
      // Some players listen for pointer events rather than click()
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    } catch (_) {
      /* silent by design */
    }
    return true;
  }

  function activeSiteRules() {
    const host = location.hostname.replace(/^www\./, "");
    for (const site of SITE_RULES) {
      if (site.hosts.some((h) => host === h || host.endsWith("." + h))) {
        return site.rules;
      }
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Scan
  // ------------------------------------------------------------------
  let scanQueued = false;

  function scan() {
    scanQueued = false;
    if (!settings.enabled) return;

    // 1. Site-specific rules
    const rules = activeSiteRules();
    if (rules) {
      for (const { selector, category } of rules) {
        let els;
        try {
          els = document.querySelectorAll(selector);
        } catch (_) {
          continue;
        }
        for (const el of els) {
          const cat = category === "BY_TEXT" ? categoryFromText(el) : category;
          if (tryClick(el, cat)) return; // one click per scan is plenty
        }
      }
    }

    // 2. Generic text matching (all sites, including mapped ones as fallback)
    const candidates = document.querySelectorAll(CLICKABLE_SELECTOR);
    for (const el of candidates) {
      const cat = categoryFromText(el);
      if (cat && tryClick(el, cat)) return;
    }
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    // Coalesce bursts of mutations into a single scan on the next frame
    requestAnimationFrame(scan);
  }

  // MutationObserver — fires when the player injects the button
  const observer = new MutationObserver(queueScan);

  function startObserving() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
      queueScan();
    } else {
      // document_idle should guarantee body exists, but be safe
      document.addEventListener("DOMContentLoaded", startObserving, { once: true });
    }
  }

  startObserving();

  // Safety-net interval — catches anything the observer misses
  // (canvas-adjacent overlays, shadow-root re-renders, SPA route changes)
  setInterval(() => {
    if (settings.enabled) queueScan();
  }, 1000);
})();
