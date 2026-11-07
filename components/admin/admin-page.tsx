import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Standard page: a full-width header band (breadcrumb, title, description, actions) over a content area.
 * `crumbs` lets detail pages say where they sit without a word-labelled back button.
 */
export default function AdminPage({ title, description, actions, children, crumbs, width = "7xl" }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; crumbs?: Array<{ label: string; href?: string }>; width?: "4xl" | "6xl" | "7xl" }) {
  const max = width === "4xl" ? "max-w-4xl" : width === "7xl" ? "max-w-7xl" : "max-w-6xl";
  return (
    <div>
      <div className="border-b border-[#e4dfd9] bg-white">
        <div className={`mx-auto w-full ${max} px-4 py-5 sm:px-6 lg:px-8`}>
          {crumbs && crumbs.length > 0 ? (
            <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1.5 text-[13px] text-[#7a716a]">
              {crumbs.map((crumb, index) => (
                <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                  {index > 0 ? <span aria-hidden="true">/</span> : null}
                  {crumb.href ? <Link href={crumb.href} className="hover:text-[#7d1f2a] hover:underline">{crumb.label}</Link> : <span>{crumb.label}</span>}
                </span>
              ))}
            </nav>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="break-words text-xl font-semibold tracking-tight text-[#1f1a17] sm:text-2xl">{title}</h1>
              {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6b635d]">{description}</p> : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        </div>
      </div>
      <div className={`mx-auto w-full ${max} px-4 py-6 sm:px-6 lg:px-8`}>{children}</div>
    </div>
  );
}
