const DEFAULTS = {
  enabled: true,
  skipIntro: true,
  skipRecap: true,
  skipCredits: true,
  nextEpisode: false
};

const KEYS = Object.keys(DEFAULTS);
const $ = (id) => document.getElementById(id);

function reflectMaster(on) {
  document.body.classList.toggle("off", !on);
  $("status-line").textContent = on ? "Watching for skip buttons" : "Paused";
}

// Load stored settings into the UI
chrome.storage.sync.get(DEFAULTS, (settings) => {
  for (const key of KEYS) {
    $(key).checked = settings[key];
  }
  reflectMaster(settings.enabled);
});

// Persist changes immediately
for (const key of KEYS) {
  $(key).addEventListener("change", (e) => {
    chrome.storage.sync.set({ [key]: e.target.checked });
    if (key === "enabled") reflectMaster(e.target.checked);
  });
}
