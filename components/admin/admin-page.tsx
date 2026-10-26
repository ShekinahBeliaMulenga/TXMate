import type { ReactNode } from "react";

/** Standard page container: width, padding, and a consistent title block with optional actions. */
export default function AdminPage({ title, description, actions, children, width = "6xl" }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; width?: "4xl" | "6xl" | "7xl" }) {
  const max = width === "4xl" ? "max-w-4xl" : width === "7xl" ? "max-w-7xl" : "max-w-6xl";
  return (
    <div className={`mx-auto w-full ${max} px-4 py-6 sm:px-6 lg:px-8`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-[#282321]">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6d6260]">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
