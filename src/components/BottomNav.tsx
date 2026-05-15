"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  BrushIcon,
  TruckIcon,
  UserIcon,
  StorefrontIcon,
} from "./Icons";
import Avatar from "./Avatar";
import { useAppState, useHydrated } from "@/lib/store";

const items = [
  { href: "/", label: "Home", Icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/design", label: "Design", Icon: BrushIcon, match: (p: string) => p.startsWith("/design") },
  { href: "/deliveries", label: "Deliveries", Icon: TruckIcon, match: (p: string) => p.startsWith("/deliveries") },
  { href: "/other-designs", label: "Browse", Icon: StorefrontIcon, match: (p: string) => p.startsWith("/other-designs") },
  { href: "/profile", label: "Profile", Icon: UserIcon, match: (p: string) => p.startsWith("/profile") },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { profile } = useAppState();
  const hydrated = useHydrated();

  return (
    <nav className="sticky bottom-0 z-30 border-t border-[var(--border)] bg-white/90 backdrop-blur">
      <ul className="mx-auto flex max-w-3xl items-stretch justify-around">
        {items.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          const isProfile = href === "/profile";
          const showAvatar = isProfile && hydrated && profile.avatar;

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
                  active
                    ? "text-[var(--primary)] font-semibold"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {showAvatar ? (
                  <Avatar
                    name={profile.name}
                    src={profile.avatar}
                    size={22}
                    className={
                      active
                        ? "ring-2 ring-[var(--primary)] ring-offset-1"
                        : ""
                    }
                  />
                ) : (
                  <Icon size={22} />
                )}
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
