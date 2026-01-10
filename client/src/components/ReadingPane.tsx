import React from "react";
import {
  Archive,
  Clock,
  Forward,
  Inbox,
  Link as LinkIcon,
  MoreHorizontal,
  Reply,
  Sparkles,
} from "lucide-react";

export const ReadingPane = ({ thread }) => (
  <div className="flex-1 bg-gradient-to-br from-white via-slate-50 to-cyan-50/40">
    {thread ? (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
              <Reply size={18} />
            </button>
            <button className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
              <Forward size={18} />
            </button>
            <button className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
              <Archive size={18} />
            </button>
            <div className="h-5 w-px bg-slate-200" />
            <button className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
              <LinkIcon size={14} />
              Link to Opportunity
            </button>
          </div>
          <button className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
            <MoreHorizontal size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-10 pt-6">
          <div className="rounded-3xl border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-700">
              <Sparkles size={18} className="animate-pulse-soft" />
              AI Conversation Summary
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              Mark is evaluating the pilot scope and comparing vendors. He is positive about the
              transparency and wants a discovery call this week.
              <span className="font-semibold text-slate-900"> Action:</span> Share the updated
              timeline and confirm Wednesday availability.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                Next step: Discovery call
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5">
                Confidence: 84%
              </span>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-100 text-lg font-semibold text-cyan-700">
                {thread.avatar}
              </div>
              <div>
                <div className="text-xl font-semibold text-slate-900">{thread.sender}</div>
                <div className="text-sm text-slate-500">
                  To: Zahid Mohammadi &lt;zahid.m@pivotal-b2b.com&gt;
                </div>
              </div>
            </div>
            <div className="text-right text-sm text-slate-500">
              <div className="font-semibold text-slate-900">{thread.time}</div>
              <div>Oct 26, 2023</div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2 py-1 text-cyan-700">
              Opportunity: {thread.opportunity}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-500">
              Stage: {thread.stage}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-500">
              Health: On track
            </span>
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-4 text-sm leading-relaxed text-slate-700">
              <p>Hi Zahid,</p>
              <p>
                Thanks for the proposal. We are reviewing the pilot scope internally and
                comparing it with another vendor. The transparency in your plan is a strong
                signal for us.
              </p>
              <p>
                If possible, we would like to schedule a short discovery call this week so we
                can align on timelines, deliverables, and the success metrics you mentioned.
              </p>
              <ul className="list-disc pl-5">
                <li>Confirm pilot objectives and stakeholders</li>
                <li>Review data requirements and integration steps</li>
                <li>Align on launch timing and milestones</li>
              </ul>
              <p>
                Best regards,
                <br />
                <strong>Mark Johnson</strong>
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-4 shadow-md transition focus-within:ring-2 focus-within:ring-cyan-300/50">
            <textarea
              placeholder="Quick reply to keep the deal moving..."
              className="h-24 w-full resize-none border-none text-sm outline-none placeholder:text-slate-400"
            />
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <div className="flex items-center gap-2 text-slate-400">
                <button className="rounded-lg p-2 transition hover:bg-slate-50 hover:text-slate-600">
                  <Clock size={16} />
                </button>
                <button className="rounded-lg p-2 transition hover:bg-slate-50 hover:text-slate-600">
                  <LinkIcon size={16} />
                </button>
              </div>
              <button className="rounded-full bg-gradient-to-r from-cyan-600 to-emerald-500 px-5 py-2 text-xs font-semibold text-white shadow transition hover:brightness-105">
                Send Reply
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : (
      <div className="flex h-full items-center justify-center text-slate-400">
        <div className="text-center">
          <Inbox size={44} className="mx-auto mb-4 opacity-30" />
          <div className="text-sm">Select a conversation to read</div>
        </div>
      </div>
    )}
  </div>
);

export default ReadingPane;
