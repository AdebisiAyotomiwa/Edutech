import { requireAuth, getCurrentStudent, logout } from "./auth.js";
import { getResults, getCourses } from "./api.js";
import { calculateGPA, scoreToGrade } from "./utils.js";

/* ========================================================
   Protect Results Page
======================================================== */
requireAuth();

/* ========================================================
   Global State
======================================================== */
let student = null;
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

const gpaSummaryLabel = document.getElementById("gpaSummaryLabel");
const semesterGpaValue = document.getElementById("semesterGpaValue");

const resultsTable = document.getElementById("resultsTable");
const resultsCountBadge = document.getElementById("resultsCountBadge");
const resultsEmpty = document.getElementById("resultsEmpty");

/* ========================================================
   Start
======================================================== */
document.addEventListener("DOMContentLoaded", initResultsPage);

async function initResultsPage() {
  try {
    student = getCurrentStudent();

    if (!student) {
      window.location.href = "/pages/login.html";
      return;
    }

    initialiseSidebar();
    initialiseLogout();

    await loadStudentData();

    resultsLoading.classList.add("d-none");
    resultsContent.classList.remove("d-none");

    populateFilters();
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
  const [results, courses] = await Promise.all([
    getResults({ studentId: student.id }),
    getCourses(),
  ]);

  allCourses = courses;

  resultsWithCourses = results.map((result) => {
    const course = allCourses.find(
      (c) => Number(c.id) === Number(result.courseId),
    );

    if (!course) {
      console.warn("Course not found for result:", result);
      return {
        ...result,
        courseCode: "N/A",
        courseTitle: "Unknown Course",
        creditUnit: 0,
      };
    }

    return {
      ...result,
      courseCode: course.courseCode,
      courseTitle: course.courseTitle,
      creditUnit: course.creditUnit,
    };
  });
}

/* ========================================================
   Sidebar (same pattern as dashboard.js)
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

  logoutBtn.addEventListener("click", () => {
    logoutModal.show();
  });

  confirmLogoutBtn.addEventListener("click", () => {
    logout();
    window.location.href = "/assets/pages/login.html";
  });
}

/* ========================================================
   Filters — options derived entirely from resultsWithCourses
======================================================== */
function populateFilters() {
  // Sessions: unique, sorted ascending (works for "YYYY/YYYY" strings)
  const sessions = [...new Set(resultsWithCourses.map((r) => r.session))].sort();

  sessionFilter.innerHTML = `<option value="all">All Sessions</option>`;
  sessions.forEach((session) => {
    sessionFilter.innerHTML += `<option value="${session}">${session}</option>`;
  });

  // Semesters: unique values actually present in the data
  const semesters = [...new Set(resultsWithCourses.map((r) => r.semester))].sort(
    (a, b) => a - b,
  );

  semesterFilter.innerHTML = `<option value="all">All Semesters</option>`;
  semesters.forEach((semester) => {
    const label = SEMESTER_LABELS[semester] ?? `Semester ${semester}`;
    semesterFilter.innerHTML += `<option value="${semester}">${label}</option>`;
  });
}

function initialiseFilterListeners() {
  sessionFilter.addEventListener("change", renderResults);
  semesterFilter.addEventListener("change", renderResults);
}

/* ========================================================
   Render — table rows, count, GPA — all computed on the fly
======================================================== */
function getFilteredResults() {
  const sessionValue = sessionFilter.value;
  const semesterValue = semesterFilter.value;

  return resultsWithCourses.filter((r) => {
    const matchesSession = sessionValue === "all" || r.session === sessionValue;
    const matchesSemester =
      semesterValue === "all" || String(r.semester) === semesterValue;
    return matchesSession && matchesSemester;
  });
}

function renderResults() {
  const filtered = getFilteredResults();

  renderTable(filtered);
  renderCountBadge(filtered);
  renderGpaSummary(filtered);
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

function renderGpaSummary(filtered) {
  const sessionValue = sessionFilter.value;
  const semesterValue = semesterFilter.value;
  const isFullyFiltered = sessionValue !== "all" && semesterValue !== "all";

  gpaSummaryLabel.textContent = isFullyFiltered ? "Semester GPA" : "Overall GPA (CGPA)";
  semesterGpaValue.textContent = filtered.length ? calculateGPA(filtered) : "0.00";
}