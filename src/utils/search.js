import { MAPTILER_API_KEY } from "../constants";

const SEARCH_RESULT_LIMIT = 8;

export function normalizeMapTilerFeatures(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  return features.filter((feature) => Array.isArray(feature?.center) && feature.center.length === 2);
}

export function normalizeNominatimFeatures(payload) {
  const items = Array.isArray(payload) ? payload : [];
  return items
    .filter((item) => Number.isFinite(Number(item?.lon)) && Number.isFinite(Number(item?.lat)))
    .map((item) => {
      const primary =
        item?.namedetails?.name ||
        item?.name ||
        (typeof item?.display_name === "string" ? item.display_name.split(",")[0]?.trim() : "") ||
        "Unnamed place";
      return {
        id: `nominatim-${item.place_id || `${item.lon}-${item.lat}`}`,
        center: [Number(item.lon), Number(item.lat)],
        text: primary,
        place_name: item.display_name || primary,
      };
    });
}

export async function fetchSearchResults(query, signal) {
  const providers = [];

  if (MAPTILER_API_KEY) {
    providers.push(async () => {
      const response = await fetch(
        `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_API_KEY}&autocomplete=true&fuzzyMatch=true&limit=${SEARCH_RESULT_LIMIT}&types=address,poi,place,locality,neighborhood,street`,
        { signal }
      );
      if (!response.ok) throw new Error(`MapTiler search failed (${response.status})`);
      const payload = await response.json();
      return normalizeMapTilerFeatures(payload);
    });
  }

  providers.push(async () => {
    const language = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en";
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=${SEARCH_RESULT_LIMIT}&addressdetails=1&namedetails=1&extratags=1&accept-language=${encodeURIComponent(language)}`,
      { signal }
    );
    if (!response.ok) throw new Error(`Nominatim search failed (${response.status})`);
    const payload = await response.json();
    return normalizeNominatimFeatures(payload);
  });

  let features = [];
  let allFailed = true;
  for (const runSearch of providers) {
    try {
      const found = await runSearch();
      allFailed = false;
      if (found.length) {
        features = found;
        break;
      }
    } catch (providerError) {
      if (providerError?.name === "AbortError") throw providerError;
    }
  }

  if (allFailed) throw new Error("All search providers failed");
  return features;
}
