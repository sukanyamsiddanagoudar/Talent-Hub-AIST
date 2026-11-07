# Talent Hub — Student Placement & Recruitment Portal

A full-stack web application built with **Node.js, Express.js, MySQL, HTML, CSS and JavaScript**.

## 1. Features

### Student
- Register and log in.
- Create a student profile during registration (department, semester, CGPA, **active backlogs**, **total backlogs**).
- Update academic details later from **My profile** (e.g. after clearing a backlog).
- Browse and search open job listings, each showing its eligibility criteria.
- See instantly whether they are eligible for a job — and the exact reasons if not.
- Apply for jobs only when **all** eligibility conditions are met (duplicate applications are blocked).
- Track application status.
- View interview schedules.
- View, accept or decline offers.
- Receive application and offer notifications.

### Company / Recruiter
- Register and log in.
- Publish job and internship opportunities with eligibility criteria: allowed departments, minimum CGPA, maximum active backlogs and (optionally) maximum total backlogs.
- View applications received for its own jobs.
- Shortlist or reject candidates.
- Create interview availability slots.
- Schedule an applicant into an available slot.
- Publish an offer to an applicant.

### Administrator
- View dashboard totals for students, companies, jobs, applications and accepted offers.

## 2. Database tables

The SQL schema creates these 11 tables:
1. `Students`
2. `Companies`
3. `Job Listings`
4. `Applications`
5. `Interview Slots`
6. `Interviews`
7. `Offers`
8. `Skills`
9. `Student Skills`
10. `Notifications`
11. `Job Eligible Departments`

The `Skills` and `Student Skills` tables are created and seeded. This starter version does not yet include frontend screens for editing a student's skills; that can be added as a next iteration.

## 2a. Job eligibility rules

A student can apply for a job only if **every** rule below passes. The check runs on the server (`evaluateEligibility` in `server.js`), so it cannot be bypassed from the browser.

| Rule | Set by recruiter on the job | Compared with student's |
|---|---|---|
| Department / domain | Eligible departments (one or more; none ticked = all departments) | `department` |
| Minimum CGPA | `minimum_cgpa` | `cgpa` |
| Active backlogs | `max_active_backlogs` (default **0** = none allowed) | `active_backlogs` |
| Total backlogs | `max_total_backlogs` (blank = no limit) | `total_backlogs` |

**Active backlog vs. backlog:** *active backlogs* are arrears still pending right now. *Total backlogs* count every backlog the student has ever had, including ones already cleared. A student with 3 cleared backlogs and 0 pending has `active_backlogs = 0`, `total_backlogs = 3`. Total backlogs must always be >= active backlogs.

Example: a CSAI-only role with CGPA >= 7.5, 0 active backlogs and total backlogs <= 2 accepts a CSAI student with 8.0 CGPA and 2 cleared backlogs, but rejects an ECE student, a CSAI student with 7.0 CGPA, or one with a pending backlog.

The list of departments is the `DEPARTMENTS` array near the top of `server.js` — edit it to match your college.

## 3. Requirements

Install:
- Node.js (LTS)
- MySQL Server
- VS Code (recommended)

Check Node and npm:
```bash
node -v
npm -v
```

## 4. Setup instructions (Windows)

### Step 1 — Extract the ZIP
Extract `talent-hub.zip` to a convenient folder, for example:
`C:\Users\YourName\Desktop\talent-hub`

Open that folder in VS Code.

### Step 2 — Create the database
Open MySQL Workbench, connect to your local MySQL server, open `database/schema.sql`, and execute the complete script.

Alternatively, in a terminal:
```bash
mysql -u root -p < database/schema.sql
```

> **Already created the database with the older schema?** Do not re-run `schema.sql`. Run `database/migration_eligibility.sql` once instead; it adds the new columns and table without deleting your data. Existing jobs default to "all departments, 0 active backlogs allowed", and existing students default to 0 active / 0 total backlogs until they update **My profile**.

### Step 3 — Configure environment variables
In the project root, copy `.env.example` and rename the copy to `.env`.

Update the MySQL password:
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_actual_mysql_password
DB_NAME=talent_hub
```
Change `JWT_SECRET` to a long random string. Set an administrator password you will remember.

### Step 4 — Install dependencies
Open VS Code terminal in the project root:
```bash
npm install
```

### Step 5 — Start the server
```bash
npm start
```
Expected message:
```text
Talent Hub running at http://localhost:5000
```

### Step 6 — Open the website
Open Chrome and visit:
`http://localhost:5000`

Register a student account and a company account to test both workflows. For the administrator, use the email and password configured in `.env` (defaults are shown in `.env.example`).

## 5. Suggested demonstration sequence

1. Register a company account.
2. Sign in as the company and publish a job.
3. Register a student account whose department, CGPA and backlogs meet the job requirement (then try one that does not, to see the eligibility message).
4. Sign in as the student and apply for the job.
5. Sign in as the company and open Candidates.
6. Shortlist the student.
7. Create an interview slot under Interview slots.
8. Use the API endpoint described below to schedule the interview.
9. Publish an offer from the Candidates page.
10. Sign in as the student to accept or decline the offer.

## 6. Scheduling an interview

The recruiter interface creates slots. To connect an application to a slot, send a POST request to `/api/interviews` with a company token:

```json
{
  "application_id": 1,
  "slot_id": 1,
  "round_name": "Technical Round"
}
```

Use Postman or Thunder Client:
- Method: `POST`
- URL: `http://localhost:5000/api/interviews`
- Header: `Authorization: Bearer YOUR_COMPANY_TOKEN`
- Header: `Content-Type: application/json`
- Body: raw JSON shown above.

The application and slot must belong to the same company's job, and the slot must be available.

## 7. Important API routes

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/register/student` | Student registration |
| POST | `/api/auth/register/company` | Company registration |
| POST | `/api/auth/login` | Login |
| GET | `/api/jobs` | Browse/search jobs (adds `eligibility` + `already_applied` when called by a logged-in student) |
| POST | `/api/jobs` | Company creates a job (incl. `eligible_departments[]`, `minimum_cgpa`, `max_active_backlogs`, `max_total_backlogs`) |
| GET | `/api/departments` | List of departments |
| GET / PUT | `/api/students/me` | Student views / updates academic profile |
| POST | `/api/applications` | Student applies (403 with reasons if not eligible) |
| GET | `/api/applications/mine` | Student application history |
| GET | `/api/company/applications` | Recruiter views applicants |
| PATCH | `/api/applications/:id/status` | Recruiter updates status |
| POST | `/api/interview-slots` | Recruiter creates a slot |
| POST | `/api/interviews` | Recruiter schedules interview |
| GET | `/api/interviews/mine` | Student views interviews |
| POST | `/api/offers` | Recruiter publishes offer |
| GET | `/api/offers/mine` | Student views offers |
| PATCH | `/api/offers/:id/respond` | Student accepts/declines |
| GET | `/api/notifications` | Student notifications |
| GET | `/api/admin/summary` | Admin dashboard totals |

## 8. Architecture

```text
Browser (HTML, CSS, JavaScript)
            |
            | HTTP / JSON (REST API)
            v
Node.js + Express.js server
            |
            | mysql2 queries
            v
        MySQL database
```

## 9. Security and design notes

- Passwords are hashed with bcryptjs; plain-text passwords are not stored.
- JWT is used for authenticated API requests.
- Role checks protect student, company and administrator routes.
- SQL queries use parameter placeholders for user-provided values.
- The database prevents duplicate student applications to the same job.
- Eligibility (department, CGPA, backlogs) is enforced by the server on every application.
- Academic details are self-reported by students. For real placements, have the placement cell verify them (or make the profile admin-editable only).
- The `.env` file contains secrets and should not be committed to GitHub.
- This is a classroom project starter. Before production deployment, add HTTPS, rate limiting, stronger validation, password reset, audit logging, file upload scanning, and automated tests.

## 10. Troubleshooting

**Database connection error**
- Confirm MySQL is running.
- Check `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in `.env`.
- Execute `database/schema.sql`.

**Port 5000 already in use**
Change `PORT=5001` in `.env`, restart the server, and open `http://localhost:5001`.

**Module not found**
Run:
```bash
npm install
```

**Login not working**
Use the same account type selected during registration. Student and company accounts are stored separately.

## 11. Project structure

```text
talent-hub/
├── database/
│   ├── schema.sql
│   └── migration_eligibility.sql
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md
```
