import { requireAuth, getCurrentStudent, logout } from "./auth.js";
import { getCourses, getRegistrations, getResults, getAcademicCalendar } from "./api.js";
import { initTopbar } from "./topbar.js";

function resolveImagePath(raw) {
  if (!raw || !raw.trim()) return "";
  if (raw.startsWith("/") || raw.startsWith("http")) return raw;
  return "/" + raw;
}

requireAuth();

/* ── State ──────────────────────────────────────────────── */
let student = null;
let allCourses = [];
let allRegistrations = [];
let allResults = [];
let academicCalendar = null;

const SEMESTER_LABELS = { 1: "First Semester", 2: "Second Semester" };

/* ── DOM refs ───────────────────────────────────────────── */
const coursesLoading    = document.getElementById("coursesLoading");
const coursesContent    = document.getElementById("coursesContent");
const registeredTabBtn  = document.getElementById("registeredTabBtn");
const allTabBtn         = document.getElementById("allTabBtn");
const registeredPanel   = document.getElementById("registeredPanel");
const allPanel          = document.getElementById("allPanel");
const currentSemesterLabel = document.getElementById("currentSemesterLabel");
const registeredTable   = document.getElementById("registeredTable");
const registeredEmpty   = document.getElementById("registeredEmpty");
const registeredTabBadge = document.getElementById("registeredTabBadge");
const allGroups         = document.getElementById("allGroups");
const allEmpty          = document.getElementById("allEmpty");
const allTabBadge       = document.getElementById("allTabBadge");

const sidebarUserName       = document.getElementById("sidebarUserName");
const sidebarUserMeta       = document.getElementById("sidebarUserMeta");
const sidebarAvatarImg      = document.getElementById("sidebarAvatarImg");
const sidebarAvatarInitials = document.getElementById("sidebarAvatarInitials");
const sidebarToggleBtn      = document.getElementById("sidebarToggleBtn");
const appSidebar            = document.getElementById("appSidebar");
const appSidebarScrim       = document.getElementById("appSidebarScrim");
const logoutBtn             = document.getElementById("logoutBtn");

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", initCoursesPage);

async function initCoursesPage() {
  try {
    student = getCurrentStudent();
    if (!student) { window.location.href = "/index.html"; return; }

    initialiseSidebar();
    initialiseLogout();
    await loadStudentData();

    coursesLoading.classList.add("d-none");
    coursesContent.classList.remove("d-none");

    initialiseTabs();
    renderRegisteredTab();
    renderAllCoursesTab();
  } catch (err) {
    console.error(err);
    coursesLoading.innerHTML = `<div class="alert alert-danger mb-0">Failed to load courses.</div>`;
  }
}

/* ── Data ───────────────────────────────────────────────── */
async function loadStudentData() {
  // Fetch all results then filter client-side. This guards against the
  // json-server type-coercion quirk where records created by the admin
  // panel store studentId as a string while seeded records use a number —
  // a server-side ?studentId= query can miss one type or the other.
  const [courses, registrations, allFetchedResults, calendar] = await Promise.all([
    getCourses(),
    getRegistrations({ studentId: student.id }),
    getResults(),
    getAcademicCalendar(),
  ]);

  allCourses       = courses;
  academicCalendar = calendar;

  // Keep only this student's results, comparing as strings to handle type mismatch
  allResults = allFetchedResults.filter(r => String(r.studentId) === String(student.id));

  /* Sort registrations chronologically for the All Courses grouping */
  allRegistrations = registrations.sort((a, b) => {
    if (a.session !== b.session) return a.session.localeCompare(b.session);
    return a.semester - b.semester;
  });
}

/* ── Sidebar ────────────────────────────────────────────── */
function initialiseSidebar() {
  sidebarUserName.textContent = `${student.firstName} ${student.lastName}`;
  sidebarUserMeta.textContent = student.matricNumber;
  const initials = student.firstName[0] + student.lastName[0];
  if (student.profileImage && student.profileImage.trim()) {
    sidebarAvatarImg.src = resolveImagePath(student.profileImage);
    sidebarAvatarImg.onerror = () => { sidebarAvatarImg.classList.add("d-none"); sidebarAvatarInitials.style.display = "flex"; sidebarAvatarInitials.textContent = initials; };
    sidebarAvatarImg.classList.remove("d-none"); sidebarAvatarInitials.style.display = "none";
  } else { sidebarAvatarInitials.style.display = "flex"; sidebarAvatarInitials.textContent = initials; }
  initTopbar(student);
}

function initialiseLogout() {
  const modal = new bootstrap.Modal(document.getElementById("logoutConfirmModal"));
  logoutBtn.addEventListener("click", () => modal.show());
  document.getElementById("confirmLogoutBtn").addEventListener("click", () => {
    logout(); window.location.href = "/index.html";
  });
}

/* ── Tabs ───────────────────────────────────────────────── */
function initialiseTabs() {
  registeredTabBtn.addEventListener("click", () => switchTab("registered"));
  allTabBtn.addEventListener("click", () => switchTab("all"));
}

function switchTab(tab) {
  const isReg = tab === "registered";
  registeredTabBtn.classList.toggle("active", isReg);
  allTabBtn.classList.toggle("active", !isReg);
  registeredTabBtn.setAttribute("aria-selected", isReg);
  allTabBtn.setAttribute("aria-selected", !isReg);
  registeredPanel.classList.toggle("d-none", !isReg);
  allPanel.classList.toggle("d-none", isReg);
}

/* ── Helpers ────────────────────────────────────────────── */
function findCourse(courseId) {
  return allCourses.find(c => Number(c.id) === Number(courseId));
}

/**
 * A course registration is "completed" (result released) when there is
 * a published result entry for this specific student/course/session/semester.
 * We compare all IDs as strings to guard against numeric vs string type
 * mismatches that arise when json-server stores newly-created records with
 * string IDs while seeded records have numeric IDs.
 */
function hasResult(reg) {
  return allResults.some(
    r =>
      String(r.studentId) === String(student.id) &&
      String(r.courseId)  === String(reg.courseId) &&
      r.session           === reg.session &&
      Number(r.semester)  === Number(reg.semester) &&
      r.published !== false   // only published results count as "Completed"
  );
}

function statusBadge(completed) {
  return completed
    ? `<span class="badge status-badge status-badge--completed">Completed</span>`
    : `<span class="badge status-badge status-badge--pending">Pending</span>`;
}

/* ── Registered Courses Tab ─────────────────────────────── */
/**
 * Always shows current session + current semester registrations.
 *
 * States:
 *  A) Courses registered, some/all results released → show table with live status
 *  B) Courses registered, no results yet → show table with Pending status
 *  C) No courses registered for current semester → contextual empty state
 */
function renderRegisteredTab() {
  const { currentSession, currentSemester } = academicCalendar;

  currentSemesterLabel.textContent =
    `${currentSession}, ${SEMESTER_LABELS[currentSemester] ?? `Semester ${currentSemester}`} · ${student.level} Level`;

  const currentRegs = allRegistrations.filter(
    r => r.session === currentSession && Number(r.semester) === Number(currentSemester)
  );

  registeredTabBadge.textContent = currentRegs.length || "";

  if (currentRegs.length === 0) {
    /* No registration for current semester */
    registeredTable.innerHTML = "";
    registeredEmpty.classList.remove("d-none");
    registeredEmpty.innerHTML = `
      <i class="bi bi-journal-x"></i>
      <p class="mb-0 fw-semibold mt-2">No courses registered yet</p>
      <p class="text-muted small mt-1 mb-0">
        Course registration for ${currentSession} ${SEMESTER_LABELS[currentSemester] ?? `Semester ${currentSemester}`}
        has not been completed. Please contact your department or check back when registration opens.
      </p>`;
    return;
  }

  registeredEmpty.classList.add("d-none");
  registeredTable.innerHTML = currentRegs.map(reg => {
    const course    = findCourse(reg.courseId);
    if (!course) return "";
    const completed = hasResult(reg);
    const carryTag  = reg.type === "carry-over"
      ? ` <span class="carryover-tag">Carry-over</span>` : "";
    const typeTag   = course.courseType === "elective"
      ? `<span title="Elective" style="font-size:.68rem;font-weight:700;padding:.1em .4em;border-radius:4px;background:var(--info-100);color:var(--info);">E</span>`
      : `<span title="Core/Compulsory" style="font-size:.68rem;font-weight:700;padding:.1em .4em;border-radius:4px;background:var(--brand-100);color:var(--brand-900);">C</span>`;
    return `<tr>
      <td>${course.courseCode}</td>
      <td>${typeTag} ${course.courseTitle}${carryTag}</td>
      <td>${course.creditUnit}</td>
      <td>${statusBadge(completed)}</td>
    </tr>`;
  }).join("");
}

/* ── All Courses Tab ────────────────────────────────────── */
/**
 * Shows full registration history grouped by session/semester.
 * Groups are built from allRegistrations (includes current semester).
 * Status for each course is live — based on whether a result exists.
 */
function renderAllCoursesTab() {
  allTabBadge.textContent = allRegistrations.length || "";

  if (allRegistrations.length === 0) {
    allEmpty.classList.remove("d-none");
    allGroups.innerHTML = "";
    return;
  }
  allEmpty.classList.add("d-none");

  /* Sub-heading showing current level */
  const levelHeading = document.getElementById("allCoursesLevelLabel");
  if (levelHeading) levelHeading.textContent = `Full Registration History — ${student.level} Level`;

  /* Build ordered groups */
  const groups = [];
  const seen   = new Map();

  allRegistrations.forEach(reg => {
    const key = `${reg.session}|${reg.semester}`;
    if (!seen.has(key)) {
      seen.set(key, groups.length);
      groups.push({ session: reg.session, semester: reg.semester, rows: [] });
    }
    groups[seen.get(key)].rows.push(reg);
  });

  allGroups.innerHTML = groups.map(renderAllGroupHtml).join("");
}

function renderAllGroupHtml(group) {
  const { currentSession, currentSemester } = academicCalendar;
  const isCurrent =
    group.session === currentSession &&
    Number(group.semester) === Number(currentSemester);

  const label = `${group.session} — ${SEMESTER_LABELS[group.semester] ?? `Semester ${group.semester}`}`;
  const currentTag = isCurrent
    ? `<span class="status-badge status-badge--pending ms-2" style="font-size:.7rem;">Current</span>`
    : "";

  const rows = group.rows.map(reg => {
    const course   = findCourse(reg.courseId);
    if (!course) return "";
    const completed = hasResult(reg);
    const carryTag  = reg.type === "carry-over"
      ? ` <span class="carryover-tag">Carry-over</span>` : "";
    const typeTag   = course.courseType === "elective"
      ? `<span title="Elective" style="font-size:.68rem;font-weight:700;padding:.1em .4em;border-radius:4px;background:var(--info-100);color:var(--info);">E</span>`
      : `<span title="Core/Compulsory" style="font-size:.68rem;font-weight:700;padding:.1em .4em;border-radius:4px;background:var(--brand-100);color:var(--brand-900);">C</span>`;
    return `<tr>
      <td>${course.courseCode}</td>
      <td>${typeTag} ${course.courseTitle}${carryTag}</td>
      <td>${course.creditUnit}</td>
      <td>${statusBadge(completed)}</td>
    </tr>`;
  }).join("");

  return `
    <div class="transcript-group">
      <div class="transcript-group-header">
        <span class="transcript-group-title">${label}${currentTag}</span>
      </div>
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>Course Code</th><th>Course Title</th><th>Credit Unit</th><th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}
