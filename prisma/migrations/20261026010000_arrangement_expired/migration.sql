-- A one-time arrangement that nobody answered for 24h after its session ended is closed as EXPIRED,
-- which frees the student to request that offering again.
ALTER TYPE "TutoringArrangementStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
