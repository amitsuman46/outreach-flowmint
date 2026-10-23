"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DeskCounts } from "@/lib/counts";
import { IconBan, IconHome, IconInbox, IconSend, IconUsers } from "./icons";
import { cx } from "./ui";

const links = [
  { href: "/desk", label: "Overview", icon: IconHome },
  { href: "/desk/gathered", label: "Leads", icon: IconUsers, count: "gathered" },
  { href: "/desk/sent", label: "Sent items", icon: IconSend, count: "sent" },
  { href: "/desk/inbox", label: "Mail", icon: IconInbox, count: "replies" },
  { href: "/desk/rejected", label: "Rejected", icon: IconBan, count: "rejected" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/desk") return pathname === "/desk";
  if (href === "/desk/gathered" && pathname.startsWith("/desk/prospects")) return true;
  return pathname.startsWith(href);
}

export function DeskNav({ counts, variant }: { counts: DeskCounts; variant: "side" | "top" }) {
  const pathname = usePathname();

  if (variant === "top") {
    return (
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cx(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px]",
              isActive(pathname, link.href) ? "bg-white/12 text-white" : "text-slate-400",
            )}
          >
            <link.icon size={14} />
            {link.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5">
      {links.map((link) => {
        const active = isActive(pathname, link.href);
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
            {"count" in link ? (
              <span
                className={cx(
                  "min-w-6 rounded-md px-1.5 text-center text-[11px] font-medium tabular-nums",
                  active ? "bg-mint-500/20 text-mint-200" : "bg-white/6 text-slate-400",
                )}
              >
                {counts[link.count]}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
