"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Таймер рахується від часу сервера, а не від годинника на пристрої учасника.
let offsetPromise: Promise<number> | null = null;

function loadOffset(): Promise<number> {
  if (!offsetPromise) {
    offsetPromise = (async () => {
      const t0 = Date.now();
      const { data, error } = await createClient().rpc("server_time");
      const t1 = Date.now();
      if (error || !data) return 0;
      return new Date(data as string).getTime() - (t0 + t1) / 2;
    })();
  }
  return offsetPromise;
}

/** Поточний час сервера; null до монтування в браузері — щоб SSR і перший рендер клієнта збігались. */
export function useServerNow(tickMs = 1000): number | null {
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    loadOffset().then(setOffset);
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now === null ? null : now + offset;
}
