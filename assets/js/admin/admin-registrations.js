import { requireAdminAuth, getCurrentAdmin, adminLogout } from "../adminAuth.js";
import {
  getStudents, getDepartments, getFaculties, getCourses,
  getRegistrations, getAcademicCalendar,
  createRegistration, deleteRegistration,
  getResultSubmissions,
} from "../api.js";
import { previewRegistrationBatch, generateRegistrationBatch } from "../registrationEngine.js";

requireAdminAuth();

/* ── State ──────────────────────────────────────────────── */
let admin = null;
let students = [], departments = [], faculties = [], courses = [];
let registrations = [], calendar = null;
let submissions = [];   // for pending badge count
let allSessions = [];

/* Current tab */
let currSelectedStudentId = null;
let currStudentRegs = [];     // live regs for the open student
let currPage = 1;
const PAGE_SIZE = 15;
let pendingDeleteRegId = null;

/* History tab */
let histData = [];
let histPage = 1;

/* ── DOM refs ───────────────────────────────────────────── */
const pageState   = document.getElementById("pageState");
const pageContent = document.getElementById("pageContent");
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar  = document.getElementById("appSidebar");
const appSidebarScrim = document.getElementById("appSidebarScrim");
const logoutBtn   = document.getElementById("logoutBtn");
const deleteRegModal = new bootstrap.Modal(document.getElementById("deleteRegModal"));

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    admin = getCurrentAdmin();
    if (!admin) { window.location.href = "/assets/pages/admin/admin-login.html"; return; }
    setupSidebar(); setupLogout();
    await loadData();
    buildSessionList();
    populateFacultySelects();
    pageState.classList.add("d-none");
    pageContent.classList.remove("d-none");
    bindTabs();
    bindCurrentTab();
    document.getElementById("generateRegBtn").addEventListener("click", openGeneratePreview);
    document.getElementById("generateNextSemBtn").addEventListener("click", openGenerateNextSemPreview);
    document.getElementById("confirmGenerateBtn").addEventListener("click", handleConfirmGenerate);
    bindHistoryTab();
    /* Auto-load all students for current semester */
    renderCurrStudents();
  } catch (err) {
    console.error(err);
    pageState.innerHTML = `<div class="alert alert-danger mb-0">Failed to load registrations.</div>`;
  }
}

async function loadData() {
  [students, departments, faculties, courses, registrations, calendar, submissions] = await Promise.all([
    getStudents(), getDepartments(), getFaculties(), getCourses(),
    getRegistrations(), getAcademicCalendar(),
    getResultSubmissions(),
  ]);
}

function buildSessionList() {
  const set = new Set([...registrations.map(r => r.session), calendar.currentSession]);
  allSessions = Array.from(set).sort().reverse();
}

/* ── Sidebar / logout ───────────────────────────────────── */
function setupSidebar() {
  document.getElementById("sidebarUserName").textContent = admin.name || "Admin";
  document.getElementById("sidebarUserMeta").textContent = admin.email;
  document.getElementById("sidebarAvatarInitials").textContent =
    (admin.name || "A").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

  // Pending approval badge
  const pendingCount = submissions.filter(s => s.status === "pending").length;
  const badge = document.getElementById("sidebarPendingBadge");
  if (badge && pendingCount > 0) { badge.textContent = pendingCount; badge.style.display = ""; }

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
    adminLogout(); window.location.href = "/assets/pages/admin/admin-login.html";
  });
}

/* ── Tabs ───────────────────────────────────────────────── */
function bindTabs() {
  document.getElementById("mainTabs").querySelectorAll(".nav-link").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("mainTabs").querySelectorAll(".nav-link").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.getElementById("currentTab").classList.toggle("d-none", tab !== "current");
      document.getElementById("historyTab").classList.toggle("d-none", tab !== "history");
      /* Auto-load history accordion the first time the history tab opens */
      if (tab === "history") {
        histPage = 1;
        buildHistData();
        renderHistAccordion();
      }
    });
  });
}

/* ── Faculty selects ────────────────────────────────────── */
function populateFacultySelects() {
  const opts    = faculties.map(f => `<option value="${f.name}">${f.name}</option>`).join("");
  const deptOpts = `<option value="">All Departments</option>` +
    departments.map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  const sessOpts = allSessions.map(s => `<option value="${s}">${s}</option>`).join("");

  document.getElementById("rCurrFaculty").innerHTML = `<option value="">All Faculties</option>` + opts;
  document.getElementById("rCurrDept").innerHTML    = deptOpts;

  document.getElementById("rHistFaculty").innerHTML = `<option value="">All Faculties</option>` + opts;
  document.getElementById("rHistDept").innerHTML    = deptOpts;
  document.getElementById("rHistSession").innerHTML = `<option value="">All Sessions</option>` + sessOpts;

  document.getElementById("loadHistoryBtn").disabled = false;

  /* ── Current session label + generation status ── */
  const currKey = `${calendar.currentSession}-${calendar.currentSemester}`;
  const isGenerated = !!(calendar.registrationGenerated && calendar.registrationGenerated[currKey]);

  document.getElementById("currSessionLabel").textContent =
    `${calendar.currentSession} — Semester ${calendar.currentSemester}`;

  const genBadge   = document.getElementById("currGenBadge");
  const genBtn     = document.getElementById("generateRegBtn");
  const nextSemBtn = document.getElementById("generateNextSemBtn");

  if (isGenerated) {
    genBadge.style.display = "";
    genBtn.disabled   = true;   // already generated for current sem
    nextSemBtn.disabled = false;
  } else {
    genBadge.style.display = "none";
    genBtn.disabled   = false;
    nextSemBtn.disabled = true;  // generate current first
  }

  /* Render metrics for current semester */
  renderRegMetrics();
}

function renderRegMetrics() {
  const session  = calendar.currentSession;
  const semester = Number(calendar.currentSemester);
  const currRegs = registrations.filter(
    r => r.session === session && Number(r.semester) === semester
  );
  const regStudentIds  = new Set(currRegs.map(r => String(r.studentId)));
  const carryoverCount = currRegs.filter(r => r.type === "carry-over").length;
  const uniqueCourses  = new Set(currRegs.map(r => String(r.courseId))).size;

  const el = id => document.getElementById(id);
  if (el("regmTotal"))     el("regmTotal").textContent    = currRegs.length;
  if (el("regmStudents"))  el("regmStudents").textContent = regStudentIds.size;
  if (el("regmCarryover")) el("regmCarryover").textContent = carryoverCount;
  if (el("regmCourses"))   el("regmCourses").textContent  = uniqueCourses;
}

/* ════════════════════════════════════════════════════════
   CURRENT REGISTRATION TAB
   ════════════════════════════════════════════════════════ */
function bindCurrentTab() {
  document.getElementById("rCurrFaculty").addEventListener("change", onCurrFacultyChange);
  document.getElementById("rCurrDept").addEventListener("change", onCurrDeptChange);
  document.getElementById("rCurrLevel").addEventListener("change", renderCurrStudents);
  document.getElementById("rCurrSession").addEventListener("change", renderCurrStudents);
  document.getElementById("rCurrSemester").addEventListener("change", renderCurrStudents);
  document.getElementById("rCurrSearch").addEventListener("input", () => { currPage = 1; renderCurrStudents(); });
  document.getElementById("backToStudentsBtn").addEventListener("click", showStudentList);
  document.getElementById("addCourseToRegBtn").addEventListener("click", openAddCoursePicker);
  document.getElementById("cancelAddCourseBtn").addEventListener("click", closeAddCoursePicker);
  document.getElementById("confirmAddCourseBtn").addEventListener("click", handleAddCourse);
  document.getElementById("confirmDeleteRegBtn").addEventListener("click", handleDeleteRegConfirm);
}

function onCurrFacultyChange() {
  const faculty = document.getElementById("rCurrFaculty").value;
  const deptSel = document.getElementById("rCurrDept");
  deptSel.innerHTML = `<option value="">All Departments</option>` +
    departments.filter(d => !faculty || d.faculty === faculty)
      .map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  deptSel.disabled = false;
  renderCurrStudents();
}

function onCurrDeptChange() {
  renderCurrStudents();
}

function getCurrFilters() {
  return {
    deptId:   document.getElementById("rCurrDept").value,
    level:    document.getElementById("rCurrLevel").value,
    session:  calendar.currentSession,
    semester: Number(calendar.currentSemester),
  };
}

function renderCurrStudents() {
  const { deptId, level, session, semester } = getCurrFilters();

  document.getElementById("regManagePanel").classList.add("d-none");
  document.getElementById("currFilterPrompt").classList.add("d-none");
  document.getElementById("currStudentArea").classList.remove("d-none");

  let deptStudents = students.filter(s =>
    (!deptId || String(s.departmentId) === String(deptId)) &&
    (!level  || Number(s.level) === Number(level))
  );

  const q = document.getElementById("rCurrSearch").value.trim().toLowerCase();
  if (q) deptStudents = deptStudents.filter(s =>
    `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
    s.matricNumber.toLowerCase().includes(q)
  );

  document.getElementById("rCurrStudentCount").textContent =
    `${deptStudents.length} student${deptStudents.length === 1 ? "" : "s"}`;

  const totalPages = Math.max(1, Math.ceil(deptStudents.length / PAGE_SIZE));
  if (currPage > totalPages) currPage = totalPages;
  const start = (currPage - 1) * PAGE_SIZE;
  const paged = deptStudents.slice(start, start + PAGE_SIZE);

  document.getElementById("currPaginationInfo").textContent =
    deptStudents.length ? `Showing ${start+1}–${Math.min(start+PAGE_SIZE,deptStudents.length)} of ${deptStudents.length}` : "";

  const tbody = document.getElementById("currStudentsTbody");
  const empty = document.getElementById("currStudentsEmpty");

  if (paged.length === 0) { tbody.innerHTML = ""; empty.classList.remove("d-none"); renderCurrPagination(0); return; }
  empty.classList.add("d-none");

  tbody.innerHTML = paged.map(s => {
    const regCount = registrations.filter(r =>
      String(r.studentId) === String(s.id) &&
      r.session === session &&
      Number(r.semester) === semester
    ).length;
    return `<tr>
      <td>
        <div class="d-flex align-items-center gap-2">
          <span class="student-avatar-mini">${(s.firstName[0]+s.lastName[0]).toUpperCase()}</span>
          <div class="fw-semibold">${s.firstName} ${s.lastName}</div>
        </div>
      </td>
      <td class="text-muted-cell">${s.matricNumber}</td>
      <td>${regCount} course${regCount === 1 ? "" : "s"}</td>
      <td class="text-end">
        <button class="btn btn-brand btn-sm" data-action="manage" data-id="${s.id}">
          <i class="bi bi-pencil-square"></i> Manage
        </button>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-action='manage']").forEach(btn =>
    btn.addEventListener("click", () => openRegManagePanel(btn.dataset.id)));

  renderCurrPagination(totalPages);
}

function renderCurrPagination(totalPages) {
  const list = document.getElementById("currPaginationList");
  if (totalPages <= 1) { list.innerHTML = ""; return; }
  let html = `<li class="page-item${currPage===1?" disabled":""}"><button class="page-link" data-page="${currPage-1}">&lsaquo;</button></li>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<li class="page-item${i===currPage?" active":""}"><button class="page-link" data-page="${i}">${i}</button></li>`;
  }
  html += `<li class="page-item${currPage===totalPages?" disabled":""}"><button class="page-link" data-page="${currPage+1}">&rsaquo;</button></li>`;
  list.innerHTML = html;
  list.querySelectorAll("[data-page]").forEach(btn =>
    btn.addEventListener("click", () => { currPage = Number(btn.dataset.page); renderCurrStudents(); }));
}
/* ── Generate current semester ──────────────────────────── */
async function openGeneratePreview() {
  const { deptId, level } = getCurrFilters();
  const session  = calendar.currentSession;
  const semester = Number(calendar.currentSemester);
  await _openGenerateModal({ deptId, level, session, semester, isNext: false });
}

/* ── Generate next semester ─────────────────────────────── */
async function openGenerateNextSemPreview() {
  const { deptId, level } = getCurrFilters();
  /* Next semester: if current is 1 → next is 2 same session; if 2 → Sem 1 of next session year */
  let session  = calendar.currentSession;
  let semester = Number(calendar.currentSemester) + 1;
  if (semester > 2) {
    semester = 1;
    const [startYear] = session.split("/").map(Number);
    session = `${startYear + 1}/${startYear + 2}`;
  }
  document.getElementById("generateRegModalTitle").textContent = `Generate Next Semester — ${session} Sem ${semester}`;
  await _openGenerateModal({ deptId, level, session, semester, isNext: true });
}

async function _openGenerateModal({ deptId, level, session, semester, isNext }) {
  const modal = new bootstrap.Modal(document.getElementById("generateRegModal"));
  const body  = document.getElementById("generateRegModalBody");
  body.innerHTML = `<div class="text-center py-4"><div class="spinner-border text-success"></div></div>`;
  modal.show();

  try {
    const preview = await previewRegistrationBatch({ departmentId: deptId || null, level: level || null, session, semester });
    pendingBatchParams = { departmentId: deptId || null, level: level || null, session, semester, isNext };
    renderGeneratePreview(preview, session, semester, level);
  } catch (err) {
    console.error(err);
    body.innerHTML = `<div class="alert alert-danger mb-0">Failed to build preview.</div>`;
  }
}
 
function renderGeneratePreview(preview, session, semester, level) {
  const { eligibleStudents, coreCourses, carryOverByStudent, totalCarryOverCount } = preview;
  const body = document.getElementById("generateRegModalBody");
 
  const carryRows = carryOverByStudent.slice(0, 5).map(({ student, carryOvers }) =>
    carryOvers.map(({ course }) => `
      <tr>
        <td>${student.matricNumber} — ${student.firstName} ${student.lastName}</td>
        <td>${course.courseCode} — ${course.courseTitle}</td>
        <td>${course.creditUnit}</td>
      </tr>`).join("")
  ).join("");
 
  const extraCount = carryOverByStudent.length > 5 ? carryOverByStudent.length - 5 : 0;
 
  body.innerHTML = `
    <p class="text-muted small mb-3">
      ${session} · Semester ${semester} · Level ${level}
    </p>
    <div class="row g-2 mb-3">
      <div class="col-4">
        <div class="p-2 rounded bg-light">
          <div class="text-muted small">Students eligible</div>
          <div class="fs-5 fw-semibold">${eligibleStudents.length}</div>
        </div>
      </div>
      <div class="col-4">
        <div class="p-2 rounded bg-light">
          <div class="text-muted small">Core courses to assign</div>
          <div class="fs-5 fw-semibold">${coreCourses.length}</div>
        </div>
      </div>
      <div class="col-4">
        <div class="p-2 rounded bg-warning-subtle">
          <div class="text-warning small">Carry-overs detected</div>
          <div class="fs-5 fw-semibold text-warning">${totalCarryOverCount}</div>
        </div>
      </div>
    </div>
    ${totalCarryOverCount > 0 ? `
      <p class="small fw-semibold mb-2">Students with outstanding carry-overs</p>
      <div class="table-responsive mb-2">
        <table class="table table-sm">
          <thead><tr><th>Student</th><th>Carry-over course</th><th>Units</th></tr></thead>
          <tbody>${carryRows}</tbody>
        </table>
      </div>
      ${extraCount > 0 ? `<p class="text-muted small">+${extraCount} more student(s)</p>` : ""}
    ` : `<p class="text-muted small">No outstanding same-semester carry-overs for this level.</p>`}
  `;
 
  document.getElementById("confirmGenerateBtn").textContent =
    `Generate for ${eligibleStudents.length} student${eligibleStudents.length === 1 ? "" : "s"}`;
  document.getElementById("confirmGenerateBtn").disabled = eligibleStudents.length === 0;
}
 
let pendingBatchParams = null;

async function handleConfirmGenerate() {
  if (!pendingBatchParams) return;
 
  const btn = document.getElementById("confirmGenerateBtn");
  btn.disabled = true;
  btn.textContent = "Generating…";
 
  try {
    await generateRegistrationBatch({ ...pendingBatchParams, actorId: admin.id });

    /* Mark the generated flag in the academic calendar so the UI reflects it */
    const { updateAcademicCalendar } = await import("../api.js");
    const key = `${pendingBatchParams.session}-${pendingBatchParams.semester}`;
    const genMap = { ...(calendar.registrationGenerated || {}), [key]: true };
    await updateAcademicCalendar({ registrationGenerated: genMap });
    calendar.registrationGenerated = genMap;

    await loadData();
    renderRegMetrics();
    renderCurrStudents();
    populateFacultySelects();   // refresh badge/button state
    bootstrap.Modal.getInstance(document.getElementById("generateRegModal")).hide();
  } catch (err) {
    console.error(err);
    document.getElementById("generateRegModalBody").insertAdjacentHTML(
      "beforeend",
      `<div class="alert alert-danger mt-2 mb-0">Generation failed. Please try again.</div>`
    );
    btn.disabled = false;
    btn.textContent = "Retry generate";
  }
}
 
/* ── Registration manage panel ──────────────────────────── */
function openRegManagePanel(studentId) {
  const { session, semester, deptId } = getCurrFilters();
  const student = students.find(s => String(s.id) === String(studentId));
  if (!student) return;

  currSelectedStudentId = studentId;
  document.getElementById("currStudentArea").classList.add("d-none");
  document.getElementById("regManagePanel").classList.remove("d-none");
  document.getElementById("addCoursePicker").classList.add("d-none");
  document.getElementById("regStudentName").textContent = `${student.firstName} ${student.lastName}`;
  document.getElementById("regStudentMeta").textContent = `${student.matricNumber} · ${session} Semester ${semester}`;

  /* Load live regs for this student/session/semester */
  currStudentRegs = registrations.filter(r =>
    String(r.studentId) === String(studentId) &&
    r.session === session &&
    Number(r.semester) === semester
  );

  renderRegCourses();
}

function renderRegCourses() {
  const tbody = document.getElementById("regCoursesTbody");
  const empty = document.getElementById("regCoursesEmpty");

  if (currStudentRegs.length === 0) {
    tbody.innerHTML = ""; empty.classList.remove("d-none"); return;
  }
  empty.classList.add("d-none");

  tbody.innerHTML = currStudentRegs.map(reg => {
    const course = courses.find(c => String(c.id) === String(reg.courseId));
    const typeTag = reg.type === "carry-over"
      ? `<span class="carryover-tag">CARRY-OVER</span>`
      : `<span class="status-badge status-badge--completed">Regular</span>`;
    return `<tr>
      <td class="fw-semibold">${course?.courseCode ?? "—"}</td>
      <td>${course?.courseTitle ?? "Unknown"}</td>
      <td>${course?.creditUnit ?? "—"}</td>
      <td>${typeTag}</td>
      <td class="text-end">
        <button class="btn btn-danger-soft btn-sm" data-action="remove" data-reg-id="${reg.id}" title="Remove">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>`;
  }).join("");

  tbody.querySelectorAll("[data-action='remove']").forEach(btn =>
    btn.addEventListener("click", () => confirmRemoveCourse(btn.dataset.regId)));
}

function showStudentList() {
  document.getElementById("regManagePanel").classList.add("d-none");
  document.getElementById("currStudentArea").classList.remove("d-none");
  currSelectedStudentId = null;
}

/* ── Add course to registration ─────────────────────────── */
function openAddCoursePicker() {
  const { deptId, level, semester } = getCurrFilters();
  const student = students.find(s => String(s.id) === String(currSelectedStudentId));

  /* Available courses: same dept, same level (student's level), same semester, not already registered */
  const studentLevel = student?.level;
  const availableCourses = courses.filter(c => {
    const inDept    = String(c.departmentId) === String(deptId);
    const inLevel   = Number(c.level) === Number(studentLevel);
    const inSem     = Number(c.semester) === Number(semester);
    const notReg    = !currStudentRegs.some(r => String(r.courseId) === String(c.id));
    const active    = (c.status || "active") === "active";
    return inDept && inLevel && inSem && notReg && active;
  });

  const sel = document.getElementById("addCourseSelect");
  sel.innerHTML = `<option value="">Select course to add…</option>` +
    availableCourses.map(c => `<option value="${c.id}">${c.courseCode} — ${c.courseTitle} (${c.creditUnit} cr)</option>`).join("");

  hideAlert("addCourseAlert");
  document.getElementById("addCoursePicker").classList.remove("d-none");
}

function closeAddCoursePicker() {
  document.getElementById("addCoursePicker").classList.add("d-none");
}

async function handleAddCourse() {
  hideAlert("addCourseAlert");
  const courseId = document.getElementById("addCourseSelect").value;
  const type     = document.getElementById("addCourseType").value;
  const { session, semester } = getCurrFilters();

  if (!courseId) { showAlert("addCourseAlert", "Please select a course."); return; }

  /* Prevent duplicate */
  const dup = registrations.find(r =>
    String(r.studentId) === String(currSelectedStudentId) &&
    String(r.courseId)  === String(courseId) &&
    r.session === session &&
    Number(r.semester) === semester
  );
  if (dup) { showAlert("addCourseAlert", "This course is already registered for this student."); return; }

  try {
    const courseObj = courses.find(c => String(c.id) === String(courseId));
    const studentObj = students.find(s => String(s.id) === String(currSelectedStudentId));
    const created = await createRegistration({
      studentId: currSelectedStudentId,
      courseId,
      session,
      semester,
      type,
    }, {
      actorId: admin.id,
      actorRole: "admin",
      note: `Manually added ${courseObj?.courseCode ?? "a course"} for ${studentObj ? `${studentObj.firstName} ${studentObj.lastName} (${studentObj.matricNumber})` : "student"}.`,
    });
    registrations.push(created);
    currStudentRegs.push(created);
    closeAddCoursePicker();
    renderRegCourses();
    renderCurrStudents();   // refresh count in student list
  } catch (err) {
    console.error(err);
    showAlert("addCourseAlert", "Failed to add course. Please try again.");
  }
}

/* ── Remove course from registration ────────────────────── */
let pendingDeleteRegSnapshot = null;
function confirmRemoveCourse(regId) {
  const reg    = registrations.find(r => String(r.id) === String(regId));
  const course = reg ? courses.find(c => String(c.id) === String(reg.courseId)) : null;
  const studentObj = reg ? students.find(s => String(s.id) === String(reg.studentId)) : null;
  pendingDeleteRegId = regId;
  pendingDeleteRegSnapshot = reg
    ? { courseId: reg.courseId, type: reg.type, session: reg.session, semester: reg.semester }
    : null;
  document.getElementById("deleteRegBody").textContent =
    `This will remove "${course?.courseCode ?? "this course"}" from the student's registration. This cannot be undone.`;
  deleteRegModal.show();
}

async function handleDeleteRegConfirm() {
  try {
    await deleteRegistration(pendingDeleteRegId, {
      actorId: admin.id,
      actorRole: "admin",
      previousValue: pendingDeleteRegSnapshot,
      note: "Manually removed course from student's registration.",
    });
    registrations = registrations.filter(r => String(r.id) !== String(pendingDeleteRegId));
    currStudentRegs = currStudentRegs.filter(r => String(r.id) !== String(pendingDeleteRegId));
    deleteRegModal.hide();
    renderRegCourses();
    renderCurrStudents();
  } catch (err) {
    console.error(err);
    alert("Failed to remove registration. Please try again.");
  }
}

/* ════════════════════════════════════════════════════════
   REGISTRATION HISTORY TAB  —  per-student accordion (read-only)
   ════════════════════════════════════════════════════════ */
function bindHistoryTab() {
  document.getElementById("rHistFaculty").addEventListener("change", () => { histPage = 1; onHistFacultyChange(); });
  document.getElementById("rHistDept").addEventListener("change",    () => { histPage = 1; buildHistData(); renderHistAccordion(); });
  document.getElementById("rHistLevel").addEventListener("change",   () => { histPage = 1; buildHistData(); renderHistAccordion(); });
  document.getElementById("rHistSession").addEventListener("change", () => { histPage = 1; buildHistData(); renderHistAccordion(); });
  document.getElementById("rHistSemester").addEventListener("change",() => { histPage = 1; buildHistData(); renderHistAccordion(); });
  document.getElementById("loadHistoryBtn").addEventListener("click", () => { histPage = 1; buildHistData(); renderHistAccordion(); });
  document.getElementById("rHistSearch").addEventListener("input",   () => { histPage = 1; renderHistAccordion(); });
}

function onHistFacultyChange() {
  const faculty = document.getElementById("rHistFaculty").value;
  const deptSel = document.getElementById("rHistDept");
  deptSel.innerHTML = `<option value="">All Departments</option>` +
    departments.filter(d => !faculty || d.faculty === faculty)
      .map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  buildHistData();
  renderHistAccordion();
}

function buildHistData() {
  const deptId   = document.getElementById("rHistDept").value;
  const level    = document.getElementById("rHistLevel").value;
  const session  = document.getElementById("rHistSession").value;
  const semester = document.getElementById("rHistSemester").value;

  const eligibleStudents = students.filter(s =>
    (!deptId || String(s.departmentId) === String(deptId)) &&
    (!level  || Number(s.level) === Number(level))
  );
  const eligibleIds = new Set(eligibleStudents.map(s => String(s.id)));

  const filtered = registrations.filter(r => {
    const inStudents = eligibleIds.has(String(r.studentId));
    const sessMatch  = !session  || r.session === session;
    const semMatch   = !semester || Number(r.semester) === Number(semester);
    return inStudents && sessMatch && semMatch;
  });

  const byStudent = new Map();
  filtered.forEach(reg => {
    const sid = String(reg.studentId);
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid).push(reg);
  });

  histData = Array.from(byStudent.entries())
    .map(([sid, regs]) => ({
      student: students.find(s => String(s.id) === sid),
      regs: regs.sort((a, b) => {
        if (a.session !== b.session) return a.session.localeCompare(b.session);
        return a.semester - b.semester;
      }),
    }))
    .filter(row => row.student);
}

function renderHistAccordion() {
  const q = document.getElementById("rHistSearch").value.trim().toLowerCase();
  let filtered = histData;
  if (q) {
    filtered = histData.map(row => ({
      ...row,
      regs: row.regs.filter(r => {
        const c = courses.find(co => String(co.id) === String(r.courseId));
        return `${row.student.firstName} ${row.student.lastName}`.toLowerCase().includes(q) ||
          row.student.matricNumber.toLowerCase().includes(q) ||
          (c && c.courseCode.toLowerCase().includes(q));
      }),
    })).filter(row => row.regs.length > 0);
  }

  const total = filtered.length;
  document.getElementById("rHistCount").textContent = `${total} student${total === 1 ? "" : "s"}`;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (histPage > totalPages) histPage = totalPages;
  const start = (histPage - 1) * PAGE_SIZE;
  const paged = filtered.slice(start, start + PAGE_SIZE);

  document.getElementById("histPaginationInfo").textContent =
    total ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, total)} of ${total}` : "";

  const container = document.getElementById("histAccordion");
  const empty     = document.getElementById("histRegsEmpty");

  if (!container) return;
  if (paged.length === 0) { container.innerHTML = ""; empty.classList.remove("d-none"); renderHistPagination(0); return; }
  empty.classList.add("d-none");

  container.innerHTML = paged.map((row, idx) => {
    const { student, regs } = row;
    const initials   = (student.firstName[0] + student.lastName[0]).toUpperCase();
    const collapseId = `histRegCol_${student.id}`;

    /* Group regs by session+semester */
    const groups = new Map();
    regs.forEach(r => {
      const key = `${r.session}|${r.semester}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });

    const groupHtml = Array.from(groups.entries()).map(([key, groupRegs]) => {
      const [sess, sem] = key.split("|");
      const rows = groupRegs.map(reg => {
        const course  = courses.find(c => String(c.id) === String(reg.courseId));
        const typeTag = reg.type === "carry-over"
          ? `<span class="carryover-tag">C/O</span>`
          : `<span class="status-badge status-badge--completed" style="font-size:.7rem;">Regular</span>`;
        return `<tr>
          <td class="fw-semibold">${course?.courseCode ?? "—"}</td>
          <td>${course?.courseTitle ?? "Unknown"}</td>
          <td>${course?.creditUnit ?? "—"}</td>
          <td>${typeTag}</td>
        </tr>`;
      }).join("");
      return `<div class="mb-2">
        <div class="text-muted small fw-semibold mb-1">${sess} — Semester ${sem}</div>
        <table class="table table-sm admin-table mb-0">
          <thead><tr><th>Code</th><th>Title</th><th>Credits</th><th>Type</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }).join("");

    return `<div class="hist-student-card mb-2">
      <button class="hist-student-header" type="button"
        data-bs-toggle="collapse" data-bs-target="#${collapseId}"
        aria-expanded="${idx === 0 ? "true" : "false"}" aria-controls="${collapseId}">
        <span class="d-flex align-items-center gap-2">
          <span class="student-avatar-mini">${initials}</span>
          <span>
            <span class="fw-semibold">${student.firstName} ${student.lastName}</span>
            <span class="text-muted-cell ms-2 small">${student.matricNumber}</span>
          </span>
        </span>
        <span class="hist-student-meta">
          <span class="badge bg-secondary">${regs.length} course${regs.length === 1 ? "" : "s"}</span>
          <i class="bi bi-chevron-down hist-chevron"></i>
        </span>
      </button>
      <div class="collapse ${idx === 0 ? "show" : ""}" id="${collapseId}">
        <div class="hist-student-body">${groupHtml}</div>
      </div>
    </div>`;
  }).join("");

  renderHistPagination(totalPages);
}

function renderHistPagination(totalPages) {
  const list = document.getElementById("histPaginationList");
  if (!list) return;
  if (totalPages <= 1) { list.innerHTML = ""; return; }
  let html = `<li class="page-item${histPage===1?" disabled":""}"><button class="page-link" data-page="${histPage-1}">&lsaquo;</button></li>`;
  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7 && Math.abs(i - histPage) > 2 && i !== 1 && i !== totalPages) {
      if (i === 2 || i === totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
      continue;
    }
    html += `<li class="page-item${i===histPage?" active":""}"><button class="page-link" data-page="${i}">${i}</button></li>`;
  }
  html += `<li class="page-item${histPage===totalPages?" disabled":""}"><button class="page-link" data-page="${histPage+1}">&rsaquo;</button></li>`;
  list.innerHTML = html;
  list.querySelectorAll("[data-page]").forEach(btn =>
    btn.addEventListener("click", () => { histPage = Number(btn.dataset.page); renderHistAccordion(); }));
}

function showAlert(id, msg) { const el = document.getElementById(id); if(el){ el.textContent = msg; el.classList.remove("d-none"); } }
function hideAlert(id)      { const el = document.getElementById(id); if(el){ el.textContent = "";  el.classList.add("d-none"); } }