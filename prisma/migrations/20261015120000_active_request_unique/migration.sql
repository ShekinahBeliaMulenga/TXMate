   CREATE UNIQUE INDEX "MateRequest_active_unique"
   ON "MateRequest" ("studentProfileId", "offeringId")
   WHERE "status" IN ('REQUESTED', 'ACCEPTED');