import { requireAuth, getCurrentStudent, logout } from "./auth.js";
import { getResults, getCourses, getDepartmentById } from "./api.js";
import { calculateGPA, scoreToGrade } from "./utils.js";

/* ========================================================
   Protect Transcript Page
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
const transcriptLoading = document.getElementById("transcriptLoading");
const transcriptContent = document.getElementById("transcriptContent");

const sidebarUserName = document.getElementById("sidebarUserName");
const sidebarUserMeta = document.getElementById("sidebarUserMeta");
const sidebarAvatarImg = document.getElementById("sidebarAvatarImg");
const sidebarAvatarInitials = document.getElementById("sidebarAvatarInitials");

const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar = document.getElementById("appSidebar");
const appSidebarScrim = document.getElementById("appSidebarScrim");

const logoutBtn = document.getElementById("logoutBtn");

const courseSearch = document.getElementById("courseSearch");
const sessionFilter = document.getElementById("sessionFilter");
const semesterFilter = document.getElementById("semesterFilter");
const cgpaValue = document.getElementById("cgpaValue");

const resultsTable = document.getElementById("resultsTable");
const resultsCountBadge = document.getElementById("resultsCountBadge");
const resultsEmpty = document.getElementById("resultsEmpty");

const printTranscriptBtn = document.getElementById("printTranscriptBtn");

/* ========================================================
   Start
======================================================== */
document.addEventListener("DOMContentLoaded", initTranscriptPage);

async function initTranscriptPage() {
  try {
    student = getCurrentStudent();

    if (!student) {
      window.location.href = "/assets/pages/login.html";
      return;
    }

    initialiseSidebar();
    initialiseLogout();

    await loadStudentData();

    transcriptLoading.classList.add("d-none");
    transcriptContent.classList.remove("d-none");

    populateFilters();
    initialiseListeners();
    renderResults();
    preparePrintArea(); // print area = full dataset, built once
  } catch (error) {
    console.error(error);
    transcriptLoading.innerHTML = `
      <div class="alert alert-danger mb-0">Failed to load transcript.</div>
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

  // Chronological order for a transcript reads more naturally oldest → newest
  resultsWithCourses.sort((a, b) => {
    if (a.session !== b.session) return a.session.localeCompare(b.session);
    return a.semester - b.semester;
  });
}

/* ========================================================
   Sidebar / Logout (same pattern as results.js)
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
   Filters
======================================================== */
function populateFilters() {
  const sessions = [...new Set(resultsWithCourses.map((r) => r.session))].sort();

  sessionFilter.innerHTML = `<option value="all">All Sessions</option>`;
  sessions.forEach((session) => {
    sessionFilter.innerHTML += `<option value="${session}">${session}</option>`;
  });

  const semesters = [...new Set(resultsWithCourses.map((r) => r.semester))].sort((a, b) => a - b);

  semesterFilter.innerHTML = `<option value="all">All Semesters</option>`;
  semesters.forEach((semester) => {
    const label = SEMESTER_LABELS[semester] ?? `Semester ${semester}`;
    semesterFilter.innerHTML += `<option value="${semester}">${label}</option>`;
  });
}

function initialiseListeners() {
  sessionFilter.addEventListener("change", renderResults);
  semesterFilter.addEventListener("change", renderResults);
  courseSearch.addEventListener("input", renderResults);
  printTranscriptBtn.addEventListener("click", () => window.print());
}

/* ========================================================
   On-screen filtering (search + session + semester)
======================================================== */
function getFilteredResults() {
  const sessionValue = sessionFilter.value;
  const semesterValue = semesterFilter.value;
  const query = courseSearch.value.trim().toLowerCase();

  return resultsWithCourses.filter((r) => {
    const matchesSession = sessionValue === "all" || r.session === sessionValue;
    const matchesSemester = semesterValue === "all" || String(r.semester) === semesterValue;
    const matchesSearch =
      query === "" ||
      r.courseCode.toLowerCase().includes(query) ||
      r.courseTitle.toLowerCase().includes(query);

    return matchesSession && matchesSemester && matchesSearch;
  });
}

function renderResults() {
  const filtered = getFilteredResults();

  renderTable(filtered);
  renderCountBadge(filtered);

  // CGPA always reflects the FULL record, not the current filter/search —
  // it's a fixed academic figure, not something that should change because
  // you searched for one course.
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
        <td>${result.session}</td>
        <td>${SEMESTER_LABELS[result.semester] ?? result.semester}</td>
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
   Print Area — always the FULL, unfiltered result set
======================================================== */
function preparePrintArea() {
  document.getElementById("printStudentName").textContent =
    `${student.firstName} ${student.lastName}${student.otherName ? " " + student.otherName : ""}`;
  document.getElementById("printMatric").textContent = student.matricNumber;
  document.getElementById("printDepartment").textContent = department?.name ?? "N/A";
  document.getElementById("printProgramme").textContent = student.programme;
  document.getElementById("printLevel").textContent = `${student.level} Level`;
  document.getElementById("printCgpa").textContent = resultsWithCourses.length
    ? calculateGPA(resultsWithCourses)
    : "0.00";

  document.getElementById("printGeneratedDate").textContent =
    `Generated on ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;

  const printTable = document.getElementById("printResultsTable");
  printTable.innerHTML = "";

  resultsWithCourses.forEach((result) => {
    const grade = scoreToGrade(result.score);
    printTable.innerHTML += `
      <tr>
        <td>${result.session}</td>
        <td>${SEMESTER_LABELS[result.semester] ?? result.semester}</td>
        <td>${result.courseCode}</td>
        <td>${result.courseTitle}</td>
        <td>${result.creditUnit}</td>
        <td>${result.score}</td>
        <td>${grade.grade}</td>
      </tr>
    `;
  });
}