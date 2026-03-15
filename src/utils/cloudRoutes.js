import { parseGpxText } from "./gpx";
import { getDefaultRouteColor, normalizeImportedRoute } from "./routes";
import { GPX_FILES_BUCKET, GPX_FOLDERS_TABLE, GPX_ROUTES_TABLE, SAVED_ROUTES_TABLE, supabase } from "./supabase";

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

function createCloudRouteId() {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }

  throw new Error("Your browser does not support secure UUID generation");
}

function normalizeFolderName(folderName) {
  const trimmed = String(folderName || "").trim();
  return trimmed || "Imported";
}

export function isMissingCloudFoldersTableError(error) {
  const parts = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
  ]
    .map((value) => String(value || ""))
    .join(" ")
    .toLowerCase();

  return parts.includes("gpx_folders") || parts.includes("could not find the table");
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
    .select("id, name, folder, file_name, storage_path, color, imported_at, geo_json")
    .eq("user_id", userId)
    .order("imported_at", { ascending: false });

  if (error) throw error;

  const allRows = rows || [];
  // Fast path: rows with geo_json stored in DB need no storage download
  const fastRows = allRows.filter((r) => r.geo_json);
  const slowRows = allRows.filter((r) => !r.geo_json);

  const fastRoutes = fastRows.map((row, i) =>
    buildImportedRouteFromRow(row, row.geo_json, i)
  );

  // Slow path: legacy rows without geo_json must download from storage
  const DOWNLOAD_BATCH_SIZE = 8;
  const slowRoutes = [];
  for (let i = 0; i < slowRows.length; i += DOWNLOAD_BATCH_SIZE) {
    const batch = slowRows.slice(i, i + DOWNLOAD_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (row, batchIdx) => {
        try {
          const { data: blob, error: downloadError } = await client
            .storage
            .from(GPX_FILES_BUCKET)
            .download(row.storage_path);
          if (downloadError) throw downloadError;

          const gpxText = await blob.text();
          const parsed = parseGpxText(gpxText);
          if (!parsed) return null;

          return buildImportedRouteFromRow(row, parsed.featureCollection, fastRows.length + i + batchIdx);
        } catch (routeError) {
          console.error(`Failed to load GPX route ${row.id}:`, routeError);
          return null;
        }
      })
    );
    slowRoutes.push(...results.filter(Boolean));
  }

  return [...fastRoutes, ...slowRoutes];
}

export async function listCloudFolders(userId) {
  const client = ensureSupabase();
  const { data: rows, error } = await client
    .from(GPX_FOLDERS_TABLE)
    .select("name")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) throw error;

  return Array.from(
    new Set((rows || []).map((row) => normalizeFolderName(row?.name)).filter(Boolean))
  );
}

export async function createCloudFolder({ userId, name, allowMissingTable = false }) {
  const client = ensureSupabase();
  const folderName = normalizeFolderName(name);

  const { error } = await client
    .from(GPX_FOLDERS_TABLE)
    .upsert(
      {
        user_id: userId,
        name: folderName,
      },
      {
        onConflict: "user_id,name",
        ignoreDuplicates: true,
      }
    );

  if (error) {
    if (allowMissingTable && isMissingCloudFoldersTableError(error)) {
      return folderName;
    }
    throw error;
  }
  return folderName;
}

export async function uploadCloudImportedRoute({ userId, file, folder, color, index = 0, parsedData = null }) {
  const client = ensureSupabase();
  // Use pre-parsed data if provided (avoids re-reading the file a second time)
  const parsed = parsedData || parseGpxText(await file.text());
  if (!parsed) throw new Error(`"${file.name}" is not a valid GPX file`);

  const routeId = createCloudRouteId();
  const folderName = normalizeFolderName(folder);
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
    folder: folderName,
    file_name: fileName,
    storage_path: storagePath,
    color: color || getDefaultRouteColor(index),
    imported_at: new Date().toISOString(),
    geo_json: parsed.featureCollection || null,
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

export async function updateCloudImportedRouteFolder(routeId, folder) {
  const client = ensureSupabase();
  const { error } = await client
    .from(GPX_ROUTES_TABLE)
    .update({ folder: normalizeFolderName(folder) })
    .eq("id", routeId);

  if (error) throw error;
}

export async function updateCloudImportedRoutesFolder(routeIds, folder) {
  const client = ensureSupabase();
  const normalizedIds = Array.isArray(routeIds) ? routeIds.filter(Boolean) : [];
  if (!normalizedIds.length) return;

  const { error } = await client
    .from(GPX_ROUTES_TABLE)
    .update({ folder: normalizeFolderName(folder) })
    .in("id", normalizedIds);

  if (error) throw error;
}

export async function deleteCloudImportedRoutes(routes) {
  const client = ensureSupabase();
  const ids = routes.map((r) => r.id).filter(Boolean);
  const storagePaths = routes.map((r) => r.storagePath).filter(Boolean);

  if (!ids.length) return;

  const { error } = await client.from(GPX_ROUTES_TABLE).delete().in("id", ids);
  if (error) throw error;

  if (storagePaths.length) {
    await client.storage.from(GPX_FILES_BUCKET).remove(storagePaths);
  }
}

export async function listCloudSavedRoutes(userId) {
  const client = ensureSupabase();
  const { data: rows, error } = await client
    .from(SAVED_ROUTES_TABLE)
    .select("id, name, routing_mode, waypoints, route_geo_json, distance_km, elevation_gain_m, elevation_loss_m, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (rows || []).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    routingMode: row.routing_mode,
    waypoints: Array.isArray(row.waypoints) ? row.waypoints : [],
    routeGeoJson: row.route_geo_json || null,
    distanceKm: row.distance_km || "0.00",
    elevationGainM: row.elevation_gain_m || "0",
    elevationLossM: row.elevation_loss_m || "0",
  })).filter((r) => r.routeGeoJson);
}

export async function upsertCloudSavedRoute(userId, route) {
  const client = ensureSupabase();
  const { error } = await client
    .from(SAVED_ROUTES_TABLE)
    .upsert({
      id: route.id,
      user_id: userId,
      name: route.name,
      routing_mode: route.routingMode || "default",
      waypoints: route.waypoints || [],
      route_geo_json: route.routeGeoJson,
      distance_km: route.distanceKm,
      elevation_gain_m: route.elevationGainM,
      elevation_loss_m: route.elevationLossM,
      created_at: route.createdAt,
    }, { onConflict: "id" });
  if (error) throw error;
}

export async function deleteCloudSavedRoute(routeId) {
  const client = ensureSupabase();
  const { error } = await client
    .from(SAVED_ROUTES_TABLE)
    .delete()
    .eq("id", routeId);
  if (error) throw error;
}

export async function updateCloudSavedRouteName(routeId, name) {
  const client = ensureSupabase();
  const { error } = await client
    .from(SAVED_ROUTES_TABLE)
    .update({ name })
    .eq("id", routeId);
  if (error) throw error;
}

export async function deleteCloudFolder({ userId, name, allowMissingTable = false }) {
  const client = ensureSupabase();
  const folderName = normalizeFolderName(name);

  const { error } = await client
    .from(GPX_FOLDERS_TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("name", folderName);

  if (error) {
    if (allowMissingTable && isMissingCloudFoldersTableError(error)) {
      return;
    }
    throw error;
  }
}
