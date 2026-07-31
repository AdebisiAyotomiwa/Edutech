import { requireLecturerAuth, getCurrentLecturer, lecturerLogout } from "../lecturerAuth.js";
import {
  getCourseAssignments, getCourses, getDepartments, getAcademicCalendar,
  changePassword,
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
    setupChangePassword();
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

  const openSidebar  = () => { sidebar.classList.add("is-open");    scrim.classList.add("is-open");    toggle.setAttribute("aria-expanded", "true");  };
  const closeSidebar = () => { sidebar.classList.remove("is-open"); scrim.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); };

  toggle.addEventListener("click", () => sidebar.classList.contains("is-open") ? closeSidebar() : openSidebar());
  scrim.addEventListener("click", closeSidebar);

  /* Auto-close when a nav link is tapped on mobile */
  sidebar.querySelectorAll(".app-sidebar-link").forEach(link =>
    link.addEventListener("click", closeSidebar)
  );
}

function setupLogout() {
  const modal = new bootstrap.Modal(document.getElementById("logoutConfirmModal"));
  document.getElementById("logoutBtn").addEventListener("click", () => modal.show());
  document.getElementById("confirmLogoutBtn").addEventListener("click", () => {
    lecturerLogout();
    window.location.href = "/assets/pages/lecturer/lecturer-login.html";
  });
}

/* ── Change Password ────────────────────────────────────── */
function setupChangePassword() {
  const modal   = new bootstrap.Modal(document.getElementById("changePasswordModal"));
  const form    = document.getElementById("changePasswordForm");
  const alertEl = document.getElementById("pwAlert");
  const saveBtn = document.getElementById("pwSaveBtn");
  const saveTxt = document.getElementById("pwSaveBtnText");
  const saveSpn = document.getElementById("pwSaveBtnSpinner");

  document.getElementById("changePasswordBtn").addEventListener("click", () => {
    form.reset();
    showAlert("", "");
    modal.show();
  });

  /* Show / hide password toggles */
  document.querySelectorAll("[data-pw-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.pwToggle);
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      btn.querySelector("i").className = hidden ? "bi bi-eye-slash" : "bi bi-eye";
    });
  });

  saveBtn.addEventListener("click", async () => {
    showAlert("", "");
    const current = document.getElementById("pwCurrent").value.trim();
    const next    = document.getElementById("pwNew").value;
    const confirm = document.getElementById("pwConfirm").value;

    if (!current)         return showAlert("Please enter your current password.", "danger");
    if (next.length < 6)  return showAlert("New password must be at least 6 characters.", "danger");
    if (next !== confirm)  return showAlert("New passwords do not match.", "danger");
    if (next === current)  return showAlert("New password must differ from the current one.", "danger");

    setSaving(true);
    try {
      const result = await changePassword({
        collection: "lecturers",
        id: lecturer.id,
        currentPassword: current,
        newPassword: next,
      });
      if (!result.success) {
        showAlert(result.message || "Current password is incorrect.", "danger");
      } else {
        showAlert("Password changed successfully.", "success");
        form.reset();
        setTimeout(() => modal.hide(), 1800);
      }
    } catch (err) {
      console.error(err);
      showAlert("Something went wrong. Please try again.", "danger");
    } finally {
      setSaving(false);
    }
  });

  function showAlert(msg, type) {
    if (!msg) { alertEl.className = "alert d-none"; return; }
    alertEl.className = `alert alert-${type}`;
    alertEl.textContent = msg;
  }
  function setSaving(on) {
    saveBtn.disabled = on;
    saveTxt.classList.toggle("d-none", on);
    saveSpn.classList.toggle("d-none", !on);
  }
}

/* ── Profile ────────────────────────────────────────────── */
function renderProfile() {
  const dept        = departments.find(d => String(d.id) === String(lecturer.departmentId));
  const initials    = lecturer.name.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  const displayName = `${lecturer.title ? lecturer.title + " " : ""}${lecturer.name}`;

  /* Header */
  document.getElementById("profileAvatarInitials").textContent = initials;
  document.getElementById("profileFullName").textContent       = displayName;
  document.getElementById("profileStaffId").textContent        = lecturer.staffId || "—";

  /* Detail fields */
  document.getElementById("profileTitle").textContent         = lecturer.title      || "—";
  document.getElementById("profileName").textContent          = lecturer.name       || "—";
  document.getElementById("profileStaffIdField").textContent  = lecturer.staffId    || "—";
  document.getElementById("profilePhone").textContent         = lecturer.phone      || "—";
  document.getElementById("profileDepartment").textContent    = dept?.name          || "—";
  document.getElementById("profileFaculty").textContent       = dept?.faculty       || "—";
  document.getElementById("profileEmail").textContent         = lecturer.email      || "—";
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
