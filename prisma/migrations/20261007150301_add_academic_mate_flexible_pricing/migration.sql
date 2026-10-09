-- CreateEnum
CREATE TYPE "MateOfferingRateType" AS ENUM ('PER_SESSION', 'PER_HOUR', 'PER_WEEK', 'PER_MONTH', 'PER_COURSE', 'CUSTOM');

-- AlterTable
ALTER TABLE "MateOffering" ADD COLUMN     "rateDetails" TEXT,
ADD COLUMN     "rateType" "MateOfferingRateType" NOT NULL DEFAULT 'PER_SESSION';
