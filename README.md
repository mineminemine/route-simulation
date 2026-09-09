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

New category cutoffs are estimated from route distance using these reference
points:

| Distance | Default cutoff |
| --- | ---: |
| 5 km | 1 hour |
| 10 km | 1 hour 30 minutes |
| 21.1 km (half marathon) | 3 hours |
| 42 km | 6 hours |
| 50 km | 16 hours |
| 70 km | 23 hours |
| 160.934 km (100 miles) | 36 hours |

Distances between the reference points are interpolated. The resulting cutoff
is an editable default, so each category can still be adjusted manually.

## Simulation Speed

The simulation speed controls how quickly simulated time advances while the
simulation is playing:

- `1x`: one real second equals one simulated second.
- `60x`: one real second equals one simulated minute.
- `300x`: one real second equals five simulated minutes.

The control ranges from `1x` to `300x`, with a default of `60x`.

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

## Deploying to GitHub Pages

The repository includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml`. It builds the app as a static export and deploys the generated `out/` directory to GitHub Pages whenever changes are pushed to `main`.

To enable it in GitHub:

1. Open the repository's **Settings**.
2. Go to **Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push to `main` or run the **Deploy to GitHub Pages** workflow manually.

For this repository, the project site will be available at:

```text
https://mineminemine.github.io/route-simulation/
```

The build automatically uses the repository name as the URL base path in GitHub Actions. Local development continues to use `http://localhost:3000/`. A custom base path can be supplied with the `PAGES_BASE_PATH` environment variable.

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
- An internet connection is required to load the OpenStreetMap map tiles.
