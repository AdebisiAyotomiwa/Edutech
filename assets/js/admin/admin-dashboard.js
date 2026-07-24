import { requireAdminAuth, getCurrentAdmin, adminLogout } from "../adminAuth.js";
import { getStudents, getCourses, getDepartments, getResults, getFaculties } from "../api.js";
import { scoreToGrade } from "../utils.js";

requireAdminAuth();

/* ── State ─────────────────────────────────────────────── */
let admin = null;
let students = [];
let courses = [];
let departments = [];
let results = [];
let faculties = [];

let gradeChartInstance = null;

/* ── DOM refs ───────────────────────────────────────────── */
const dashboardLoading = document.getElementById("dashboardLoading");
const dashboardContent = document.getElementById("dashboardContent");
const greetingName     = document.getElementById("greetingName");
const sidebarUserName  = document.getElementById("sidebarUserName");
const sidebarUserMeta  = document.getElementById("sidebarUserMeta");
const sidebarAvatarInitials = document.getElementById("sidebarAvatarInitials");
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar       = document.getElementById("appSidebar");
const appSidebarScrim  = document.getElementById("appSidebarScrim");
const logoutBtn        = document.getElementById("logoutBtn");

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    admin = getCurrentAdmin();
    if (!admin) { window.location.href = "/assets/pages/admin/admin-login.html"; return; }

    setupSidebar();
    setupLogout();
    await loadData();

    dashboardLoading.classList.add("d-none");
    dashboardContent.classList.remove("d-none");

    renderStatCards();
    buildGradeFilterOptions();
    renderDeptChart();
    renderGradeChart();
  } catch (err) {
    console.error(err);
    dashboardLoading.innerHTML = `<div class="alert alert-danger mb-0">Failed to load dashboard.</div>`;
  }
}

async function loadData() {
  [students, courses, departments, results, faculties] = await Promise.all([
    getStudents(), getCourses(), getDepartments(), getResults(), getFaculties(),
  ]);
}

/* ── Sidebar / logout ───────────────────────────────────── */
function setupSidebar() {
  greetingName.textContent = admin.name || "Admin";
  sidebarUserName.textContent = admin.name || "Admin";
  sidebarUserMeta.textContent = admin.email;
  sidebarAvatarInitials.textContent = (admin.name || "A")
    .split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

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

function setupLogout() {
  const modal = new bootstrap.Modal(document.getElementById("logoutConfirmModal"));
  logoutBtn.addEventListener("click", () => modal.show());
  document.getElementById("confirmLogoutBtn").addEventListener("click", () => {
    adminLogout();
    window.location.href = "/assets/pages/admin/admin-login.html";
  });
}

/* ── Stat cards ─────────────────────────────────────────── */
function renderStatCards() {
  document.getElementById("statStudents").textContent    = students.length;
  document.getElementById("statCourses").textContent     = courses.length;
  document.getElementById("statDepartments").textContent = departments.length;
  document.getElementById("statResults").textContent     = results.length;
}

/* ── Students-per-dept bar chart ────────────────────────── */
function renderDeptChart() {
  const canvas = document.getElementById("deptChart");
  if (!canvas || typeof Chart === "undefined") return;

  const labels = departments.map(d => d.name);
  const data   = departments.map(d =>
    students.filter(s => String(s.departmentId) === String(d.id)).length
  );

  new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Students", data, backgroundColor: "#1F7A5C", borderRadius: 6 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

/* ── Grade-distribution chart (filterable) ──────────────── */
function buildGradeFilterOptions() {
  const deptSel  = document.getElementById("gradeFilterDept");
  const levelSel = document.getElementById("gradeFilterLevel");

  // Dept options
  deptSel.innerHTML =
    `<option value="">All Departments</option>` +
    departments.map(d => `<option value="${d.id}">${d.name}</option>`).join("");

  // Unique levels from courses
  const levels = [...new Set(courses.map(c => Number(c.level)))].sort((a, b) => a - b);
  levelSel.innerHTML =
    `<option value="">All Levels</option>` +
    levels.map(l => `<option value="${l}">${l} Level</option>`).join("");

  deptSel.addEventListener("change",  renderGradeChart);
  levelSel.addEventListener("change", renderGradeChart);
}

function renderGradeChart() {
  const canvas = document.getElementById("gradeChart");
  if (!canvas || typeof Chart === "undefined") return;

  const deptId = document.getElementById("gradeFilterDept").value;
  const level  = document.getElementById("gradeFilterLevel").value;

  // Filter results based on selections
  let filtered = results;

  if (deptId || level) {
    // Determine which courseIds match the filters
    const matchingCourseIds = new Set(
      courses
        .filter(c => {
          const deptMatch  = !deptId || String(c.departmentId) === String(deptId);
          const levelMatch = !level  || Number(c.level) === Number(level);
          return deptMatch && levelMatch;
        })
        .map(c => String(c.id))
    );
    filtered = results.filter(r => matchingCourseIds.has(String(r.courseId)));
  }

  const gradeCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  filtered.forEach(r => {
    const { grade } = scoreToGrade(r.score);
    gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
  });

  const colors = {
    A: "#1F7A5C", B: "#2B6CB0", C: "#C79A3B", D: "#A6741A", E: "#d97706", F: "#B3402E",
  };

  if (gradeChartInstance) gradeChartInstance.destroy();

  gradeChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: Object.keys(gradeCounts),
      datasets: [{
        label: "Results",
        data: Object.values(gradeCounts),
        backgroundColor: Object.keys(gradeCounts).map(g => colors[g]),
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}
