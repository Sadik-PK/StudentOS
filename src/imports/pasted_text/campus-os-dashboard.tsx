Build a polished, fully functional personal college dashboard web app called CampusOS.

This is NOT a public SaaS product. It is a private personal-use dashboard for one college student. Do not add marketing pages, pricing, sign-up flows, multi-user features, social features, or unnecessary onboarding.

Tech requirements

Use the existing React + TypeScript + Vite setup in this project. The current project already uses React 19, Tailwind CSS 4, TypeScript and Vite, so work within that setup rather than replacing the project architecture.

Build the UI as a real interactive application, not a static mockup.

Use React state/localStorage for personal data so the app works without a backend.

Do not add external APIs unless absolutely necessary.

Visual direction

Create a modern, premium student productivity dashboard.

Style:

Clean
Minimal
Slightly futuristic
Professional but personal
Desktop-first, responsive on smaller screens
Light theme by default
Soft off-white/light gray background
White cards
Dark charcoal text
One tasteful blue/indigo accent
Subtle borders and shadows
Rounded corners around 12–16px
Generous spacing
Excellent typography hierarchy
Avoid excessive gradients
Avoid overly colorful "AI dashboard" aesthetics
Avoid huge decorative illustrations

The UI should feel closer to a polished productivity app than a typical college portal.

Main layout

Use a persistent left sidebar on desktop.

Sidebar:

CampusOS logo/name

Navigation:

Dashboard
Timetable
Attendance
Assignments
Exams
Notes
GPA Calculator

Bottom:

Settings

Main content should have a clean top header with:

Current date
Page title
Small profile/avatar area
Optional notification icon

On mobile, convert the sidebar into a compact navigation/menu.

1. DASHBOARD

Make this the primary screen.

Header:

"Good evening 👋"

Below it:
"Wednesday, 26 August"
Use the actual current date dynamically.

Create a dashboard grid.

Next class card

Large card:

NEXT CLASS

Show:

Subject
Course code
Lecture / Tutorial / Practical
Time
Room
Countdown until class

Use the timetable data provided below.

If there are no more classes today, show:
"No more classes today"

Today's schedule

Create a timeline/list showing today's classes.

Each class should show:

Time
Subject
Course code
Type
Room
Status: completed / current / upcoming

Highlight the current/upcoming class.

Attendance summary

Show cards for all six subjects.

Each card:

Subject name
Course code
Percentage
attended / total
Progress bar
Status

Status:

Green: >= 80%
Yellow: 75–79%
Red: <75%

Do NOT hardcode fake attendance as permanent data. Create sensible initial demo values, but make them editable.

Include:
"Classes needed to reach 75%" where relevant.

Upcoming assignments

Show the next 3 assignments.

Each:

Subject
Assignment title
Due date
Priority
Completion status
Upcoming exams

Show the next exams with:

Subject
Date
Time
Room
Countdown
Semester progress

A card showing:
"Semester 1"
with a progress bar and percentage.

Allow the semester progress to be calculated from dates or manually adjusted.

2. TIMETABLE

Create a dedicated timetable page.

Have two views:

Today
Week

The Week view should resemble a clean calendar grid.

Columns:
Monday
Tuesday
Wednesday
Thursday
Friday
Saturday
Sunday

Rows should use the actual time slots.

Use the following timetable data extracted from the student's uploaded college timetable:

Monday:

2:20–3:10 PM — MEC136 — Engineering Drawing with AutoCAD — Tutorial — Room 26-404X — Group 2
3:10–4:00 PM — MEC136 — Engineering Drawing with AutoCAD — Tutorial — Room 26-404X — Group 2
4:00–4:50 PM — CSE111 — Orientation to Computing — Lecture — Room 26-404X

Tuesday:

11:50 AM–12:40 PM — INT335 — Design Thinking — Lecture — Room 26-307
12:40–1:30 PM — MTH165 — Mathematics for Engineers — Lecture — Room 27-307
2:20–3:10 PM — INT108 — Python Programming — Practical — Room 36-909 — Group 2
3:10–4:00 PM — INT108 — Python Programming — Practical — Room 36-909 — Group 2

Wednesday:

11:00–11:50 AM — CSE111 — Orientation to Computing — Lecture — Room 27-307
11:50 AM–12:40 PM — MEC136 — Engineering Drawing with AutoCAD — Lecture — Room 27-307
12:40–1:30 PM — MTH165 — Mathematics for Engineers — Lecture — Room 27-307
2:20–3:10 PM — INT108 — Python Programming — Practical — Room 25-101A — Group 2
3:10–4:00 PM — INT108 — Python Programming — Practical — Room 25-101A — Group 2

Thursday:

11:00–11:50 AM — CSE111 — Orientation to Computing — Lecture — Room 25-104
11:50 AM–12:40 PM — INT335 — Design Thinking — Lecture — Room 25-403
12:40–1:30 PM — CSE326 — Internet Programming — Lecture — Room 25-101
2:20–3:10 PM — INT108 — Python Programming — Practical — Room 25-101A — Group 2
3:10–4:00 PM — INT108 — Python Programming — Practical — Room 25-101A — Group 2
3:10–4:00 PM — MTH165 — Mathematics for Engineers — Tutorial — Room 26-106 — Group 2

Friday:

10:10–11:00 AM — INT108 — Python Programming — Lecture — Room 27-405
11:00–11:50 AM — INT108 — Python Programming — Lecture — Room 27-405
11:50 AM–12:40 PM — CSE326 — Internet Programming — Practical — Room 27-405 — Group 0
11:50 AM–12:40 PM — CSE326 — Internet Programming — Practical — Room 27-405 — Group 2 — Makeup Class
12:40–1:30 PM — CSE326 — Internet Programming — Practical — Room 27-405 — Group 0
12:40–1:30 PM — CSE326 — Internet Programming — Practical — Room 27-405 — Group 2 — Makeup Class
2:20–3:10 PM — MTH165 — Mathematics for Engineers — Lecture — Room 26-106
3:10–4:00 PM — MTH165 — Mathematics for Engineers — Tutorial — Room 26-106 — Group 2

Saturday:

Project Work / Other Weekly Activities

Sunday:

No regular classes

Important:
Some timetable entries overlap because they represent groups/makeup classes. Preserve the data rather than silently deleting them. Make group/makeup information visible.

Allow the user to edit/delete/add timetable entries manually.

3. TIMETABLE IMPORT

Create an "Import timetable" button.

When clicked, open a polished modal:

"Import your timetable"

Support:

PDF
Image
CSV

For this personal app, the user should be able to upload their college timetable once and then edit the extracted schedule.

Create a realistic import UI:

Upload
Processing
Preview extracted classes
Confirm
Save

For now, implement the UI and local state. Do not pretend an actual PDF parser/API exists if it is not implemented.

Include a clear editable preview table.

4. ATTENDANCE

Create a dedicated Attendance page.

Top:
"Attendance"

Show:

Overall attendance
Total attended
Total classes
Subjects below 75%

Then create a subject table/cards.

Subjects:

CSE111 — Orientation to Computing — 3 credits
CSE326 — Internet Programming — 2 credits
INT108 — Python Programming — 4 credits
INT335 — Design Thinking — 2 credits
MEC136 — Engineering Drawing with AutoCAD — 4 credits
MTH165 — Mathematics for Engineers — 4 credits

Each subject should have:

Attendance percentage
Present
Total
Progress bar
Status
"+" and "-" controls

Also add:

"Mark today's attendance"

Show today's scheduled classes with:
[Present] [Absent]

When clicked, update attendance immediately.

Persist attendance in localStorage.

Attendance calculator

Add a useful calculator:

"If I skip my next class..."

Show:
Current percentage
Projected percentage if absent
Projected percentage if present

Also show:
"Classes needed to reach 75%"

Make the calculations actually work.

5. ASSIGNMENTS

Create an assignment manager.

Features:

Add assignment
Edit
Delete
Mark complete
Subject
Due date
Priority
Notes

Views:

Upcoming
Completed
Overdue

Use cards with clear deadlines.

Add a small countdown such as:
"Due in 2 days"

Persist data locally.

6. EXAMS

Create an exam schedule.

Allow:

Add exam
Edit
Delete
Subject
Date
Time
Room
Exam type

Show:

Next exam
Countdown
Upcoming exams
Completed exams
7. NOTES

Create a notes library organized by subject.

Subject folders/cards:

CSE111
CSE326
INT108
INT335
MEC136
MTH165

Allow adding note entries with:

Title
Subject
Description
Optional file name
Date
Pinned status

For now, use local state/localStorage rather than pretending to upload files to a backend.

8. GPA CALCULATOR

Create a polished semester GPA calculator.

Pre-fill the six courses and their official credits:

CSE111 — 3
CSE326 — 2
INT108 — 4
INT335 — 2
MEC136 — 4
MTH165 — 4

Allow selecting grades.

Calculate weighted GPA dynamically.

Show:

Total credits
GPA
Grade distribution

Also add:
"What GPA do I need?"

Keep the interface simple.

9. SETTINGS

Settings should include:

Edit profile name
Theme toggle
Semester dates
Timetable import
Reset attendance
Reset assignments
Reset all local data

Include confirmation dialogs for destructive actions.

DATA / LOCAL STORAGE

The application is personal-use only.

Use localStorage for:

Attendance
Assignments
Exams
Notes
Timetable edits
Profile settings
GPA grades

Create sensible TypeScript data models.

Keep all data in a clean centralized state structure.

Do not require login.

Do not create a backend.

IMPORTANT UX DETAILS

Use reusable React components.

Examples:

Sidebar
Header
StatCard
ClassCard
AttendanceCard
ProgressBar
AssignmentCard
ExamCard
Modal
EmptyState
Badge
Button

Add subtle hover states and transitions.

Use accessible buttons and form controls.

Use icons consistently. If an icon library is unavailable, use simple text/icon alternatives rather than adding a huge dependency.

Make sure the entire application works without console errors.

Do not leave placeholder pages.

Every sidebar navigation item should open a functional page.

The Dashboard must be the default route/view.

The application should feel like something a real college student would use every morning.

Use the actual timetable/course information above as the initial data, but clearly allow the user to edit it.

Do not expose or display the student's VID publicly anywhere in the interface.

Finally, make the UI visually polished enough that it feels like a finished personal productivity application rather than a generated prototype.