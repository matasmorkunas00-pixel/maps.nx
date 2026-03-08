# Gravel Planner

Route planning app built with React, Vite, MapLibre, and OpenRouteService.

## Development

```bash
npm run dev
```

## Apple Satellite

To use Apple satellite imagery for the `Satellite` mode, add a MapKit JS token to your Vite env:

```bash
VITE_APPLE_MAPKIT_JS_TOKEN=your_mapkit_js_jwt
```

Without that token, the app falls back to the existing non-Apple satellite tiles.

## Supabase GPX Sync

The app can now save uploaded GPX files per user with Supabase.

### 1. Create a Supabase project

Create a project in Supabase, then copy:

- Project URL
- anon/public API key

### 2. Run the SQL setup

In the Supabase SQL editor, run:

`supabase/setup.sql`

That creates:

- `public.gpx_routes`
- row-level security policies
- private storage bucket `gpx-files`
- storage policies so each user can only access their own files

### 3. Add env vars

Copy `.env.example` to `.env` and fill in:

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Sign in from the app

Open the GPX library panel and enter your email. The app sends a magic sign-in link using Supabase Auth. Once signed in, new GPX uploads are stored in your Supabase account instead of only in browser storage.

Notes:

- signed-out uploads still stay local in browser storage
- signed-in uploads are saved to Supabase Storage + Postgres metadata
- current implementation syncs imported GPX library only, not saved planner routes

## Build

```bash
npm run build
```
