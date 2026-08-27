import { gpx } from "@tmcw/togeojson";

export interface RoutePoint {
  lat: number;
  lng: number;
  elevationM: number;
  cumulativeDistanceKm: number;
  cumulativeEffortKm: number;
}

// Haversine formula to compute distance between two lat/lng points in km
function haversineDistance(
  coord1: [number, number],
  coord2: [number, number],
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const dLng = ((coord2[0] - coord1[0]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1[1] * Math.PI) / 180) *
      Math.cos((coord2[1] * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function parseAndNormalizeGPX(xmlText: string): RoutePoint[] {
  const parser = new DOMParser();
  const gpxDoc = parser.parseFromString(xmlText, "text/xml");
  const geojson = gpx(gpxDoc);

  const rawCoordinates: [number, number, number?][] = [];

  // Extract coordinates from LineString features
  geojson.features.forEach((feature) => {
    if (feature.geometry.type === "LineString") {
      rawCoordinates.push(
        ...(feature.geometry.coordinates as [number, number, number?][]),
      );
    }
  });

  if (rawCoordinates.length === 0) return [];

  let totalDist = 0;
  let totalEffort = 0;
  const routePoints: RoutePoint[] = [
    {
      lat: rawCoordinates[0][1],
      lng: rawCoordinates[0][0],
      elevationM: rawCoordinates[0][2] ?? 0,
      cumulativeDistanceKm: 0,
      cumulativeEffortKm: 0,
    },
  ];

  for (let i = 1; i < rawCoordinates.length; i++) {
    const prev = rawCoordinates[i - 1];
    const curr = rawCoordinates[i];
    const dist = haversineDistance([prev[0], prev[1]], [curr[0], curr[1]]);
    totalDist += dist;
    const elevationChangeM = (curr[2] ?? 0) - (prev[2] ?? 0);
    const grade = dist > 0 ? elevationChangeM / (dist * 1000) : 0;
    const terrainFactor = Math.min(
      1.8,
      1 + Math.max(0, grade) * 2.5 + Math.max(0, -grade) * 0.5,
    );
    totalEffort += dist * terrainFactor;
    routePoints.push({
      lat: curr[1],
      lng: curr[0],
      elevationM: curr[2] ?? 0,
      cumulativeDistanceKm: totalDist,
      cumulativeEffortKm: totalEffort,
    });
  }

  return routePoints;
}
