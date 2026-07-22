import { requireAuth, getCurrentStudent, logout } from "./auth.js";
import { getCourses, getRegistrations, getResults, getAcademicCalendar } from "./api.js";

/* ========================================================
   Protect Courses Page
======================================================== */
requireAuth();

/* ========================================================
   Global State
======================================================== */
let student = null;
let allCourses = [];
let allRegistrations = [];
let allResults = [];
let academicCalendar = null;

const SEMESTER_LABELS = {
  1: "First Semester",
  2: "Second Semester",
};

/* ========================================================
   DOM Elements
======================================================== */
const coursesLoading = document.getElementById("coursesLoading");
const coursesContent = document.getElementById("coursesContent");

const sidebarUserName = document.getElementById("sidebarUserName");
const sidebarUserMeta = document.getElementById("sidebarUserMeta");
const sidebarAvatarImg = document.getElementById("sidebarAvatarImg");
const sidebarAvatarInitials = document.getElementById("sidebarAvatarInitials");

const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar = document.getElementById("appSidebar");
const appSidebarScrim = document.getElementById("appSidebarScrim");

const logoutBtn = document.getElementById("logoutBtn");

const registeredTabBtn = document.getElementById("registeredTabBtn");
const allTabBtn = document.getElementById("allTabBtn");
const registeredPanel = document.getElementById("registeredPanel");
const allPanel = document.getElementById("allPanel");

const currentSemesterLabel = document.getElementById("currentSemesterLabel");
const registeredTable = document.getElementById("registeredTable");
const registeredEmpty = document.getElementById("registeredEmpty");
const registeredTabBadge = document.getElementById("registeredTabBadge");

const allGroups = document.getElementById("allGroups");
const allEmpty = document.getElementById("allEmpty");
const allTabBadge = document.getElementById("allTabBadge");

/* ========================================================
   Start
======================================================== */
document.addEventListener("DOMContentLoaded", initCoursesPage);

async function initCoursesPage() {
  try {
    student = getCurrentStudent();

    if (!student) {
      window.location.href = "/assets/pages/login.html";
      return;
    }

    initialiseSidebar();
    initialiseLogout();

    await loadStudentData();

    coursesLoading.classList.add("d-none");
    coursesContent.classList.remove("d-none");

    initialiseTabs();
    renderRegisteredTab();
    renderAllCoursesTab();
  } catch (error) {
    console.error(error);
    coursesLoading.innerHTML = `
      <div class="alert alert-danger mb-0">Failed to load courses.</div>
    `;
  }
}

/* ========================================================
   Load Data
======================================================== */
async function loadStudentData() {
  const [courses, registrations, results, calendar] = await Promise.all([
    getCourses(),
    getRegistrations({ studentId: student.id }),
    getResults({ studentId: student.id }),
    getAcademicCalendar(),
  ]);

  allCourses = courses;
  allRegistrations = registrations;
  allResults = results;
  academicCalendar = calendar;

  // Chronological order for the "All Courses" grouping
  allRegistrations.sort((a, b) => {
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
   Tabs
======================================================== */
function initialiseTabs() {
  registeredTabBtn.addEventListener("click", () => switchTab("registered"));
  allTabBtn.addEventListener("click", () => switchTab("all"));
}

function switchTab(tab) {
  const isRegistered = tab === "registered";

  registeredTabBtn.classList.toggle("active", isRegistered);
  allTabBtn.classList.toggle("active", !isRegistered);
  registeredTabBtn.setAttribute("aria-selected", isRegistered);
  allTabBtn.setAttribute("aria-selected", !isRegistered);

  registeredPanel.classList.toggle("d-none", !isRegistered);
  allPanel.classList.toggle("d-none", isRegistered);
}

/* ========================================================
   Shared helper: does a given registration have a result yet?
======================================================== */
function hasResult(registration) {
  return allResults.some(
    (r) =>
      r.courseId === registration.courseId &&
      r.session === registration.session &&
      Number(r.semester) === Number(registration.semester)
  );
}

function findCourse(courseId) {
  return allCourses.find((c) => Number(c.id) === Number(courseId));
}

function statusBadge(isCompleted) {
  return isCompleted
    ? `<span class="badge status-badge status-badge--completed">Completed</span>`
    : `<span class="badge status-badge status-badge--pending">Pending</span>`;
}

/* ========================================================
   Registered Courses tab — current semester only
======================================================== */
function renderRegisteredTab() {
  currentSemesterLabel.textContent = `${academicCalendar.currentSession}, ${
    SEMESTER_LABELS[academicCalendar.currentSemester] ?? `Semester ${academicCalendar.currentSemester}`
  }`;

  const currentRegs = allRegistrations.filter(
    (r) =>
      r.session === academicCalendar.currentSession &&
      Number(r.semester) === Number(academicCalendar.currentSemester)
  );

  registeredTabBadge.textContent = currentRegs.length;

  registeredTable.innerHTML = "";

  if (currentRegs.length === 0) {
    registeredEmpty.classList.remove("d-none");
    return;
  }

  registeredEmpty.classList.add("d-none");

  currentRegs.forEach((reg) => {
    const course = findCourse(reg.courseId);
    if (!course) return;

    registeredTable.innerHTML += `
      <tr>
        <td>${course.courseCode}</td>
        <td>${course.courseTitle}${reg.type === "carry-over" ? ' <span class="carryover-tag">Carry-over</span>' : ""}</td>
        <td>${course.creditUnit}</td>
        <td>${statusBadge(hasResult(reg))}</td>
      </tr>
    `;
  });
}

/* ========================================================
   All Courses tab — full history, grouped by session/semester
======================================================== */
function renderAllCoursesTab() {
  allTabBadge.textContent = allRegistrations.length;

  allGroups.innerHTML = "";

  if (allRegistrations.length === 0) {
    allEmpty.classList.remove("d-none");
    return;
  }

  allEmpty.classList.add("d-none");

  const groups = [];
  const seen = new Map();

  allRegistrations.forEach((reg) => {
    const key = `${reg.session}|${reg.semester}`;
    if (!seen.has(key)) {
      seen.set(key, groups.length);
      groups.push({ session: reg.session, semester: reg.semester, rows: [] });
    }
    groups[seen.get(key)].rows.push(reg);
  });

  groups.forEach((group) => {
    allGroups.innerHTML += renderAllGroupHtml(group);
  });
}

function renderAllGroupHtml(group) {
  const label = `${group.session} — ${SEMESTER_LABELS[group.semester] ?? `Semester ${group.semester}`}`;

  const rows = group.rows
    .map((reg) => {
      const course = findCourse(reg.courseId);
      if (!course) return "";

      return `
        <tr>
          <td>${course.courseCode}</td>
          <td>${course.courseTitle}${reg.type === "carry-over" ? ' <span class="carryover-tag">Carry-over</span>' : ""}</td>
          <td>${course.creditUnit}</td>
          <td>${statusBadge(hasResult(reg))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="transcript-group">
      <div class="transcript-group-header">
        <span class="transcript-group-title">${label}</span>
      </div>
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>Course Code</th>
              <th>Course Title</th>
              <th>Credit Unit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}