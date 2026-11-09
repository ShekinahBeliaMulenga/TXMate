# Academic Mate verification with identity documents (rounds 26, 27, 29)

## What changed
- To apply for verification an Academic Mate must upload **one identity document** (student ID card, **NRC** or **passport**, whichever they have) and **either proof of enrolment or academic results** (JPG, PNG, WebP or PDF, up to 5 MB each, at most 2 per type and 6 in total).
- Admins open **Identity documents** (a new tab on the review page), look at each file, and **accept or reject each one**, with a reason when rejecting (preset reasons or their own words).
- **Approval is blocked** until every file is reviewed, one identity document is accepted and one proof is accepted. The server enforces this; the Verify button is also disabled.
- A rejected document shows the reason to the applicant, who removes it and uploads a better one, then applies again. Documents accepted earlier stay accepted.

## Privacy and security
- Files go to the private Cloudflare R2 bucket under `verification/<profile id>/<random id>.<ext>`: no name or personal detail in the key. **Do not put a public domain or public access on the `verification/` part of the bucket.**
- The real file type is read from the file's first bytes. Names and browser-claimed types are ignored, and SVG, HTML and executables are refused. Identical re-uploads are refused.
- Only admins with the verification permission, for the applicant's university, can open a file, through a link that **stops working after 60 seconds**. Every link handed out is written to the audit log ("Opened a verification document"), and so is every accept or reject. An admin cannot open or judge their own application.
- Applicants cannot change documents while the application is being reviewed or after approval.
- **Clean-up:** files are deleted 14 days after approval or rejection, by `npx tsx scripts/purge-verification-evidence.ts` (add `--dry-run` to preview). Run it once a day from your scheduler. Until you schedule it, nothing is deleted automatically.
- Holding copies of student ID cards is personal data. Have a Zambian lawyer confirm the notice shown to applicants, the keep periods and your obligations under the Data Protection Act before launch.

## Approving as an exception (round 29)
- When documents are missing or not accepted, only a **platform admin** sees an **Approve as exception** box on the review page. They must write a reason (20 to 1000 characters).
- The server enforces this: any other role gets a 403, and a missing or short reason is refused. Rejecting is unaffected.
- It is audited as **"Approved verification as an exception"** (shown in red) with the reason and the list of waived requirements, and the reason also appears in the application's review history.
- Use it rarely, for real cases such as lost documents confirmed by the registry. Admins still cannot judge their own application.

## Deploying
1. Back up the database, then `npx prisma migrate deploy` and `npx prisma generate`.
   Round 29 adds a migration that adds `NATIONAL_ID` and `PASSPORT` to the document types.
2. R2 settings (`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`) are the same ones profile photos already use.
3. Schedule the clean-up script.

## Things to know
- Applications that were already waiting for review before round 26 have no documents. Reject them with a short reason ("please upload your ID and proof of enrolment") and the applicant can reapply, or, in a real case, a platform admin can approve them as an exception.
- Already verified Academic Mates are not affected.
- Not included yet: university-email confirmation and per-course checks. Both are planned next.

## Tests
`tests/verification-evidence.test.ts` covers file-type detection, the required-document rules, the approval gate, the NRC and passport alternatives, the platform-admin exception rule and the keep periods. Run `bun test tests`.
