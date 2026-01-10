import React from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Inbox,
  Link as LinkIcon,
  Send,
  Star,
  User,
} from "lucide-react";
import NavItem from "./NavItem";

export const Sidebar = () => (
  <div className="w-full border-b border-slate-200/70 bg-white/80 p-6 shadow-sm backdrop-blur lg:w-72 lg:border-b-0 lg:border-r">
    <button className="w-full rounded-2xl bg-gradient-to-r from-cyan-600 to-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-105">
      <span className="flex items-center justify-center gap-2">
        <Send size={16} />
        Compose
      </span>
    </button>

    <div className="mt-6 space-y-2">
      <NavItem icon={<Inbox size={18} />} label="Inbox" count={12} active />
      <NavItem icon={<Star size={18} />} label="Starred" />
      <NavItem icon={<Send size={18} />} label="Sent" />
      <NavItem icon={<Archive size={18} />} label="Archived" />
    </div>

    <div className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
      Smart Views
    </div>
    <div className="mt-3 space-y-2">
      <NavItem icon={<LinkIcon size={18} />} label="Linked Deals" count={5} />
      <NavItem icon={<AlertCircle size={18} />} label="Needs Attention" count={2} />
      <NavItem icon={<User size={18} />} label="High Intent" />
    </div>

    <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 size={16} />
        </span>
        <div>
          <div className="text-sm font-semibold text-slate-900">Mailbox Connected</div>
          <div>zahid.m@pivotal-b2b.com</div>
        </div>
      </div>
    </div>
  </div>
);

export default Sidebar;
