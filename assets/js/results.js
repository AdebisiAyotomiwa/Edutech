import { requireAuth, getCurrentStudent, logout } from "./auth.js";
import { getResults, getCourses, getDepartmentById } from "./api.js";
import { calculateGPA, scoreToGrade } from "./utils.js";

/* ========================================================
   Protect Results Page
======================================================== */
requireAuth();

/* ========================================================
   Global State
======================================================== */
let student = null;
let department = null;
let resultsWithCourses = [];
let allCourses = [];

const SEMESTER_LABELS = {
  1: "First Semester",
  2: "Second Semester",
};

/* ========================================================
   DOM Elements
======================================================== */
const resultsLoading = document.getElementById("resultsLoading");
const resultsContent = document.getElementById("resultsContent");

const sidebarUserName = document.getElementById("sidebarUserName");
const sidebarUserMeta = document.getElementById("sidebarUserMeta");
const sidebarAvatarImg = document.getElementById("sidebarAvatarImg");
const sidebarAvatarInitials = document.getElementById("sidebarAvatarInitials");

const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar = document.getElementById("appSidebar");
const appSidebarScrim = document.getElementById("appSidebarScrim");

const logoutBtn = document.getElementById("logoutBtn");

const sessionFilter = document.getElementById("sessionFilter");
const semesterFilter = document.getElementById("semesterFilter");

const semesterGpaValue = document.getElementById("semesterGpaValue");
const cgpaValue = document.getElementById("cgpaValue");

const resultsTable = document.getElementById("resultsTable");
const resultsCountBadge = document.getElementById("resultsCountBadge");
const resultsEmpty = document.getElementById("resultsEmpty");

const printResultsBtn = document.getElementById("printResultsBtn");

/* ========================================================
   Start
======================================================== */
document.addEventListener("DOMContentLoaded", initResultsPage);

async function initResultsPage() {
  try {
    student = getCurrentStudent();

    if (!student) {
      window.location.href = "/assets/pages/login.html";
      return;
    }

    initialiseSidebar();
    initialiseLogout();

    await loadStudentData();

    resultsLoading.classList.add("d-none");
    resultsContent.classList.remove("d-none");

    populateFilters();
    selectLatestSemester();
    initialiseFilterListeners();
    renderResults();
  } catch (error) {
    console.error(error);
    resultsLoading.innerHTML = `
      <div class="alert alert-danger mb-0">Failed to load results.</div>
    `;
  }
}

/* ========================================================
   Load Data
======================================================== */
async function loadStudentData() {
  const [results, courses, dept] = await Promise.all([
    getResults({ studentId: student.id }),
    getCourses(),
    getDepartmentById(student.departmentId),
  ]);

  allCourses = courses;
  department = dept;

  resultsWithCourses = results.map((result) => {
    const course = allCourses.find((c) => Number(c.id) === Number(result.courseId));

    if (!course) {
      console.warn("Course not found for result:", result);
      return { ...result, courseCode: "N/A", courseTitle: "Unknown Course", creditUnit: 0 };
    }

    return {
      ...result,
      courseCode: course.courseCode,
      courseTitle: course.courseTitle,
      creditUnit: course.creditUnit,
    };
  });

  // Chronological order — needed so "latest" is reliably the last entry
  resultsWithCourses.sort((a, b) => {
    if (a.session !== b.session) return a.session.localeCompare(b.session);
    return a.semester - b.semester;
  });
}

/* ========================================================
   Sidebar / Logout
======================================================== */
function initialiseSidebar() {
  sidebarUserName.textContent = `${student.firstName} ${student.lastName}`;
  sidebarUserMeta.textContent = student.matricNumber;

  const initials = student.firstName.charAt(0) + student.lastName.charAt(0);

  if (student.profileImage && student.profileImage.trim() !== "") {
    sidebarAvatarImg.src = student.profileImage;
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
    const isOpen = appSidebar.classList.toggle("is-open");
    appSidebarScrim.classList.toggle("is-open");
    sidebarToggleBtn.setAttribute("aria-expanded", isOpen);
  });

  appSidebarScrim.addEventListener("click", () => {
    appSidebar.classList.remove("is-open");
    appSidebarScrim.classList.remove("is-open");
    sidebarToggleBtn.setAttribute("aria-expanded", "false");
  });
}

function initialiseLogout() {
  const logoutModalEl = document.getElementById("logoutConfirmModal");
  const logoutModal = new bootstrap.Modal(logoutModalEl);
  const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

  logoutBtn.addEventListener("click", () => logoutModal.show());

  confirmLogoutBtn.addEventListener("click", () => {
    logout();
    window.location.href = "/assets/pages/login.html";
  });
}

/* ========================================================
   Filters — session/semester only, no "All" options.
   The student always views exactly one semester at a time.
======================================================== */
function populateFilters() {
  const sessions = [...new Set(resultsWithCourses.map((r) => r.session))].sort();

  sessionFilter.innerHTML = "";
  sessions.forEach((session) => {
    sessionFilter.innerHTML += `<option value="${session}">${session}</option>`;
  });

  // Semester options depend on which session is selected — populated
  // dynamically in updateSemesterOptions(), called after session changes.
  updateSemesterOptions();
}

function updateSemesterOptions() {
  const sessionValue = sessionFilter.value;

  const semesters = [
    ...new Set(
      resultsWithCourses
        .filter((r) => r.session === sessionValue)
        .map((r) => r.semester)
    ),
  ].sort((a, b) => a - b);

  const previousValue = semesterFilter.value;

  semesterFilter.innerHTML = "";
  semesters.forEach((semester) => {
    const label = SEMESTER_LABELS[semester] ?? `Semester ${semester}`;
    semesterFilter.innerHTML += `<option value="${semester}">${label}</option>`;
  });

  // Preserve the previously selected semester if it still exists for
  // the newly selected session; otherwise default to the first available.
  if (semesters.includes(Number(previousValue))) {
    semesterFilter.value = previousValue;
  }
}

/**
 * Defaults the filters to the most recently completed semester —
 * the last entry in resultsWithCourses, since it's sorted chronologically.
 */
function selectLatestSemester() {
  if (resultsWithCourses.length === 0) return;

  const latest = resultsWithCourses[resultsWithCourses.length - 1];
  sessionFilter.value = latest.session;
  updateSemesterOptions();
  semesterFilter.value = String(latest.semester);
}

function initialiseFilterListeners() {
  sessionFilter.addEventListener("change", () => {
    updateSemesterOptions();
    renderResults();
  });
  semesterFilter.addEventListener("change", renderResults);
  printResultsBtn.addEventListener("click", handlePrint);
}

/* ========================================================
   Render
======================================================== */
function getFilteredResults() {
  const sessionValue = sessionFilter.value;
  const semesterValue = semesterFilter.value;

  return resultsWithCourses.filter(
    (r) => r.session === sessionValue && String(r.semester) === semesterValue
  );
}

function renderResults() {
  const filtered = getFilteredResults();

  renderTable(filtered);
  renderCountBadge(filtered);

  semesterGpaValue.textContent = filtered.length ? calculateGPA(filtered) : "0.00";
  cgpaValue.textContent = resultsWithCourses.length ? calculateGPA(resultsWithCourses) : "0.00";
}

function renderTable(filtered) {
  resultsTable.innerHTML = "";

  if (filtered.length === 0) {
    resultsEmpty.classList.remove("d-none");
    return;
  }

  resultsEmpty.classList.add("d-none");

  filtered.forEach((result) => {
    const grade = scoreToGrade(result.score);
    resultsTable.innerHTML += `
      <tr>
        <td>${result.courseCode}</td>
        <td>${result.courseTitle}</td>
        <td>${result.creditUnit}</td>
        <td>${result.score}</td>
        <td><span class="badge badge-grade badge-grade--${grade.grade.toLowerCase()}">${grade.grade}</span></td>
      </tr>
    `;
  });
}

function renderCountBadge(filtered) {
  const count = filtered.length;
  resultsCountBadge.textContent = `${count} course${count === 1 ? "" : "s"}`;
}

/* ========================================================
   Print — prints exactly whatever is currently filtered
======================================================== */
function handlePrint() {
  const filtered = getFilteredResults();
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
  printTable.innerHTML = "";

  filtered.forEach((result) => {
    const grade = scoreToGrade(result.score);
    printTable.innerHTML += `
      <tr>
        <td>${result.courseCode}</td>
        <td>${result.courseTitle}</td>
        <td>${result.creditUnit}</td>
        <td>${result.score}</td>
        <td>${grade.grade}</td>
      </tr>
    `;
  });
}