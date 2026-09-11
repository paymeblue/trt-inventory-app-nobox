"use client";

import * as React from "react";
import { apiFetch } from "./client";

export type Location = { id: string; name: string; code: string; kind: string };
export type Category = { id: string; name: string };
export type Supplier = { id: string; name: string };
export type Project = { id: string; code: string; name: string; status: string };

type Lookups = {
  locations: Location[];
  categories: Category[];
  suppliers: Supplier[];
  projects: Project[];
  loading: boolean;
};

/**
 * Reference data is small and read on nearly every form, so it is fetched once
 * per mount and shared through the hook's own module cache.
 */
let cache: Omit<Lookups, "loading"> | null = null;
let inflight: Promise<Omit<Lookups, "loading">> | null = null;

async function load() {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const safe = async <T>(url: string): Promise<T[]> => {
      try {
        const data = await apiFetch<{ items: T[] }>(url);
        return data.items ?? [];
      } catch {
        return [];
      }
    };
    const [locations, categories, suppliers, projects] = await Promise.all([
      safe<Location>("/api/locations"),
      safe<Category>("/api/categories"),
      safe<Supplier>("/api/suppliers"),
      safe<Project>("/api/projects"),
    ]);
    cache = { locations, categories, suppliers, projects };
    inflight = null;
    return cache;
  })();

  return inflight;
}

export function invalidateLookups() {
  cache = null;
  inflight = null;
}

export function useLookups(): Lookups {
  const [state, setState] = React.useState<Omit<Lookups, "loading"> | null>(cache);

  React.useEffect(() => {
    let active = true;
    void load().then((data) => {
      if (active) setState(data);
    });
    return () => {
      active = false;
    };
  }, []);

  return {
    locations: state?.locations ?? [],
    categories: state?.categories ?? [],
    suppliers: state?.suppliers ?? [],
    projects: state?.projects ?? [],
    loading: state === null,
  };
}
