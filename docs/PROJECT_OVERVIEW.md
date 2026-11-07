# Talent Hub — Project Overview

## Objective
Talent Hub is a web-based placement and recruitment platform that connects students with companies. Students can present their academic details, discover opportunities and track their placement journey. Recruiters can publish roles, review applicants, arrange interviews and issue offers.

## Main actors
- Student
- Company / Recruiter
- Administrator

## Main use-case flow
Student registration → profile creation → job discovery → eligibility check (department, CGPA, active backlogs, total backlogs) → application → recruiter review → interview scheduling → offer → student response.

## Functional scope
The starter implementation supports registration/login, job search, job publishing, applying (only when eligible), per-job eligibility criteria, student profile updates, application status updates, interview slot creation, interview scheduling through a REST endpoint, offer publication and response, student notifications, and administrator summary statistics.

## Non-functional considerations
- Security: bcrypt password hashing, JWT authentication and role-based authorization.
- Performance: indexed primary/unique keys and a MySQL connection pool.
- Usability: responsive dashboard and role-specific navigation.
- Maintainability: frontend, backend and SQL schema are separated.
- Data integrity: foreign keys and unique constraints protect relationships and prevent duplicate applications.

## Current scope limitations
- No resume upload or skill management page yet.
- Academic details (CGPA, backlogs, department) are self-reported and not verified by an administrator.
- Interview scheduling is available through the documented API rather than a recruiter form.
- Admin dashboard currently displays summary counts only.
- No email/SMS delivery; notifications are stored in the database and displayed via API.
- The app is a local academic prototype, not production hardened.
