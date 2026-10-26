export type ProfileVisibility = "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";
export type AcademicMateStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type VerificationStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
export type MateOfferingStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type MateOfferingRateType = "PER_SESSION" | "PER_HOUR" | "PER_WEEK" | "PER_MONTH" | "PER_COURSE" | "CUSTOM";
export type Weekday = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
export type StudentStatus = "ACTIVE" | "GRADUATED" | "SUSPENDED" | "WITHDRAWN";
export type RequestStatus = "REQUESTED" | "ACCEPTED";

export type Offering = {
  id: string;
  course: { id: string; code: string; name: string; description: string | null };
  title: string | null;
  description: string | null;
  rate: string;
  currency: string;
  sessionDurationMinutes: number;
  rateType: MateOfferingRateType;
  rateDetails: string | null;
  status: MateOfferingStatus;
  verificationStatus: VerificationStatus;
  topics: Array<{ id: string; name: string; description: string | null }>;
  isOutsideCurrentCurriculum: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AvailabilitySlot = {
  id: string;
  mateOfferingId: string;
  day: Weekday;
  startMinute: number;
  endMinute: number;
  timezone: string;
  isActive: boolean;
};

export type Experience = {
  id: string;
  title: string;
  organisation: string | null;
  description: string | null;
  startYear: number | null;
  endYear: number | null;
  createdAt: string;
  updatedAt: string;
};

export type Qualification = {
  id: string;
  name: string;
  issuer: string | null;
  year: number | null;
  credentialUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Review = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerUser: { id: string; name: string; image: string | null };
};

export type StudentInfo = {
  id: string;
  studentId: string | null;
  gender: "MALE" | "FEMALE";
  status: StudentStatus;
  phoneNumber: string | null;
  bio: string | null;
  profileVisibility: ProfileVisibility;
  university: { id: string; code: string; name: string; slug: string };
  school: { id: string; code: string; name: string };
  department: { id: string; code: string; name: string } | null;
  programme: { id: string; code: string; name: string; level: string; durationYears: number };
  programmeYear: { id: string; yearNumber: number };
  courses: Array<{
    id: string;
    semester: number | null;
    status: string;
    academicYear: { id: string; name: string; isCurrent: boolean };
    course: { id: string; code: string; name: string; description: string | null; credits: number | null };
  }>;
};

export type Statistics = {
  totalOfferings: number;
  totalAvailabilitySlots: number;
  totalExperiences: number;
  totalQualifications: number;
  totalReviews: number;
  averageRating: number | null;
  ratingDistribution?: Record<string, number>;
};

export type Viewer = { signedIn: boolean; canRequest: boolean; isOwner: boolean };
export type RequestsByOffering = Record<string, { id: string; status: RequestStatus; hasSession: boolean }>;

export type ProfileResponse = {
  profile: {
    id: string;
    status: AcademicMateStatus;
    verificationStatus: VerificationStatus;
    headline: string | null;
    bio: string | null;
    teachingExperience: string | null;
    yearsExperience: number | null;
    profileVisibility: ProfileVisibility;
    verifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  user: { id: string; name: string; image: string | null };
  student: StudentInfo | null;
  offerings: Offering[];
  availability: AvailabilitySlot[];
  experiences: Experience[];
  qualifications: Qualification[];
  reviews: Review[];
  statistics: Statistics;
  viewer: Viewer;
  requestsByOffering: RequestsByOffering;
};

export type TabId = "about" | "courses" | "reviews" | "availability";
