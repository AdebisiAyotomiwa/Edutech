import { requireAdminAuth, getCurrentAdmin, adminLogout } from "../adminAuth.js";
import {
  getStudents, getCourses, getDepartments, getResults,
  getFaculties, getRegistrations, getAcademicCalendar,
  getResultSubmissions,
} from "../api.js";
import { scoreToGrade } from "../utils.js";
import { initMobileSidebar } from "../sidebar.js";

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
    renderDeptChart("");
    buildGradeFilters();
    renderGradeChart();
    renderPendingApprovals();
    bindDeptChartFilter();
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
  // Also wire the topbar approvals badge
  const topbarBadge = document.getElementById("topbarApprovalsBadge");
  if (topbarBadge && pendingCount > 0) {
    topbarBadge.textContent = pendingCount;
    topbarBadge.style.display = "";
  }

  /* initMobileSidebar() wires the toggle, scrim, close button,
     auto-close on nav links, and Escape key in one place.
     Do NOT add a second toggle.addEventListener here — that
     causes the button to open-then-immediately-close (no-op). */
  initMobileSidebar();
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
function renderDeptChart(genderFilter) {
  const canvas = document.getElementById("deptChart");
  if (!canvas || typeof Chart === "undefined") return;

  // Destroy previous instance if re-rendering
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  // Apply optional gender filter
  const filteredStudents = genderFilter
    ? students.filter(s => s.gender === genderFilter)
    : students;

  const labels = departments.map(d => d.name);
  const data   = departments.map(d =>
    filteredStudents.filter(s => String(s.departmentId) === String(d.id)).length
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

/* Wire up the gender filter dropdown for the dept chart */
function bindDeptChartFilter() {
  const sel = document.getElementById("deptGenderFilter");
  if (!sel) return;
  sel.addEventListener("change", () => renderDeptChart(sel.value));
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

/* ── Pending approvals activity list ────────────────────── */
function renderPendingApprovals() {
  const list = document.getElementById("pendingApprovalsList");
  const pending = submissions
    .filter(s => s.status === "pending")
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .slice(0, 6);

  if (pending.length === 0) {
    list.innerHTML = `<div class="activity-item">
      <div class="activity-body">
        <div class="activity-title" style="color:var(--success);"><i class="bi bi-check-circle-fill me-1"></i>No pending approvals</div>
        <div class="activity-meta">All submissions have been reviewed</div>
      </div>
    </div>`;
    return;
  }

  list.innerHTML = pending.map(sub => {
    const course   = courses.find(c => String(c.id) === String(sub.courseId));
    const lecturer = students.find(s => String(s.id) === String(sub.lecturerId)); // fallback if needed
    // Try lecturers array first (may not be loaded on dashboard — use course code)
    const date = new Date(sub.submittedAt).toLocaleDateString("en-GB", { day:"numeric", month:"short" });
    return `<div class="activity-item">
      <div class="activity-icon activity-icon--amber"><i class="bi bi-hourglass-split"></i></div>
      <div class="activity-body">
        <div class="activity-title">${course ? course.courseCode + " — " + course.courseTitle : "Unknown Course"}</div>
        <div class="activity-meta">${sub.session} Sem ${sub.semester} · ${sub.level} Level · ${date}</div>
      </div>
      <a href="/assets/pages/admin/admin-approvals.html" class="activity-badge" style="background:var(--warn-100);color:var(--warn);font-size:0.7rem;font-weight:700;padding:.25em .6em;border-radius:6px;text-decoration:none;">
        Review
      </a>
    </div>`;
  }).join("");
}
