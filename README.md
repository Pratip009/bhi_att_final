# BHI Attendance Sheet

The paper **Individual Student Attendance Sheet**, made digital. Next.js 15 + MongoDB.

- **Students** find their name, enter a PIN, and tap **Start** when class begins and **Fill** when it ends. The server records the times. Their handwritten signature, put on file once, is added to the row automatically.
- **Teachers** see their own courses, sign students' rows with one tap using their signature on file, approve each month, and download any student's report as **PDF or Word (DOCX)**.
- **Admins** add students (one at a time, or hundreds from a spreadsheet), manage staff and holidays, and see everything.

## How a day works

| Who | What they do | What gets written on the sheet |
|---|---|---|
| Student, first time only | Uploads a photo of their signature on paper (or draws it) | Signature on file |
| Student, arriving | Taps **Tap to start** | Start time (server clock) |
| Student, leaving | Taps **Tap to fill** | End time, hours, and their signature |
| Teacher | Ticks rows (or "Select all ready"), taps **Sign with my signature** | Staff signature |
| Teacher, end of day | **Mark not started as absent** | "Absent" on those rows |
| Teacher, end of month | **Approve with my signature** (+ comments) | "Approved by" block |

## Built to be hard to get wrong

- **Times come from the server**, in the school's time zone. Students can't type or change times; start rounds up and end rounds down to the minute.
- **Each row can only be started once and filled once**, enforced in the database, so double taps can't record twice.
- **Signed rows are locked.** Staff corrections need a reason, are kept in the row's history and the audit log, and remove the staff signature so the row is signed again.
- **A month approval goes out of date** if any row changes afterwards, and says so on screen and in the reports.
- **Signatures are stored once and referenced**, so replacing a signature never changes rows already signed.
- **Teachers only see their own courses**, in every page, action and download.
- **PIN guessing is limited** (5 tries per 15 minutes); staff logins are limited too; a password change signs out other devices.
- **The app refuses to start** without `MONGODB_URI` and a strong `SESSION_SECRET`. There are no default secrets.
- **Secrets are never committed:** `.env` and `.env.*` are ignored by git.

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
npm test            # rules for times, hours, class days and the import
npm run build       # production build
```

## Code map

| What | Where |
|---|---|
| Sheet rules (dates, times, hours, import) | `src/lib/sheet.ts` |
| Data model | `src/lib/types.ts` |
| Student actions (PIN, Start, Fill, signature) | `src/actions/student.ts` |
| Staff actions (sign rows, edit a row, absent, approve) | `src/actions/staff.ts` |
| Admin actions (students, import, staff, holidays) | `src/actions/admin.ts` |
| Who can see whom | `src/lib/access.ts` |
| PDF and Word reports | `src/lib/report.ts`, `src/app/api/report/[studentId]/route.ts` |
| The paper sheet on screen | `src/components/PaperSheet.tsx` |
| Signature photo clean-up | `src/components/SignatureCapture.tsx` |
