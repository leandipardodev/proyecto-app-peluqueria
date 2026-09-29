import { describe, it, expect } from "vitest";
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_STATUS_OPEN,
  canTransitionStatus,
  getAppointmentStatusLabel,
  isAppointmentStatus,
  type AppointmentStatus,
} from "@/lib/dashboard/appointments/status";

describe("appointment status model", () => {
  it("exposes exactly 4 statuses", () => {
    expect([...APPOINTMENT_STATUSES]).toEqual([
      "confirmed",
      "pending_payment",
      "completed",
      "cancelled",
    ]);
  });

  it("no longer accepts the retired statuses", () => {
    for (const legacy of ["scheduled", "in_progress", "no_show", "done"]) {
      expect(isAppointmentStatus(legacy)).toBe(false);
    }
  });

  it("labels confirmed as Agendado", () => {
    expect(APPOINTMENT_STATUS_LABEL.confirmed).toBe("Agendado");
    expect(getAppointmentStatusLabel("confirmed")).toBe("Agendado");
  });

  it("falls back to the raw value for unknown statuses", () => {
    expect(getAppointmentStatusLabel("no_show")).toBe("no_show");
  });

  it("treats confirmed and pending_payment as the only open statuses", () => {
    expect([...APPOINTMENT_STATUS_OPEN].sort()).toEqual(["confirmed", "pending_payment"]);
  });
});

describe("canTransitionStatus", () => {
  const allowed: Array<[AppointmentStatus, AppointmentStatus]> = [
    ["confirmed", "completed"],
    ["confirmed", "cancelled"],
    ["pending_payment", "confirmed"],
    ["pending_payment", "cancelled"],
    ["completed", "confirmed"],
    ["completed", "cancelled"],
    ["cancelled", "confirmed"],
  ];

  it.each(allowed)("allows %s -> %s", (from, to) => {
    expect(canTransitionStatus(from, to)).toBe(true);
  });

  const rejected: Array<[string, string]> = [
    ["confirmed", "pending_payment"],
    ["completed", "pending_payment"],
    ["cancelled", "completed"],
    ["cancelled", "pending_payment"],
    ["pending_payment", "completed"],
    ["scheduled", "confirmed"],
  ];

  it.each(rejected)("rejects %s -> %s", (from, to) => {
    expect(canTransitionStatus(from, to)).toBe(false);
  });
});
