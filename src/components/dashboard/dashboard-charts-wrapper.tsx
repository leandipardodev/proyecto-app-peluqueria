"use client";

import dynamicImport from "next/dynamic";

type ClientPoint = { month: string; clients: number; growthPct: number | null };
type RevenuePoint = { month: string; income: number };
type HealthBreakdown = { revenue: number; clients: number; appointments: number };

const RevenueChart = dynamicImport(() => import("@/components/dashboard/revenue-chart"), {
  ssr: false,
  loading: () => <div className="h-72 rounded-3xl bg-white/30 dark:bg-white/5 animate-pulse" />,
});

const DemandaCarousel = dynamicImport(() => import("@/components/dashboard/demanda-carousel"), {
  ssr: false,
  loading: () => <div className="h-52 rounded-3xl bg-white/30 dark:bg-white/5 animate-pulse" />,
});

const MonthlyGrowthCard = dynamicImport(() => import("@/components/dashboard/monthly-growth-card"), {
  ssr: false,
  loading: () => <div className="h-52 rounded-3xl bg-white/30 dark:bg-white/5 animate-pulse" />,
});

interface DashboardChartsWrapperProps {
  revenueData: Array<{ month: string; income: number; expenses: number }>;
  dailyBreakdown: Array<{ dateKey: string; income: number; expenses: number }>;
  hourlyBreakdown: Array<{ hour: string; income: number; expenses: number }>;
  weeklyBreakdown: Array<{ weekKey: string; income: number; expenses: number }>;
  flowByPeriod?: {
    today: { income: number; expenses: number };
    week: { income: number; expenses: number };
    month: { income: number; expenses: number };
  };
  topServicesData: Array<{ name: string; count: number }>;
  topDiasData: Array<{ name: string; count: number }>;
  topHorariosData: Array<{ name: string; count: number }>;
  serviceLabelPlural?: string;
  clientsData: ClientPoint[];
  monthlyRevenueData: RevenuePoint[];
  healthScore: number | null;
  healthBreakdown: HealthBreakdown | null;
  totalClients: number;
  isStaff?: boolean;
}

export default function DashboardChartsWrapper(props: DashboardChartsWrapperProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 min-w-0 h-full">
        <RevenueChart data={props.revenueData} dailyBreakdown={props.dailyBreakdown} hourlyBreakdown={props.hourlyBreakdown} weeklyBreakdown={props.weeklyBreakdown} flowByPeriod={props.flowByPeriod} isStaff={props.isStaff} />
      </div>
      <div className="lg:col-span-1 space-y-4 min-w-0">
        <DemandaCarousel topServices={props.topServicesData} topDias={props.topDiasData} topHorarios={props.topHorariosData} />
        <MonthlyGrowthCard
          clientsData={props.clientsData}
          revenueData={props.monthlyRevenueData}
          healthScore={props.healthScore}
          healthBreakdown={props.healthBreakdown}
          totalClients={props.totalClients}
          isStaff={props.isStaff}
        />
      </div>
    </div>
  );
}
