CREATE DATABASE IF NOT EXISTS talent_hub;
USE talent_hub;

CREATE TABLE IF NOT EXISTS Students (
  student_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  department VARCHAR(80) NOT NULL,
  semester TINYINT,
  cgpa DECIMAL(3,2),
  active_backlogs TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- arrears currently pending (not yet cleared)
  total_backlogs TINYINT UNSIGNED NOT NULL DEFAULT 0,   -- every backlog ever had, including cleared ones
  phone VARCHAR(20),
  bio TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_backlogs CHECK (active_backlogs <= total_backlogs)
);

CREATE TABLE IF NOT EXISTS Companies (
  company_id INT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(160) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  website VARCHAR(255),
  location VARCHAR(120),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `Job Listings` (
  job_id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  job_type ENUM('Full-time','Internship','Part-time') DEFAULT 'Full-time',
  location VARCHAR(120),
  minimum_cgpa DECIMAL(3,2) DEFAULT 0,
  max_active_backlogs TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- 0 = no pending backlogs allowed
  max_total_backlogs TINYINT UNSIGNED NULL,                 -- NULL = no limit on history of backlogs
  deadline DATE,
  status ENUM('Open','Closed') DEFAULT 'Open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES Companies(company_id) ON DELETE CASCADE
);

-- Departments allowed to apply for a job. A job with NO rows here is open to every department.
CREATE TABLE IF NOT EXISTS `Job Eligible Departments` (
  job_id INT NOT NULL,
  department VARCHAR(80) NOT NULL,
  PRIMARY KEY (job_id, department),
  FOREIGN KEY (job_id) REFERENCES `Job Listings`(job_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Applications (
  application_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  job_id INT NOT NULL,
  status ENUM('Applied','Shortlisted','Interview','Selected','Rejected') DEFAULT 'Applied',
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_student_job (student_id, job_id),
  FOREIGN KEY (student_id) REFERENCES Students(student_id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES `Job Listings`(job_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `Interview Slots` (
  slot_id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  slot_datetime DATETIME NOT NULL,
  duration_minutes INT DEFAULT 30,
  mode ENUM('Online','Offline') DEFAULT 'Online',
  location_or_link VARCHAR(255),
  status ENUM('Available','Booked') DEFAULT 'Available',
  FOREIGN KEY (job_id) REFERENCES `Job Listings`(job_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Interviews (
  interview_id INT AUTO_INCREMENT PRIMARY KEY,
  application_id INT NOT NULL,
  slot_id INT NOT NULL,
  round_name VARCHAR(100) DEFAULT 'Technical Round',
  result ENUM('Pending','Passed','Failed') DEFAULT 'Pending',
  notes TEXT,
  FOREIGN KEY (application_id) REFERENCES Applications(application_id) ON DELETE CASCADE,
  FOREIGN KEY (slot_id) REFERENCES `Interview Slots`(slot_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Offers (
  offer_id INT AUTO_INCREMENT PRIMARY KEY,
  application_id INT NOT NULL UNIQUE,
  job_title VARCHAR(160) NOT NULL,
  package_amount DECIMAL(10,2),
  joining_date DATE,
  status ENUM('Pending','Accepted','Declined') DEFAULT 'Pending',
  offered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES Applications(application_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Skills (
  skill_id INT AUTO_INCREMENT PRIMARY KEY,
  skill_name VARCHAR(100) NOT NULL UNIQUE,
  category VARCHAR(80)
);

CREATE TABLE IF NOT EXISTS `Student Skills` (
  student_id INT NOT NULL,
  skill_id INT NOT NULL,
  proficiency ENUM('Beginner','Intermediate','Advanced') DEFAULT 'Beginner',
  PRIMARY KEY (student_id, skill_id),
  FOREIGN KEY (student_id) REFERENCES Students(student_id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES Skills(skill_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES Students(student_id) ON DELETE CASCADE
);

INSERT IGNORE INTO Skills(skill_name, category) VALUES
('Python','Programming'),('Java','Programming'),('JavaScript','Programming'),
('React','Web Development'),('Node.js','Web Development'),('SQL','Database'),
('Machine Learning','AI/ML'),('Communication','Soft Skills'),('C++','Programming');
