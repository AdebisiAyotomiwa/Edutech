import { requireAuth, getCurrentStudent, logout } from "./auth.js";
import { getResults, getCourses, getDepartmentById, getRegistrations, getAcademicCalendar } from "./api.js";
import { calculateGPA, getStudentDisplayName, scoreToGrade } from "./utils.js";

/* Normalise a profile image path to absolute so it resolves correctly
   from any sub-folder page (e.g. /assets/pages/dashboard.html). */
function resolveImagePath(raw) {
  if (!raw || !raw.trim()) return "";
  if (raw.startsWith("/") || raw.startsWith("http")) return raw;
  return "/" + raw;
}

/* ========================================================
   Protect Dashboard
======================================================== */
requireAuth();

/* ========================================================
   Global State
======================================================== */
let student = null;
let department = null;
let resultsWithCourses = [];
let allCourses = [];
let allRegistrations = [];
let academicCalendar = null;

/* ========================================================
   DOM Elements
======================================================== */
const dashboardLoading = document.getElementById("dashboardLoading");
const dashboardContent = document.getElementById("dashboardContent");
const greetingName = document.getElementById("greetingName");

const sidebarUserName = document.getElementById("sidebarUserName");
const sidebarUserMeta = document.getElementById("sidebarUserMeta");
const sidebarAvatarImg = document.getElementById("sidebarAvatarImg");
const sidebarAvatarInitials = document.getElementById("sidebarAvatarInitials");

const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar = document.getElementById("appSidebar");
const appSidebarScrim = document.getElementById("appSidebarScrim");

const logoutBtn = document.getElementById("logoutBtn");

/* ========================================================
   Start
======================================================== */
document.addEventListener("DOMContentLoaded", initDashboard);

async function initDashboard() {
  try {
    student = getCurrentStudent();

    if (!student) {
      window.location.href = "/assets/pages/login.html";
      return;
    }

    initialiseSidebar();
    initialiseLogout();

    await loadStudentData();

    dashboardLoading.classList.add("d-none");
    dashboardContent.classList.remove("d-none");

    renderStatCards();
    renderAcademicSummary();
    renderChart();
  } catch (error) {
    console.error(error);
    dashboardLoading.innerHTML = `
      <div class="alert alert-danger mb-0">Failed to load dashboard.</div>
    `;
  }
}

/* ========================================================
   Load Data
======================================================== */
async function loadStudentData() {
  const [results, courses, dept, registrations, calendar] = await Promise.all([
    getResults({ studentId: student.id }),
    getCourses(),
    getDepartmentById(student.departmentId),
    getRegistrations({ studentId: student.id }),
    getAcademicCalendar(),
  ]);

  allCourses = courses;
  department = dept;
  allRegistrations = registrations;
  academicCalendar = calendar;

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
}

/* ========================================================
   Sidebar
======================================================== */
function initialiseSidebar() {
  greetingName.textContent = getStudentDisplayName(student);
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
    window.location.href = "/assets/pages/login.html";
  });
}

/* ========================================================
   Stat Cards
======================================================== */
function renderStatCards() {
  const cgpa = resultsWithCourses.length ? calculateGPA(resultsWithCourses) : "0.00";

  const totalCreditsPassed = getCreditsEarned();
  const currentSemesterCourseCount = getCurrentSemesterRegistrations().length;
  const outstandingCount = getOutstandingCourses().length;

  document.getElementById("statCgpa").textContent = cgpa;
  document.getElementById("statCredits").textContent = totalCreditsPassed;
  document.getElementById("statCourses").textContent = currentSemesterCourseCount;
  document.getElementById("statOutstanding").textContent = outstandingCount;
}

/**
 * Credits Earned = sum of creditUnit for every result the student has
 * PASSED (grade E or above). A failed course's units don't count toward
 * what's been "earned," even though the score still affects CGPA.
 */
function getCreditsEarned() {
  return resultsWithCourses
    .filter((r) => scoreToGrade(r.score).grade !== "F")
    .reduce((sum, r) => sum + r.creditUnit, 0);
}

/**
 * Current Semester Courses = every registration matching the academic
 * calendar's current session/semester. Includes carry-over registrations
 * alongside regular ones — both are genuinely "courses this semester."
 */
function getCurrentSemesterRegistrations() {
  return allRegistrations.filter(
    (r) =>
      r.session === academicCalendar.currentSession &&
      Number(r.semester) === Number(academicCalendar.currentSemester)
  );
}

/**
 * Outstanding = distinct courses the student has ever failed that do NOT
 * have a later passing result for that same course. A fail with a
 * subsequent pass (a resolved carry-over) is no longer outstanding.
 */
function getOutstandingCourses() {
  const fails = resultsWithCourses.filter((r) => scoreToGrade(r.score).grade === "F");

  return fails.filter((fail) => {
    const laterPass = resultsWithCourses.some(
      (r) =>
        r.courseId === fail.courseId &&
        scoreToGrade(r.score).grade !== "F" &&
        isLater(r.session, r.semester, fail.session, fail.semester)
    );
    return !laterPass;
  });
}

/**
 * Session strings are formatted "YYYY/YYYY", so string comparison
 * sorts them correctly in chronological order.
 */
function isLater(sessionA, semesterA, sessionB, semesterB) {
  if (sessionA !== sessionB) return sessionA > sessionB;
  return Number(semesterA) > Number(semesterB);
}

/* ========================================================
   Academic Summary
======================================================== */
function renderAcademicSummary() {
  const summary = document.getElementById("academicSummary");

  summary.innerHTML = `
    <p><strong>Name:</strong><br>${student.firstName} ${student.lastName}</p>
    <p><strong>Matric No:</strong><br>${student.matricNumber}</p>
    <p><strong>Department:</strong><br>${department?.name ?? "N/A"}</p>
    <p><strong>Programme:</strong><br>${student.programme}</p>
    <p class="mb-0"><strong>Current Level:</strong><br>${student.level} Level</p>
  `;
}

/* ========================================================
   GPA Trend Chart
======================================================== */
function renderChart() {
  const canvas = document.getElementById("gpaChart");
  if (!canvas || typeof Chart === "undefined") return;

  if (window.gpaChart instanceof Chart) {
    window.gpaChart.destroy();
  }

  const grouped = {};
  resultsWithCourses.forEach((result) => {
    const key = `${result.session} - Sem ${result.semester}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(result);
  });

  const labels = [];
  const values = [];
  Object.entries(grouped).forEach(([label, records]) => {
    labels.push(label);
    values.push(Number(calculateGPA(records)));
  });

  window.gpaChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "GPA",
          data: values,
          borderColor: "#1f9d55",
          backgroundColor: "#1f9d55",
          borderWidth: 3,
          tension: 0.35,
          fill: false,
          pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 5 } },
    },
  });
}