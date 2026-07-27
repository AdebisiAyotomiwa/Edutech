import { requireAuth, getCurrentStudent, logout } from "./auth.js";
import { getResults, getCourses, getDepartmentById, getRegistrations, getAcademicCalendar } from "./api.js";
import { calculateGPA, scoreToGrade } from "./utils.js";

function resolveImagePath(raw) {
  if (!raw || !raw.trim()) return "";
  if (raw.startsWith("/") || raw.startsWith("http")) return raw;
  return "/" + raw;
}

requireAuth();

/* ── State ──────────────────────────────────────────────── */
let student = null;
let resultsWithCourses = [];
let allCourses = [];
let allRegistrations = [];
let calendar = null;

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    student = getCurrentStudent();
    if (!student) { window.location.href = "/assets/pages/login.html"; return; }

    initialiseSidebar();
    initialiseLogout();
    await loadData();

    document.getElementById("dashboardLoading").classList.add("d-none");
    document.getElementById("dashboardContent").classList.remove("d-none");

    renderStatCards();
    renderGpaChart();
    renderAcademicSummary();
    renderCurrentCourses();
    renderOutstandingList();
  } catch (err) {
    console.error(err);
    document.getElementById("dashboardLoading").innerHTML =
      `<div class="alert alert-danger mb-0">Failed to load dashboard. Please refresh.</div>`;
  }
}

/* ── Data ───────────────────────────────────────────────── */
async function loadData() {
  const [results, courses, registrations, cal] = await Promise.all([
    getResults({ studentId: student.id }),
    getCourses(),
    getRegistrations({ studentId: student.id }),
    getAcademicCalendar(),
  ]);

  allCourses       = courses;
  allRegistrations = registrations;
  calendar         = cal;

  resultsWithCourses = results
    .filter(r => r.published !== false)
    .map(r => {
      const course = allCourses.find(c => Number(c.id) === Number(r.courseId));
      if (!course) return null;
      return {
        ...r,
        course,
        /* Hoist creditUnit to the top level so calculateGPA() can read it directly */
        creditUnit: course.creditUnit,
      };
    })
    .filter(r => r !== null);
}

/* ── Sidebar ────────────────────────────────────────────── */
function initialiseSidebar() {
  const name     = `${student.firstName} ${student.lastName}`;
  const initials = (student.firstName[0] + student.lastName[0]).toUpperCase();
  const metaText = student.matricNumber;

  /* Sidebar */
  document.getElementById("sidebarUserName").textContent = name;
  document.getElementById("sidebarUserMeta").textContent = metaText;
  const sidebarImg = document.getElementById("sidebarAvatarImg");
  const sidebarIni = document.getElementById("sidebarAvatarInitials");
  if (student.profileImage?.trim()) {
    sidebarImg.src = resolveImagePath(student.profileImage);
    sidebarImg.onerror = () => { sidebarImg.classList.add("d-none"); sidebarIni.style.display = "flex"; sidebarIni.textContent = initials; };
    sidebarImg.classList.remove("d-none"); sidebarIni.style.display = "none";
  } else { sidebarIni.style.display = "flex"; sidebarIni.textContent = initials; }

  /* Topbar user chip */
  document.getElementById("topbarUserName").textContent = name;
  document.getElementById("topbarUserSub").textContent  = metaText;
  const topbarImg = document.getElementById("topbarAvatarImg");
  const topbarIni = document.getElementById("topbarAvatarInitials");
  if (student.profileImage?.trim()) {
    topbarImg.src = resolveImagePath(student.profileImage);
    topbarImg.onerror = () => { topbarImg.classList.add("d-none"); topbarIni.textContent = initials; };
    topbarImg.classList.remove("d-none"); topbarIni.style.display = "none";
  } else { topbarIni.textContent = initials; }

  /* Greeting subtitle */
  document.getElementById("dashboardSubtitle").textContent =
    `Welcome back, ${student.firstName}. Here's your academic overview.`;

  /* Sidebar toggle */
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

function initialiseLogout() {
  const modal = new bootstrap.Modal(document.getElementById("logoutConfirmModal"));
  document.getElementById("logoutBtn").addEventListener("click", () => modal.show());
  document.getElementById("confirmLogoutBtn").addEventListener("click", () => {
    logout(); window.location.href = "/assets/pages/login.html";
  });
}

/* ── Helpers ─────────────────────────────────────────────── */
function getCurrentSemesterRegs() {
  return allRegistrations.filter(r =>
    r.session === calendar.currentSession &&
    Number(r.semester) === Number(calendar.currentSemester)
  );
}

function getOutstandingCourses() {
  /* Outstanding = score < 40 in any published result */
  return resultsWithCourses.filter(r => r.score < 40);
}

function getCreditsEarned() {
  /* Credits for courses with score >= 40 */
  return resultsWithCourses
    .filter(r => r.score >= 40)
    .reduce((sum, r) => sum + (r.course?.creditUnit ?? 0), 0);
}

/* ── Stat cards ──────────────────────────────────────────── */
function renderStatCards() {
  const cgpa       = resultsWithCourses.length ? calculateGPA(resultsWithCourses) : "0.00";
  const credits    = getCreditsEarned();
  const currCourses = getCurrentSemesterRegs().length;
  const outstanding = getOutstandingCourses().length;

  document.getElementById("statCgpa").textContent        = cgpa;
  document.getElementById("statCredits").textContent     = credits;
  document.getElementById("statCourses").textContent     = currCourses;
  document.getElementById("statOutstanding").textContent = outstanding;

  /* Colour trend on outstanding */
  const outTrend = document.getElementById("statOutstandingTrend");
  if (outstanding === 0) {
    outTrend.classList.remove("down");
    outTrend.innerHTML = `<i class="bi bi-check-circle"></i> None — great work!`;
  }
}

/* ── CGPA Trend chart ────────────────────────────────────── */
function renderGpaChart() {
  /* Build session/semester groups */
  const groups = new Map();
  resultsWithCourses.forEach(r => {
    const key = `${r.session} S${r.semester}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });

  const labels = Array.from(groups.keys());
  const gpas   = labels.map(k => parseFloat(calculateGPA(groups.get(k))));

  const canvas  = document.getElementById("gpaChart");
  const ctx     = canvas.getContext("2d");
  const grad    = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, "rgba(31,122,92,0.25)");
  grad.addColorStop(1, "rgba(31,122,92,0)");

  new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "GPA",
        data: gpas,
        borderColor: "#1F7A5C",
        backgroundColor: grad,
        borderWidth: 2.5,
        pointBackgroundColor: "#1F7A5C",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointRadius: 5,
        tension: 0.4,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` GPA: ${ctx.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        y: {
          min: 0, max: 5,
          ticks: { stepSize: 1, font: { size: 11 } },
          grid: { color: "rgba(0,0,0,0.05)" },
        },
        x: {
          ticks: { font: { size: 11 } },
          grid: { display: false },
        },
      },
    },
  });
}

/* ── Academic Summary panel ──────────────────────────────── */
function renderAcademicSummary() {
  const dept    = student.programme || "N/A";
  const level   = student.level ? `${student.level} Level` : "N/A";
  const session = `${calendar.currentSession}, Semester ${calendar.currentSemester}`;
  const cgpa    = resultsWithCourses.length ? calculateGPA(resultsWithCourses) : "0.00";
  const credits = getCreditsEarned();

  /* Grade distribution */
  const gradeCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  resultsWithCourses.forEach(r => {
    const { grade } = scoreToGrade(r.score);
    gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
  });

  const gradeColors = { A: "#1F7A5C", B: "#2B6CB0", C: "#C79A3B", D: "#A6741A", E: "#d97706", F: "#B3402E" };

  document.getElementById("academicSummary").innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;">
        ${summaryField("Programme", dept)}
        ${summaryField("Level", level)}
        ${summaryField("Session", session)}
        ${summaryField("CGPA", cgpa)}
        ${summaryField("Credits Earned", String(credits))}
        ${summaryField("Total Results", String(resultsWithCourses.length))}
      </div>
      <div>
        <div style="font-size:0.78rem;font-weight:700;color:var(--ink-400);text-transform:uppercase;letter-spacing:.04em;margin-bottom:0.5rem;">Grade Distribution</div>
        <div style="display:flex;gap:0.35rem;flex-wrap:wrap;">
          ${Object.entries(gradeCounts).map(([g, n]) =>
            `<span style="font-size:0.75rem;font-weight:700;padding:.25em .6em;border-radius:6px;background:${gradeColors[g]}20;color:${gradeColors[g]}">${g}: ${n}</span>`
          ).join("")}
        </div>
      </div>
    </div>`;
}

function summaryField(label, value) {
  return `<div>
    <div style="font-size:0.71rem;font-weight:700;color:var(--ink-400);text-transform:uppercase;letter-spacing:.04em;">${label}</div>
    <div style="font-size:0.9rem;font-weight:600;color:var(--ink-900);">${value}</div>
  </div>`;
}

/* ── Current courses list ────────────────────────────────── */
function renderCurrentCourses() {
  const regs     = getCurrentSemesterRegs();
  const list     = document.getElementById("currentCoursesList");

  if (regs.length === 0) {
    list.innerHTML = `<div class="activity-item"><div class="activity-body">
      <div class="activity-title">No courses registered</div>
      <div class="activity-meta">Registration for this semester is not yet open</div>
    </div></div>`;
    return;
  }

  list.innerHTML = regs.map(reg => {
    const course = allCourses.find(c => Number(c.id) === Number(reg.courseId));
    if (!course) return "";
    const result = resultsWithCourses.find(r =>
      Number(r.courseId) === Number(reg.courseId) &&
      r.session === reg.session && Number(r.semester) === Number(reg.semester)
    );
    const hasResult  = !!result;
    const { grade }  = hasResult ? scoreToGrade(result.score) : { grade: "—" };
    const statusHtml = hasResult
      ? `<span class="activity-badge" style="background:var(--success-100);color:var(--success);">Grade ${grade}</span>`
      : `<span class="activity-badge" style="background:var(--warn-100);color:var(--warn);">Pending</span>`;
    const iconCls = hasResult ? "activity-icon--green" : "activity-icon--amber";
    return `<div class="activity-item">
      <div class="activity-icon ${iconCls}"><i class="bi bi-journal-text"></i></div>
      <div class="activity-body">
        <div class="activity-title">${course.courseCode} — ${course.courseTitle}</div>
        <div class="activity-meta">${course.creditUnit} credit unit${course.creditUnit === 1 ? "" : "s"}</div>
      </div>
      ${statusHtml}
    </div>`;
  }).join("");
}

/* ── Outstanding list ────────────────────────────────────── */
function renderOutstandingList() {
  const outstanding = getOutstandingCourses();
  const list        = document.getElementById("outstandingList");

  if (outstanding.length === 0) {
    list.innerHTML = `<div class="activity-item"><div class="activity-body">
      <div class="activity-title" style="color:var(--success);">
        <i class="bi bi-check-circle-fill me-1"></i> No outstanding courses
      </div>
      <div class="activity-meta">Keep up the great work!</div>
    </div></div>`;
    return;
  }

  list.innerHTML = outstanding.map(r => {
    const { grade } = scoreToGrade(r.score);
    return `<div class="activity-item">
      <div class="activity-icon activity-icon--red"><i class="bi bi-exclamation-circle"></i></div>
      <div class="activity-body">
        <div class="activity-title">${r.course.courseCode} — ${r.course.courseTitle}</div>
        <div class="activity-meta">${r.session}, Semester ${r.semester} · Score: ${r.score}</div>
      </div>
      <span class="activity-badge" style="background:var(--danger-100);color:var(--danger);">Grade ${grade}</span>
    </div>`;
  }).join("");
}
