import AdminPage from "@/components/admin/admin-page";
import ReviewsModeration from "@/components/admin/reviews-moderation";
import { requireAdminPage } from "@/lib/admin/guard";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
  await requireAdminPage("reviews:moderate");
  return (
    <AdminPage title="Reviews" description="Hide a review that breaks the rules. It stays on record, students stop seeing it, and it stops counting in the Academic Mate’s rating. Every change needs a reason and is audited.">
      <ReviewsModeration />
    </AdminPage>
  );
}
