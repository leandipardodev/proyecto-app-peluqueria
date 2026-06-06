"use client";

import dynamicImport from "next/dynamic";

type ClientPoint = { month: string; clients: number; growthPct: number | null };
type RevenuePoint = { month: string; income: number };
type HealthBreakdown = { revenue: number; clients: number; appointments: number };

const RevenueChart = dynamicImport(() => import("@/components/dashboard/revenue-chart"), {
  ssr: false,
  loading: () => <div className="h-72 rounded-3xl bg-white/30 dark:bg-white/5 animate-pulse" />,
});

const TopServices = dynamicImport(() => import("@/components/dashboard/top-services"), {
  ssr: false,
  loading: () => <div className="h-52 rounded-3xl bg-white/30 dark:bg-white/5 animate-pulse" />,
});

const MonthlyGrowthCard = dynamicImport(() => import("@/components/dashboard/monthly-growth-card"), {
  ssr: false,
  loading: () => <div className="h-52 rounded-3xl bg-white/30 dark:bg-white/5 animate-pulse" />,
});

interface DashboardChartsWrapperProps {
  revenueData: Array<{ month: string; income: number; expenses: number }>;
  flowByPeriod?: {
    today: { income: number; expenses: number };
    week: { income: number; expenses: number };
    month: { income: number; expenses: number };
  };
  topServicesData: Array<{ name: string; count: number }>;
  serviceLabelPlural?: string;
  clientsData: ClientPoint[];
  monthlyRevenueData: RevenuePoint[];
  healthScore: number | null;
  healthBreakdown: HealthBreakdown | null;
  totalClients: number;
}

export default function DashboardChartsWrapper(props: DashboardChartsWrapperProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      <div className="lg:col-span-2 min-w-0 space-y-4">
        <RevenueChart data={props.revenueData} flowByPeriod={props.flowByPeriod} />
      </div>
      <div className="lg:col-span-1 space-y-4 min-w-0">
        <TopServices data={props.topServicesData} serviceLabelPlural={props.serviceLabelPlural} />
        <MonthlyGrowthCard
          clientsData={props.clientsData}
          revenueData={props.monthlyRevenueData}
          healthScore={props.healthScore}
          healthBreakdown={props.healthBreakdown}
          totalClients={props.totalClients}
        />
      </div>
    </div>
  );
}
