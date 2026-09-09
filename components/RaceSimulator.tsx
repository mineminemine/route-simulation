"use client";

import React, { useState, useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { parseAndNormalizeGPX, RoutePoint } from "@/lib/gpx";
import { Play, Pause, RotateCcw, Upload, X } from "lucide-react";

interface Runner {
  id: number;
  speedKmH: number; // Simulated pace
}

type Activity = "walking" | "running" | "cycling";

interface RaceCategory {
  id: string;
  name: string;
  fileName: string;
  route: RoutePoint[];
  distanceKm: number;
  startDateTime: string;
  cutoffMins: number;
  activity: Activity;
  color: string;
  runners: Runner[];
}

const categoryColors = ["#FF1744", "#2563EB", "#16A34A", "#D97706", "#9333EA"];

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function getFastestRunnerId(category: RaceCategory): number | null {
  return category.runners.reduce<number | null>(
    (fastestId, runner) =>
      fastestId === null ||
      runner.speedKmH >
        category.runners.find((candidate) => candidate.id === fastestId)!
          .speedKmH
        ? runner.id
        : fastestId,
    null,
  );
}

function getInvertedColor(color: string): string {
  const channelValues = color
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => parseInt(channel, 16));
  if (!channelValues || channelValues.length !== 3) return color;

  return `#${channelValues
    .map((channel) => (255 - channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function getColorChannels(color: string): number[] | null {
  const channels = color
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => parseInt(channel, 16));
  return channels && channels.length === 3 ? channels : null;
}

function getColorDistance(firstColor: string, secondColor: string): number {
  const first = getColorChannels(firstColor);
  const second = getColorChannels(secondColor);
  if (!first || !second) return 0;

  return Math.sqrt(
    first.reduce(
      (distance, channel, index) => distance + (channel - second[index]) ** 2,
      0,
    ),
  );
}

function getDistinctFastestColor(
  category: RaceCategory,
  categories: RaceCategory[],
): string {
  const inverted = getInvertedColor(category.color);
  const invertedChannels = getColorChannels(inverted);
  if (!invertedChannels) return inverted;

  const candidates = [
    inverted,
    `#${[invertedChannels[1], invertedChannels[2], invertedChannels[0]]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")}`,
    `#${[invertedChannels[2], invertedChannels[0], invertedChannels[1]]
      .map((channel) => channel.toString(16).padStart(2, "0"))
      .join("")}`,
  ];
  const otherColors = categories.flatMap((item) => [
    item.color,
    getInvertedColor(item.color),
  ]);

  return candidates.reduce((best, candidate) => {
    const candidateDistance = Math.min(
      ...otherColors
        .filter((color) => color !== candidate)
        .map((color) => getColorDistance(candidate, color)),
    );
    const bestDistance = Math.min(
      ...otherColors
        .filter((color) => color !== best)
        .map((color) => getColorDistance(best, color)),
    );
    return candidateDistance > bestDistance ? candidate : best;
  });
}

function toDateTimeInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}

function formatCategoryEndTime(category: RaceCategory): string {
  const startMs = Date.parse(category.startDateTime);
  if (!Number.isFinite(startMs)) return "Unavailable";

  return new Date(startMs + category.cutoffMins * 60 * 1000).toLocaleString(
    undefined,
    { dateStyle: "medium", timeStyle: "short" },
  );
}

function getEventStartMs(categories: RaceCategory[]): number {
  const startTimes = categories
    .map((category) => Date.parse(category.startDateTime))
    .filter(Number.isFinite);
  return startTimes.length > 0 ? Math.min(...startTimes) : Date.now();
}

function getCategoryStartSec(
  category: RaceCategory,
  eventStartMs: number,
): number {
  const categoryStartMs = Date.parse(category.startDateTime);
  return Number.isFinite(categoryStartMs)
    ? Math.max(0, (categoryStartMs - eventStartMs) / 1000)
    : 0;
}

function getSimulationEndSec(
  categories: RaceCategory[],
  eventStartMs: number,
): number {
  return categories.reduce((latestEnd, category) => {
    const routeEffortKm =
      category.route[category.route.length - 1].cumulativeEffortKm;
    const lastRunnerFinishSec = Math.max(
      ...category.runners.map(
        (runner) => (routeEffortKm / runner.speedKmH) * 3600,
      ),
      0,
    );
    const categoryEnd = Math.min(category.cutoffMins * 60, lastRunnerFinishSec);
    return Math.max(
      latestEnd,
      getCategoryStartSec(category, eventStartMs) + categoryEnd,
    );
  }, 0);
}

function getRunnerFinishSec(category: RaceCategory, runner: Runner): number {
  return (
    (category.route[category.route.length - 1].cumulativeEffortKm /
      runner.speedKmH) *
    3600
  );
}

function getCategoryDnfCount(category: RaceCategory): number {
  return category.runners.filter(
    (runner) => getRunnerFinishSec(category, runner) > category.cutoffMins * 60,
  ).length;
}

interface PaceGroup {
  weight: number;
  minPaceMinPerKm: number;
  maxPaceMinPerKm: number;
}

interface SpeedGroup {
  weight: number;
  minSpeedKmH: number;
  maxSpeedKmH: number;
}

const paceGroups: PaceGroup[] = [
  { weight: 0.15, minPaceMinPerKm: 6.5, maxPaceMinPerKm: 8 },
  { weight: 0.6, minPaceMinPerKm: 5, maxPaceMinPerKm: 6 },
  { weight: 0.2, minPaceMinPerKm: 4, maxPaceMinPerKm: 5 },
  { weight: 0.05, minPaceMinPerKm: 3.3, maxPaceMinPerKm: 4 },
];

const activitySpeedGroups: Record<
  Exclude<Activity, "running">,
  SpeedGroup[]
> = {
  walking: [
    { weight: 0.2, minSpeedKmH: 3.5, maxSpeedKmH: 4.5 },
    { weight: 0.65, minSpeedKmH: 4.5, maxSpeedKmH: 5.5 },
    { weight: 0.15, minSpeedKmH: 5.5, maxSpeedKmH: 6.5 },
  ],
  cycling: [
    { weight: 0.15, minSpeedKmH: 16, maxSpeedKmH: 20 },
    { weight: 0.65, minSpeedKmH: 20, maxSpeedKmH: 26 },
    { weight: 0.2, minSpeedKmH: 26, maxSpeedKmH: 32 },
  ],
};

const activityLabels: Record<Activity, string> = {
  walking: "Walking",
  running: "Running",
  cycling: "Cycling",
};

function generateRunners(
  numRunners: number,
  distanceKm: number,
  activity: Activity = "running",
): Runner[] {
  const distanceFatigue =
    distanceKm > 10 ? 1 + 0.12 * Math.log(distanceKm / 10) : 1;

  return Array.from({ length: numRunners }, (_, id) => {
    let selection = Math.random();
    let speedKmH: number;

    if (activity === "running") {
      const group =
        paceGroups.find((paceGroup) => {
          selection -= paceGroup.weight;
          return selection <= 0;
        }) ?? paceGroups[paceGroups.length - 1];
      const paceMinPerKm =
        (group.minPaceMinPerKm +
          Math.random() * (group.maxPaceMinPerKm - group.minPaceMinPerKm)) *
        distanceFatigue;
      speedKmH = 60 / paceMinPerKm;
    } else {
      const groups = activitySpeedGroups[activity];
      const group =
        groups.find((speedGroup) => {
          selection -= speedGroup.weight;
          return selection <= 0;
        }) ?? groups[groups.length - 1];
      speedKmH =
        (group.minSpeedKmH +
          Math.random() * (group.maxSpeedKmH - group.minSpeedKmH)) /
        distanceFatigue;
    }

    return {
      id,
      speedKmH,
    };
  });
}

function getElevationStats(route: RoutePoint[]) {
  return route.slice(1).reduce(
    (stats, point, index) => ({
      gain:
        stats.gain + Math.max(0, point.elevationM - route[index].elevationM),
      loss:
        stats.loss + Math.max(0, route[index].elevationM - point.elevationM),
    }),
    { gain: 0, loss: 0 },
  );
}

function getRunnerPosition(
  category: RaceCategory,
  runner: Runner,
  simTimeSec: number,
  eventStartMs: number,
): [number, number] {
  const elapsedSec = Math.min(
    category.cutoffMins * 60,
    Math.max(0, simTimeSec - getCategoryStartSec(category, eventStartMs)),
  );
  const effortTravelled = (runner.speedKmH * elapsedSec) / 3600;
  const totalEffortKm =
    category.route[category.route.length - 1].cumulativeEffortKm;
  const cappedEffort = Math.min(effortTravelled, totalEffortKm);

  for (let index = 0; index < category.route.length - 1; index++) {
    const current = category.route[index];
    const next = category.route[index + 1];
    if (
      cappedEffort >= current.cumulativeEffortKm &&
      cappedEffort <= next.cumulativeEffortKm
    ) {
      const segmentEffort =
        next.cumulativeEffortKm - current.cumulativeEffortKm;
      const ratio =
        segmentEffort > 0
          ? (cappedEffort - current.cumulativeEffortKm) / segmentEffort
          : 0;
      return [
        current.lng + (next.lng - current.lng) * ratio,
        current.lat + (next.lat - current.lat) * ratio,
      ];
    }
  }

  const lastPoint = category.route[category.route.length - 1];
  return [lastPoint.lng, lastPoint.lat];
}

export default function RaceSimulator() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const routeOverlayRef = useRef<SVGSVGElement>(null);
  const runnerDotsRef = useRef<HTMLDivElement>(null);

  // Form Configuration
  const [numRunners, setNumRunners] = useState<number>(100);

  // Route & Simulation State
  const [categories, setCategories] = useState<RaceCategory[]>([]);
  const [simTimeSec, setSimTimeSec] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState<number>(60); // 60x speed
  const [isDraggingFiles, setIsDraggingFiles] = useState<boolean>(false);

  // Initialize MapLibre
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
          route: {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          },
          runners: {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          },
        },
        layers: [
          {
            id: "osm-basemap",
            type: "raster",
            source: "osm",
          },
          {
            id: "route-casing",
            type: "line",
            source: "route",
            paint: {
              "line-color": "#111827",
              "line-width": 14,
              "line-opacity": 1,
            },
            layout: { "line-cap": "round", "line-join": "round" },
          },
          {
            id: "route-line",
            type: "line",
            source: "route",
            paint: { "line-color": "#FF1744", "line-width": 8 },
            layout: { "line-cap": "round", "line-join": "round" },
          },
          {
            id: "runner-dots",
            type: "circle",
            source: "runners",
            paint: {
              "circle-radius": 5,
              "circle-color": "#2563EB",
              "circle-opacity": 0.8,
            },
          },
        ],
      },
      center: [101.6869, 3.139],
      zoom: 12,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.once("load", () => {
      map.resize();
      map.triggerRepaint();
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || categories.length === 0) return;

    const updateRouteOverlay = () => {
      categories.forEach((category) => {
        const points = category.route
          .map((point) => map.project([point.lng, point.lat]))
          .map((point) => `${point.x},${point.y}`)
          .join(" ");
        routeOverlayRef.current
          ?.querySelectorAll(`[data-route-id^="${category.id}"]`)
          .forEach((polyline) => polyline.setAttribute("points", points));
      });
    };

    updateRouteOverlay();
    map.on("move", updateRouteOverlay);
    map.on("resize", updateRouteOverlay);

    return () => {
      map.off("move", updateRouteOverlay);
      map.off("resize", updateRouteOverlay);
    };
  }, [categories]);

  // Handle GPX File Upload
  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;

    const parsedCategories = await Promise.all(
      files.map(async (file, index): Promise<RaceCategory | null> => {
        const parsedPoints = parseAndNormalizeGPX(await file.text());
        if (parsedPoints.length < 2) return null;
        const distanceKm =
          parsedPoints[parsedPoints.length - 1].cumulativeDistanceKm;
        return {
          id: `${file.name}-${index}-${Date.now()}`,
          name: file.name.replace(/\.gpx$/i, ""),
          fileName: file.name,
          route: parsedPoints,
          distanceKm,
          startDateTime: toDateTimeInputValue(new Date()),
          cutoffMins: 180,
          activity: "running",
          color: categoryColors[index % categoryColors.length],
          runners: generateRunners(numRunners, distanceKm, "running"),
        } satisfies RaceCategory;
      }),
    );
    const validCategories = parsedCategories.filter(
      (category): category is RaceCategory => category !== null,
    );

    if (validCategories.length === 0) {
      alert("No valid GPX routes were selected.");
      return;
    }

    setCategories((current) => [...current, ...validCategories]);
    setSimTimeSec(0);
    setIsPlaying(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await processFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || categories.length === 0) return;

    const renderRoute = () => {
      if (!map.getSource("route")) return;

      const routeData = {
        type: "FeatureCollection" as const,
        features: categories.map((category) => ({
          type: "Feature" as const,
          properties: { categoryId: category.id },
          geometry: {
            type: "LineString" as const,
            coordinates: category.route.map((point) => [point.lng, point.lat]),
          },
        })),
      };
      (map.getSource("route") as maplibregl.GeoJSONSource).setData(routeData);
      map.moveLayer("osm-basemap", "route-casing");

      const coordinates = categories.flatMap((category) =>
        category.route.map((point) => [point.lng, point.lat]),
      );
      const bounds = coordinates
        .slice(1)
        .reduce(
          (currentBounds, coordinate) =>
            currentBounds.extend(coordinate as [number, number]),
          new maplibregl.LngLatBounds(
            coordinates[0] as [number, number],
            coordinates[0] as [number, number],
          ),
        );
      map.fitBounds(bounds, { padding: 40 });
      map.moveLayer("route-casing");
      map.moveLayer("route-line");
      map.triggerRepaint();
    };

    if (map.getSource("route")) {
      renderRoute();
    } else {
      const handleStyleData = () => {
        if (!map.getSource("route")) return;
        renderRoute();
        map.off("styledata", handleStyleData);
      };
      map.on("styledata", handleStyleData);

      return () => {
        map.off("styledata", handleStyleData);
      };
    }

    const retryId = window.setTimeout(renderRoute, 1000);

    return () => {
      window.clearTimeout(retryId);
    };
  }, [categories]);

  // Animation Loop Update
  useEffect(() => {
    let animationFrameId: number;
    let lastTimestamp: number;
    const eventStartMs = getEventStartMs(categories);
    const simulationEndSec = getSimulationEndSec(categories, eventStartMs);

    const updateSimulation = (timestamp: number) => {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const deltaTimeSec = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      setSimTimeSec((prev) => {
        const nextTime = prev + deltaTimeSec * simSpeedMultiplier;
        if (nextTime >= simulationEndSec) {
          setIsPlaying(false);
          return simulationEndSec;
        }
        return nextTime;
      });

      if (isPlaying) {
        animationFrameId = requestAnimationFrame(updateSimulation);
      }
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(updateSimulation);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, simSpeedMultiplier, categories]);

  // Update runner locations on Map canvas frame-by-frame
  useEffect(() => {
    if (!mapRef.current || categories.length === 0) return;
    const eventStartMs = getEventStartMs(categories);
    const runnerFeatures = categories.flatMap((category) =>
      category.runners.map((runner) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: getRunnerPosition(
            category,
            runner,
            simTimeSec,
            eventStartMs,
          ),
        },
        properties: {
          id: `${category.id}-${runner.id}`,
          categoryId: category.id,
        },
      })),
    );

    const runnerSource = mapRef.current.getSource(
      "runners",
    ) as maplibregl.GeoJSONSource;
    if (runnerSource) {
      runnerSource.setData({
        type: "FeatureCollection",
        features: runnerFeatures,
      });
    }
  }, [simTimeSec, categories]);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = runnerDotsRef.current;
    if (!map || !overlay) return;
    if (categories.length === 0) {
      overlay.replaceChildren();
      return;
    }
    const eventStartMs = getEventStartMs(categories);

    const updateRunnerDots = () => {
      const { clientWidth, clientHeight } = map.getContainer();
      const dots = categories
        .flatMap((category) =>
          category.runners.map((runner) => {
            const isFastestRunner = runner.id === getFastestRunnerId(category);
            const projected = map.project(
              getRunnerPosition(category, runner, simTimeSec, eventStartMs),
            );
            if (
              !Number.isFinite(projected.x) ||
              !Number.isFinite(projected.y) ||
              projected.x < 0 ||
              projected.x > clientWidth ||
              projected.y < 0 ||
              projected.y > clientHeight
            ) {
              return null;
            }
            const dot = document.createElement("div");
            dot.className =
              "absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md";
            dot.style.backgroundColor = isFastestRunner
              ? getDistinctFastestColor(category, categories)
              : category.color;
            dot.title = isFastestRunner
              ? `${category.name} fastest runner`
              : category.name;
            dot.style.left = `${projected.x}px`;
            dot.style.top = `${projected.y}px`;
            return dot;
          }),
        )
        .filter((dot): dot is HTMLDivElement => dot !== null);
      overlay.replaceChildren(...dots);
    };

    updateRunnerDots();
    map.on("move", updateRunnerDots);
    map.on("resize", updateRunnerDots);

    return () => {
      map.off("move", updateRunnerDots);
      map.off("resize", updateRunnerDots);
    };
  }, [categories, simTimeSec]);

  const eventStartMs = getEventStartMs(categories);
  const simulationEndSec = getSimulationEndSec(categories, eventStartMs);
  const currentSimulationTime = new Date(eventStartMs + simTimeSec * 1000);
  const minimumSimulationTime = new Date(eventStartMs);
  const maximumSimulationTime = new Date(
    eventStartMs + simulationEndSec * 1000,
  );

  const handleSimulationTimeChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const requestedTimeMs = Date.parse(event.target.value);
    if (!Number.isFinite(requestedTimeMs)) return;

    const requestedTimeSec = (requestedTimeMs - eventStartMs) / 1000;
    setIsPlaying(false);
    setSimTimeSec(Math.max(0, Math.min(simulationEndSec, requestedTimeSec)));
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-900 text-white">
      {/* Sidebar Controls */}
      <div className="z-30 flex w-80 flex-col gap-4 overflow-y-auto bg-slate-800 p-4 shadow-xl">
        <h1 className="text-xl font-bold text-slate-100">Race Simulator</h1>

        {/* Upload GPX */}
        <div className="flex flex-col gap-2">
          <label className="text-sm text-slate-400">Upload GPX Route</label>
          <label
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDraggingFiles(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setIsDraggingFiles(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDraggingFiles(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFiles(false);
              void processFiles(Array.from(e.dataTransfer.files));
            }}
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 transition-colors ${
              isDraggingFiles
                ? "border-blue-400 bg-blue-500/10 text-blue-200"
                : "border-slate-600 hover:border-blue-500"
            }`}
          >
            <Upload size={18} />
            <span className="text-sm">
              {isDraggingFiles
                ? "Drop GPX files here"
                : "Choose or drop GPX files"}
            </span>
            <input
              type="file"
              accept=".gpx"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
          <p className="text-xs text-slate-400">
            Select one or more GPX routes.
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-700 pt-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-200">Categories</h2>
            {categories.length > 0 && (
              <span className="text-xs text-slate-400">
                {categories.length} loaded
              </span>
            )}
          </div>
          {categories.map((category) => (
            <div
              key={category.id}
              className="flex flex-col gap-2 rounded-lg bg-slate-700/60 p-3"
            >
              <div className="flex items-center gap-2">
                <input
                  value={category.name}
                  onChange={(e) =>
                    setCategories((current) =>
                      current.map((item) =>
                        item.id === category.id
                          ? { ...item, name: e.target.value }
                          : item,
                      ),
                    )
                  }
                  className="min-w-0 flex-1 bg-slate-600 rounded p-1.5 text-sm"
                />
                <input
                  type="color"
                  value={category.color}
                  title="Category color"
                  onChange={(e) =>
                    setCategories((current) =>
                      current.map((item) =>
                        item.id === category.id
                          ? { ...item, color: e.target.value }
                          : item,
                      ),
                    )
                  }
                  className="h-8 w-8 cursor-pointer bg-transparent"
                />
                <button
                  onClick={() =>
                    setCategories((current) =>
                      current.filter((item) => item.id !== category.id),
                    )
                  }
                  className="text-slate-300 hover:text-white"
                  title="Remove category"
                  aria-label={`Remove ${category.name}`}
                >
                  <X size={16} />
                </button>
              </div>
              <p
                className="truncate text-xs text-slate-400"
                title={category.fileName}
              >
                {category.fileName}
              </p>
              <p className="text-xs text-slate-300">
                {category.distanceKm.toFixed(2)} km · +
                {getElevationStats(category.route).gain.toFixed(0)}m / -
                {getElevationStats(category.route).loss.toFixed(0)}m
              </p>
              <p className="text-xs text-slate-300">
                Fastest{" "}
                {formatDuration(
                  Math.min(
                    ...category.runners.map((runner) =>
                      getRunnerFinishSec(category, runner),
                    ),
                  ),
                )}{" "}
                · Slowest{" "}
                {formatDuration(
                  Math.max(
                    ...category.runners.map((runner) =>
                      getRunnerFinishSec(category, runner),
                    ),
                  ),
                )}
                {getCategoryDnfCount(category) > 0 &&
                  ` · ${getCategoryDnfCount(category)} DNF`}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="col-span-2 text-xs text-slate-400">
                  Activity
                  <select
                    value={category.activity}
                    onChange={(e) => {
                      const activity = e.target.value as Activity;
                      setCategories((current) =>
                        current.map((item) =>
                          item.id === category.id
                            ? {
                                ...item,
                                activity,
                                runners: generateRunners(
                                  item.runners.length,
                                  item.distanceKm,
                                  activity,
                                ),
                              }
                            : item,
                        ),
                      );
                    }}
                    className="mt-1 w-full rounded bg-slate-600 p-1.5 text-sm text-white"
                  >
                    {(Object.keys(activityLabels) as Activity[]).map(
                      (activity) => (
                        <option key={activity} value={activity}>
                          {activityLabels[activity]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="col-span-2 text-xs text-slate-400">
                  Start date/time
                  <input
                    type="datetime-local"
                    value={category.startDateTime}
                    onChange={(e) =>
                      setCategories((current) =>
                        current.map((item) =>
                          item.id === category.id
                            ? {
                                ...item,
                                startDateTime: e.target.value,
                              }
                            : item,
                        ),
                      )
                    }
                    className="mt-1 min-w-0 w-full rounded bg-slate-600 p-1.5 text-sm text-white"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Runners
                  <input
                    type="number"
                    min="1"
                    value={category.runners.length}
                    onChange={(e) =>
                      setCategories((current) =>
                        current.map((item) =>
                          item.id === category.id
                            ? {
                                ...item,
                                runners: generateRunners(
                                  Math.max(1, Number(e.target.value)),
                                  item.distanceKm,
                                  item.activity,
                                ),
                              }
                            : item,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded bg-slate-600 p-1.5 text-sm text-white"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Cutoff (min)
                  <input
                    type="number"
                    min="1"
                    value={category.cutoffMins}
                    onChange={(e) =>
                      setCategories((current) =>
                        current.map((item) =>
                          item.id === category.id
                            ? {
                                ...item,
                                cutoffMins: Math.max(1, Number(e.target.value)),
                              }
                            : item,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded bg-slate-600 p-1.5 text-sm text-white"
                  />
                </label>
                <div className="col-span-2 text-xs text-slate-400">
                  End time
                  <p className="mt-1 rounded bg-slate-600 p-1.5 text-sm text-slate-100">
                    {formatCategoryEndTime(category)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Current time</span>
            <input
              type="datetime-local"
              value={
                categories.length > 0
                  ? toDateTimeInputValue(currentSimulationTime)
                  : ""
              }
              min={
                categories.length > 0
                  ? toDateTimeInputValue(minimumSimulationTime)
                  : undefined
              }
              max={
                categories.length > 0
                  ? toDateTimeInputValue(maximumSimulationTime)
                  : undefined
              }
              step="60"
              onChange={handleSimulationTimeChange}
              disabled={categories.length === 0}
              aria-label="Current simulation time"
              className="min-w-0 rounded bg-slate-700 px-2 py-1 text-right text-xs text-slate-100"
            />
          </div>
          <label className="mt-2 block text-xs text-slate-400">
            Timeline
            <input
              type="range"
              min="0"
              max={simulationEndSec}
              step="1"
              value={simTimeSec}
              onChange={(event) => {
                setIsPlaying(false);
                setSimTimeSec(Number(event.target.value));
              }}
              disabled={categories.length === 0}
              aria-label="Simulation timeline"
              className="mt-1 w-full accent-blue-500"
            />
          </label>
          <div className="mt-1 flex items-center justify-between gap-3 text-slate-400">
            <span>Elapsed</span>
            <span>
              {Math.floor(simTimeSec / 60)}m {Math.floor(simTimeSec % 60)}s
            </span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="mt-auto flex flex-col gap-3 border-t border-slate-700 pt-3">
          <div className="flex gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={categories.length === 0}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 rounded-lg py-2 font-medium transition-colors"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              {isPlaying ? "Pause" : "Start"}
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                setSimTimeSec(0);
              }}
              disabled={categories.length === 0}
              className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 p-2 rounded-lg"
            >
              <RotateCcw size={18} />
            </button>
          </div>

          <div>
            <label className="text-xs text-slate-400">
              Sim Speed: {simSpeedMultiplier}x
            </label>
            <input
              type="range"
              min="1"
              max="300"
              value={simSpeedMultiplier}
              onChange={(e) => setSimSpeedMultiplier(Number(e.target.value))}
              className="w-full mt-1"
            />
          </div>
        </div>
      </div>

      {/* Map Display */}
      <div className="relative z-0 flex-1 overflow-hidden">
        <div ref={mapContainerRef} className="h-full w-full" />
        {categories.length > 0 && (
          <div className="pointer-events-none absolute left-4 top-4 z-30 max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/90 p-3 text-xs text-white shadow-lg backdrop-blur-sm">
            <div className="mb-2 flex items-center justify-between gap-4 border-b border-slate-700 pb-2">
              <strong>Categories</strong>
              <span className="text-slate-400">Fastest</span>
            </div>
            <div className="flex flex-col gap-2">
              {categories.map((category) => (
                <div key={category.id} className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border border-white/80"
                    style={{ backgroundColor: category.color }}
                    title={`${category.name} runners`}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {category.name}
                  </span>
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border border-white/80"
                    style={{
                      backgroundColor: getDistinctFastestColor(
                        category,
                        categories,
                      ),
                    }}
                    title={`${category.name} fastest runner`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        <div
          ref={runnerDotsRef}
          className="pointer-events-none absolute inset-0 z-20"
          aria-hidden="true"
        />
        <svg
          ref={routeOverlayRef}
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          aria-hidden="true"
        >
          {categories.map((category) => (
            <g key={category.id}>
              <polyline
                data-route-id={category.id}
                fill="none"
                stroke="#111827"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="14"
              />
              <polyline
                data-route-id={`${category.id}-line`}
                fill="none"
                stroke={category.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="8"
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
