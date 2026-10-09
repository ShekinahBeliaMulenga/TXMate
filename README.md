# TXMate Student Onboarding Endpoint

Copy:
app/api/onboarding/student/route.ts

into exactly:
<project-root>/app/api/onboarding/student/route.ts

This registers:
POST /api/onboarding/student

It requires a Better Auth session and uses the current TXMate Prisma schema.

After copying, restart:
npm run dev

The endpoint validates the university, university settings, school, programme,
programme year, curriculum courses, current academic year, student ID,
and duplicate student ID before creating StudentProfile and StudentCourse
records in a single transaction.
