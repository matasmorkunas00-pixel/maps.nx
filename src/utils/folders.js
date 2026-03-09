import { GPX_FOLDER_STORAGE_KEY } from "../constants";

export function normalizeFolderName(value, fallback = "Imported") {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || fallback;
}

export function appendFolderName(currentFolders, folderName) {
  const normalizedFolder = normalizeFolderName(folderName, "");
  if (!normalizedFolder) return Array.isArray(currentFolders) ? currentFolders : [];

  const folders = Array.isArray(currentFolders)
    ? currentFolders.map((folder) => normalizeFolderName(folder, "")).filter(Boolean)
    : [];

  return folders.includes(normalizedFolder) ? folders : [...folders, normalizedFolder];
}

export function loadStoredFolderNames() {
  try {
    const raw = localStorage.getItem(GPX_FOLDER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.from(
      new Set((Array.isArray(parsed) ? parsed : []).map((folder) => normalizeFolderName(folder, "")).filter(Boolean))
    );
  } catch {
    return [];
  }
}
