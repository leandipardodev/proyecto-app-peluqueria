"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";
import DashboardSidebar from "./dashboard-sidebar";

interface DashboardHeaderProps {
  shopName: string;
  userName: string;
  onLogout: () => void;
}

export default function DashboardHeader({
  shopName,
  userName,
  onLogout,
}: DashboardHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center gap-3 bg-white border-b border-gray-200 px-4 py-3 lg:px-6">
        <button
          onClick={() => setMobileOpen(true)}
          className="lg:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100"
        >
          <Menu className="w-5 h-5" />
        </button>

        <h2 className="text-lg font-semibold text-gray-800">{shopName}</h2>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-64 shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
              <h1 className="text-xl font-bold text-violet-700">Klip</h1>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-md text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <DashboardSidebar
              userName={userName}
              onLogout={() => {
                setMobileOpen(false);
                onLogout();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
