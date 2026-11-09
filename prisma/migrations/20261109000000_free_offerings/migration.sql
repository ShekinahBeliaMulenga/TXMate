-- Tutors can offer a course for free. Free offerings store a rate of 0.
ALTER TYPE "MateOfferingRateType" ADD VALUE IF NOT EXISTS 'FREE';
