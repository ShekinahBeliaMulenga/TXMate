-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "UniversityStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProgrammeLevel" AS ENUM ('CERTIFICATE', 'DIPLOMA', 'BACHELOR', 'MASTERS', 'DOCTORATE', 'OTHER');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'GRADUATED', 'SUSPENDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AcademicMateStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MateOfferingStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MateRequestStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TutoringSessionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'DISPUTED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PENDING', 'STUDENT_CHECKED_IN', 'CONFIRMED', 'DISPUTED', 'EXCUSED');

-- CreateEnum
CREATE TYPE "StudentCourseStatus" AS ENUM ('ENROLLED', 'COMPLETED', 'DROPPED', 'REPEATING');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SYSTEM', 'MATE_REQUEST', 'REQUEST_ACCEPTED', 'REQUEST_DECLINED', 'SESSION_SCHEDULED', 'SESSION_REMINDER', 'SESSION_COMPLETED', 'NEW_MESSAGE', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'PAYOUT_COMPLETED', 'REVIEW_RECEIVED', 'VERIFICATION_UPDATED', 'SUBSCRIPTION_UPDATED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MTN_ZAMBIA', 'AIRTEL_ZAMBIA', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'MEMBERS_ONLY', 'PRIVATE');

-- CreateEnum
CREATE TYPE "SubscriptionInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('PLATFORM_ADMIN', 'UNIVERSITY_ADMIN', 'MODERATOR', 'SUPPORT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "University" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "UniversityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "University_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniversitySettings" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "studentIdMinLength" INTEGER NOT NULL DEFAULT 1,
    "studentIdMaxLength" INTEGER NOT NULL DEFAULT 50,
    "studentIdPrefix" TEXT,
    "studentIdPattern" TEXT,
    "requireUniversityEmail" BOOLEAN NOT NULL DEFAULT false,
    "universityEmailDomain" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lusaka',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UniversitySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Programme" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "ProgrammeLevel" NOT NULL DEFAULT 'BACHELOR',
    "durationYears" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Programme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgrammeYear" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "yearNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgrammeYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "credits" DECIMAL(5,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgrammeCourse" (
    "id" TEXT NOT NULL,
    "programmeYearId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "semester" INTEGER,
    "isCompulsory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgrammeCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "programmeId" TEXT NOT NULL,
    "programmeYearId" TEXT NOT NULL,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "phoneNumber" TEXT,
    "bio" TEXT,
    "profileVisibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
    "showStudentId" BOOLEAN NOT NULL DEFAULT false,
    "showPhoneNumber" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentCourse" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "semester" INTEGER,
    "status" "StudentCourseStatus" NOT NULL DEFAULT 'ENROLLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseTopic" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicMateProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "studentProfileId" TEXT,
    "status" "AcademicMateStatus" NOT NULL DEFAULT 'ACTIVE',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "headline" TEXT,
    "bio" TEXT,
    "teachingExperience" TEXT,
    "yearsExperience" INTEGER,
    "profileVisibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
    "verifiedAt" TIMESTAMP(3),
    "verifiedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicMateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MateOffering" (
    "id" TEXT NOT NULL,
    "academicMateProfileId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "rate" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZMW',
    "sessionDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "status" "MateOfferingStatus" NOT NULL DEFAULT 'ACTIVE',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MateOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MateOfferingTopic" (
    "offeringId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,

    CONSTRAINT "MateOfferingTopic_pkey" PRIMARY KEY ("offeringId","topicId")
);

-- CreateTable
CREATE TABLE "MateOfferingVerification" (
    "id" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL,
    "notes" TEXT,
    "evidenceUrl" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MateOfferingVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MateAvailability" (
    "id" TEXT NOT NULL,
    "academicMateProfileId" TEXT NOT NULL,
    "day" "Weekday" NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MateAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicMateExperience" (
    "id" TEXT NOT NULL,
    "academicMateProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "organisation" TEXT,
    "description" TEXT,
    "startYear" INTEGER,
    "endYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicMateExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicMateQualification" (
    "id" TEXT NOT NULL,
    "academicMateProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "year" INTEGER,
    "credentialUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicMateQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MateRequest" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "message" TEXT,
    "requestedStart" TIMESTAMP(3),
    "requestedEnd" TIMESTAMP(3),
    "status" "MateRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutoringSession" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "meetingLocation" TEXT NOT NULL,
    "status" "TutoringSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutoringSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PENDING',
    "studentCheckedInAt" TIMESTAMP(3),
    "mateConfirmedAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "mateProfileId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "providerReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "payerUserId" TEXT NOT NULL,
    "academicMateProfileId" TEXT NOT NULL,
    "requestId" TEXT,
    "sessionId" TEXT,
    "provider" "PaymentProvider" NOT NULL,
    "providerTransactionId" TEXT,
    "externalReference" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "platformFee" DECIMAL(12,2) NOT NULL,
    "tutorAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZMW',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "academicMateProfileId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZMW',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "externalReference" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'ZMW',
    "defaultCommissionPercent" DECIMAL(5,2) NOT NULL,
    "premiumEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZMW',
    "interval" "SubscriptionInterval" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "providerReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUniversityAccess" (
    "id" TEXT NOT NULL,
    "adminProfileId" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUniversityAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "University_code_key" ON "University"("code");

-- CreateIndex
CREATE UNIQUE INDEX "University_slug_key" ON "University"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "UniversitySettings_universityId_key" ON "UniversitySettings"("universityId");

-- CreateIndex
CREATE INDEX "School_universityId_idx" ON "School"("universityId");

-- CreateIndex
CREATE UNIQUE INDEX "School_universityId_code_key" ON "School"("universityId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "School_id_universityId_key" ON "School"("id", "universityId");

-- CreateIndex
CREATE INDEX "Programme_universityId_schoolId_idx" ON "Programme"("universityId", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Programme_universityId_code_key" ON "Programme"("universityId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Programme_id_universityId_key" ON "Programme"("id", "universityId");

-- CreateIndex
CREATE INDEX "ProgrammeYear_programmeId_idx" ON "ProgrammeYear"("programmeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammeYear_programmeId_yearNumber_key" ON "ProgrammeYear"("programmeId", "yearNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammeYear_id_programmeId_key" ON "ProgrammeYear"("id", "programmeId");

-- CreateIndex
CREATE INDEX "AcademicYear_universityId_isCurrent_idx" ON "AcademicYear"("universityId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_universityId_name_key" ON "AcademicYear"("universityId", "name");

-- CreateIndex
CREATE INDEX "Course_universityId_code_idx" ON "Course"("universityId", "code");

-- CreateIndex
CREATE INDEX "Course_universityId_name_idx" ON "Course"("universityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Course_universityId_code_key" ON "Course"("universityId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Course_id_universityId_key" ON "Course"("id", "universityId");

-- CreateIndex
CREATE INDEX "ProgrammeCourse_courseId_idx" ON "ProgrammeCourse"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammeCourse_programmeYearId_courseId_key" ON "ProgrammeCourse"("programmeYearId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE INDEX "StudentProfile_universityId_programmeId_programmeYearId_idx" ON "StudentProfile"("universityId", "programmeId", "programmeYearId");

-- CreateIndex
CREATE INDEX "StudentProfile_programmeId_idx" ON "StudentProfile"("programmeId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_universityId_studentId_key" ON "StudentProfile"("universityId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_id_universityId_key" ON "StudentProfile"("id", "universityId");

-- CreateIndex
CREATE INDEX "StudentCourse_courseId_idx" ON "StudentCourse"("courseId");

-- CreateIndex
CREATE INDEX "StudentCourse_academicYearId_idx" ON "StudentCourse"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCourse_studentProfileId_courseId_academicYearId_key" ON "StudentCourse"("studentProfileId", "courseId", "academicYearId");

-- CreateIndex
CREATE INDEX "CourseTopic_name_idx" ON "CourseTopic"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CourseTopic_courseId_name_key" ON "CourseTopic"("courseId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicMateProfile_userId_key" ON "AcademicMateProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicMateProfile_studentProfileId_key" ON "AcademicMateProfile"("studentProfileId");

-- CreateIndex
CREATE INDEX "AcademicMateProfile_universityId_status_idx" ON "AcademicMateProfile"("universityId", "status");

-- CreateIndex
CREATE INDEX "AcademicMateProfile_universityId_verificationStatus_idx" ON "AcademicMateProfile"("universityId", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicMateProfile_id_universityId_key" ON "AcademicMateProfile"("id", "universityId");

-- CreateIndex
CREATE INDEX "MateOffering_universityId_courseId_status_idx" ON "MateOffering"("universityId", "courseId", "status");

-- CreateIndex
CREATE INDEX "MateOffering_universityId_verificationStatus_idx" ON "MateOffering"("universityId", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MateOffering_id_universityId_key" ON "MateOffering"("id", "universityId");

-- CreateIndex
CREATE UNIQUE INDEX "MateOffering_academicMateProfileId_courseId_key" ON "MateOffering"("academicMateProfileId", "courseId");

-- CreateIndex
CREATE INDEX "MateOfferingTopic_topicId_idx" ON "MateOfferingTopic"("topicId");

-- CreateIndex
CREATE INDEX "MateOfferingVerification_offeringId_status_idx" ON "MateOfferingVerification"("offeringId", "status");

-- CreateIndex
CREATE INDEX "MateAvailability_day_startMinute_endMinute_idx" ON "MateAvailability"("day", "startMinute", "endMinute");

-- CreateIndex
CREATE UNIQUE INDEX "MateAvailability_academicMateProfileId_day_startMinute_endM_key" ON "MateAvailability"("academicMateProfileId", "day", "startMinute", "endMinute");

-- CreateIndex
CREATE INDEX "AcademicMateExperience_academicMateProfileId_idx" ON "AcademicMateExperience"("academicMateProfileId");

-- CreateIndex
CREATE INDEX "AcademicMateQualification_academicMateProfileId_idx" ON "AcademicMateQualification"("academicMateProfileId");

-- CreateIndex
CREATE INDEX "MateRequest_universityId_status_createdAt_idx" ON "MateRequest"("universityId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MateRequest_studentProfileId_status_idx" ON "MateRequest"("studentProfileId", "status");

-- CreateIndex
CREATE INDEX "MateRequest_offeringId_status_idx" ON "MateRequest"("offeringId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TutoringSession_requestId_key" ON "TutoringSession"("requestId");

-- CreateIndex
CREATE INDEX "TutoringSession_scheduledStart_status_idx" ON "TutoringSession"("scheduledStart", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_sessionId_key" ON "Attendance"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_sessionId_key" ON "Review"("sessionId");

-- CreateIndex
CREATE INDEX "Review_mateProfileId_createdAt_idx" ON "Review"("mateProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_reviewerUserId_idx" ON "Review"("reviewerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_requestId_key" ON "Conversation"("requestId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderUserId_idx" ON "Message"("senderUserId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_channel_status_idx" ON "NotificationDelivery"("channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key" ON "NotificationDelivery"("notificationId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerTransactionId_key" ON "Payment"("providerTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_externalReference_key" ON "Payment"("externalReference");

-- CreateIndex
CREATE INDEX "Payment_payerUserId_createdAt_idx" ON "Payment"("payerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_academicMateProfileId_status_createdAt_idx" ON "Payment"("academicMateProfileId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_externalReference_key" ON "Payout"("externalReference");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_providerTransactionId_key" ON "Payout"("providerTransactionId");

-- CreateIndex
CREATE INDEX "Payout_academicMateProfileId_status_createdAt_idx" ON "Payout"("academicMateProfileId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_name_key" ON "SubscriptionPlan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_providerReference_key" ON "UserSubscription"("providerReference");

-- CreateIndex
CREATE INDEX "UserSubscription_userId_status_idx" ON "UserSubscription"("userId", "status");

-- CreateIndex
CREATE INDEX "UserSubscription_planId_status_idx" ON "UserSubscription"("planId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AdminProfile_userId_key" ON "AdminProfile"("userId");

-- CreateIndex
CREATE INDEX "AdminUniversityAccess_universityId_idx" ON "AdminUniversityAccess"("universityId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUniversityAccess_adminProfileId_universityId_key" ON "AdminUniversityAccess"("adminProfileId", "universityId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniversitySettings" ADD CONSTRAINT "UniversitySettings_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programme" ADD CONSTRAINT "Programme_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programme" ADD CONSTRAINT "Programme_schoolId_universityId_fkey" FOREIGN KEY ("schoolId", "universityId") REFERENCES "School"("id", "universityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeYear" ADD CONSTRAINT "ProgrammeYear_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeCourse" ADD CONSTRAINT "ProgrammeCourse_programmeYearId_fkey" FOREIGN KEY ("programmeYearId") REFERENCES "ProgrammeYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgrammeCourse" ADD CONSTRAINT "ProgrammeCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_programmeId_universityId_fkey" FOREIGN KEY ("programmeId", "universityId") REFERENCES "Programme"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_programmeYearId_programmeId_fkey" FOREIGN KEY ("programmeYearId", "programmeId") REFERENCES "ProgrammeYear"("id", "programmeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCourse" ADD CONSTRAINT "StudentCourse_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCourse" ADD CONSTRAINT "StudentCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCourse" ADD CONSTRAINT "StudentCourse_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseTopic" ADD CONSTRAINT "CourseTopic_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicMateProfile" ADD CONSTRAINT "AcademicMateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicMateProfile" ADD CONSTRAINT "AcademicMateProfile_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicMateProfile" ADD CONSTRAINT "AcademicMateProfile_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicMateProfile" ADD CONSTRAINT "AcademicMateProfile_verifiedByAdminId_fkey" FOREIGN KEY ("verifiedByAdminId") REFERENCES "AdminProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateOffering" ADD CONSTRAINT "MateOffering_academicMateProfileId_universityId_fkey" FOREIGN KEY ("academicMateProfileId", "universityId") REFERENCES "AcademicMateProfile"("id", "universityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateOffering" ADD CONSTRAINT "MateOffering_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateOffering" ADD CONSTRAINT "MateOffering_courseId_universityId_fkey" FOREIGN KEY ("courseId", "universityId") REFERENCES "Course"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateOfferingTopic" ADD CONSTRAINT "MateOfferingTopic_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "MateOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateOfferingTopic" ADD CONSTRAINT "MateOfferingTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "CourseTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateOfferingVerification" ADD CONSTRAINT "MateOfferingVerification_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "MateOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateOfferingVerification" ADD CONSTRAINT "MateOfferingVerification_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "AdminProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateAvailability" ADD CONSTRAINT "MateAvailability_academicMateProfileId_fkey" FOREIGN KEY ("academicMateProfileId") REFERENCES "AcademicMateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicMateExperience" ADD CONSTRAINT "AcademicMateExperience_academicMateProfileId_fkey" FOREIGN KEY ("academicMateProfileId") REFERENCES "AcademicMateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicMateQualification" ADD CONSTRAINT "AcademicMateQualification_academicMateProfileId_fkey" FOREIGN KEY ("academicMateProfileId") REFERENCES "AcademicMateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateRequest" ADD CONSTRAINT "MateRequest_studentProfileId_universityId_fkey" FOREIGN KEY ("studentProfileId", "universityId") REFERENCES "StudentProfile"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateRequest" ADD CONSTRAINT "MateRequest_offeringId_universityId_fkey" FOREIGN KEY ("offeringId", "universityId") REFERENCES "MateOffering"("id", "universityId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MateRequest" ADD CONSTRAINT "MateRequest_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutoringSession" ADD CONSTRAINT "TutoringSession_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MateRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TutoringSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "AdminProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TutoringSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_mateProfileId_fkey" FOREIGN KEY ("mateProfileId") REFERENCES "AcademicMateProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MateRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_academicMateProfileId_fkey" FOREIGN KEY ("academicMateProfileId") REFERENCES "AcademicMateProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MateRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TutoringSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_academicMateProfileId_fkey" FOREIGN KEY ("academicMateProfileId") REFERENCES "AcademicMateProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminProfile" ADD CONSTRAINT "AdminProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUniversityAccess" ADD CONSTRAINT "AdminUniversityAccess_adminProfileId_fkey" FOREIGN KEY ("adminProfileId") REFERENCES "AdminProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUniversityAccess" ADD CONSTRAINT "AdminUniversityAccess_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
