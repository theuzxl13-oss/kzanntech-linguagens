import { useSyncExternalStore } from "react";

/** Substituto de next/navigation baseado no hash da URL (funciona em qualquer hospedagem estática). */
function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}
const hashPath = () => (location.hash.replace(/^#/, "") || "/");

export function useHashRoute() {
  return useSyncExternalStore(subscribe, hashPath, () => "/");
}

export function usePathname() {
  return useHashRoute().split("?")[0];
}

export function useSearchParams() {
  const full = useHashRoute();
  return new URLSearchParams(full.includes("?") ? full.slice(full.indexOf("?") + 1) : "");
}

export function navigate(to: string, replace = false) {
  const url = `${location.pathname}${location.search}#${to}`;
  if (replace) location.replace(url);
  else location.hash = to;
  window.scrollTo(0, 0);
}

export function useRouter() {
  return {
    push: (to: string) => navigate(to),
    replace: (to: string) => navigate(to, true),
    refresh: () => window.dispatchEvent(new Event("demo-refresh")),
    back: () => history.back(),
    prefetch: () => {},
  };
}

export function redirect(to: string): never {
  navigate(to, true);
  throw new Error("redirect");
}

export function notFound(): never {
  throw new Error("not-found");
}
