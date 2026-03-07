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

## Build

```bash
npm run build
```
