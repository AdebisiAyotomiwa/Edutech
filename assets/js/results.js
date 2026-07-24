import { requireAuth, getCurrentStudent, logout } from "./auth.js";
import { getResults, getCourses, getDepartmentById, getRegistrations, getAcademicCalendar } from "./api.js";
import { calculateGPA, scoreToGrade } from "./utils.js";

function resolveImagePath(raw) {
  if (!raw || !raw.trim()) return "";
  if (raw.startsWith("/") || raw.startsWith("http")) return raw;
  return "/" + raw;
}

requireAuth();

/* ── State ──────────────────────────────────────────────── */
let student = null;
let department = null;
let resultsWithCourses = [];   // only entries with actual scores
let allRegistrations = [];     // every registration ever for this student
let allCourses = [];
let academicCalendar = null;

const SEMESTER_LABELS = { 1: "First Semester", 2: "Second Semester" };

/* ── DOM refs ───────────────────────────────────────────── */
const resultsLoading    = document.getElementById("resultsLoading");
const resultsContent    = document.getElementById("resultsContent");
const sessionFilter     = document.getElementById("sessionFilter");
const semesterFilter    = document.getElementById("semesterFilter");
const semesterGpaValue  = document.getElementById("semesterGpaValue");
const cgpaValue         = document.getElementById("cgpaValue");
const resultsTable      = document.getElementById("resultsTable");
const resultsCountBadge = document.getElementById("resultsCountBadge");
const resultsEmpty      = document.getElementById("resultsEmpty");
const printResultsBtn   = document.getElementById("printResultsBtn");

const sidebarUserName       = document.getElementById("sidebarUserName");
const sidebarUserMeta       = document.getElementById("sidebarUserMeta");
const sidebarAvatarImg      = document.getElementById("sidebarAvatarImg");
const sidebarAvatarInitials = document.getElementById("sidebarAvatarInitials");
const sidebarToggleBtn      = document.getElementById("sidebarToggleBtn");
const appSidebar            = document.getElementById("appSidebar");
const appSidebarScrim       = document.getElementById("appSidebarScrim");
const logoutBtn             = document.getElementById("logoutBtn");

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", initResultsPage);

async function initResultsPage() {
  try {
    student = getCurrentStudent();
    if (!student) { window.location.href = "/assets/pages/login.html"; return; }

    initialiseSidebar();
    initialiseLogout();
    await loadStudentData();

    resultsLoading.classList.add("d-none");
    resultsContent.classList.remove("d-none");

    populateFilters();
    selectDefaultSemester();
    initialiseFilterListeners();
    renderResults();
  } catch (err) {
    console.error(err);
    resultsLoading.innerHTML = `<div class="alert alert-danger mb-0">Failed to load results.</div>`;
  }
}

/* ── Data ───────────────────────────────────────────────── */
async function loadStudentData() {
  const [results, courses, dept, registrations, calendar] = await Promise.all([
    getResults({ studentId: student.id }),
    getCourses(),
    getDepartmentById(student.departmentId),
    getRegistrations({ studentId: student.id }),
    getAcademicCalendar(),
  ]);

  allCourses       = courses;
  department       = dept;
  allRegistrations = registrations;
  academicCalendar = calendar;

  resultsWithCourses = results
    .filter(r => r.published !== false)   // only published results visible to students
    .map(r => {
      const course = allCourses.find(c => Number(c.id) === Number(r.courseId));
      if (!course) return { ...r, courseCode: "N/A", courseTitle: "Unknown Course", creditUnit: 0 };
      return { ...r, courseCode: course.courseCode, courseTitle: course.courseTitle, creditUnit: course.creditUnit };
    })
    .sort((a, b) => {
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
    sidebarAvatarImg.onerror = () => {
      sidebarAvatarImg.classList.add("d-none");
      sidebarAvatarInitials.style.display = "flex";
      sidebarAvatarInitials.textContent = initials;
    };
    sidebarAvatarImg.classList.remove("d-none");
    sidebarAvatarInitials.style.display = "none";
  } else {
    sidebarAvatarInitials.style.display = "flex";
    sidebarAvatarInitials.textContent = initials;
  }

  sidebarToggleBtn.addEventListener("click", () => {
    const open = appSidebar.classList.toggle("is-open");
    appSidebarScrim.classList.toggle("is-open");
    sidebarToggleBtn.setAttribute("aria-expanded", open);
  });
  appSidebarScrim.addEventListener("click", () => {
    appSidebar.classList.remove("is-open");
    appSidebarScrim.classList.remove("is-open");
    sidebarToggleBtn.setAttribute("aria-expanded", "false");
  });
}

function initialiseLogout() {
  const modal = new bootstrap.Modal(document.getElementById("logoutConfirmModal"));
  logoutBtn.addEventListener("click", () => modal.show());
  document.getElementById("confirmLogoutBtn").addEventListener("click", () => {
    logout(); window.location.href = "/assets/pages/login.html";
  });
}

/* ── Filter population ──────────────────────────────────── */
/**
 * Build the full list of session/semester options from:
 *  1. All sessions/semesters the student has results for
 *  2. All sessions/semesters the student has registrations for
 *  3. The current session + current semester (always present)
 *
 * This ensures the current semester is always selectable even
 * when no results have been released yet.
 */
function getAllSessionSemesters() {
  const map = new Map(); // "session" -> Set of semesters

  const add = (session, semester) => {
    if (!map.has(session)) map.set(session, new Set());
    map.get(session).add(Number(semester));
  };

  resultsWithCourses.forEach(r => add(r.session, r.semester));
  allRegistrations.forEach(r => add(r.session, r.semester));
  // Always include current calendar entry
  add(academicCalendar.currentSession, academicCalendar.currentSemester);

  return map;
}

function populateFilters() {
  const map = getAllSessionSemesters();
  const sessions = Array.from(map.keys()).sort().reverse();

  sessionFilter.innerHTML = sessions
    .map(s => `<option value="${s}">${s}</option>`)
    .join("");

  updateSemesterOptions();
}

function updateSemesterOptions() {
  const map = getAllSessionSemesters();
  const session = sessionFilter.value;
  const semesters = Array.from(map.get(session) || []).sort();

  const prev = semesterFilter.value;
  semesterFilter.innerHTML = semesters
    .map(s => `<option value="${s}">${SEMESTER_LABELS[s] ?? `Semester ${s}`}</option>`)
    .join("");

  if (semesters.includes(Number(prev))) semesterFilter.value = prev;
}

/**
 * Default to current session + current semester so the student
 * immediately sees the most relevant view.
 */
function selectDefaultSemester() {
  const { currentSession, currentSemester } = academicCalendar;
  // Try to select current session
  const options = Array.from(sessionFilter.options).map(o => o.value);
  if (options.includes(currentSession)) {
    sessionFilter.value = currentSession;
    updateSemesterOptions();
  }
  // Try to select current semester within that session
  const semOptions = Array.from(semesterFilter.options).map(o => Number(o.value));
  if (semOptions.includes(Number(currentSemester))) {
    semesterFilter.value = String(currentSemester);
  }
}

function initialiseFilterListeners() {
  sessionFilter.addEventListener("change", () => { updateSemesterOptions(); renderResults(); });
  semesterFilter.addEventListener("change", renderResults);
  printResultsBtn.addEventListener("click", handlePrint);
}

/* ── Render ─────────────────────────────────────────────── */
function getFilteredResults() {
  return resultsWithCourses.filter(
    r => r.session === sessionFilter.value && String(r.semester) === semesterFilter.value
  );
}

/**
 * Check whether the student is registered for this session/semester.
 * Used to decide whether to show "not yet released" vs "no registration".
 */
function isRegisteredForSelection() {
  return allRegistrations.some(
    r => r.session === sessionFilter.value && Number(r.semester) === Number(semesterFilter.value)
  );
}

function isCurrentSelection() {
  return (
    sessionFilter.value === academicCalendar.currentSession &&
    Number(semesterFilter.value) === Number(academicCalendar.currentSemester)
  );
}

function renderResults() {
  const filtered = getFilteredResults();

  /* GPA figures — CGPA always uses all historical results */
  const hasSemesterResults = filtered.length > 0;
  semesterGpaValue.textContent = hasSemesterResults ? calculateGPA(filtered) : "—";
  cgpaValue.textContent = resultsWithCourses.length ? calculateGPA(resultsWithCourses) : "0.00";
  resultsCountBadge.textContent = hasSemesterResults ? `${filtered.length} course${filtered.length === 1 ? "" : "s"}` : "";

  /* Decide what to show in the table area */
  if (hasSemesterResults) {
    /* ✅ Results exist — render the table normally */
    showResultsTable(filtered);
  } else if (isRegisteredForSelection()) {
    /* ⏳ Registered but no results yet */
    showNotReleasedState();
  } else if (isCurrentSelection()) {
    /* Current semester, not yet registered */
    showNoRegistrationState();
  } else {
    /* Past semester with no results and no registration — shouldn't
       normally appear but handled gracefully */
    showNoDataState();
  }
}

function showResultsTable(filtered) {
  resultsEmpty.classList.add("d-none");
  resultsTable.innerHTML = filtered.map(r => {
    const grade = scoreToGrade(r.score);
    return `<tr>
      <td>${r.courseCode}</td>
      <td>${r.courseTitle}</td>
      <td>${r.creditUnit}</td>
      <td class="fw-semibold">${r.score}</td>
      <td><span class="badge badge-grade badge-grade--${grade.grade.toLowerCase()}">${grade.grade}</span></td>
    </tr>`;
  }).join("");
  printResultsBtn.closest(".results-print-row")?.classList.remove("d-none");
}

function showNotReleasedState() {
  resultsTable.innerHTML = "";
  printResultsBtn.closest(".results-print-row")?.classList.add("d-none");
  resultsEmpty.classList.remove("d-none");
  resultsEmpty.innerHTML = `
    <i class="bi bi-hourglass-split" style="font-size:2rem;color:var(--warn);display:block;margin-bottom:.6rem;"></i>
    <p class="mb-0 fw-semibold" style="color:var(--warn);">Results not yet released</p>
    <p class="text-muted small mt-1 mb-0">Your results for this semester have not been published yet. Check back later.</p>`;
}

function showNoRegistrationState() {
  resultsTable.innerHTML = "";
  printResultsBtn.closest(".results-print-row")?.classList.add("d-none");
  resultsEmpty.classList.remove("d-none");
  resultsEmpty.innerHTML = `
    <i class="bi bi-journal-x" style="font-size:2rem;color:var(--ink-400);display:block;margin-bottom:.6rem;"></i>
    <p class="mb-0 fw-semibold">No courses registered</p>
    <p class="text-muted small mt-1 mb-0">You have not registered any courses for this semester yet.</p>`;
}

function showNoDataState() {
  resultsTable.innerHTML = "";
  printResultsBtn.closest(".results-print-row")?.classList.add("d-none");
  resultsEmpty.classList.remove("d-none");
  resultsEmpty.innerHTML = `
    <i class="bi bi-inbox" style="font-size:2rem;color:var(--ink-400);display:block;margin-bottom:.6rem;"></i>
    <p class="mb-0">No results found for this selection.</p>`;
}

/* ── Print ──────────────────────────────────────────────── */
function handlePrint() {
  const filtered = getFilteredResults();
  if (!filtered.length) return;
  preparePrintArea(filtered);
  window.print();
}

function preparePrintArea(filtered) {
  document.getElementById("printStudentName").textContent =
    `${student.firstName} ${student.lastName}${student.otherName ? " " + student.otherName : ""}`;
  document.getElementById("printMatric").textContent = student.matricNumber;
  document.getElementById("printDepartment").textContent = department?.name ?? "N/A";
  document.getElementById("printProgramme").textContent = student.programme;
  document.getElementById("printSession").textContent = sessionFilter.value;
  document.getElementById("printSemester").textContent =
    SEMESTER_LABELS[semesterFilter.value] ?? `Semester ${semesterFilter.value}`;
  document.getElementById("printGeneratedDate").textContent =
    `Generated on ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
  document.getElementById("printSemesterGpa").textContent =
    filtered.length ? calculateGPA(filtered) : "0.00";
  document.getElementById("printCgpa").textContent =
    resultsWithCourses.length ? calculateGPA(resultsWithCourses) : "0.00";

  const printTable = document.getElementById("printResultsTable");
  printTable.innerHTML = filtered.map(r => {
    const grade = scoreToGrade(r.score);
    return `<tr>
      <td>${r.courseCode}</td><td>${r.courseTitle}</td>
      <td>${r.creditUnit}</td><td>${r.score}</td><td>${grade.grade}</td>
    </tr>`;
  }).join("");
}
