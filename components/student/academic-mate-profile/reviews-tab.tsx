import RatingSummary from "@/components/student/rating-summary";
import { formatDate, reviewsLabel } from "./format";
import { Avatar, Block, Empty, FOCUS, Icon, Stars, Surface } from "./profile-ui";
import type { Review, Statistics } from "./types";

type ReviewerStats = Record<string, { average: number | null; count: number }>;

/** One entry per student: their average rating and how many reviews they left; the newest review shows, earlier ones fold away. */
export function ReviewerList({ reviews, reviewerStats }: { reviews: readonly Review[]; reviewerStats?: ReviewerStats }) {
  const groups = Array.from(
    reviews.reduce((map, review) => {
      const id = review.reviewerUser.id;
      const group = map.get(id);
      if (group) group.reviews.push(review);
      else map.set(id, { id, reviewer: review.reviewerUser, reviews: [review] });
      return map;
    }, new Map<string, { id: string; reviewer: Review["reviewerUser"]; reviews: Review[] }>()).values(),
  ).map((group) => {
    const known = reviewerStats?.[group.id];
    const listed = group.reviews.reduce((sum, review) => sum + review.rating, 0) / group.reviews.length;
    return { ...group, count: known?.count ?? group.reviews.length, average: Math.round((known?.average ?? listed) * 10) / 10 };
  });
  return (
    <ul className="divide-y divide-[#efe8e1]">
      {groups.map(({ id, reviewer, reviews: list, count, average }) => (
        <li key={id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start gap-2.5">
            <Avatar name={reviewer.name} image={reviewer.image} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <p className="text-[13px] font-semibold leading-5 text-[#282321]">{reviewer.name}</p>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#282321]" aria-label={`Average ${average} out of 5 from ${reviewsLabel(count)}`}>
                  <Icon name="star" className="h-3 w-3 fill-amber-500 text-amber-500" />{average.toFixed(1)}
                  <span className="font-normal text-[#7a6f6a]">· {reviewsLabel(count)}</span>
                </span>
              </div>
              <ReviewLine review={list[0]} showStars latest={list.length > 1} />
              {list.length > 1 && (
                <details className="group mt-1">
                  <summary className={`inline-flex cursor-pointer list-none items-center gap-1 rounded text-[11px] font-medium text-[#7d1f2a] ${FOCUS}`}>
                    <span className="group-open:hidden">Show {list.length - 1} earlier {list.length === 2 ? "review" : "reviews"}</span>
                    <span className="hidden group-open:inline">Hide earlier reviews</span>
                  </summary>
                  <ul className="mt-1 space-y-2">
                    {list.slice(1).map((review) => <li key={review.id}><ReviewLine review={review} showStars /></li>)}
                  </ul>
                </details>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ReviewsTab({ reviews, reviewerStats, statistics }: { reviews: readonly Review[]; reviewerStats?: ReviewerStats; statistics: Statistics }) {
  return (
    <Surface>
      <Block title="Reviews" icon="star" aside={statistics.totalReviews > 0 ? <span className="text-[11px] font-medium text-[#6d6260]">{reviewsLabel(statistics.totalReviews)}</span> : null}>
        <RatingSummary average={statistics.averageRating} count={statistics.totalReviews} distribution={statistics.ratingDistribution} />
        {reviews.length === 0 ? <Empty text="No reviews yet." /> : <ReviewerList reviews={reviews} reviewerStats={reviewerStats} />}
      </Block>
    </Surface>
  );
}

/** One review: stars, date and comment. `latest` marks the newest of several reviews from the same student. */
function ReviewLine({ review, showStars, latest = false }: { review: Review; showStars: boolean; latest?: boolean }) {
  return (
    <div className="mt-1 border-l-2 border-[#efe8e1] pl-3">
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        {showStars ? <Stars rating={review.rating} className="h-3 w-3" /> : <span className="text-[10px] font-medium text-[#7a6f6a]">{review.rating}/5</span>}
        <time dateTime={review.createdAt} className="text-[10px] leading-4 text-[#7a6f6a]">{latest ? "Latest · " : ""}{formatDate(review.createdAt)}</time>
      </div>
      {review.comment && <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-[1.5] text-[#514844]">{review.comment}</p>}
    </div>
  );
}