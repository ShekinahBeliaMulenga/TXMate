import RatingSummary from "@/components/student/rating-summary";
import { formatDate, reviewsLabel } from "./format";
import { Avatar, Block, Empty, Stars, Surface } from "./profile-ui";
import type { Review, Statistics } from "./types";

export default function ReviewsTab({
  reviews,
  statistics,
}: {
  reviews: readonly Review[];
  statistics: Statistics;
}) {
  const groupedReviews = Array.from(
    reviews.reduce((groups, review) => {
      const reviewerId = review.reviewerUser.id;
      const existing = groups.get(reviewerId);

      if (existing) {
        existing.reviews.push(review);
      } else {
        groups.set(reviewerId, {
          reviewer: review.reviewerUser,
          reviews: [review],
        });
      }

      return groups;
    }, new Map<string, { reviewer: Review["reviewerUser"]; reviews: Review[] }>()),
    ([id, group]) => ({ id, ...group }),
  );

  return (
    <Surface>
      <Block
        title="Reviews"
        icon="star"
        aside={
          statistics.totalReviews > 0 ? (
            <span className="text-[11px] font-medium text-[#6d6260]">
              {reviewsLabel(statistics.totalReviews)}
            </span>
          ) : null
        }
      >
        <RatingSummary
          average={statistics.averageRating}
          count={statistics.totalReviews}
          distribution={statistics.ratingDistribution}
        />

        {reviews.length === 0 ? (
          <Empty text="No reviews yet." />
        ) : (
          <ul className="divide-y divide-[#efe8e1]">
            {groupedReviews.map(({ id, reviewer, reviews: studentReviews }) => (
              <li key={id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-2.5">
                  <Avatar
                    name={reviewer.name}
                    image={reviewer.image}
                    size={32}
                  />

                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold leading-5 text-[#282321]">
                      {reviewer.name}
                    </p>
                    {studentReviews.length > 1 && (
                      <p className="text-[11px] text-[#7a6f6a]">
                        {studentReviews.length} reviews
                      </p>
                    )}

                    <ul className="mt-2 space-y-3">
                      {studentReviews.map((review) => (
                        <li
                          key={review.id}
                          className="border-l-2 border-[#efe8e1] pl-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                            <Stars
                              rating={review.rating}
                              className="h-3 w-3"
                            />
                            <time
                              dateTime={review.createdAt}
                              className="text-[10px] leading-4 text-[#7a6f6a]"
                            >
                              {formatDate(review.createdAt)}
                            </time>
                          </div>

                          {review.comment && (
                            <p className="mt-1 whitespace-pre-wrap text-[12px] leading-[1.5] text-[#514844]">
                              {review.comment}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </Surface>
  );
}