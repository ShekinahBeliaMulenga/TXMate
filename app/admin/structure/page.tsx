import Link from "next/link";
import AdminPage from "@/components/admin/admin-page";
import { EmptyState, Panel } from "@/components/admin/admin-ui";
import StructureManager from "@/components/admin/structure-manager";
import { requireAdminPage } from "@/lib/admin/guard";
import { getStructure } from "@/lib/admin/structure";
import { listUniversities } from "@/lib/admin/universities";

export const dynamic = "force-dynamic";

export default async function AdminStructurePage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  await requireAdminPage("universities:manage");
  const { u } = await searchParams;
  const universities = await listUniversities();
  const selected = universities.find((item) => item.id === u) ?? universities[0] ?? null;
  const schools = selected ? await getStructure(selected.id) : [];

  return (
    <AdminPage title="Academic structure" description="Schools, departments and programmes as students see them when they sign up. A programme can be chosen only when it has a department and at least one year of study.">
      {!selected ? (
        <Panel><EmptyState icon="university" title="No universities yet" hint="Add a university first, then build its structure here or import it from a file." action={<Link href="/admin/universities" className="text-sm font-semibold text-[#7d1f2a] hover:underline">Go to Universities</Link>} /></Panel>
      ) : (
        <div className="space-y-4">
          <nav aria-label="University" className="flex flex-wrap gap-2">
            {universities.map((item) => (
              <Link key={item.id} href={`/admin/structure?u=${encodeURIComponent(item.id)}`} aria-current={item.id === selected.id ? "page" : undefined} className={`rounded-md border px-3 py-2 text-sm ${item.id === selected.id ? "border-[#7d1f2a] bg-[#7d1f2a] font-semibold text-white" : "border-[#d9d3cc] bg-white text-[#3a332f] hover:bg-[#faf8f6]"}`}>
                {item.name}
              </Link>
            ))}
          </nav>
          <StructureManager schools={schools} universityName={selected.name} />
          <p className="text-[13px] text-[#6b635d]">To add many programmes at once, use the CSV imports (programmes, and courses for each programme and year) on the <Link href="/admin/universities" className="font-semibold text-[#7d1f2a] hover:underline">Universities</Link> page.</p>
        </div>
      )}
    </AdminPage>
  );
}
