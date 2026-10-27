# BHI Attendance Sheet

The paper **Individual Student Attendance Sheet**, made digital. Next.js 15 + MongoDB.

- **Students** find their name, enter a PIN, and type their **start time** when they arrive and their **end time** when class is over. The server checks every typed time against its own clock before writing it. Their handwritten signature, put on file once, is added to the row automatically.
- **Teachers** see their own courses, sign students' rows with one tap using their signature on file, approve each month, and download any student's report as **PDF or Word (DOCX)**.
- **Admins** add students (one at a time, or hundreds from a spreadsheet), manage staff and holidays, and see everything.

## How a day works

| Who | What they do | What gets written on the sheet |
|---|---|---|
| Student, first time only | Uploads a photo of their signature on paper (or draws it) | Signature on file |
| Student, arriving | Taps **Enter start time**, types the time (or taps *Use the time now*), confirms | Start time (checked by the server) |
| Student, leaving | Taps **Enter end time**, types the time, confirms | End time, hours, and their signature |
| Teacher | Ticks rows (or "Select all ready"), taps **Sign with my signature** | Staff signature |
| Teacher, end of day | **Mark not started as absent** | "Absent" on those rows |
| Teacher, end of month | **Approve with my signature** (+ comments) | "Approved by" block |

## Built to be hard to get wrong

- **Students type their own times, but the server decides what's believable**, using its own clock in the school's time zone (never the tablet's). A typed time is refused if it:
  - hasn't happened yet;
  - is older than `TIME_ENTRY_WINDOW_MINUTES` (default 15). Older times are a staff correction;
  - is an end time that isn't after the start, or is earlier than the moment the start was entered (the student was demonstrably still there);
  - makes a day shorter than `MIN_CLASS_MINUTES` (default 5) or longer than `MAX_CLASS_MINUTES` (default 720).
- **AM/PM mix-ups are caught** ("That's 1:05 am. Did you mean 1:05 pm?"), and every time is confirmed on a second screen before it's saved.
- **Nothing is hidden:** the exact moment each time was saved is kept next to it. Times typed 5+ minutes after the fact are flagged on the staff board and sheet so they're checked before signing. Staff corrections clear the flag.
- **Students can't change a saved time.** Only staff can, with a reason, as before.
- **Each row can only be started once and filled once**, enforced in the database, so double taps can't record twice.
- **Signed rows are locked.** Staff corrections need a reason, are kept in the row's history and the audit log, and remove the staff signature so the row is signed again.
- **A month approval goes out of date** if any row changes afterwards, and says so on screen and in the reports.
- **Signatures are stored once and referenced**, so replacing a signature never changes rows already signed.
- **Teachers only see their own courses**, in every page, action and download.
- **PIN guessing is limited** (5 tries per 15 minutes); staff logins are limited too; a password change signs out other devices.
- **The app refuses to start** without `MONGODB_URI` and a strong `SESSION_SECRET`. There are no default secrets.
- **Secrets are never committed:** `.env` and `.env.*` are ignored by git.

## Settings for typed times (optional)

| Setting | Default | Meaning |
|---|---|---|
| `TIME_ENTRY_WINDOW_MINUTES` | `15` | How far back a student may enter a time. `0` = only the current minute. |
| `MIN_CLASS_MINUTES` | `5` | Shortest day a student can record. |
| `MAX_CLASS_MINUTES` | `720` | Longest day a student can record (12 hours). |

## Setup

1. **MongoDB Atlas:** create a database user and copy the connection string, with a database name after the host (e.g. `.../bhi_attendance?retryWrites=true`).
2. **Settings:** copy `.env.example` to `.env.local` and fill in `MONGODB_URI` and `SESSION_SECRET`. On Vercel, add the same two under Settings → Environment Variables.
3. **Install and set up the database** (creates the indexes and the first admin):
   ```bash
   npm install
   npm run setup
   ```
4. **Run:** `npm run dev`, then open http://localhost:3000. Staff sign in at `/staff/login`.

## First steps for the office

1. **Students → Add students from a spreadsheet.** Upload a CSV with the columns `name, courseName, courseCode, courseDuration, caseManager, instructor, startDate, endDate, pin` (`pin` is optional). Download the list of PINs it shows and give each student theirs.
2. **Staff accounts:** add teachers and tick their courses.
3. **Holidays:** add the year's holidays.
4. **My account:** each staff member puts their signature on file.

## Checks

```bash
npm run typecheck   # TypeScript
npm test            # rules for typed times, hours, class days and the import
npm run build       # production build
```

## Code map

| What | Where |
|---|---|
| Sheet rules (dates, times, hours, import) | `src/lib/sheet.ts` |
| Data model | `src/lib/types.ts` |
| Rules for typed times (shared by browser and server) | `checkTypedTime` in `src/lib/sheet.ts` |
| Student actions (PIN, Start, End, signature) | `src/actions/student.ts` |
| Typing a time (dialog) | `src/components/TimeEntry.tsx` |
| Staff actions (sign rows, edit a row, absent, approve) | `src/actions/staff.ts` |
| Admin actions (students, import, staff, holidays) | `src/actions/admin.ts` |
| Who can see whom | `src/lib/access.ts` |
| PDF and Word reports | `src/lib/report.ts`, `src/app/api/report/[studentId]/route.ts` |
| The paper sheet on screen | `src/components/PaperSheet.tsx` |
| Signature photo clean-up | `src/components/SignatureCapture.tsx` |
