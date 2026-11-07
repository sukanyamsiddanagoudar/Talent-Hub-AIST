-- Run this ONLY if you already created the database with the OLD schema.sql
-- (fresh installs should just run the updated schema.sql instead).
-- Run once; running it twice will fail with "Duplicate column name".
USE talent_hub;

ALTER TABLE Students
  ADD COLUMN active_backlogs TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER cgpa,
  ADD COLUMN total_backlogs  TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER active_backlogs;

ALTER TABLE `Job Listings`
  ADD COLUMN max_active_backlogs TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER minimum_cgpa,
  ADD COLUMN max_total_backlogs  TINYINT UNSIGNED NULL AFTER max_active_backlogs;

CREATE TABLE IF NOT EXISTS `Job Eligible Departments` (
  job_id INT NOT NULL,
  department VARCHAR(80) NOT NULL,
  PRIMARY KEY (job_id, department),
  FOREIGN KEY (job_id) REFERENCES `Job Listings`(job_id) ON DELETE CASCADE
);
-- Existing jobs keep working: no department rows = open to all departments.
