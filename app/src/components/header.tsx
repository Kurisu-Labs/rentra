"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { Icon } from "@/components/icon";

const links = [
  { href: "/", label: "Explore" },
  { href: "/my", label: "My rentals" },
  { href: "/reputation", label: "Reputation" },
];

export function Header() {
  const pathname = usePathname();

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
        <WalletConnectButton />
      </div>
    </header>
  );
}
