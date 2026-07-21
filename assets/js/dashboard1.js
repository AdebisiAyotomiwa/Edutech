import { requireAuth, getCurrentStudent, logout } from "./auth.js";
import { getResults, getCourses, getDepartmentById } from "./api.js";
import { calculateGPA, getStudentDisplayName, scoreToGrade } from "./utils.js";

/* ========================================================
   Protect Dashboard
======================================================== */
requireAuth();

/* ========================================================
   Global State
======================================================== */
let student = null;
let resultsWithCourses = [];
let allCourses = [];
let department = null;

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
      window.location.href = "/pages/login.html";
      return;
    }

    initialiseSidebar();
    initialiseLogout();

    await loadStudentData();

    dashboardLoading.classList.add("d-none");
    dashboardContent.classList.remove("d-none");

    renderStatCards();
    renderAcademicSummary();
    renderRecentResults();
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
  const [results, courses, dept] = await Promise.all([
    getResults({ studentId: student.id }),
    getCourses(),
    getDepartmentById(student.departmentId),
  ]);

  allCourses = courses;
  department = dept;

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
   Sidebar
======================================================== */
function initialiseSidebar() {
  greetingName.textContent = getStudentDisplayName(student);
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

  //   sidebarToggleBtn.addEventListener("click", () => {
  //     appSidebar.classList.toggle("show");
  //     appSidebarScrim.classList.toggle("show");
  //   });

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

  appSidebarScrim.addEventListener("click", () => {
    appSidebar.classList.remove("show");
    appSidebarScrim.classList.remove("show");
  });
}

// function initialiseLogout() {
//   logoutBtn.addEventListener("click", () => {
//     logout();
//     window.location.href = "/pages/login.html";
//   });
// }

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
   Stat Cards
======================================================== */
function renderStatCards() {
  const totalCredits = resultsWithCourses.reduce((sum, r) => sum + r.creditUnit, 0);
  const cgpa = resultsWithCourses.length ? calculateGPA(resultsWithCourses) : "0.00";

  const currentSemester = getCurrentSemester();

  const levelCourses = allCourses.filter(
    (c) =>
      c.departmentId === student.departmentId &&
      c.level === currentSemester.level &&
      c.semester === currentSemester.semester
  );

  // Outstanding = courses the student has FAILED (grade F) at any point
  // so far — these are carry-overs still owed, not "not yet taken".
  const failedCourses = resultsWithCourses.filter(
    (r) => scoreToGrade(r.score).grade === "F"
  );

  document.getElementById("statCgpa").textContent = cgpa;
  document.getElementById("statCredits").textContent = totalCredits;
  document.getElementById("statCourses").textContent = levelCourses.length;
  document.getElementById("statOutstanding").textContent = failedCourses.length;
}
/**
 * Finds the most recent (session, level, semester) combination the
 * student has any result for. This represents "where they currently
 * are" academically, since a level now spans 2 semesters of data.
 */
function getCurrentSemester() {
  if (resultsWithCourses.length === 0) {
    return { level: student.level, semester: 1 };
  }

  // Results were loaded in whatever order the API returned them;
  // sort by level then semester to reliably find the latest.
  const sorted = [...resultsWithCourses].sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return a.semester - b.semester;
  });

  const latest = sorted[sorted.length - 1];
  return { level: latest.level, semester: latest.semester };
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
   Recent Results
======================================================== */
function renderRecentResults() {
  const table = document.getElementById("recentResultsTable");
  table.innerHTML = "";

  const latest = [...resultsWithCourses].reverse().slice(0, 6);

  if (latest.length === 0) {
    table.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">No results yet.</td></tr>`;
    return;
  }

  latest.forEach((result) => {
    const grade = scoreToGrade(result.score);
    table.innerHTML += `
      <tr>
        <td>${result.courseCode}</td>
        <td>${result.courseTitle}</td>
        <td>${result.score}</td>
        <td><span class="badge bg-primary">${grade.grade}</span></td>
      </tr>
    `;
  });
}

/* ========================================================
   GPA Trend Chart
======================================================== */
function renderChart() {
  const canvas = document.getElementById("gpaChart");
  //   if (!canvas || typeof Chart === "undefined") return;

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
