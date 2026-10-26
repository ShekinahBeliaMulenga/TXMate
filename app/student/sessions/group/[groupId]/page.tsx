import { redirect } from "next/navigation";

/** The attendance list opens as a pop-up on the Sessions page. This keeps notification links working. */
export default async function GroupSheetRedirect({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  redirect(`/student/sessions?group=${encodeURIComponent(groupId)}`);
}
