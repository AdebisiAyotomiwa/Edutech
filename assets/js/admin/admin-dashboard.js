import { requireAdminAuth, getCurrentAdmin, adminLogout } from "../adminAuth.js";
import {
  getStudents, getCourses, getDepartments, getResults,
  getFaculties, getRegistrations, getAcademicCalendar,
  getResultSubmissions,
} from "../api.js";
import { scoreToGrade } from "../utils.js";

requireAdminAuth();

/* ── State ──────────────────────────────────────────────── */
let admin        = null;
let students     = [], courses = [], departments = [];
let results      = [], faculties = [], registrations = [], calendar = null;
let submissions  = [];   // resultSubmissions — used for pending approval badge
let gradeChartInst = null;

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    admin = getCurrentAdmin();
    if (!admin) { window.location.href = "/assets/pages/admin/admin-login.html"; return; }

    setupSidebar();
    setupLogout();
    await loadData();

    document.getElementById("dashboardLoading").classList.add("d-none");
    document.getElementById("dashboardContent").classList.remove("d-none");

    renderStatCards();
    renderDeptChart();
    buildGradeFilters();
    renderGradeChart();
    renderRecentRegs();
  } catch (err) {
    console.error(err);
    document.getElementById("dashboardLoading").innerHTML =
      `<div class="alert alert-danger mb-0">Failed to load dashboard. Please refresh.</div>`;
  }
}

async function loadData() {
  [students, courses, departments, results, faculties, registrations, calendar, submissions] = await Promise.all([
    getStudents(), getCourses(), getDepartments(), getResults(),
    getFaculties(), getRegistrations(), getAcademicCalendar(),
    getResultSubmissions(),
  ]);
}

/* ── Sidebar / logout ───────────────────────────────────── */
function setupSidebar() {
  const initials = (admin.name || "A").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  document.getElementById("sidebarAvatarInitials").textContent = initials;
  document.getElementById("sidebarUserName").textContent = admin.name || "Admin";
  document.getElementById("sidebarUserMeta").textContent = admin.email;
  document.getElementById("topbarAvatarInitials").textContent = initials;
  document.getElementById("topbarUserName").textContent = admin.name || "Admin";
  document.getElementById("greetingName").textContent = `Welcome back, ${(admin.name || "Admin").split(" ")[0]} 👋`;

  // Show pending approval count badge in sidebar nav
  const pendingCount = submissions.filter(s => s.status === "pending").length;
  const badge = document.getElementById("sidebarPendingBadge");
  if (badge && pendingCount > 0) {
    badge.textContent = pendingCount;
    badge.style.display = "";
  }

  const toggle = document.getElementById("sidebarToggleBtn");
  const sidebar = document.getElementById("appSidebar");
  const scrim   = document.getElementById("appSidebarScrim");
  toggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("is-open");
    scrim.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open);
  });
  scrim.addEventListener("click", () => {
    sidebar.classList.remove("is-open");
    scrim.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  });
}

function setupLogout() {
  const modal = new bootstrap.Modal(document.getElementById("logoutConfirmModal"));
  document.getElementById("logoutBtn").addEventListener("click", () => modal.show());
  document.getElementById("confirmLogoutBtn").addEventListener("click", () => {
    adminLogout();
    window.location.href = "/assets/pages/admin/admin-login.html";
  });
}

/* ── Stat cards ─────────────────────────────────────────── */
function renderStatCards() {
  const publishedResults = results.filter(r => r.published !== false);
  const draftResults     = results.filter(r => r.published === false);

  /* Pending = registered courses this semester with no published result */
  const currRegs = registrations.filter(
    r => r.session === calendar.currentSession &&
         Number(r.semester) === Number(calendar.currentSemester)
  );
  const pendingCount = currRegs.filter(reg =>
    !publishedResults.some(
      r => String(r.studentId) === String(reg.studentId) &&
           String(r.courseId)  === String(reg.courseId) &&
           r.session === reg.session &&
           Number(r.semester) === Number(reg.semester)
    )
  ).length;

  document.getElementById("statStudents").textContent    = students.length;
  document.getElementById("statCourses").textContent     = courses.filter(c => (c.status || "active") === "active").length;
  document.getElementById("statDepartments").textContent = departments.length;
  document.getElementById("statResults").textContent     = publishedResults.length;
  document.getElementById("statPending").textContent     = pendingCount;
  document.getElementById("statDrafts").textContent      = draftResults.length;
  document.getElementById("statRegs").textContent        = currRegs.length;
  document.getElementById("statFaculties").textContent   = faculties.length;
}

/* ── Students per dept bar chart ────────────────────────── */
function renderDeptChart() {
  const canvas = document.getElementById("deptChart");
  if (!canvas || typeof Chart === "undefined") return;

  const labels = departments.map(d => d.name);
  const data   = departments.map(d =>
    students.filter(s => String(s.departmentId) === String(d.id)).length
  );
  const colors = [
    "#0B3D2E","#145C43","#1F7A5C","#2E9D76","#3DC492",
    "#4FD5A8","#68DDB8","#82E5CA","#9DEEDD","#B8F5F0",
  ];

  new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Students",
        data,
        backgroundColor: labels.map((_, i) => colors[i % colors.length]),
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } }, grid: { color: "rgba(0,0,0,0.05)" } },
        x: { ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
}

/* ── Grade distribution chart (filterable) ──────────────── */
function buildGradeFilters() {
  const deptSel  = document.getElementById("gradeFilterDept");
  const levelSel = document.getElementById("gradeFilterLevel");

  deptSel.innerHTML =
    `<option value="">All Departments</option>` +
    departments.map(d => `<option value="${d.id}">${d.name}</option>`).join("");

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

  let filtered = results.filter(r => r.published !== false);

  if (deptId || level) {
    const matchingCourseIds = new Set(
      courses
        .filter(c => {
          const dm = !deptId || String(c.departmentId) === String(deptId);
          const lm = !level  || Number(c.level) === Number(level);
          return dm && lm;
        })
        .map(c => String(c.id))
    );
    filtered = filtered.filter(r => matchingCourseIds.has(String(r.courseId)));
  }

  const gradeCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  filtered.forEach(r => {
    const { grade } = scoreToGrade(r.score);
    gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
  });

  const bgColors = {
    A: "#1F7A5C", B: "#2B6CB0", C: "#C79A3B", D: "#A6741A", E: "#d97706", F: "#B3402E",
  };

  if (gradeChartInst) gradeChartInst.destroy();

  gradeChartInst = new Chart(canvas, {
    type: "bar",
    data: {
      labels: Object.keys(gradeCounts),
      datasets: [{
        label: "Students",
        data: Object.values(gradeCounts),
        backgroundColor: Object.keys(gradeCounts).map(g => bgColors[g]),
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } }, grid: { color: "rgba(0,0,0,0.05)" } },
        x: { ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
}

/* ── Recent registrations activity list ─────────────────── */
function renderRecentRegs() {
  const list = document.getElementById("recentRegsList");

  /* Get the 8 most recent registrations by id (highest id = most recent) */
  const recent = [...registrations]
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, 8);

  if (recent.length === 0) {
    list.innerHTML = `<div class="activity-item">
      <div class="activity-body"><div class="activity-title">No registrations yet</div></div>
    </div>`;
    return;
  }

  list.innerHTML = recent.map(reg => {
    const student = students.find(s => String(s.id) === String(reg.studentId));
    const course  = courses.find(c => String(c.id)  === String(reg.courseId));
    const initials = student
      ? (student.firstName[0] + student.lastName[0]).toUpperCase()
      : "?";
    const carryTag = reg.type === "carry-over"
      ? `<span style="font-size:0.68rem;font-weight:700;color:var(--danger);background:var(--danger-100);padding:.1em .45em;border-radius:4px;margin-left:.3rem;">C/O</span>`
      : "";
    return `<div class="activity-item">
      <div class="activity-icon activity-icon--green" style="font-size:0.78rem;font-weight:700;font-family:var(--font-display);">${initials}</div>
      <div class="activity-body">
        <div class="activity-title">
          ${student ? `${student.firstName} ${student.lastName}` : "Unknown"}${carryTag}
        </div>
        <div class="activity-meta">${course ? `${course.courseCode} · ` : ""}${reg.session} Sem ${reg.semester}</div>
      </div>
      <span class="activity-badge" style="background:var(--success-100);color:var(--success);font-size:0.7rem;font-weight:700;padding:.25em .6em;border-radius:6px;">
        Registered
      </span>
    </div>`;
  }).join("");
}
