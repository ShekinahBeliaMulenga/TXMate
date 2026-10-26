import { redirect } from "next/navigation";

/** Session details open as a pop-up on the Sessions page. This keeps every older link working. */
export default async function SessionDetailsRedirect({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  redirect(`/student/sessions?session=${encodeURIComponent(sessionId)}`);
}
