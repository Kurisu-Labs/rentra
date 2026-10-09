"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { privyConfigured } from "@/lib/contracts";
import { shortAddr } from "@/lib/format";
import { Icon } from "@/components/icon";

const links = [
  { href: "/", label: "Explore" },
  { href: "/my", label: "My rentals" },
  { href: "/reputation", label: "Reputation" },
];

export function Header() {
  const pathname = usePathname();
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { address } = useAccount();
  const who = user?.email?.address || user?.google?.email || shortAddr(address);

  return (
    <header className="header">
      <Link href="/" className="brand" aria-label="Rentra home">
        <span className="brand-mark">
          <Icon name="box" size={23} />
        </span>
        <strong>
          rentra<span className="brand-dot">.</span>
        </strong>
      </Link>
      <nav className="nav" aria-label="Main navigation">
        {links.map(({ href, label }) => {
          const active =
            href === "/"
              ? pathname === "/" || pathname.startsWith("/items/")
              : pathname.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}>
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="header-actions">
        <Link
          href="/list"
          className="list-link"
          aria-current={pathname === "/list" ? "page" : undefined}
        >
          List an item <span aria-hidden="true">+</span>
        </Link>
        {ready && authenticated ? (
          <>
            <span className="account-name small muted" title={who}>
              {who}
            </span>
            <button className="secondary" type="button" onClick={() => void logout()}>
              Sign out
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => login()}
            disabled={!ready || !privyConfigured}
            title={!privyConfigured ? "Sign-in is unavailable in this preview." : undefined}
          >
            Sign in <Icon name="arrow" size={16} />
          </button>
        )}
      </div>
    </header>
  );
}
