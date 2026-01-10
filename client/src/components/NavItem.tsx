import React from "react";

export const NavItem = ({
  icon,
  label,
  count,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
}) => (
  <div
    className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
      active
        ? "bg-cyan-50 text-cyan-700 shadow-sm"
        : "text-slate-600 hover:bg-slate-100"
    }`}
  >
    <div className="flex items-center gap-3">
      {icon}
      <span>{label}</span>
    </div>
    {count ? (
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          active ? "bg-cyan-200 text-cyan-800" : "bg-slate-200 text-slate-600"
        }`}
      >
        {count}
      </span>
    ) : null}
  </div>
);

export default NavItem;
