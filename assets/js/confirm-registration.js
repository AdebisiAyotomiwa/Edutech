import { requireAuth, getCurrentStudent, logout } from "./auth.js";
import { getCourses, getRegistrations, getAcademicCalendar, createRegistration, createAuditLogEntry } from "./api.js";
import { getUnitLoadState } from "./registrationEngine.js";
import { initTopbar } from "./topbar.js";

/* =========================================================
   confirm-registration.js
   ---------------------------------------------------------
   Purpose:
   Student-facing hybrid registration screen.

   States rendered:
   A) Registration window open, student hasn't confirmed yet
      -> locked core/carry-over rows + editable elective checkboxes
   B) Student already confirmed
      -> read-only summary of what was confirmed
   C) Registration window closed (neither normal nor late open)
      -> read-only "registration is closed" state, shows whatever
         was auto-registered (core + carry-over only)
   ========================================================= */

requireAuth();

let student = null;
let calendar = null;
let allCourses = [];
let unitState = null;
let electiveCourses = [];

function resolveImagePath(raw) {
  if (!raw || !raw.trim()) return "";
  if (raw.startsWith("/") || raw.startsWith("http")) return raw;
  return "/" + raw;
}

const els = {
  loading:      document.getElementById("regLoading"),
  content:      document.getElementById("regContent"),
  windowBanner: document.getElementById("windowBanner"),
  unitSummary:  document.getElementById("unitSummary"),
  warning:      document.getElementById("regWarning"),
  lockedList:   document.getElementById("lockedList"),
  carryList:    document.getElementById("carryList"),
  electiveList: document.getElementById("electiveList"),
  confirmBtn:   document.getElementById("confirmBtn"),
  closedNote:   document.getElementById("regClosedNote"),
  logoutBtn:    document.getElementById("logoutBtn"),

  sidebarUserName:       document.getElementById("sidebarUserName"),
  sidebarUserMeta:       document.getElementById("sidebarUserMeta"),
  sidebarAvatarImg:      document.getElementById("sidebarAvatarImg"),
  sidebarAvatarInitials: document.getElementById("sidebarAvatarInitials"),
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    student = getCurrentStudent();
    if (!student) { window.location.href = "/index.html"; return; }

    initialiseSidebar();
    initialiseLogout();

    calendar = await getAcademicCalendar();
    allCourses = await getCourses();

    unitState = await getUnitLoadState({
      studentId: student.id,
      level: student.level,
      session: calendar.currentSession,
      semester: calendar.currentSemester,
    });

    electiveCourses = getEligibleElectives();

    render();

    els.loading?.classList.add("d-none");
    els.content?.classList.remove("d-none");
  } catch (err) {
    console.error(err);
    if (els.loading) {
      els.loading.innerHTML = `<div class="alert alert-danger mb-0">Failed to load registration.</div>`;
    }
  }
}

/* ── Sidebar / logout (matches courses.js / dashboard.js convention) ── */
function initialiseSidebar() {
  if (els.sidebarUserName) els.sidebarUserName.textContent = `${student.firstName} ${student.lastName}`;
  if (els.sidebarUserMeta) els.sidebarUserMeta.textContent = student.matricNumber;

  const initials = student.firstName[0] + student.lastName[0];
  if (els.sidebarAvatarImg && els.sidebarAvatarInitials) {
    if (student.profileImage && student.profileImage.trim()) {
      els.sidebarAvatarImg.src = resolveImagePath(student.profileImage);
      els.sidebarAvatarImg.onerror = () => {
        els.sidebarAvatarImg.classList.add("d-none");
        els.sidebarAvatarInitials.style.display = "flex";
        els.sidebarAvatarInitials.textContent = initials;
      };
      els.sidebarAvatarImg.classList.remove("d-none");
      els.sidebarAvatarInitials.style.display = "none";
    } else {
      els.sidebarAvatarInitials.style.display = "flex";
      els.sidebarAvatarInitials.textContent = initials;
    }
  }

  initTopbar(student);
}

function initialiseLogout() {
  const modalEl = document.getElementById("logoutConfirmModal");
  if (!modalEl) return;
  const modal = new bootstrap.Modal(modalEl);
  els.logoutBtn?.addEventListener("click", () => modal.show());
  document.getElementById("confirmLogoutBtn")?.addEventListener("click", () => {
    logout(); window.location.href = "/index.html";
  });
}

/* ── Registration window state ─────────────────────────── */
function getWindowState() {
  const w = calendar.registrationWindow;
  if (w.normal.isOpen) return "normal";
  if (w.late.isOpen) return "late";
  return "closed";
}

function alreadyConfirmed() {
  // A student has "confirmed" once they have at least one source:"student"
  // registration for the current session/semester.
  return unitState.registrations.some(r => r.source === "student");
}

/* ── Eligible electives: student's own department + cross-department
   electives (departmentId null), matching level + current semester,
   excluding anything already registered ─────────────────── */
function getEligibleElectives() {
  const registeredCourseIds = new Set(unitState.registrations.map(r => String(r.course.id)));
  return allCourses.filter(c =>
    c.courseType === "elective" &&
    Number(c.level) === Number(student.level) &&
    Number(c.semester) === Number(calendar.currentSemester) &&
    (c.departmentId === null || Number(c.departmentId) === Number(student.departmentId)) &&
    !registeredCourseIds.has(String(c.id))
  );
}

/* ── Rendering ──────────────────────────────────────────── */
function render() {
  const windowState = getWindowState();
  const confirmed = alreadyConfirmed();

  renderWindowBanner(windowState);
  renderLockedRows();

  if (windowState === "closed" || confirmed) {
    renderReadOnlyElectives();
    els.confirmBtn.classList.add("d-none");
    if (els.closedNote) {
      els.closedNote.classList.remove("d-none");
      els.closedNote.innerHTML = confirmed
        ? `<i class="bi bi-check2-circle me-1"></i>You've already confirmed registration for this semester.`
        : `<i class="bi bi-lock-fill me-1"></i>Registration is closed.`;
    }
  } else {
    renderEditableElectives();
    els.confirmBtn.classList.remove("d-none");
    els.confirmBtn.addEventListener("click", handleConfirm);
    els.closedNote?.classList.add("d-none");
    updateUnitSummary();
  }
}

function renderWindowBanner(windowState) {
  if (!els.windowBanner) return;
  const labels = {
    normal: { text: "Registration open", cls: "bg-success-subtle text-success" },
    late:   { text: "Late registration open", cls: "bg-warning-subtle text-warning" },
    closed: { text: "Registration closed", cls: "bg-danger-subtle text-danger" },
  };
  const { text, cls } = labels[windowState];
  els.windowBanner.textContent = text;
  els.windowBanner.className = `badge ${cls}`;
}

function renderLockedRows() {
  // Core courses only — filter by courseType so electives don't appear here
  const core = unitState.registrations.filter(r =>
    r.source === "auto" && r.type === "regular" &&
    (r.course?.courseType === "core" || !r.course?.courseType)
  );
  const carry = unitState.registrations.filter(r =>
    r.source === "auto" && r.type === "carry-over"
  );

  els.lockedList.innerHTML = core.map(lockedRowHtml).join("") ||
    `<p class="text-muted small mb-0 p-3">No core courses auto-registered yet.</p>`;

  if (carry.length === 0) {
    els.carryList?.closest(".carryover-section")?.classList.add("d-none");
  } else {
    els.carryList.innerHTML = carry.map(lockedRowHtml).join("");
  }
}

function lockedRowHtml(reg) {
  return `<div class="d-flex align-items-center gap-2 px-3 py-2 border-bottom locked-row">
    <i class="bi bi-lock text-muted"></i>
    <span class="flex-grow-1">${reg.course.courseCode} — ${reg.course.courseTitle}</span>
    <span class="text-muted small">${reg.course.creditUnit} units</span>
  </div>`;
}

function renderEditableElectives() {
  els.electiveList.innerHTML = electiveCourses.map(c => `
    <label class="d-flex align-items-center gap-2 px-3 py-2 border-bottom elective-row">
      <input type="checkbox" class="elective-cb" data-units="${c.creditUnit}" data-course-id="${c.id}">
      <span class="flex-grow-1">${c.courseCode} — ${c.courseTitle}</span>
      <span class="text-muted small">${c.creditUnit} units</span>
    </label>`).join("") ||
    `<p class="text-muted small mb-0 p-3">No electives available for your level this semester.</p>`;

  els.electiveList.querySelectorAll(".elective-cb").forEach(cb =>
    cb.addEventListener("change", updateUnitSummary)
  );
}

function renderReadOnlyElectives() {
  // In closed state: show all elective registrations (source=student or source=auto+elective)
  // as read-only with a "Selected" badge and a locked icon instead of a checkbox
  const electives = unitState.registrations.filter(r =>
    r.source === "student" ||
    (r.source === "auto" && r.course?.courseType === "elective")
  );

  if (electives.length === 0) {
    els.electiveList.innerHTML =
      `<p class="text-muted small mb-0 p-3">No electives were selected for this semester.</p>`;
    return;
  }

  els.electiveList.innerHTML = electives.map(reg => `
    <div class="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
      <i class="bi bi-check-circle-fill" style="color:var(--brand-500);flex-shrink:0;"></i>
      <span class="flex-grow-1">${reg.course.courseCode} — ${reg.course.courseTitle}</span>
      <span class="text-muted small me-2">${reg.course.creditUnit} units</span>
      <span style="font-size:.7rem;font-weight:700;padding:.15em .55em;border-radius:5px;background:var(--brand-100);color:var(--brand-900);">Selected</span>
    </div>`).join("");
}

/* ── Unit gating ────────────────────────────────────────── */
function selectedElectiveUnits() {
  let total = 0;
  document.querySelectorAll(".elective-cb").forEach(cb => {
    if (cb.checked) total += parseInt(cb.dataset.units, 10);
  });
  return total;
}

function updateUnitSummary() {
  const total = selectedElectiveUnits();
  const { minElectiveUnitsNeeded, maxElectiveUnitsAllowed } = unitState;

  if (els.unitSummary) {
    els.unitSummary.textContent =
      `${total} / need ${minElectiveUnitsNeeded}–${maxElectiveUnitsAllowed} elective units`;
  }

  const withinBand = total >= minElectiveUnitsNeeded && total <= maxElectiveUnitsAllowed;

  if (els.warning) {
    if (total < minElectiveUnitsNeeded) {
      els.warning.classList.remove("d-none");
      els.warning.textContent = `Select ${minElectiveUnitsNeeded - total} more elective unit(s) to meet your minimum semester load.`;
    } else if (total > maxElectiveUnitsAllowed) {
      els.warning.classList.remove("d-none");
      els.warning.textContent = `Over maximum load. Remove ${total - maxElectiveUnitsAllowed} unit(s) before confirming.`;
    } else {
      els.warning.classList.add("d-none");
    }
  }

  els.confirmBtn.disabled = !withinBand;
}

/* ── Confirm submission ─────────────────────────────────── */
async function handleConfirm() {
  const windowState = getWindowState();
  const selected = Array.from(document.querySelectorAll(".elective-cb")).filter(cb => cb.checked);

  els.confirmBtn.disabled = true;
  els.confirmBtn.textContent = "Confirming…";

  try {
    await Promise.all(selected.map(cb =>
      createRegistration({
        studentId: Number(student.id),
        courseId: Number(cb.dataset.courseId),
        session: calendar.currentSession,
        semester: Number(calendar.currentSemester),
        type: "regular",
        source: "student",
        confirmedVia: windowState, // "normal" | "late"
      })
    ));

    await createAuditLogEntry({
      entityType: "registrationConfirm",
      entityId: `confirm-${student.id}-${calendar.currentSession}-${calendar.currentSemester}`,
      action: "confirmed",
      actorId: student.id,
      actorRole: "student",
      timestamp: new Date().toISOString(),
      previousValue: null,
      newValue: {
        electivesConfirmed: selected.length,
        totalUnits: selectedElectiveUnits(),
        confirmedVia: windowState,
      },
      note: `Confirmed registration with ${selected.length} elective(s) via the ${windowState} window.`,
    });

    window.location.reload();
  } catch (err) {
    console.error(err);
    els.confirmBtn.disabled = false;
    els.confirmBtn.textContent = "Confirm registration";
    if (els.warning) {
      els.warning.classList.remove("d-none");
      els.warning.textContent = "Something went wrong confirming your registration. Please try again.";
    }
  }
}