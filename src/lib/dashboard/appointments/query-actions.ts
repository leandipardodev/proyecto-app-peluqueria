"use server";

import { fetchAppointments as _fetchAppointments, fetchAllAppointmentsForTable as _fetchAllAppointmentsForTable } from "./queries";

export const fetchAppointments = _fetchAppointments;
export const fetchAllAppointmentsForTable = _fetchAllAppointmentsForTable;
