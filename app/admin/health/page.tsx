import Link from "next/link";
import AdminPage from "@/components/admin/admin-page";
import { Badge, EmptyState, Panel } from "@/components/admin/admin-ui";
import { requireAdminPage } from "@/lib/admin/guard";
import { getHealthReport } from "@/lib/admin/ops";

export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
  const admin = await requireAdminPage("system:view");
  const report = await getHealthReport(admin);
  const problems = report.checks.filter((check) => check.count > 0);

  return (
    <AdminPage title="System health" description="Live checks of the database and of the data your universities depend on. Every number here is counted when you open the page.">
      <div className="space-y-6">
        <Panel title="Services">
          <ul className="divide-y divide-[#eee9e3]">
            <li className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm font-medium">Database</span>
              {report.database.ok ? <Badge tone="success">Reachable{report.database.latencyMs !== null ? ` · ${report.database.latencyMs} ms` : ""}</Badge> : <Badge tone="danger">Not reachable</Badge>}
            </li>
            {report.deliveries === null ? (
              <li className="px-4 py-3 text-[13px] text-[#6b635d]">Notification delivery is only shown to platform admins.</li>
            ) : report.deliveries.length === 0 ? (
              <li className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium">Notification delivery</span>
                <Badge tone="success">No failed or waiting deliveries</Badge>
              </li>
            ) : (
              report.deliveries.map((channel) => (
                <li key={channel.channel} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{channel.channel} delivery</span>
                    <Badge tone={channel.failed > 0 ? "danger" : "warning"}>{channel.failed} failed · {channel.pending} waiting</Badge>
                  </div>
                  {channel.examples.map((example, index) => (
                    <p key={index} className="mt-1 break-words text-[13px] text-[#6b635d]">{example.when}: {example.reason}</p>
                  ))}
                </li>
              ))
            )}
          </ul>
        </Panel>

        <Panel title={problems.length === 0 ? "Data checks" : `Data checks · ${problems.length} need attention`}>
          {report.checks.length === 0 ? (
            <EmptyState icon="info" title="No checks to run" />
          ) : (
            <ul className="divide-y divide-[#eee9e3]">
              {report.checks.map((check) => (
                <li key={check.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold text-[#1f1a17]">{check.title}</h3>
                      <p className="mt-1 max-w-3xl text-[13px] leading-5 text-[#6b635d]">{check.explanation}</p>
                    </div>
                    <Badge tone={check.count > 0 ? "warning" : "success"}>{check.count > 0 ? `${check.count} found` : "All clear"}</Badge>
                  </div>
                  {check.count > 0 ? (
                    <div className="mt-3 text-[13px]">
                      {check.examples.length > 0 ? (
                        <ul className="mb-2 list-disc space-y-0.5 pl-5 text-[#4e4742]">
                          {check.examples.map((example) => <li key={example} className="break-words">{example}</li>)}
                          {check.count > check.examples.length ? <li className="list-none text-[#7a716a]">and {check.count - check.examples.length} more</li> : null}
                        </ul>
                      ) : null}
                      <p className="text-[#4e4742]"><span className="font-semibold">What to do: </span>{check.action}{check.href ? <> <Link href={check.href} className="font-semibold text-[#7d1f2a] hover:underline">Open it</Link></> : null}</p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <p className="text-xs text-[#7a716a]">Checked {new Date(report.generatedAt).toLocaleString("en-GB", { timeZone: "Africa/Lusaka" })}</p>
      </div>
    </AdminPage>
  );
}
