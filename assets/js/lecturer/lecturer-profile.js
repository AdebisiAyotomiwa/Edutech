import { requireLecturerAuth, getCurrentLecturer, lecturerLogout } from "../lecturerAuth.js";
import {
  getCourseAssignments, getCourses, getDepartments, getAcademicCalendar,
} from "../api.js";

requireLecturerAuth();

let lecturer    = null;
let assignments = [];
let courses     = [];
let departments = [];
let calendar    = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    lecturer = getCurrentLecturer();
    if (!lecturer) {
      window.location.href = "/assets/pages/lecturer/lecturer-login.html";
      return;
    }

    setupSidebar();
    setupLogout();
    await loadData();

    document.getElementById("pageLoading").classList.add("d-none");
    document.getElementById("pageContent").classList.remove("d-none");

    renderProfile();
    renderAssignments();
  } catch (err) {
    console.error(err);
    document.getElementById("pageLoading").innerHTML =
      `<div class="alert alert-danger mb-0">Failed to load profile.</div>`;
  }
}

async function loadData() {
  [assignments, courses, departments, calendar] = await Promise.all([
    getCourseAssignments({ lecturerId: Number(lecturer.id) }),
    getCourses(),
    getDepartments(),
    getAcademicCalendar(),
  ]);
}

/* ── Sidebar ────────────────────────────────────────────── */
function setupSidebar() {
  const initials = lecturer.name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  document.getElementById("sidebarAvatarInitials").textContent = initials;
  document.getElementById("sidebarUserName").textContent = `${lecturer.title ? lecturer.title + " " : ""}${lecturer.name}`;
  document.getElementById("sidebarUserMeta").textContent = lecturer.staffId || lecturer.email;

  const toggle  = document.getElementById("sidebarToggleBtn");
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
    lecturerLogout();
    window.location.href = "/assets/pages/lecturer/lecturer-login.html";
  });
}

/* ── Profile ────────────────────────────────────────────── */
function renderProfile() {
  const dept     = departments.find(d => String(d.id) === String(lecturer.departmentId));
  const initials = lecturer.name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  const displayName = `${lecturer.title ? lecturer.title + " " : ""}${lecturer.name}`;

  document.getElementById("profileAvatar").textContent  = initials;
  document.getElementById("profileFullName").textContent = displayName;
  document.getElementById("profileStaffId").textContent  = lecturer.staffId || "—";

  const fields = [
    { label: "Title",      value: lecturer.title    || "—",   wide: false },
    { label: "Full Name",  value: lecturer.name     || "—",   wide: false },
    { label: "Staff ID",   value: lecturer.staffId  || "—",   wide: false },
    { label: "Phone",      value: lecturer.phone    || "—",   wide: false },
    { label: "Department", value: dept?.name        || "—",   wide: false },
    { label: "Faculty",    value: dept?.faculty     || "—",   wide: false },
    { label: "Role",       value: "Lecturer",                 wide: false },
    { label: "Email",      value: lecturer.email    || "—",   wide: true  },
  ];

  document.getElementById("profileFields").innerHTML = fields.map(f => `
    <div class="${f.wide ? "col-12" : "col-6 col-md-4"}">
      <div class="text-muted small fw-semibold" style="font-size:.71rem;text-transform:uppercase;letter-spacing:.04em;">${f.label}</div>
      <div class="fw-medium" style="font-size:.9rem;color:var(--ink-900);word-break:break-all;overflow-wrap:anywhere;">${f.value}</div>
    </div>`).join("");
}

/* ── Course assignments ─────────────────────────────────── */
function renderAssignments() {
  const currAssignments = assignments.filter(
    a => a.session === calendar.currentSession &&
         Number(a.semester) === Number(calendar.currentSemester)
  );

  document.getElementById("assignmentsSessionLabel").textContent =
    `${calendar.currentSession} — Semester ${calendar.currentSemester}`;

  const list = document.getElementById("profileAssignmentsList");

  if (currAssignments.length === 0) {
    list.innerHTML = `<div class="activity-item">
      <div class="activity-body">
        <div class="activity-title">No courses assigned this semester</div>
        <div class="activity-meta">Contact the admin if this is unexpected.</div>
      </div>
    </div>`;
    return;
  }

  list.innerHTML = currAssignments.map(a => {
    const course = courses.find(c => String(c.id) === String(a.courseId));
    if (!course) return "";
    return `<div class="activity-item">
      <div class="activity-icon activity-icon--green"><i class="bi bi-journal-text"></i></div>
      <div class="activity-body">
        <div class="activity-title">${course.courseCode} — ${course.courseTitle}</div>
        <div class="activity-meta">${course.level} Level · ${course.creditUnit} credit unit${course.creditUnit === 1 ? "" : "s"} · Semester ${course.semester}</div>
      </div>
    </div>`;
  }).join("");
}
