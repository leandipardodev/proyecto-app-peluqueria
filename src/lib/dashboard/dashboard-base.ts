import { DASHBOARD_LEGACY_SEGMENTS_SET } from "@/lib/dashboard/legacy-segments";

export function getDashboardBasePath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const slug = parts[1];
  if (parts[0] === "dashboard" && slug && !DASHBOARD_LEGACY_SEGMENTS_SET.has(slug)) {
    return `/dashboard/${slug}`;
  }
  return "/dashboard";
}

export function withDashboardBase(href: string, dashboardBasePath: string): string {
  if (!href.startsWith("/dashboard")) return href;
  if (href === "/dashboard") return dashboardBasePath;
  return `${dashboardBasePath}${href.replace("/dashboard", "")}`;
}
