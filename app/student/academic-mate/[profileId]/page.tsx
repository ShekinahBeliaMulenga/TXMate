"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AboutTab from "@/components/student/academic-mate-profile/about-tab";
import AvailabilityTab from "@/components/student/academic-mate-profile/availability-tab";
import CoursesTab from "@/components/student/academic-mate-profile/courses-tab";
import ProfileHeader from "@/components/student/academic-mate-profile/profile-header";
import ProfileTabs, { tabButtonId, tabPanelId, type TabItem } from "@/components/student/academic-mate-profile/profile-tabs";
import RequestCta from "@/components/student/academic-mate-profile/request-cta";
import ReviewsTab from "@/components/student/academic-mate-profile/reviews-tab";
import type { Offering, ProfileResponse, RequestStatus, TabId } from "@/components/student/academic-mate-profile/types";
import { useInView } from "@/components/student/academic-mate-profile/use-in-view";
import SessionRequestDialog from "@/components/student/session-request-dialog";

type ApiError = { error?: string; message?: string };

const TABS: readonly TabItem[] = [
  { id: "about", label: "About" },
  { id: "courses", label: "Courses" },
  { id: "reviews", label: "Reviews" },
  { id: "availability", label: "Availability" },
];

export default function PublicAcademicMateProfilePage() {
  const params = useParams<{ profileId: string }>();
  const router = useRouter();
  const profileId = params.profileId;
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyOfferingId, setBusyOfferingId] = useState<string | null>(null);
  const [requestingOffering, setRequestingOffering] = useState<Offering | null>(null);
  const [tab, setTab] = useState<TabId>("about");
  const tabsRef = useRef<HTMLDivElement>(null);
  const [ctaRef, ctaInView] = useInView<HTMLDivElement>();

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/student/academic-mates/${encodeURIComponent(profileId)}`, {
      method: "GET", headers: { Accept: "application/json" }, cache: "no-store", signal,
    });
    const body = await response.json().catch(() => ({} as ApiError));
    if (!response.ok) throw new Error((body as ApiError).error || "Unable to load this Academic Mate profile.");
    setData(body as ProfileResponse);
  }, [profileId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setError(null);
    loadProfile(controller.signal)
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load this Academic Mate profile.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadProfile]);

  const sortedOfferings = useMemo(
    () => (data ? [...data.offerings].sort((a, b) => a.course.code.localeCompare(b.course.code)) : []),
    [data]
  );

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/student/find-academic-mate");
  }

  function showCourses() {
    setTab("courses");
    window.requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function handleRequest(offering: Offering) {
    if (!data?.viewer.canRequest || busyOfferingId) return;
    setActionError(null);
    setRequestingOffering(offering);
  }

  async function handleCancel(offering: Offering) {
    const request = data?.requestsByOffering[offering.id];
    if (!request || request.hasSession || busyOfferingId) return;
    setBusyOfferingId(offering.id);
    setActionError(null);
    try {
      const response = await fetch(`/api/student/mate-requests/${encodeURIComponent(request.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ action: "CANCELLED" }),
      });
      const body = await response.json().catch(() => ({} as ApiError));
      if (!response.ok) throw new Error((body as ApiError).error || "Unable to cancel the request.");
      setData((current) => {
        if (!current) return current;
        const requestsByOffering = { ...current.requestsByOffering };
        delete requestsByOffering[offering.id];
        return { ...current, requestsByOffering };
      });
      await loadProfile().catch(() => undefined);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to cancel the request.");
    } finally {
      setBusyOfferingId(null);
    }
  }

  if (loading) {
    const block = "animate-pulse rounded-xl border border-[#e2d9d0] bg-white";
    return (
      <main className="min-h-screen bg-[#f4f1ed] px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
        <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-5">
          <div className="overflow-hidden rounded-2xl border border-[#e2d9d0] bg-white">
            <div className="h-20 animate-pulse bg-[#7d1f2a]/70 sm:h-28" />
            <div className="px-4 pb-4">
              <div className="-mt-9 h-[72px] w-[72px] animate-pulse rounded-full bg-[#eee7df] ring-4 ring-white sm:-mt-10 sm:h-20 sm:w-20" />
              <div className="mt-3 h-6 w-44 animate-pulse rounded-lg bg-[#eee7df]" />
              <div className="mt-2 h-3.5 w-56 max-w-full animate-pulse rounded bg-[#f1ece7]" />
              <div className="mt-3 h-10 animate-pulse rounded-xl bg-[#f1ece7]" />
            </div>
          </div>
          <div className="mt-3 space-y-3 lg:mt-0">
            <div className={`h-10 ${block}`} />
            <div className={`h-56 ${block}`} />
          </div>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-[#f4f1ed] px-3 py-6 sm:px-6 lg:px-8">
        <div role="alert" className="mx-auto max-w-md rounded-2xl border border-[#e2d9d0] bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-[#282321]">Couldn’t load this Academic Mate profile</h1>
          <p className="mt-2 text-[13px] leading-5 text-[#6d6260]">{error ?? "This Academic Mate profile could not be loaded."}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-[#7d1f2a] px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#691923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2">Try again</button>
          <div><Link href="/student/find-academic-mate" className="mt-3 inline-block text-[13px] font-semibold text-[#7d1f2a] hover:underline">Back to Find Academic Mate</Link></div>
        </div>
      </main>
    );
  }

  const { profile, user, student, experiences, qualifications, reviews, statistics, viewer, requestsByOffering } = data;
  const showStickyCta = viewer.canRequest && !ctaInView;

  const cta = (compact: boolean) => (
    <RequestCta viewer={viewer} offerings={sortedOfferings} requestsByOffering={requestsByOffering} onRequest={handleRequest} onChooseCourse={showCourses} compact={compact} />
  );

  return (
    <main className={`min-h-screen bg-[#f4f1ed] px-3 py-3 sm:px-6 sm:py-4 lg:px-8 lg:pb-8 ${viewer.canRequest ? "pb-24" : "pb-6"}`}>
      <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start lg:gap-5">
        <div className="lg:sticky lg:top-4">
          <ProfileHeader profile={profile} user={user} student={student} statistics={statistics} onBack={goBack} action={<div ref={ctaRef}>{cta(false)}</div>} />
        </div>

        <div ref={tabsRef} className="mt-3 min-w-0 scroll-mt-4 lg:mt-0">
          {actionError ? <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs text-red-700">{actionError}</div> : null}

          <div className="overflow-hidden rounded-xl border border-[#ece5de] bg-white">
            <ProfileTabs tabs={TABS} active={tab} onChange={setTab} />
          </div>

          <div role="tabpanel" id={tabPanelId(tab)} aria-labelledby={tabButtonId(tab)} className="mt-3">
            {tab === "about" ? <AboutTab profile={profile} student={student} offerings={sortedOfferings} experiences={experiences} qualifications={qualifications} /> : null}
            {tab === "courses" ? (
              <CoursesTab offerings={sortedOfferings} requestsByOffering={requestsByOffering} viewer={viewer} busyOfferingId={busyOfferingId} onRequest={handleRequest} onCancel={(offering) => void handleCancel(offering)} />
            ) : null}
            {tab === "reviews" ? <ReviewsTab reviews={reviews} statistics={statistics} /> : null}
            {tab === "availability" ? <AvailabilityTab slots={data.availability} offerings={sortedOfferings} /> : null}
          </div>
        </div>
      </div>

      {showStickyCta ? (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-[#e2d9d0] bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
          {cta(true)}
        </div>
      ) : null}

      {requestingOffering && (
        <SessionRequestDialog
          offering={{
            id: requestingOffering.id,
            course: requestingOffering.course,
            title: requestingOffering.title,
            rate: requestingOffering.rate,
            currency: requestingOffering.currency,
            rateType: requestingOffering.rateType,
            sessionDurationMinutes: requestingOffering.sessionDurationMinutes,
            academicMateName: user.name,
          }}
          onClose={() => setRequestingOffering(null)}
          onSubmitted={(request) => {
            setData((current) => current ? {
              ...current,
              requestsByOffering: {
                ...current.requestsByOffering,
                [requestingOffering.id]: {
                  id: request.id,
                  status: request.status as RequestStatus,
                  hasSession: false,
                },
              },
            } : current);
            void loadProfile().catch(() => undefined);
          }}
        />
      )}
    </main>
  );
}