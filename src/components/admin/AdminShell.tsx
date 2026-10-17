import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut, Menu, Search, X } from "lucide-react";
import { matchesAdminNavigation } from "../../lib/adminNavigation";
import { calgaryDateTimeFormat } from "../../lib/calgaryTz";
import { toneColor, type Tone } from "./ui";
import "../../styles/admin.css";
export type NavItem = {
  id: string;
  label: string;
  short?: string;
  icon: React.ElementType;
  count?: number;
  tone?: Tone;
  href?: string;
  group?: string;
  description?: string;
  keywords?: string;
};
const clock = calgaryDateTimeFormat("en-CA", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
export function AdminShell({
  items,
  activeId,
  onSelect,
  title,
  subtitle,
  actions,
  children,
  onSignOut,
}: {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  onSignOut?: () => void;
}) {
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = React.useState(false),
    [search, setSearch] = React.useState(""),
    [now, setNow] = React.useState(Date.now());
  const dialog = React.useRef<HTMLDivElement>(null),
    trigger = React.useRef<HTMLButtonElement>(null),
    main = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  React.useEffect(() => {
    if (!moreOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMoreOpen(false);
        return;
      }
      if (e.key === "Tab") {
        const nodes = [
          ...(dialog.current?.querySelectorAll<HTMLElement>("button,a,input") ??
            []),
        ].filter(
          (el) => el.getClientRects().length && !el.hasAttribute("disabled"),
        );
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", key);
      trigger.current?.focus();
    };
  }, [moreOpen]);
  const go = (item: NavItem) => {
    setMoreOpen(false);
    setSearch("");
    if (item.href) navigate(item.href);
    else onSelect(item.id);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
      main.current?.focus({ preventScroll: true });
    });
  };
  const filtered = items.filter((item) => matchesAdminNavigation(item, search));
  const groups = [...new Set(filtered.map((i) => i.group || "Workspaces"))];
  const nav = (mobile = false) => (
    <>
      <label className="admin-nav-search">
        <Search size={16} />
        <input
          aria-label={mobile ? "Find an admin tool" : "Search admin tools"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a tool or task…"
        />
        {search ? (
          <button
            type="button"
            aria-label="Clear navigation search"
            onClick={() => setSearch("")}
          >
            <X size={14} />
          </button>
        ) : null}
      </label>
      {groups.map((group) => (
        <div key={group} className="admin-nav-group">
          <p>{group}</p>
          {filtered
            .filter((i) => (i.group || "Workspaces") === group)
            .map((item) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.id}
                  aria-current={activeId === item.id ? "page" : undefined}
                  onClick={() => go(item)}
                  title={item.description}
                >
                  <Icon size={18} />
                  <span>
                    <strong>{item.label}</strong>
                    {mobile && item.description ? (
                      <small>{item.description}</small>
                    ) : null}
                  </span>
                  {!!item.count ? (
                    <b
                      style={{
                        background: toneColor[item.tone ?? "attention"],
                        color: item.tone === "attention" ? "#17212d" : "white",
                      }}
                    >
                      {item.count > 99 ? "99+" : item.count}
                    </b>
                  ) : null}
                </button>
              );
            })}
        </div>
      ))}
      {!filtered.length ? (
        <p className="admin-nav-empty">
          No matching tools. Try “claims”, “email” or “reports”.
        </p>
      ) : null}
    </>
  );
  const primary = ["desk", "partners", "members", "content"]
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is NavItem => !!i);
  const moreActive = !primary.some((i) => i.id === activeId);
  return (
    <div className="admin-shell">
      <a className="admin-skip" href="#admin-main">
        Skip to workspace
      </a>
      <aside className="admin-rail" aria-label="Admin sidebar">
        <Link className="admin-back" to="/">
          <ArrowLeft size={15} />
          Back to CalgaryWatch
        </Link>
        <div className="admin-brand">
          <img
            src="/images/brand/calgarywatch-city-spark-v2.webp"
            width="40"
            height="40"
            alt=""
          />
          <div>
            <small>CALGARYWATCH</small>
            <strong>Admin workspace</strong>
          </div>
        </div>
        <p className="admin-clock">{clock.format(now)} · Calgary</p>
        <nav aria-label="Admin workspaces">{nav()}</nav>
        {onSignOut ? (
          <button className="admin-signout" type="button" onClick={onSignOut}>
            <LogOut size={16} />
            Sign out
          </button>
        ) : null}
      </aside>
      <div className="admin-canvas">
        <header className="admin-header">
          <button
            className="admin-mobile-menu"
            type="button"
            ref={trigger}
            aria-label="Open all admin tools"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={(e) => {trigger.current=e.currentTarget;setMoreOpen(true);}}
          >
            <Menu size={20} />
          </button>
          <div className="admin-heading">
            <p>CalgaryWatch / Admin</p>
            <h1>{title}</h1>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
          {actions ? (
            <div className="admin-header-actions">{actions}</div>
          ) : null}
        </header>
        <main id="admin-main" tabIndex={-1} ref={main} className="admin-main">
          {children}
        </main>
      </div>
      <nav className="admin-mobile-tabs" aria-label="Frequent admin tools">
        {primary.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              aria-current={activeId === item.id ? "page" : undefined}
              onClick={() => go(item)}
            >
              <Icon size={19} />
              <span>{item.short ?? item.label}</span>
              {!!item.count ? (
                <b>{item.count > 99 ? "99+" : item.count}</b>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          aria-label="More admin tools"
          aria-current={moreActive ? "page" : undefined}
          onClick={(e) => {trigger.current=e.currentTarget;setMoreOpen(true);}}
        >
          <Menu size={19} />
          <span>All tools</span>
        </button>
      </nav>
      {moreOpen ? (
        <div
          className="admin-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMoreOpen(false);
          }}
        >
          <div
            className="admin-tool-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-tools-title"
            ref={dialog}
          >
            <div className="admin-dialog-heading">
              <h2 id="admin-tools-title">All admin tools</h2>
              <button
                type="button"
                aria-label="Close admin tools"
                onClick={() => setMoreOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            {nav(true)}
            <div className="admin-dialog-footer">
              <Link to="/">Back to the site</Link>
              {onSignOut ? (
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    onSignOut();
                  }}
                >
                  Sign out
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
