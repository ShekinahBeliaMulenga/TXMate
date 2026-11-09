export type ProfileVisibility = "PUBLIC" | "MEMBERS_ONLY" | "PRIVATE";
export type StudentStatus = "ACTIVE" | "GRADUATED" | "SUSPENDED" | "WITHDRAWN";

export type ProfileResponse = {
  studentProfile: {
    id: string;
    studentId: string;
    gender: "MALE" | "FEMALE";
    status: StudentStatus;
    phoneNumber: string | null;
    bio: string | null;
    profileVisibility: ProfileVisibility;
    showStudentId: boolean;
    showPhoneNumber: boolean;
  };
  user: { id: string; name: string; email: string; image: string | null };
};

/** The editable fields saved together by the Personal information and Privacy screens. */
export type SettingsFormValues = {
  name: string;
  /** Country of the phone number (ISO code, for example "ZM"). */
  phoneCountry: string;
  /** The phone number without its country code, digits only. */
  phoneNumber: string;
  bio: string;
  profileVisibility: ProfileVisibility;
  showStudentId: boolean;
  showPhoneNumber: boolean;
};
