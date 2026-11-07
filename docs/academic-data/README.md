# Academic structure import file (UNZA)

`unza-bachelor-programmes.csv` holds **107 bachelor programmes** at the University of Zambia, each with its school and department, taken from UNZA's own undergraduate programmes page (https://www.unza.zm/academics/undergraduate/programmes).

Students choose school, then department, then programme when they sign up, so every row has a department. Nothing in the file was invented, with the limits below.

## How to import
Admin, then Universities, then open UNZA (create it first with code `UNZA`), then Schools, departments and programmes. Choose the file, Preview changes, tick the confirmation, Import.

## What came from UNZA and what did not
- **Programme names, schools and departments** come from UNZA's page. Each programme's school and department are read from the address of its page on unza.zm. Department names are those address words written out in plain English, so they may differ slightly from UNZA's official wording (for example "Demography Population Sciences Monitoring and Evaluation" has lost its commas).
- **Codes are internal labels made up for this file** (`UNZA-AGR-01`, department `D01`). UNZA does not publish them. They only need to be unique inside the university. Do not change a code after import.
- **Durations are blank on purpose.** UNZA does not publish them on that page. A programme with no duration has no years of study, so students cannot choose it until you set its length: use the Academic structure page after importing, or pick a default in the import panel if you are sure it applies to every blank row.

## Left out because the department could not be confirmed
Diplomas; Bachelor of Community Education, Bachelor in Health Promotion and the ICT Diploma (no page on UNZA's site); Bachelor of Engineering in Geotechnical Engineering (its page shows no department); Bachelor of Science in Radiography (listed under Physiotherapy, not confirmed). Add these by hand on the Academic structure page once you confirm them.

## Copperbelt University
There is no CBU file. CBU's own pages are incomplete and inconsistent, and a file built from third-party lists would be guesswork. Send CBU's current prospectus or programme list and it can be turned into the same format.

## What the import does
It adds or updates schools, departments and programmes by code in one all-or-nothing step. It never deletes anything, never moves a programme to another school, and leaves a stored department alone when the file's department is blank.
