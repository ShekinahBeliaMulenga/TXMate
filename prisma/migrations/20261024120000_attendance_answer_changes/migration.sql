-- A student may change an attendance answer a limited number of times.
ALTER TABLE "Attendance" ADD COLUMN "studentAnswerChanges" INTEGER NOT NULL DEFAULT 0;
