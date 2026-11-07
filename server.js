require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend")));

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "talent_hub",
  waitForConnections: true,
  connectionLimit: 10
});

const tokenFor = (user) => jwt.sign(
  { id: user.id, role: user.role, name: user.name },
  process.env.JWT_SECRET || "development_secret_change_me",
  { expiresIn: "8h" }
);

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Please log in to continue." });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || "development_secret_change_me");
    next();
  } catch {
    return res.status(401).json({ message: "Your session has expired. Please log in again." });
  }
}
const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ message: "You do not have permission for this action." });

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET || "development_secret_change_me"); } catch { /* treat as guest */ }
  }
  next();
}

// Departments a job can be restricted to. Edit this list to match your college.
const DEPARTMENTS = ["CSAI", "CSE", "IT", "ECE", "EEE", "Mechanical", "Civil"];
const norm = (s) => String(s || "").trim().toLowerCase();
const canonicalDepartment = (d) => DEPARTMENTS.find((x) => norm(x) === norm(d)) || null;

// Parses a whole number in [0, max]. Blank/undefined -> fallback.
function wholeNumber(value, fallback, max = 50) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : NaN;
}
function parseCgpa(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : NaN;
}
// active = backlogs pending right now; total = every backlog ever (includes active + cleared)
function parseBacklogs(active, total) {
  const a = wholeNumber(active, 0), t = wholeNumber(total, 0);
  if (Number.isNaN(a) || Number.isNaN(t)) return { error: "Backlogs must be whole numbers (0 or more)." };
  if (a > t) return { error: "Total backlogs (including cleared) cannot be less than active backlogs." };
  return { active: a, total: t };
}

// Decides whether a student may apply for a job. Every rule must pass.
// student: {department, cgpa, active_backlogs, total_backlogs}
// job: {eligible_departments[], minimum_cgpa, max_active_backlogs, max_total_backlogs}
function evaluateEligibility(student, job) {
  const reasons = [];
  const depts = job.eligible_departments || [];
  if (depts.length && !depts.some((d) => norm(d) === norm(student.department))) {
    reasons.push(`This role is open only to ${depts.join(", ")} (your department: ${student.department}).`);
  }
  const minCgpa = Number(job.minimum_cgpa || 0);
  if (Number(student.cgpa || 0) < minCgpa) {
    reasons.push(`Minimum CGPA ${minCgpa.toFixed(2)} required (yours: ${student.cgpa == null ? "not set" : Number(student.cgpa).toFixed(2)}).`);
  }
  const active = Number(student.active_backlogs || 0), maxActive = Number(job.max_active_backlogs || 0);
  if (active > maxActive) {
    reasons.push(maxActive === 0
      ? `No active backlogs allowed (you have ${active}).`
      : `At most ${maxActive} active backlog(s) allowed (you have ${active}).`);
  }
  if (job.max_total_backlogs !== null && job.max_total_backlogs !== undefined) {
    const total = Number(student.total_backlogs || 0), maxTotal = Number(job.max_total_backlogs);
    if (total > maxTotal) reasons.push(`At most ${maxTotal} total backlog(s) allowed including cleared ones (you have ${total}).`);
  }
  return { eligible: reasons.length === 0, reasons };
}

async function attachDepartments(rows) {
  if (!rows.length) return rows;
  const [d] = await pool.query("SELECT job_id, department FROM `Job Eligible Departments` WHERE job_id IN (?) ORDER BY department", [rows.map((r) => r.job_id)]);
  const byJob = {};
  d.forEach((x) => { (byJob[x.job_id] = byJob[x.job_id] || []).push(x.department); });
  rows.forEach((r) => { r.eligible_departments = byJob[r.job_id] || []; });
  return rows;
}

app.get("/api/departments", (req, res) => res.json(DEPARTMENTS));

app.get("/api/health", async (req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ok", database: "connected" }); }
  catch { res.status(500).json({ status: "error", database: "not connected" }); }
});

app.post("/api/auth/register/student", async (req, res) => {
  try {
    const { full_name, email, password, department, semester, cgpa, phone, active_backlogs, total_backlogs } = req.body;
    if (!full_name || !email || !password || !department) return res.status(400).json({ message: "Name, email, password and department are required." });
    if (password.length < 8) return res.status(400).json({ message: "Password must contain at least 8 characters." });
    const dept = canonicalDepartment(department);
    if (!dept) return res.status(400).json({ message: "Please choose a valid department." });
    const gpa = parseCgpa(cgpa);
    if (Number.isNaN(gpa)) return res.status(400).json({ message: "CGPA must be a number between 0 and 10." });
    const bl = parseBacklogs(active_backlogs, total_backlogs);
    if (bl.error) return res.status(400).json({ message: bl.error });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      "INSERT INTO Students(full_name,email,password_hash,department,semester,cgpa,active_backlogs,total_backlogs,phone) VALUES(?,?,?,?,?,?,?,?,?)",
      [full_name, email.toLowerCase(), hash, dept, semester || null, gpa, bl.active, bl.total, phone || null]
    );
    const user = { id: r.insertId, role: "student", name: full_name };
    res.status(201).json({ token: tokenFor(user), user });
  } catch (e) { res.status(e.code === "ER_DUP_ENTRY" ? 409 : 500).json({ message: e.code === "ER_DUP_ENTRY" ? "This email is already registered." : "Could not create student account." }); }
});

// Student profile: academic details change over time (e.g. a backlog gets cleared), so students can update them.
app.get("/api/students/me", auth, allow("student"), async (req, res) => {
  const [[row]] = await pool.query("SELECT student_id,full_name,email,department,semester,cgpa,active_backlogs,total_backlogs,phone FROM Students WHERE student_id=?", [req.user.id]);
  if (!row) return res.status(404).json({ message: "Profile not found." });
  res.json(row);
});
app.put("/api/students/me", auth, allow("student"), async (req, res) => {
  try {
    const { department, semester, cgpa, phone, active_backlogs, total_backlogs } = req.body;
    const dept = canonicalDepartment(department);
    if (!dept) return res.status(400).json({ message: "Please choose a valid department." });
    const gpa = parseCgpa(cgpa);
    if (Number.isNaN(gpa)) return res.status(400).json({ message: "CGPA must be a number between 0 and 10." });
    const sem = wholeNumber(semester, null, 12);
    if (Number.isNaN(sem)) return res.status(400).json({ message: "Semester must be a whole number." });
    const bl = parseBacklogs(active_backlogs, total_backlogs);
    if (bl.error) return res.status(400).json({ message: bl.error });
    await pool.query("UPDATE Students SET department=?,semester=?,cgpa=?,active_backlogs=?,total_backlogs=?,phone=? WHERE student_id=?",
      [dept, sem, gpa, bl.active, bl.total, phone || null, req.user.id]);
    res.json({ message: "Profile updated." });
  } catch { res.status(500).json({ message: "Could not update profile." }); }
});

app.post("/api/auth/register/company", async (req, res) => {
  try {
    const { company_name, email, password, website, location, description } = req.body;
    if (!company_name || !email || !password) return res.status(400).json({ message: "Company name, email and password are required." });
    if (password.length < 8) return res.status(400).json({ message: "Password must contain at least 8 characters." });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      "INSERT INTO Companies(company_name,email,password_hash,website,location,description) VALUES(?,?,?,?,?,?)",
      [company_name, email.toLowerCase(), hash, website || null, location || null, description || null]
    );
    const user = { id: r.insertId, role: "company", name: company_name };
    res.status(201).json({ token: tokenFor(user), user });
  } catch (e) { res.status(e.code === "ER_DUP_ENTRY" ? 409 : 500).json({ message: e.code === "ER_DUP_ENTRY" ? "This email is already registered." : "Could not create company account." }); }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (role === "admin") {
      if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        const user = { id: 0, role: "admin", name: "Administrator" };
        return res.json({ token: tokenFor(user), user });
      }
      return res.status(401).json({ message: "Invalid administrator credentials." });
    }
    const table = role === "company" ? "Companies" : "Students";
    const idCol = role === "company" ? "company_id" : "student_id";
    const nameCol = role === "company" ? "company_name" : "full_name";
    const [rows] = await pool.query(`SELECT ${idCol} AS id, ${nameCol} AS name, email, password_hash FROM ${table} WHERE email=?`, [(email || "").toLowerCase()]);
    if (!rows.length || !(await bcrypt.compare(password || "", rows[0].password_hash))) return res.status(401).json({ message: "Email or password is incorrect." });
    const user = { id: rows[0].id, role, name: rows[0].name };
    res.json({ token: tokenFor(user), user });
  } catch { res.status(500).json({ message: "Login failed. Please try again." }); }
});

app.get("/api/jobs", optionalAuth, async (req, res) => {
  try {
    const q = `%${req.query.q || ""}%`;
    const [rows] = await pool.query(
      `SELECT j.*, c.company_name FROM \`Job Listings\` j JOIN Companies c ON c.company_id=j.company_id
       WHERE j.status='Open' AND (j.title LIKE ? OR j.description LIKE ? OR c.company_name LIKE ?)
       ORDER BY j.created_at DESC`, [q,q,q]);
    await attachDepartments(rows);
    // For a logged-in student, tell the browser whether they can apply and, if not, why.
    if (req.user && req.user.role === "student") {
      const [[student]] = await pool.query("SELECT department,cgpa,active_backlogs,total_backlogs FROM Students WHERE student_id=?", [req.user.id]);
      const [applied] = await pool.query("SELECT job_id FROM Applications WHERE student_id=?", [req.user.id]);
      const appliedIds = new Set(applied.map((a) => a.job_id));
      if (student) rows.forEach((j) => {
        j.eligibility = evaluateEligibility(student, j);
        j.already_applied = appliedIds.has(j.job_id);
      });
    }
    res.json(rows);
  } catch { res.status(500).json({ message: "Could not load jobs." }); }
});

app.post("/api/jobs", auth, allow("company"), async (req, res) => {
  let conn;
  try {
    const { title, description, job_type, location, minimum_cgpa, deadline, max_active_backlogs, max_total_backlogs, eligible_departments } = req.body;
    if (!title || !description) return res.status(400).json({ message: "Job title and description are required." });
    const minCgpa = parseCgpa(minimum_cgpa);
    if (Number.isNaN(minCgpa)) return res.status(400).json({ message: "Minimum CGPA must be between 0 and 10." });
    const maxActive = wholeNumber(max_active_backlogs, 0);
    const maxTotal = wholeNumber(max_total_backlogs, null); // blank = no limit
    if (Number.isNaN(maxActive) || Number.isNaN(maxTotal)) return res.status(400).json({ message: "Backlog limits must be whole numbers (0 or more)." });
    if (maxTotal !== null && maxTotal < maxActive) return res.status(400).json({ message: "Total backlog limit (including cleared) cannot be lower than the active backlog limit." });
    const requested = Array.isArray(eligible_departments) ? eligible_departments : [];
    const depts = [...new Set(requested.map(canonicalDepartment))];
    if (depts.includes(null)) return res.status(400).json({ message: "One or more selected departments are invalid." });

    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [r] = await conn.query(
      "INSERT INTO `Job Listings`(company_id,title,description,job_type,location,minimum_cgpa,max_active_backlogs,max_total_backlogs,deadline) VALUES(?,?,?,?,?,?,?,?,?)",
      [req.user.id,title,description,job_type || "Full-time",location || null,minCgpa || 0,maxActive,maxTotal,deadline || null]);
    for (const d of depts) await conn.query("INSERT INTO `Job Eligible Departments`(job_id,department) VALUES(?,?)", [r.insertId, d]);
    await conn.commit();
    res.status(201).json({ message: "Job published successfully.", job_id: r.insertId });
  } catch {
    if (conn) await conn.rollback().catch(() => {});
    res.status(500).json({ message: "Could not publish job." });
  } finally { if (conn) conn.release(); }
});

app.get("/api/company/jobs", auth, allow("company"), async (req,res) => {
  const [rows] = await pool.query("SELECT * FROM `Job Listings` WHERE company_id=? ORDER BY created_at DESC",[req.user.id]);
  res.json(await attachDepartments(rows));
});

app.post("/api/applications", auth, allow("student"), async (req,res) => {
  try {
    const { job_id } = req.body;
    const [[student]] = await pool.query("SELECT department,cgpa,active_backlogs,total_backlogs FROM Students WHERE student_id=?",[req.user.id]);
    const [[job]] = await pool.query("SELECT * FROM `Job Listings` WHERE job_id=? AND status='Open'",[job_id]);
    if (!student) return res.status(404).json({message:"Student profile not found."});
    if (!job) return res.status(404).json({message:"This job is no longer available."});
    await attachDepartments([job]);
    const { eligible, reasons } = evaluateEligibility(student, job);
    if (!eligible) return res.status(403).json({message:`You are not eligible for this role. ${reasons.join(" ")}`, reasons});
    await pool.query("INSERT INTO Applications(student_id,job_id) VALUES(?,?)",[req.user.id,job_id]);
    res.status(201).json({message:"Your application has been submitted."});
  } catch(e) { res.status(e.code === "ER_DUP_ENTRY" ? 409 : 500).json({message:e.code === "ER_DUP_ENTRY" ? "You have already applied for this job." : "Could not submit application."}); }
});

app.get("/api/applications/mine", auth, allow("student"), async (req,res) => {
  const [rows] = await pool.query(
    `SELECT a.*, j.title, j.location, j.job_type, c.company_name
     FROM Applications a JOIN \`Job Listings\` j ON j.job_id=a.job_id
     JOIN Companies c ON c.company_id=j.company_id
     WHERE a.student_id=? ORDER BY a.applied_at DESC`,[req.user.id]);
  res.json(rows);
});

app.get("/api/company/applications", auth, allow("company"), async (req,res) => {
  const [rows] = await pool.query(
    `SELECT a.application_id,a.status,a.applied_at,s.student_id,s.full_name,s.email,s.department,s.cgpa,s.active_backlogs,s.total_backlogs,j.title,j.job_id
     FROM Applications a JOIN Students s ON s.student_id=a.student_id
     JOIN \`Job Listings\` j ON j.job_id=a.job_id
     WHERE j.company_id=? ORDER BY a.applied_at DESC`,[req.user.id]);
  res.json(rows);
});

app.patch("/api/applications/:id/status", auth, allow("company"), async (req,res) => {
  const {status} = req.body;
  if (!["Shortlisted","Interview","Selected","Rejected"].includes(status)) return res.status(400).json({message:"Invalid application status."});
  const [r] = await pool.query(
    `UPDATE Applications a JOIN \`Job Listings\` j ON j.job_id=a.job_id
     SET a.status=? WHERE a.application_id=? AND j.company_id=?`,[status,req.params.id,req.user.id]);
  if (!r.affectedRows) return res.status(404).json({message:"Application not found."});
  const [[row]] = await pool.query("SELECT student_id FROM Applications WHERE application_id=?",[req.params.id]);
  await pool.query("INSERT INTO Notifications(student_id,title,message) VALUES(?,?,?)",[row.student_id,"Application update",`Your application status has changed to ${status}.`]);
  res.json({message:"Application status updated."});
});

app.post("/api/interview-slots", auth, allow("company"), async (req,res) => {
  try {
    const {job_id,slot_datetime,duration_minutes,mode,location_or_link} = req.body;
    const [[job]] = await pool.query("SELECT job_id FROM `Job Listings` WHERE job_id=? AND company_id=?",[job_id,req.user.id]);
    if (!job) return res.status(404).json({message:"Job not found."});
    const [r] = await pool.query("INSERT INTO `Interview Slots`(job_id,slot_datetime,duration_minutes,mode,location_or_link) VALUES(?,?,?,?,?)",
      [job_id,slot_datetime,duration_minutes || 30,mode || "Online",location_or_link || null]);
    res.status(201).json({message:"Interview slot created.",slot_id:r.insertId});
  } catch { res.status(500).json({message:"Could not create interview slot."}); }
});

app.post("/api/interviews", auth, allow("company"), async (req,res) => {
  try {
    const {application_id,slot_id,round_name} = req.body;
    const [[valid]] = await pool.query(
      `SELECT a.application_id FROM Applications a JOIN \`Job Listings\` j ON j.job_id=a.job_id
       JOIN \`Interview Slots\` s ON s.job_id=j.job_id
       WHERE a.application_id=? AND s.slot_id=? AND j.company_id=? AND s.status='Available'`,
      [application_id,slot_id,req.user.id]);
    if (!valid) return res.status(400).json({message:"Application or interview slot is invalid/unavailable."});
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("INSERT INTO Interviews(application_id,slot_id,round_name) VALUES(?,?,?)",[application_id,slot_id,round_name || "Technical Round"]);
      await conn.query("UPDATE `Interview Slots` SET status='Booked' WHERE slot_id=?",[slot_id]);
      await conn.query("UPDATE Applications SET status='Interview' WHERE application_id=?",[application_id]);
      await conn.commit();
    } catch(e) { await conn.rollback(); throw e; } finally { conn.release(); }
    res.status(201).json({message:"Interview scheduled."});
  } catch { res.status(500).json({message:"Could not schedule interview."}); }
});

app.get("/api/interviews/mine", auth, allow("student"), async (req,res) => {
  const [rows] = await pool.query(
    `SELECT i.*,s.slot_datetime,s.mode,s.location_or_link,j.title,c.company_name
     FROM Interviews i JOIN Applications a ON a.application_id=i.application_id
     JOIN \`Interview Slots\` s ON s.slot_id=i.slot_id
     JOIN \`Job Listings\` j ON j.job_id=a.job_id JOIN Companies c ON c.company_id=j.company_id
     WHERE a.student_id=? ORDER BY s.slot_datetime`,[req.user.id]);
  res.json(rows);
});

app.post("/api/offers", auth, allow("company"), async (req,res) => {
  try {
    const {application_id,package_amount,joining_date} = req.body;
    const [[row]] = await pool.query(
      `SELECT a.application_id,j.title FROM Applications a JOIN \`Job Listings\` j ON j.job_id=a.job_id
       WHERE a.application_id=? AND j.company_id=?`,[application_id,req.user.id]);
    if (!row) return res.status(404).json({message:"Application not found."});
    await pool.query("INSERT INTO Offers(application_id,job_title,package_amount,joining_date) VALUES(?,?,?,?)",
      [application_id,row.title,package_amount || null,joining_date || null]);
    await pool.query("UPDATE Applications SET status='Selected' WHERE application_id=?",[application_id]);
    const [[student]] = await pool.query("SELECT student_id FROM Applications WHERE application_id=?",[application_id]);
    await pool.query("INSERT INTO Notifications(student_id,title,message) VALUES(?,?,?)",[student.student_id,"You received an offer",`You have received an offer for ${row.title}.`]);
    res.status(201).json({message:"Offer published."});
  } catch(e) { res.status(e.code === "ER_DUP_ENTRY" ? 409 : 500).json({message:e.code === "ER_DUP_ENTRY" ? "An offer already exists for this application." : "Could not publish offer."}); }
});

app.get("/api/offers/mine", auth, allow("student"), async (req,res) => {
  const [rows] = await pool.query(
    `SELECT o.*,c.company_name FROM Offers o JOIN Applications a ON a.application_id=o.application_id
     JOIN \`Job Listings\` j ON j.job_id=a.job_id JOIN Companies c ON c.company_id=j.company_id
     WHERE a.student_id=? ORDER BY o.offered_at DESC`,[req.user.id]);
  res.json(rows);
});

app.patch("/api/offers/:id/respond", auth, allow("student"), async (req,res) => {
  const {status} = req.body;
  if (!["Accepted","Declined"].includes(status)) return res.status(400).json({message:"Choose Accepted or Declined."});
  const [r] = await pool.query(
    `UPDATE Offers o JOIN Applications a ON a.application_id=o.application_id
     SET o.status=? WHERE o.offer_id=? AND a.student_id=? AND o.status='Pending'`,
    [status,req.params.id,req.user.id]);
  if (!r.affectedRows) return res.status(404).json({message:"Pending offer not found."});
  res.json({message:`Offer ${status.toLowerCase()}.`});
});

app.get("/api/notifications", auth, allow("student"), async (req,res) => {
  const [rows] = await pool.query("SELECT * FROM Notifications WHERE student_id=? ORDER BY created_at DESC",[req.user.id]);
  res.json(rows);
});
app.patch("/api/notifications/:id/read", auth, allow("student"), async (req,res) => {
  await pool.query("UPDATE Notifications SET is_read=1 WHERE notification_id=? AND student_id=?",[req.params.id,req.user.id]);
  res.json({message:"Notification marked as read."});
});

app.get("/api/admin/summary", auth, allow("admin"), async (req,res) => {
  const [[students]] = await pool.query("SELECT COUNT(*) total FROM Students");
  const [[companies]] = await pool.query("SELECT COUNT(*) total FROM Companies");
  const [[jobs]] = await pool.query("SELECT COUNT(*) total FROM `Job Listings`");
  const [[applications]] = await pool.query("SELECT COUNT(*) total FROM Applications");
  const [[offers]] = await pool.query("SELECT COUNT(*) total FROM Offers WHERE status='Accepted'");
  res.json({students:students.total,companies:companies.total,jobs:jobs.total,applications:applications.total,acceptedOffers:offers.total});
});

app.get("*", (req,res) => res.sendFile(path.join(__dirname,"frontend","index.html")));
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Talent Hub running at http://localhost:${port}`));
