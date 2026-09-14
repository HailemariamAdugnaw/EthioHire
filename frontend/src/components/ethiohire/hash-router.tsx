
/**
 * Lightweight hash router — EthioHire is a single-route Next.js app, so
 * internal navigation uses URL hashes (back/forward works via hashchange).
 * Implemented with useSyncExternalStore (SSR-safe, no setState-in-effect).
 * Route format: #/segment/…?query
 */
import { useMemo, useSyncExternalStore } from "react";

export interface HashRoute {
  path: string; // e.g. "/candidate/jobs/abc"
  segments: string[]; // ["candidate", "jobs", "abc"]
  query: URLSearchParams;
  raw: string;
}

function parse(hash: string): HashRoute {
  const clean = hash.replace(/^#/, "") || "/";
  const [pathPart, queryPart] = clean.split("?");
  const path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  return {
    path,
    segments: path.split("/").filter(Boolean),
    query: new URLSearchParams(queryPart || ""),
    raw: clean,
  };
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const target = `#${to.startsWith("/") ? to : `/${to}`}`;
  if (opts.replace) {
    window.history.replaceState(null, "", target);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = target;
  }
}

// ---- external store: the URL hash ----

function subscribe(onChange: () => void): () => void {
  const handler = () => {
    window.scrollTo({ top: 0 });
    onChange();
  };
  window.addEventListener("hashchange", handler);
  return () => window.removeEventListener("hashchange", handler);
}

const getHash = () => window.location.hash || "#/";
const getServerHash = () => "#/";

export function useHashRoute(): HashRoute {
  const raw = useSyncExternalStore(subscribe, getHash, getServerHash);
  return useMemo(() => parse(raw), [raw]);
}

/** true once mounted on the client (SSR-safe hydration gate) */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}
