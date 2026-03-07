const APPLE_MAPKIT_SCRIPT_ID = "apple-mapkit-js";
const APPLE_MAPKIT_SRC = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.core.js";

let scriptLoadPromise = null;
let initializedToken = null;

function loadScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Apple MapKit JS can only load in the browser."));
  }

  if (window.mapkit) return Promise.resolve(window.mapkit);
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(APPLE_MAPKIT_SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.mapkit), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Apple MapKit JS.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = APPLE_MAPKIT_SCRIPT_ID;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = APPLE_MAPKIT_SRC;
    script.dataset.libraries = "map";
    script.addEventListener("load", () => resolve(window.mapkit), { once: true });
    script.addEventListener("error", () => reject(new Error("Failed to load Apple MapKit JS.")), { once: true });
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export async function loadAppleMapKit(token) {
  if (!token) throw new Error("Missing Apple MapKit JS token.");

  const mapkit = await loadScript();
  if (!mapkit) throw new Error("Apple MapKit JS did not initialize.");

  if (initializedToken !== token) {
    mapkit.init({
      authorizationCallback: (done) => done(token),
    });
    initializedToken = token;
  }

  return mapkit;
}
