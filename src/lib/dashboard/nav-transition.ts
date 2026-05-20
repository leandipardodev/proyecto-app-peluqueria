"use client";

const NAV_START_EVENT = "klip-dashboard-nav-start";

export function triggerDashboardNavTransition() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NAV_START_EVENT));
}

export function getDashboardNavTransitionEventName() {
  return NAV_START_EVENT;
}
