import { requireAuth, getCurrentStudent, logout } from "./auth.js";
import { getResults, getCourses, getDepartmentById, getRegistrations, getAcademicCalendar, getGraduationRequirements } from "./api.js";
import { calculateGPA, scoreToGrade, computeGraduationEligibility } from "./utils.js";
import { initTopbar } from "./topbar.js";

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
let allResultsRaw = [];
let department = null;
let graduationRequirements = [];

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    student = getCurrentStudent();
    if (!student) { window.location.href = "/index.html"; return; }

    initialiseSidebar();
    initialiseLogout();
    await loadData();
    document.getElementById("dashboardLoading").classList.add("d-none");
    document.getElementById("dashboardContent").classList.remove("d-none");

    renderStatCards();
    renderGpaChart();
    renderAcademicSummary();
    renderOutstandingList();
    renderGraduationProgress();
  } catch (err) {
    console.error(err);
    document.getElementById("dashboardLoading").innerHTML =
      `<div class="alert alert-danger mb-0">Failed to load dashboard. Please refresh.</div>`;
  }
}

/* ── Data ───────────────────────────────────────────────── */
async function loadData() {
  const [results, courses, registrations, cal, dept, gradReqs] = await Promise.all([
    getResults(),
    getCourses(),
    getRegistrations({ studentId: student.id }),
    getAcademicCalendar(),
    getDepartmentById(student.departmentId),
    getGraduationRequirements(),
  ]);

  allCourses       = courses;
  allRegistrations = registrations;
  calendar         = cal;
  department       = dept;
  graduationRequirements = gradReqs;

  // Filter client-side to avoid json-server type mismatch on studentId
  allResultsRaw = results.filter(r => String(r.studentId) === String(student.id));

  resultsWithCourses = allResultsRaw
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

  /* Sidebar user info */
  document.getElementById("sidebarUserName").textContent = name;
  document.getElementById("sidebarUserMeta").textContent = student.matricNumber;
  const sidebarImg = document.getElementById("sidebarAvatarImg");
  const sidebarIni = document.getElementById("sidebarAvatarInitials");
  if (student.profileImage?.trim()) {
    sidebarImg.src = resolveImagePath(student.profileImage);
    sidebarImg.onerror = () => { sidebarImg.classList.add("d-none"); sidebarIni.style.display = "flex"; sidebarIni.textContent = initials; };
    sidebarImg.classList.remove("d-none"); sidebarIni.style.display = "none";
  } else { sidebarIni.style.display = "flex"; sidebarIni.textContent = initials; }

  /* Greeting subtitle */
  document.getElementById("dashboardSubtitle").textContent =
    `Welcome back, ${student.firstName}. Here's your academic overview.`;

  /* Topbar profile dropdown + sidebar toggle via shared helper */
  initTopbar(student);
}

function initialiseLogout() {
  /* Sidebar logout button → modal */
  const modal = new bootstrap.Modal(document.getElementById("logoutConfirmModal"));
  document.getElementById("logoutBtn").addEventListener("click", () => modal.show());
  document.getElementById("confirmLogoutBtn").addEventListener("click", () => {
    logout(); window.location.href = "/index.html";
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
  const cgpa        = resultsWithCourses.length ? calculateGPA(resultsWithCourses) : "0.00";
  const credits     = getCreditsEarned();
  const currCourses = getCurrentSemesterRegs().length;
  const outstanding = getOutstandingCourses().length;

  document.getElementById("statCgpa").textContent        = cgpa;
  document.getElementById("statCredits").textContent     = credits;
  document.getElementById("statCourses").textContent     = currCourses;
  document.getElementById("statOutstanding").textContent = outstanding;

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

/* ── Graduation progress (Step 5.2) ─────────────────────── */
function renderGraduationProgress() {
  const container = document.getElementById("graduationProgress");
  if (!container) return;

  const eligibility = computeGraduationEligibility(
    student, allResultsRaw, allCourses, department, graduationRequirements
  );

  if (!eligibility) {
    container.innerHTML = `<div class="activity-meta">Graduation requirements aren't configured for your programme yet.</div>`;
    return;
  }

  const totalPct = Math.min(100, Math.round((eligibility.totalUnits / eligibility.minTotalUnits) * 100));
  const corePct  = Math.min(100, Math.round((eligibility.coreUnits / eligibility.minCoreUnits) * 100));

  let message;
  if (eligibility.status === "eligible") {
    message = `<span style="color:var(--success);"><i class="bi bi-check-circle-fill me-1"></i>You meet the unit requirements so far.</span>`;
  } else {
    const parts = [];
    if (eligibility.unitsShort > 0) parts.push(`${eligibility.unitsShort} more total unit${eligibility.unitsShort === 1 ? "" : "s"}`);
    if (eligibility.coreShort > 0) parts.push(`${eligibility.coreShort} more core unit${eligibility.coreShort === 1 ? "" : "s"}`);
    message = `You need ${parts.join(" and ")} to graduate.`;
  }

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem;">
      <div>
        <div class="d-flex justify-content-between mb-1">
          <span class="activity-meta">Total units</span>
          <span class="activity-meta">${eligibility.totalUnits} / ${eligibility.minTotalUnits}</span>
        </div>
        <div class="progress" style="height:8px;">
          <div class="progress-bar" role="progressbar" style="width:${totalPct}%;background:var(--brand-700);"></div>
        </div>
      </div>
      <div>
        <div class="d-flex justify-content-between mb-1">
          <span class="activity-meta">Core units</span>
          <span class="activity-meta">${eligibility.coreUnits} / ${eligibility.minCoreUnits}</span>
        </div>
        <div class="progress" style="height:8px;">
          <div class="progress-bar" role="progressbar" style="width:${corePct}%;background:var(--brand-500);"></div>
        </div>
      </div>
      <div class="activity-title" style="font-size:.85rem;">${message}</div>
    </div>
  `;
}