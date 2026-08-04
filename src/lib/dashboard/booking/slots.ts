import {
  createArgentinaDate,
  formatArgentinaTime,
  getArgentinaDateString,
  getArgentinaMinutesSinceMidnight,
} from "@/lib/argentina-time";

const SLOT_STEP = 30;

export type Slot = { start: string; end: string; time: string; staffIds: string[] };

export type StaffScheduleEntry = {
  staff_id: string;
  is_active: boolean;
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
};

export type DateOverrideEntry = {
  staff_id: string | null;
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
  break_start: string | null;
  break_end: string | null;
};

export type BlockEntry = {
  start_time: string;
  end_time: string;
  staff_id: string | null;
};

export type ShopDayConfig = {
  open: boolean;
  start: string;
  end: string;
  break_start?: string | null;
  break_end?: string | null;
};

export type ComputeSlotsParams = {
  date: string;
  serviceDuration: number;
  shopDayConfig: ShopDayConfig;
  shopOpenMinutes: number;
  shopCloseMinutes: number;
  poolIds: string[];
  scheduleMap: Map<string, StaffScheduleEntry>;
  staffOverrideMap: Map<string, DateOverrideEntry>;
  allBlocks: BlockEntry[];
};

function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function isInBreak(slotStartMinute: number, slotEndMinute: number, breakStart: number | null, breakEnd: number | null): boolean {
  if (breakStart === null || breakEnd === null) return false;
  return (slotStartMinute + 2) < breakEnd && (slotEndMinute - 2) > breakStart;
}

export function computeSlotsForDay(params: ComputeSlotsParams): Slot[] {
  const { date, serviceDuration, shopDayConfig, shopOpenMinutes, shopCloseMinutes, poolIds, scheduleMap, staffOverrideMap, allBlocks } = params;

  const rawDuration = Number.isFinite(serviceDuration) ? Math.round(serviceDuration) : 60;
  const safeDuration = rawDuration <= 0 ? 60 : Math.min(480, Math.max(15, rawDuration));

  const [y, monthNum, d] = date.split("-").map(Number);
  const isTodayInArgentina = date === getArgentinaDateString();
  const nowMinuteInArgentina = getArgentinaMinutesSinceMidnight(new Date());

  function getStaffDayConfig(sId: string): { startMinutes: number; closeMinutes: number; breakStart: number | null; breakEnd: number | null } | null {
    const entry = scheduleMap.get(sId);
    if (entry) {
      if (!entry.is_active) return null;
      const [sh, sm] = entry.start_time.slice(0, 5).split(":").map(Number);
      const [eh, em] = entry.end_time.slice(0, 5).split(":").map(Number);
      const openMinutes = sh * 60 + sm;
      const closeMinutes = eh * 60 + em;
      if (openMinutes >= closeMinutes) return null;
      const finalOpenMinutes = Math.max(openMinutes, shopOpenMinutes);
      const finalCloseMinutes = Math.min(closeMinutes, shopCloseMinutes);
      if (finalOpenMinutes >= finalCloseMinutes) return null;
      let breakStart: number | null = null;
      let breakEnd: number | null = null;
      if (entry.break_start && entry.break_end) {
        const [bsh, bsm] = entry.break_start.slice(0, 5).split(":").map(Number);
        const [beh, bem] = entry.break_end.slice(0, 5).split(":").map(Number);
        breakStart = bsh * 60 + bsm;
        breakEnd = beh * 60 + bem;
      }
      return { startMinutes: finalOpenMinutes, closeMinutes: finalCloseMinutes, breakStart, breakEnd };
    }
    return {
      startMinutes: shopOpenMinutes,
      closeMinutes: shopCloseMinutes,
      breakStart: shopDayConfig.break_start ? hhmmToMinutes(shopDayConfig.break_start) : null,
      breakEnd: shopDayConfig.break_end ? hhmmToMinutes(shopDayConfig.break_end) : null,
    };
  }

  function hasTimeConflict(sId: string, slotStart: Date, slotEnd: Date, skipNullStaff = false): boolean {
    return allBlocks.some((apt) => {
      if (apt.staff_id && apt.staff_id !== sId) return false;
      if (!apt.staff_id && skipNullStaff) return false;
      const aptStart = new Date(apt.start_time);
      const aptEnd = new Date(apt.end_time);
      const TOLERANCE_MS = 2 * 60 * 1000;
      return (slotStart.getTime() + TOLERANCE_MS) < aptEnd.getTime() && (slotEnd.getTime() - TOLERANCE_MS) > aptStart.getTime();
    });
  }

  function isStaffAvailableForSlot(sId: string, slotStartMinute: number, slotEndMinute: number, slotStart: Date, slotEnd: Date): boolean {
    const entry = scheduleMap.get(sId);
    if (entry && !entry.is_active) return false;
    let openMin: number;
    let closeMin: number;
    let breakStartMin: number | null = null;
    let breakEndMin: number | null = null;
    if (entry) {
      const [sh, sm] = entry.start_time.slice(0, 5).split(":").map(Number);
      const [eh, em] = entry.end_time.slice(0, 5).split(":").map(Number);
      openMin = Math.max(sh * 60 + sm, shopOpenMinutes);
      closeMin = Math.min(eh * 60 + em, shopCloseMinutes);
      if (openMin >= closeMin) return false;
      if (entry.break_start && entry.break_end) {
        const [bsh, bsm] = entry.break_start.slice(0, 5).split(":").map(Number);
        const [beh, bem] = entry.break_end.slice(0, 5).split(":").map(Number);
        breakStartMin = bsh * 60 + bsm;
        breakEndMin = beh * 60 + bem;
      }
    } else {
      openMin = shopOpenMinutes;
      closeMin = shopCloseMinutes;
      if (shopDayConfig.break_start && shopDayConfig.break_end) {
        const [bsh, bsm] = shopDayConfig.break_start.split(":").map(Number);
        const [beh, bem] = shopDayConfig.break_end.split(":").map(Number);
        breakStartMin = bsh * 60 + bsm;
        breakEndMin = beh * 60 + bem;
      }
    }
    if (slotStartMinute < openMin || slotEndMinute > closeMin) return false;
    if (isInBreak(slotStartMinute, slotEndMinute, breakStartMin, breakEndMin)) return false;
    if (isInBreak(slotStartMinute, slotEndMinute,
      shopDayConfig.break_start ? hhmmToMinutes(shopDayConfig.break_start) : null,
      shopDayConfig.break_end ? hhmmToMinutes(shopDayConfig.break_end) : null)) return false;
    const sOverride = staffOverrideMap.get(sId);
    if (sOverride) {
      if (sOverride.is_closed) return false;
      if (sOverride.start_time && sOverride.end_time) {
        const ovStart = hhmmToMinutes(sOverride.start_time);
        const ovEnd = hhmmToMinutes(sOverride.end_time);
        if (slotStartMinute < ovStart || slotEndMinute > ovEnd) return false;
      }
      if (sOverride.break_start && sOverride.break_end) {
        const bs = hhmmToMinutes(sOverride.break_start);
        const be = hhmmToMinutes(sOverride.break_end);
        if (isInBreak(slotStartMinute, slotEndMinute, bs, be)) return false;
      }
    }
    if (slotStartMinute < shopOpenMinutes || slotEndMinute > shopCloseMinutes) return false;
    const hasConflict = allBlocks.some((apt) => {
      if (!apt.staff_id || apt.staff_id !== sId) return false;
      const aptStart = new Date(apt.start_time);
      const aptEnd = new Date(apt.end_time);
      const TOLERANCE_MS = 2 * 60 * 1000;
      return (slotStart.getTime() + TOLERANCE_MS) < aptEnd.getTime() && (slotEnd.getTime() - TOLERANCE_MS) > aptStart.getTime();
    });
    return !hasConflict;
  }

  function countNullBlocksForSlot(slotStart: Date, slotEnd: Date): number {
    const TOLERANCE_MS = 2 * 60 * 1000;
    return allBlocks.filter((apt) => {
      if (apt.staff_id) return false;
      const aptStart = new Date(apt.start_time);
      const aptEnd = new Date(apt.end_time);
      return (slotStart.getTime() + TOLERANCE_MS) < aptEnd.getTime() && (slotEnd.getTime() - TOLERANCE_MS) > aptStart.getTime();
    }).length;
  }

  function countAvailableServiceStaff(slotStartMinute: number, slotEndMinute: number, slotStart: Date, slotEnd: Date): number {
    if (poolIds.length <= 1) return poolIds.length;
    let count = 0;
    for (const sId of poolIds) {
      if (isStaffAvailableForSlot(sId, slotStartMinute, slotEndMinute, slotStart, slotEnd)) {
        count++;
      }
    }
    return count;
  }

  function splitRangeOnBreak(block: { openMinutes: number; closeMinutes: number }, breakStart: number | null, breakEnd: number | null): Array<{ openMinutes: number; closeMinutes: number }> {
    if (breakStart === null || breakEnd === null) return [block];
    if (block.openMinutes < breakStart && breakStart < breakEnd && breakEnd < block.closeMinutes) {
      return [
        { openMinutes: block.openMinutes, closeMinutes: breakStart },
        { openMinutes: breakEnd, closeMinutes: block.closeMinutes },
      ];
    }
    return [block];
  }

  const slots: Slot[] = [];

  if (poolIds.length === 1) {
    const sId = poolIds[0];
    const config = getStaffDayConfig(sId);
    if (!config) return [];
    const staffOverride = staffOverrideMap.get(sId);
    if (staffOverride) {
      if (staffOverride.is_closed) { return []; }
      if (staffOverride.start_time && staffOverride.end_time) {
        const ovStart = hhmmToMinutes(staffOverride.start_time);
        const ovEnd = hhmmToMinutes(staffOverride.end_time);
        config.startMinutes = Math.max(config.startMinutes, ovStart);
        config.closeMinutes = Math.min(config.closeMinutes, ovEnd);
        if (config.startMinutes >= config.closeMinutes) { return []; }
      }
      if (staffOverride.break_start && staffOverride.break_end) {
        const bs = hhmmToMinutes(staffOverride.break_start);
        const be = hhmmToMinutes(staffOverride.break_end);
        if (config.startMinutes < bs && bs < be && be < config.closeMinutes) { config.breakStart = bs; config.breakEnd = be; }
      }
    }
    let staffBlocks = [{ openMinutes: config.startMinutes, closeMinutes: config.closeMinutes }];
    staffBlocks = staffBlocks.flatMap((b) => splitRangeOnBreak(b, config.breakStart, config.breakEnd));
    if (shopDayConfig.break_start && shopDayConfig.break_end) {
      const shopBs = hhmmToMinutes(shopDayConfig.break_start);
      const shopBe = hhmmToMinutes(shopDayConfig.break_end);
      staffBlocks = staffBlocks.flatMap((b) => splitRangeOnBreak(b, shopBs, shopBe));
    }
    for (const block of staffBlocks) {
      let currentMinute = isTodayInArgentina ? Math.max(block.openMinutes, nowMinuteInArgentina) : block.openMinutes;
      if (isTodayInArgentina && currentMinute > block.openMinutes) {
        const remainder = currentMinute % SLOT_STEP;
        if (remainder !== 0) currentMinute += SLOT_STEP - remainder;
      }
      while (currentMinute + safeDuration <= block.closeMinutes) {
        const hour = Math.floor(currentMinute / 60);
        const minute = currentMinute % 60;
        const slotStart = createArgentinaDate(y, monthNum, d, hour, minute);
        const slotEnd = new Date(slotStart.getTime() + safeDuration * 60000);
        const slotEndMinute = currentMinute + safeDuration;
        const availableCount = countAvailableServiceStaff(currentMinute, slotEndMinute, slotStart, slotEnd);
        const nullBlocks = countNullBlocksForSlot(slotStart, slotEnd);
        if (!hasTimeConflict(sId, slotStart, slotEnd, availableCount > nullBlocks)) {
          slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString(), time: formatArgentinaTime(slotStart), staffIds: [sId] });
        }
        currentMinute += SLOT_STEP;
      }
    }
  } else {
    const shopBlocks: Array<{ openMinutes: number; closeMinutes: number }> = [];
    if (shopDayConfig.break_start && shopDayConfig.break_end) {
      const [bsh, bsm] = shopDayConfig.break_start.split(":").map(Number);
      const [beh, bem] = shopDayConfig.break_end.split(":").map(Number);
      const breakStart = bsh * 60 + bsm;
      const breakEnd = beh * 60 + bem;
      if (shopOpenMinutes < breakStart && breakStart < breakEnd && breakEnd < shopCloseMinutes) {
        shopBlocks.push({ openMinutes: shopOpenMinutes, closeMinutes: breakStart });
        shopBlocks.push({ openMinutes: breakEnd, closeMinutes: shopCloseMinutes });
      } else {
        shopBlocks.push({ openMinutes: shopOpenMinutes, closeMinutes: shopCloseMinutes });
      }
    } else {
      shopBlocks.push({ openMinutes: shopOpenMinutes, closeMinutes: shopCloseMinutes });
    }
    for (const block of shopBlocks) {
      let currentMinute = isTodayInArgentina ? Math.max(block.openMinutes, nowMinuteInArgentina) : block.openMinutes;
      if (isTodayInArgentina && currentMinute > block.openMinutes) {
        const remainder = currentMinute % SLOT_STEP;
        if (remainder !== 0) currentMinute += SLOT_STEP - remainder;
      }
      while (currentMinute + safeDuration <= block.closeMinutes) {
        const hour = Math.floor(currentMinute / 60);
        const minute = currentMinute % 60;
        const slotStart = createArgentinaDate(y, monthNum, d, hour, minute);
        const slotEnd = new Date(slotStart.getTime() + safeDuration * 60000);
        const slotStartMinute = currentMinute;
        const slotEndMinute = currentMinute + safeDuration;

        const availableStaffIds: string[] = [];
        for (const sId of poolIds) {
          if (isStaffAvailableForSlot(sId, slotStartMinute, slotEndMinute, slotStart, slotEnd)) {
            availableStaffIds.push(sId);
          }
        }

        const freeCapableCount = countAvailableServiceStaff(slotStartMinute, slotEndMinute, slotStart, slotEnd);
        const nullBlocks = countNullBlocksForSlot(slotStart, slotEnd);

        if (availableStaffIds.length > 0 && freeCapableCount > nullBlocks) {
          slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString(), time: formatArgentinaTime(slotStart), staffIds: availableStaffIds });
        }
        currentMinute += SLOT_STEP;
      }
    }
  }

  return slots;
}
