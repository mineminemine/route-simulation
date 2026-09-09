# Route Simulation

Route Simulation is a browser-based race simulator built with Next.js. Upload one or more GPX routes, configure each route as a race category, and watch simulated participants move along the routes on an interactive map.

## Features

- Upload one or more GPX files by clicking the upload area or dragging files onto it.
- Display routes on a MapLibre map using OpenStreetMap tiles.
- Generate simulated participants for walking, running, or cycling categories.
- Configure participant count, activity, start date/time, cutoff, and category color.
- Play, pause, reset, scrub, and change the simulation speed.
- View route distance, elevation gain/loss, fastest and slowest estimated times, and DNFs.
- Use independent start times and cutoff times for each category.

## Timing Model

GPX tracks are normalized into route points containing coordinates, distance, elevation, and cumulative effort distance.

The effort calculation follows a Naismith-style equivalent-distance model:

- Flat distance contributes normally.
- Ascent adds approximately 8 km of equivalent effort per kilometre climbed.
- Moderate descents reduce equivalent effort.
- Steep descents add effort to account for caution and slower movement.

Participant speeds are generated from activity-specific distributions. Longer routes apply a fatigue adjustment. The resulting effort distance and participant speed determine estimated finish times and positions.

This is a simulation model rather than a prediction of an individual athlete's performance. It does not currently model stops, route-specific delays, weather, or persistence between sessions.

## Getting Started

### Requirements

- Node.js
- pnpm 11 or a compatible pnpm version

### Install dependencies

```bash
pnpm install
```

### Start the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

### Production build

```bash
pnpm build
pnpm start
```

### Lint

```bash
pnpm lint
```

## Project Structure

```text
app/
  page.tsx                 Application entrypoint
  layout.tsx               Root layout and metadata
  globals.css              Global styles and Tailwind setup
components/
  RaceSimulator.tsx        Map, controls, simulation state, and animation
lib/
  gpx.ts                   GPX parsing, distance, elevation, and effort logic
public/                    Static assets
```

## Notes

- GPX files are parsed in the browser and are not uploaded to a server.
- Each uploaded GPX file becomes an independent category.
- A category's cutoff applies only to that category's participants.
- The playback timeline is shared, and runs until the latest category endpoint.
- Map tiles are provided by OpenStreetMap and displayed through MapLibre GL.
