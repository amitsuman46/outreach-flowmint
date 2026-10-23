"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { STATUS_LABEL } from "@/lib/labels";
import type { ProspectListItem, ProspectStatus } from "@/lib/schemas";
import { IconAlert, IconGlobe, IconSearch, IconUsers } from "./icons";
import { Card, cx, EmptyState, relativeTime, StatusBadge } from "./ui";

function host(website: string | null): string {
  if (!website) return "—";
  try {
    return new URL(website).host.replace(/^www\./, "");
  } catch {
    return website;
  }
}

const AVATAR_TONES = [
  "bg-mint-100 text-mint-800",
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
];

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const tone = AVATAR_TONES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span className={cx("grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold", tone, className)}>
      {initials || "?"}
    </span>
  );
}

export function ProspectTable({
  rows,
  empty,
  filters = false,
  extra,
}: {
  rows: ProspectListItem[];
  empty: string;
  filters?: boolean;
  extra?: Record<string, { hasProposal: boolean; outdated?: boolean }>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProspectStatus | "all">("all");

  const statuses = useMemo(() => {
    const counts = new Map<ProspectStatus, number>();
    for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    return [...counts.entries()];
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return [row.name, row.company, row.email, row.title, row.website]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q));
    });
  }, [rows, query, status]);

  if (!rows.length) {
    return <EmptyState icon={<IconUsers size={20} />} title={empty} />;
  }

  return (
    <div className="space-y-3">
      {filters ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-60 flex-1 sm:max-w-xs">
            <IconSearch size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, company, email"
              className="h-10 w-full rounded-xl border-0 bg-white pr-3 pl-9 text-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-mint-500 focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
            {[["all", rows.length] as const, ...statuses].map(([key, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatus(key)}
                className={cx(
                  "rounded-lg px-2.5 py-1 text-[13px] font-medium transition-colors",
                  status === key ? "bg-ink text-white" : "text-slate-500 hover:text-slate-900",
                )}
              >
                {key === "all" ? "All" : STATUS_LABEL[key]}
                <span className={cx("ml-1.5 tabular-nums", status === key ? "text-slate-400" : "text-slate-400")}>{count}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-medium tracking-wider text-slate-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-medium">Person</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Site</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/desk/prospects/${row.id}`)}
                  className="group cursor-pointer transition-colors hover:bg-slate-50/80"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={row.name} />
                      <div className="min-w-0">
                        <Link
                          href={`/desk/prospects/${row.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="font-medium text-slate-900 group-hover:text-mint-700"
                        >
                          {row.name}
                        </Link>
                        <p className="max-w-56 truncate text-xs text-slate-500">{row.title || row.email || "—"}</p>
                      </div>
                    </div>
                    {row.rejectReason ? (
                      <p className="mt-1.5 ml-12 max-w-md text-xs leading-5 text-red-700">{row.rejectReason}</p>
                    ) : null}
                    {row.lastError ? (
                      <p className="mt-1.5 ml-12 flex max-w-md items-start gap-1 text-xs leading-5 text-amber-700">
                        <IconAlert size={12} className="mt-1 shrink-0" />
                        <span className="line-clamp-2">{row.lastError}</span>
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.company}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <IconGlobe size={13} className="text-slate-400" />
                      <span className="max-w-40 truncate">{host(row.website)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={row.status} />
                      {extra?.[row.id]?.outdated ? (
                        <span
                          className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                          title="The concept was rebuilt after this email was written. Refresh or rewrite it."
                        >
                          Outdated
                        </span>
                      ) : null}
                      {extra?.[row.id]?.hasProposal ? (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500" title="Concept page and PDF built">
                          Concept
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-xs whitespace-nowrap text-slate-500">
                    {relativeTime(row.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visible.length === 0 ? (
          <p className="border-t border-slate-100 px-5 py-8 text-center text-sm text-slate-500">No one matches that search.</p>
        ) : null}
      </Card>
    </div>
  );
}
