export type ArrangementType = "ONE_TIME" | "RECURRING";

export type Proposal = {
  id: string;
  sessionId: string;
  proposedStart: string;
  proposedEnd: string;
  reason: string | null;
  createdAt: string;
  proposedByName: string | null;
  session: {
    id: string;
    status: string;
    scheduledStart: string;
    scheduledEnd: string;
    meetingLocation: string;
    arrangementType: ArrangementType;
    arrangementStatus: string;
    studentName: string;
    studentImage: string | null;
    courseCode: string;
    courseName: string;
    offeringTitle: string | null;
  };
};

/** Raw shape returned by the reschedule-requests endpoint. */
export type ProposalsResponse = {
  count?: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  proposals?: Proposal[];
  error?: string;
};

/** Normalised page of results used by the UI. */
export type ProposalsPage = {
  proposals: Proposal[];
  total: number;
  page: number;
  hasMore: boolean;
};
