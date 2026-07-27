import { requireAuth, getCurrentStudent, logout } from "./auth.js";
import { getResults, getCourses, getDepartmentById } from "./api.js";
import { calculateGPA, scoreToGrade } from "./utils.js";

function resolveImagePath(raw) {
  if (!raw || !raw.trim()) return "";
  if (raw.startsWith("/") || raw.startsWith("http")) return raw;
  return "/" + raw;
}

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
const cgpaValue = document.getElementById("cgpaValue");

const transcriptGroups = document.getElementById("transcriptGroups");
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
      window.location.href = "/index.html";
      return;
    }

    initialiseSidebar();
    initialiseLogout();

    await loadStudentData();

    transcriptLoading.classList.add("d-none");
    transcriptContent.classList.remove("d-none");

    initialiseListeners();
    renderOnScreen();
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

  resultsWithCourses = results
    .filter(r => r.published !== false)   // only published results visible to students
    .map((result) => {
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

  // Chronological order — required for both the visual grouping
  // and the running CGPA-per-semester calculation.
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
    window.location.href = "/index.html";
  });
}

function initialiseListeners() {
  courseSearch.addEventListener("input", renderOnScreen);
  printTranscriptBtn.addEventListener("click", handlePrint);
}

/* ========================================================
   Grouping helper — groups results by (session, semester) in
   chronological order, with each group's own GPA and a running
   cumulative GPA up to and including that group.
======================================================== */
function buildSemesterGroups(records) {
  const groups = [];
  const seen = new Map(); // "session|semester" -> group index

  records.forEach((result) => {
    const key = `${result.session}|${result.semester}`;
    if (!seen.has(key)) {
      seen.set(key, groups.length);
      groups.push({
        session: result.session,
        semester: result.semester,
        rows: [],
      });
    }
    groups[seen.get(key)].rows.push(result);
  });

  // Running cumulative GPA: computed from ALL results up to and
  // including this group's semester — not just the visible/filtered
  // rows, so it stays academically accurate even while searching.
  let cumulativeSoFar = [];
  groups.forEach((group) => {
    group.semesterGpa = calculateGPA(group.rows);
    cumulativeSoFar = cumulativeSoFar.concat(
      resultsWithCourses.filter(
        (r) => r.session === group.session && r.semester === group.semester
      )
    );
    group.cumulativeGpa = calculateGPA(cumulativeSoFar);
  });

  return groups;
}

/* ========================================================
   On-screen render — search filters rows within each group;
   groups with zero matching rows are hidden entirely.
======================================================== */
function renderOnScreen() {
  const query = courseSearch.value.trim().toLowerCase();

  const filteredRecords =
    query === ""
      ? resultsWithCourses
      : resultsWithCourses.filter(
          (r) =>
            r.courseCode.toLowerCase().includes(query) ||
            r.courseTitle.toLowerCase().includes(query)
        );

  const groups = buildSemesterGroups(filteredRecords);

  cgpaValue.textContent = resultsWithCourses.length ? calculateGPA(resultsWithCourses) : "0.00";
  resultsCountBadge.textContent = `${filteredRecords.length} course${filteredRecords.length === 1 ? "" : "s"}`;

  transcriptGroups.innerHTML = "";

  if (groups.length === 0) {
    resultsEmpty.classList.remove("d-none");
    return;
  }

  resultsEmpty.classList.add("d-none");

  groups.forEach((group) => {
    transcriptGroups.innerHTML += renderGroupHtml(group);
  });
}

function renderGroupHtml(group) {
  const label = `${group.session} — ${SEMESTER_LABELS[group.semester] ?? `Semester ${group.semester}`}`;

  const rows = group.rows
    .map((result) => {
      const grade = scoreToGrade(result.score);
      return `
        <tr>
          <td>${result.courseCode}</td>
          <td>${result.courseTitle}</td>
          <td>${result.creditUnit}</td>
          <td>${result.score}</td>
          <td><span class="badge badge-grade badge-grade--${grade.grade.toLowerCase()}">${grade.grade}</span></td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="transcript-group">
      <div class="transcript-group-header">
        <span class="transcript-group-title">${label}</span>
        <div class="transcript-group-gpas">
          <span>Semester GPA: <strong>${group.semesterGpa}</strong></span>
          <span>CGPA: <strong>${group.cumulativeGpa}</strong></span>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>Course</th>
              <th>Title</th>
              <th>Credit Unit</th>
              <th>Score</th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

/* ========================================================
   Print — always the FULL, unfiltered record, same grouping
======================================================== */
function handlePrint() {
  preparePrintArea();
  window.print();
}

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

  const groups = buildSemesterGroups(resultsWithCourses);
  const printGroups = document.getElementById("printGroups");
  printGroups.innerHTML = "";

  groups.forEach((group) => {
    printGroups.innerHTML += renderPrintGroupHtml(group);
  });
}

function renderPrintGroupHtml(group) {
  const label = `${group.session} — ${SEMESTER_LABELS[group.semester] ?? `Semester ${group.semester}`}`;

  const rows = group.rows
    .map((result) => {
      const grade = scoreToGrade(result.score);
      return `
        <tr>
          <td>${result.courseCode}</td>
          <td>${result.courseTitle}</td>
          <td>${result.creditUnit}</td>
          <td>${result.score}</td>
          <td>${grade.grade}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="print-group">
      <div class="print-group-header">
        <span>${label}</span>
      </div>
      <table class="print-table">
        <thead>
          <tr>
            <th>Course Code</th>
            <th>Course Title</th>
            <th>Credit Unit</th>
            <th>Score</th>
            <th>Grade</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="print-group-gpas">
        <span>Semester GPA: <strong>${group.semesterGpa}</strong></span>
        <span>Cumulative GPA (CGPA): <strong>${group.cumulativeGpa}</strong></span>
      </div>
    </div>
  `;
}