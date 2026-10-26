"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { STATUS_LABEL } from "@/lib/labels";
import type { ProspectListItem, ProspectStatus } from "@/lib/schemas";
import { IconAlert, IconCalendar, IconGlobe, IconSearch, IconTrash, IconUsers } from "./icons";
import { useToast } from "./toast";
import { Button, Card, cx, EmptyState, Notice, relativeTime, StatusBadge } from "./ui";

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
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProspectStatus | "all">("all");
  const [uploaded, setUploaded] = useState<string>("any");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Upload days, newest first, for the "Uploaded" filter.
  const uploadDays = useMemo(() => {
    const days = new Map<string, number>();
    for (const row of rows) days.set(dayKey(row.createdAt), (days.get(dayKey(row.createdAt)) ?? 0) + 1);
    return [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  const statuses = useMemo(() => {
    const counts = new Map<ProspectStatus, number>();
    for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    return [...counts.entries()];
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!matchesUpload(row.createdAt, uploaded)) return false;
      if (!q) return true;
      return [row.name, row.company, row.email, row.title, row.website]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q));
    });
  }, [rows, query, status, uploaded]);

  const visibleIds = visible.map((row) => row.id);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function remove(ids: string[]) {
    setDeleting(true);
    try {
      const response = await fetch("/api/prospects/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await response.json().catch(() => ({}))) as { deleted?: number; error?: string };
      if (!response.ok) {
        toast("error", "Not deleted", data.error);
        return;
      }
      toast("success", `Deleted ${data.deleted} ${data.deleted === 1 ? "lead" : "leads"}`);
      setSelected((current) => new Set([...current].filter((id) => !ids.includes(id))));
      setConfirm(null);
      router.refresh();
    } catch {
      toast("error", "Could not reach the desk server");
    } finally {
      setDeleting(false);
    }
  }

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
          <label className="flex h-10 items-center gap-2 rounded-xl bg-white pr-2 pl-3 text-[13px] text-slate-500 ring-1 ring-slate-200">
            <IconCalendar size={14} className="text-slate-400" />
            Uploaded
            <select
              suppressHydrationWarning
              value={uploaded}
              onChange={(event) => setUploaded(event.target.value)}
              className="h-full cursor-pointer rounded-lg bg-transparent pr-1 font-medium text-slate-800 focus:outline-none"
            >
              <option value="any">Any time</option>
              <option value="today">Today</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              {uploadDays.length ? <option disabled>──────────</option> : null}
              {uploadDays.map(([day, count]) => (
                <option key={day} value={`day:${day}`}>
                  {formatDay(day)} · {count} {count === 1 ? "lead" : "leads"}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {selectedVisible.length ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink px-4 py-2.5 text-[13px] text-white animate-fade-in">
          <span>
            {selectedVisible.length} {selectedVisible.length === 1 ? "lead" : "leads"} selected
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" variant="danger" icon={<IconTrash size={13} />} onClick={() => setConfirm(selectedVisible)}>
              Delete selected
            </Button>
          </div>
        </div>
      ) : null}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-medium tracking-wider text-slate-500 uppercase">
              <tr>
                <th className="w-10 py-3 pr-0 pl-5">
                  <input
                    type="checkbox"
                    aria-label="Select all shown"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set([...selected, ...visibleIds]))}
                    className="size-4 cursor-pointer rounded accent-mint-700"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Person</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Site</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Uploaded</th>
                <th className="w-12 py-3 pr-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/desk/prospects/${row.id}${row.mode === "template" ? "?mode=template" : ""}`)}
                  className={cx(
                    "group cursor-pointer transition-colors hover:bg-slate-50/80",
                    selected.has(row.id) && "bg-mint-50/50",
                  )}
                >
                  <td className="py-3 pr-0 pl-5" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.name}`}
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      className="size-4 cursor-pointer rounded accent-mint-700"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={row.name} />
                      <div className="min-w-0">
                        <Link
                          href={`/desk/prospects/${row.id}${row.mode === "template" ? "?mode=template" : ""}`}
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
                  <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                    {/* Times depend on the viewer's clock, so the server's render may differ slightly. */}
                    <span className="text-slate-700" suppressHydrationWarning>
                      {formatDay(dayKey(row.createdAt))}
                    </span>
                    <span className="block text-[11px] text-slate-400" suppressHydrationWarning>
                      updated {relativeTime(row.updatedAt)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setConfirm([row.id])}
                      aria-label={`Delete ${row.name}`}
                      title="Delete lead"
                      className="rounded-lg p-1.5 text-slate-300 opacity-60 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100"
                    >
                      <IconTrash size={15} />
                    </button>
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
      {confirm ? (
        <DeleteDialog
          rows={rows.filter((row) => confirm.includes(row.id))}
          extra={extra}
          deleting={deleting}
          onCancel={() => setConfirm(null)}
          onConfirm={() => remove(confirm)}
        />
      ) : null}
    </div>
  );
}

function DeleteDialog({
  rows,
  extra,
  deleting,
  onCancel,
  onConfirm,
}: {
  rows: ProspectListItem[];
  extra?: Record<string, { hasProposal: boolean; outdated?: boolean }>;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const contacted = rows.filter((row) => row.status === "sent" || row.status === "replied");
  // Their email links to a concept page that disappears with the lead on the next publish.
  const liveLinks = contacted.filter((row) => row.mode === "ppt" && extra?.[row.id]?.hasProposal);
  const one = rows.length === 1;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-[2px] sm:items-center animate-fade-in">
      <Card className="w-full max-w-md p-5 shadow-2xl animate-slide-up">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
            <IconTrash size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-slate-900">
              Delete {one ? rows[0]?.name ?? "this lead" : `${rows.length} leads`}?
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-slate-500">
              Their site review, draft{rows.some((row) => row.mode === "ppt") ? ", concept and PDF" : ""} are removed. This
              can&apos;t be undone. Emails already sent stay in Sent items, and re-importing {one ? "them" : "these people"} still shows
              them as contacted.
            </p>
          </div>
        </div>
        {liveLinks.length ? (
          <Notice tone="warn" className="mt-4">
            {liveLinks.length === 1 ? `${liveLinks[0].name} was` : `${liveLinks.length} of these were`} emailed a concept link. It stops
            working once the concept site is next published.
          </Notice>
        ) : contacted.length ? (
          <Notice tone="info" className="mt-4">
            {contacted.length === 1 ? "This lead was" : `${contacted.length} of these were`} already emailed.
          </Notice>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={deleting} icon={<IconTrash size={14} />}>
            {deleting ? "Deleting…" : one ? "Delete lead" : `Delete ${rows.length} leads`}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Local calendar day, as YYYY-MM-DD, for grouping uploads. */
function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = dayKey(new Date().toISOString());
  if (key === today) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday.toISOString())) return "Yesterday";
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function matchesUpload(iso: string, filter: string): boolean {
  if (filter === "any") return true;
  if (filter.startsWith("day:")) return dayKey(iso) === filter.slice(4);
  if (filter === "today") return dayKey(iso) === dayKey(new Date().toISOString());
  const days = Number(filter);
  return Date.now() - new Date(iso).getTime() <= days * 24 * 60 * 60 * 1000;
}

