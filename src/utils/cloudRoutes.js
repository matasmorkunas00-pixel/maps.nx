import { parseGpxText } from "./gpx";
import { uid } from "./geo";
import { getDefaultRouteColor, normalizeImportedRoute } from "./routes";
import { GPX_FILES_BUCKET, GPX_ROUTES_TABLE, supabase } from "./supabase";

function ensureSupabase() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

function sanitizeFileName(fileName) {
  return String(fileName || "route.gpx")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_");
}

function buildImportedRouteFromRow(row, geoJson, index) {
  return normalizeImportedRoute(
    {
      id: row.id,
      folder: row.folder,
      name: row.name,
      fileName: row.file_name,
      importedAt: row.imported_at,
      color: row.color,
      storagePath: row.storage_path,
      geoJson,
    },
    index
  );
}

export async function listCloudImportedRoutes(userId) {
  const client = ensureSupabase();
  const { data: rows, error } = await client
    .from(GPX_ROUTES_TABLE)
    .select("id, name, folder, file_name, storage_path, color, imported_at")
    .eq("user_id", userId)
    .order("imported_at", { ascending: false });

  if (error) throw error;

  const importedRoutes = await Promise.all(
    (rows || []).map(async (row, index) => {
      try {
        const { data: blob, error: downloadError } = await client
          .storage
          .from(GPX_FILES_BUCKET)
          .download(row.storage_path);
        if (downloadError) throw downloadError;

        const gpxText = await blob.text();
        const parsed = parseGpxText(gpxText);
        if (!parsed) return null;

        return buildImportedRouteFromRow(row, parsed.featureCollection, index);
      } catch (routeError) {
        console.error(`Failed to load GPX route ${row.id}:`, routeError);
        return null;
      }
    })
  );

  return importedRoutes.filter(Boolean);
}

export async function uploadCloudImportedRoute({ userId, file, folder, color, index = 0 }) {
  const client = ensureSupabase();
  const gpxText = await file.text();
  const parsed = parseGpxText(gpxText);
  if (!parsed) throw new Error(`"${file.name}" is not a valid GPX file`);

  const routeId = uid();
  const routeName = parsed.name || file.name.replace(/\.gpx$/i, "") || "Imported GPX";
  const fileName = sanitizeFileName(file.name || `${routeName}.gpx`);
  const storagePath = `${userId}/${routeId}/${fileName}`;

  const { error: uploadError } = await client
    .storage
    .from(GPX_FILES_BUCKET)
    .upload(storagePath, file, {
      upsert: false,
      contentType: file.type || "application/gpx+xml",
      cacheControl: "3600",
    });

  if (uploadError) throw uploadError;

  const row = {
    id: routeId,
    user_id: userId,
    name: routeName,
    folder,
    file_name: fileName,
    storage_path: storagePath,
    color: color || getDefaultRouteColor(index),
    imported_at: new Date().toISOString(),
  };

  const { error: insertError } = await client.from(GPX_ROUTES_TABLE).insert(row);
  if (insertError) {
    await client.storage.from(GPX_FILES_BUCKET).remove([storagePath]);
    throw insertError;
  }

  return buildImportedRouteFromRow(row, parsed.featureCollection, index);
}

export async function updateCloudImportedRouteColor(routeId, color) {
  const client = ensureSupabase();
  const { error } = await client
    .from(GPX_ROUTES_TABLE)
    .update({ color })
    .eq("id", routeId);

  if (error) throw error;
}
