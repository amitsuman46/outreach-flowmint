"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { DeskCounts } from "@/lib/counts";
import { IconBan, IconHome, IconInbox, IconSend, IconSparkles, IconUsers } from "./icons";
import { cx } from "./ui";

type NavLink = {
  href: string;
  label: string;
  icon: typeof IconHome;
  count?: (counts: DeskCounts) => number;
};

const groups: { label: string; links: NavLink[] }[] = [
  {
    label: "With PPT",
    links: [
      { href: "/desk", label: "Overview", icon: IconHome },
      { href: "/desk/gathered", label: "Leads", icon: IconUsers, count: (c) => c.leads },
    ],
  },
  {
    label: "Without PPT · template",
    links: [
      { href: "/desk/template", label: "Overview", icon: IconSparkles },
      { href: "/desk/template/leads", label: "Leads", icon: IconUsers, count: (c) => c.template.leads },
    ],
  },
  {
    label: "Mailbox",
    links: [
      { href: "/desk/sent", label: "Sent items", icon: IconSend, count: (c) => c.sent },
      { href: "/desk/inbox", label: "Mail", icon: IconInbox, count: (c) => c.replies },
      { href: "/desk/rejected", label: "Rejected", icon: IconBan, count: (c) => c.rejected },
    ],
  },
];

const links = groups.flatMap((group) => group.links);

function isActive(pathname: string, href: string, mode: "ppt" | "template" | null): boolean {
  if (href === "/desk" || href === "/desk/template") return pathname === href;
  // A lead page belongs to the Leads list of its own workflow.
  if (pathname.startsWith("/desk/prospects")) {
    return (href === "/desk/gathered" && mode !== "template") || (href === "/desk/template/leads" && mode === "template");
  }
  return pathname.startsWith(href);
}

export function DeskNav({ counts, variant }: { counts: DeskCounts; variant: "side" | "top" }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const mode = params.get("mode") === "template" ? "template" : pathname.startsWith("/desk/prospects") ? "ppt" : null;

  if (variant === "top") {
    return (
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cx(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px]",
              isActive(pathname, link.href, mode) ? "bg-white/12 text-white" : "text-slate-400",
            )}
          >
            <link.icon size={14} />
            {link.href.startsWith("/desk/template") ? `${link.label} (template)` : link.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 text-[11px] font-medium tracking-wider text-slate-500 uppercase">{group.label}</p>
          <nav className="flex flex-col gap-0.5">
            {group.links.map((link) => {
              const active = isActive(pathname, link.href, mode);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cx(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active ? "bg-white/8 text-white" : "text-slate-400 hover:bg-white/4 hover:text-slate-100",
                  )}
                >
                  {active ? <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-mint-400" /> : null}
                  <link.icon size={17} className={active ? "text-mint-300" : "text-slate-500 group-hover:text-slate-300"} />
                  <span className="flex-1">{link.label}</span>
                  {link.count ? (
                    <span
                      className={cx(
                        "min-w-6 rounded-md px-1.5 text-center text-[11px] font-medium tabular-nums",
                        active ? "bg-mint-500/20 text-mint-200" : "bg-white/6 text-slate-400",
                      )}
                    >
                      {link.count(counts)}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );
}
