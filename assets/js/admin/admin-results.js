import { requireAdminAuth, getCurrentAdmin, adminLogout } from "../adminAuth.js";
import {
  getStudents, getDepartments, getFaculties, getCourses,
  getRegistrations, getResults, getAcademicCalendar,
  createResult, updateResult,
  getResultSubmissions,
} from "../api.js";
import { scoreToGrade } from "../utils.js";

requireAdminAuth();

/* ── State ──────────────────────────────────────────────── */
let admin = null;
let students = [], departments = [], faculties = [], courses = [];
let registrations = [], results = [], calendar = null;
let submissions = [];   // for pending badge count
let allSessions = [];

/* Current tab */
let currSelectedStudentId = null;
let currPage = 1;
const PAGE_SIZE = 15;

/* History tab */
let histStudents = [];   // students with published results matching filters
let histPage = 1;
let editingResultId = null;

/* ── DOM refs ───────────────────────────────────────────── */
const pageState        = document.getElementById("pageState");
const pageContent      = document.getElementById("pageContent");
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar       = document.getElementById("appSidebar");
const appSidebarScrim  = document.getElementById("appSidebarScrim");
const logoutBtn        = document.getElementById("logoutBtn");
const editResultModal  = null; // initialised in init() after DOM ready
let _editResultModal;
let publishConfirmModal = null;

/* ── Boot ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    admin = getCurrentAdmin();
    if (!admin) { window.location.href = "/assets/pages/admin/admin-login.html"; return; }
    setupSidebar(); setupLogout();
    _editResultModal = new bootstrap.Modal(document.getElementById("editResultModal"));
    publishConfirmModal = new bootstrap.Modal(document.getElementById("publishConfirmModal"));
    await loadData();
    buildSessionList();
    populateFacultySelects();
    pageState.classList.add("d-none");
    pageContent.classList.remove("d-none");
    bindTabs();
    bindCurrentTab();
    bindHistoryTab();
    /* Auto-load students for current semester immediately */
    renderCurrStudents();
  } catch (err) {
    console.error(err);
    pageState.innerHTML = `<div class="alert alert-danger mb-0">Failed to load results.</div>`;
  }
}

async function loadData() {
  [students, departments, faculties, courses, registrations, results, calendar, submissions] = await Promise.all([
    getStudents(), getDepartments(), getFaculties(), getCourses(),
    getRegistrations(), getResults(), getAcademicCalendar(),
    getResultSubmissions(),
  ]);
}

function buildSessionList() {
  /* History sessions = all sessions that have any published results */
  const sessionSet = new Set(
    results
      .filter(r => r.published !== false)
      .map(r => r.session)
  );
  /* Also include all sessions from registrations so even sessions
     with no results yet still appear as filter options */
  registrations.forEach(r => sessionSet.add(r.session));
  allSessions = Array.from(sessionSet).sort().reverse();
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

function bindTabs() {
  document.getElementById("mainTabs").querySelectorAll(".nav-link").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("mainTabs").querySelectorAll(".nav-link").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.getElementById("currentTab").classList.toggle("d-none", tab !== "current");
      document.getElementById("historyTab").classList.toggle("d-none", tab !== "history");
      /* Auto-load history data the first time the history tab is opened */
      if (tab === "history") {
        histPage = 1;
        buildHistStudents();
        renderHistAccordion();
      }
    });
  });
}

/* ── Faculty/session selects ────────────────────────────── */
function populateFacultySelects() {
  const opts = faculties.map(f => `<option value="${f.name}">${f.name}</option>`).join("");
  const deptOpts = `<option value="">All Departments</option>` +
    departments.map(d => `<option value="${d.id}">${d.name}</option>`).join("");

  document.getElementById("rCurrFaculty").innerHTML = `<option value="">All Faculties</option>` + opts;
  document.getElementById("rHistFaculty").innerHTML = `<option value="">All Faculties</option>` + opts;
  document.getElementById("rCurrDept").innerHTML    = deptOpts;
  document.getElementById("rHistDept").innerHTML    = deptOpts;

  /* Current tab: locked to current session/semester */
  const currSessEl = document.getElementById("rCurrSession");
  const currSemEl  = document.getElementById("rCurrSemester");
  currSessEl.innerHTML = `<option value="${calendar.currentSession}">${calendar.currentSession}</option>`;
  currSessEl.value     = calendar.currentSession;
  currSessEl.disabled  = true;
  currSemEl.innerHTML  = `<option value="${calendar.currentSemester}">Semester ${calendar.currentSemester}</option>`;
  currSemEl.value      = String(calendar.currentSemester);
  currSemEl.disabled   = true;

  /* History tab: all sessions — session/semester always enabled */
  const histSessOpts = allSessions.map(s => `<option value="${s}">${s}</option>`).join("");
  document.getElementById("rHistSession").innerHTML = `<option value="">All Sessions</option>` + histSessOpts;
  document.getElementById("rHistSession").disabled  = false;
  document.getElementById("rHistSemester").disabled = false;

  /* Render current semester metrics */
  renderResultsMetrics();
}

function renderResultsMetrics() {
  const session  = calendar.currentSession;
  const semester = Number(calendar.currentSemester);
  const currRegs = registrations.filter(r => r.session === session && Number(r.semester) === semester);
  const regStudentIds = new Set(currRegs.map(r => String(r.studentId)));
  const published = results.filter(r => r.session === session && Number(r.semester) === semester && r.published !== false);
  const drafts    = results.filter(r => r.session === session && Number(r.semester) === semester && r.published === false);
  const pending   = currRegs.filter(reg =>
    !results.some(r =>
      String(r.studentId) === String(reg.studentId) &&
      String(r.courseId)  === String(reg.courseId) &&
      r.session === session && Number(r.semester) === semester && r.published !== false
    )
  ).length;
  const el = (id) => document.getElementById(id);
  if (el("rmRegistered")) el("rmRegistered").textContent = regStudentIds.size;
  if (el("rmPublished"))  el("rmPublished").textContent  = published.length;
  if (el("rmDrafts"))     el("rmDrafts").textContent     = drafts.length;
  if (el("rmPending"))    el("rmPending").textContent    = pending;
}

function syncActiveFilters() {
  ["rCurrFaculty","rCurrDept","rCurrLevel",
   "rHistFaculty","rHistDept","rHistLevel","rHistSession","rHistSemester"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("is-active", !!el.value);
  });
}

/* ════════════════════════════════════════════════════════
   CURRENT SEMESTER TAB  —  Upload / Publish new results
   ════════════════════════════════════════════════════════ */
function bindCurrentTab() {
  document.getElementById("rCurrFaculty").addEventListener("change", onCurrFacultyChange);
  document.getElementById("rCurrDept").addEventListener("change", onCurrDeptChange);
  document.getElementById("rCurrLevel").addEventListener("change", renderCurrStudents);
  document.getElementById("rCurrSearch").addEventListener("input", () => { currPage = 1; renderCurrStudents(); });
  document.getElementById("backToStudentsBtn").addEventListener("click", showStudentList);
  document.getElementById("saveDraftBtn").addEventListener("click", saveDraft);
  document.getElementById("saveAndPublishBtn").addEventListener("click", saveAndPublish);
  document.getElementById("publishScoresBtn").addEventListener("click", openPublishConfirm);
  document.getElementById("confirmPublishBtn").addEventListener("click", confirmPublish);
}

function onCurrFacultyChange() {
  const faculty = document.getElementById("rCurrFaculty").value;
  const deptSel = document.getElementById("rCurrDept");
  deptSel.innerHTML = `<option value="">All Departments</option>` +
    departments.filter(d => !faculty || d.faculty === faculty)
      .map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  deptSel.disabled = false;
  document.getElementById("rCurrLevel").disabled = false;
  syncActiveFilters();
  renderCurrStudents();
}

function onCurrDeptChange() {
  document.getElementById("rCurrLevel").disabled = false;
  syncActiveFilters();
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

/* ════════════════════════════════════════════════════════
   RESULT HISTORY TAB  —  Edit past results, per-student accordion
   ════════════════════════════════════════════════════════ */
function bindHistoryTab() {
  document.getElementById("rHistFaculty").addEventListener("change", onHistFacultyChange);
  document.getElementById("rHistDept").addEventListener("change", onHistDeptChange);
  document.getElementById("rHistLevel").addEventListener("change",   () => { histPage = 1; buildHistStudents(); renderHistAccordion(); });
  document.getElementById("rHistSession").addEventListener("change", () => { histPage = 1; buildHistStudents(); renderHistAccordion(); });
  document.getElementById("rHistSemester").addEventListener("change",() => { histPage = 1; buildHistStudents(); renderHistAccordion(); });
  document.getElementById("rHistSearch").addEventListener("input",   () => { histPage = 1; renderHistAccordion(); });
  document.getElementById("editResultForm").addEventListener("submit", handleEditResultSubmit);
}

function onHistFacultyChange() {
  const faculty = document.getElementById("rHistFaculty").value;
  const deptSel = document.getElementById("rHistDept");
  deptSel.innerHTML = `<option value="">All Departments</option>` +
    departments.filter(d => !faculty || d.faculty === faculty)
      .map(d => `<option value="${d.id}">${d.name}</option>`).join("");
  syncActiveFilters();
  histPage = 1;
  buildHistStudents();
  renderHistAccordion();
}

function onHistDeptChange() {
  syncActiveFilters();
  histPage = 1;
  buildHistStudents();
  renderHistAccordion();
}

function loadHistory() {
  document.getElementById("histFilterPrompt").classList.add("d-none");
  document.getElementById("histResultsArea").classList.remove("d-none");
  histPage = 1;
  buildHistStudents();
  renderHistAccordion();
}

function buildHistStudents() {
  const deptId   = document.getElementById("rHistDept").value;
  const level    = document.getElementById("rHistLevel").value;
  const session  = document.getElementById("rHistSession").value;
  const semester = document.getElementById("rHistSemester").value;

  histStudents = students
    .filter(s =>
      // dept filter is now optional — empty string means all departments
      (!deptId || String(s.departmentId) === String(deptId)) &&
      (!level  || Number(s.level) === Number(level))
    )
    .map(s => {
      const studentResults = results.filter(r => {
        const sessMatch   = !session  || r.session === session;
        const semMatch    = !semester || Number(r.semester) === Number(semester);
        const isPublished = r.published !== false;
        return String(r.studentId) === String(s.id) && sessMatch && semMatch && isPublished;
      }).map(r => ({
        ...r,
        course: courses.find(c => String(c.id) === String(r.courseId)),
        grade:  scoreToGrade(r.score).grade,
      }));
      return { student: s, results: studentResults };
    })
    .filter(row => row.results.length > 0);
}

function renderHistAccordion() {
  const q = document.getElementById("rHistSearch").value.trim().toLowerCase();

  let filtered = histStudents;
  if (q) {
    filtered = histStudents
      .map(row => ({
        ...row,
        results: row.results.filter(r =>
          (r.course && r.course.courseCode.toLowerCase().includes(q)) ||
          `${row.student.firstName} ${row.student.lastName}`.toLowerCase().includes(q) ||
          row.student.matricNumber.toLowerCase().includes(q)
        ),
      }))
      .filter(row => row.results.length > 0);
  }

  const totalStudents = filtered.length;
  const totalResults  = filtered.reduce((sum, row) => sum + row.results.length, 0);
  document.getElementById("rHistCount").textContent =
    `${totalStudents} student${totalStudents === 1 ? "" : "s"} · ${totalResults} result${totalResults === 1 ? "" : "s"}`;

  const totalPages = Math.max(1, Math.ceil(totalStudents / PAGE_SIZE));
  if (histPage > totalPages) histPage = totalPages;
  const start = (histPage - 1) * PAGE_SIZE;
  const paged = filtered.slice(start, start + PAGE_SIZE);

  document.getElementById("histPaginationInfo").textContent =
    totalStudents ? `Showing ${start + 1}–${Math.min(start + PAGE_SIZE, totalStudents)} of ${totalStudents}` : "";

  const container = document.getElementById("histAccordion");
  const empty     = document.getElementById("histResultsEmpty");

  if (paged.length === 0) { container.innerHTML = ""; empty.classList.remove("d-none"); renderHistPagination(0); return; }
  empty.classList.add("d-none");

  container.innerHTML = paged.map((row, idx) => {
    const { student, results: sResults } = row;
    const initials  = (student.firstName[0] + student.lastName[0]).toUpperCase();
    const accordId  = `histAcc_${student.id}`;
    const collapseId = `histCol_${student.id}`;

    /* Group results by session+semester */
    const groups = groupResultsBySessionSem(sResults);

    const groupHtml = groups.map(g => `
      <div class="mb-2">
        <div class="text-muted small fw-semibold mb-1">${g.session} — Semester ${g.semester}</div>
        <div class="hist-table-scroll">
          <table class="table table-sm admin-table mb-0">
            <thead><tr><th>Code</th><th>Title</th><th>Credits</th><th>Score</th><th>Grade</th><th class="text-end">Edit</th></tr></thead>
            <tbody>
              ${g.results.map(r => {
                const gc = r.grade.toLowerCase();
                return `<tr>
                  <td class="fw-semibold">${r.course?.courseCode ?? "—"}</td>
                  <td>${r.course?.courseTitle ?? "Unknown"}</td>
                  <td>${r.course?.creditUnit ?? "—"}</td>
                  <td class="fw-semibold">${r.score}</td>
                  <td><span class="badge-grade badge-grade--${gc}">${r.grade}</span></td>
                  <td class="text-end">
                    <button class="btn btn-secondary-outline btn-sm" data-hist-edit="${r.id}" title="Edit score"><i class="bi bi-pencil"></i></button>
                  </td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>`).join("");

    return `
      <div class="hist-student-card mb-2" id="${accordId}">
        <button class="hist-student-header" type="button"
          data-bs-toggle="collapse" data-bs-target="#${collapseId}"
          aria-expanded="false" aria-controls="${collapseId}">
          <span class="d-flex align-items-center gap-2">
            <span class="student-avatar-mini">${initials}</span>
            <span>
              <span class="fw-semibold">${student.firstName} ${student.lastName}</span>
              <span class="text-muted-cell ms-2 small">${student.matricNumber}</span>
            </span>
          </span>
          <span class="hist-student-meta">
            <span class="badge bg-secondary">${sResults.length} result${sResults.length === 1 ? "" : "s"}</span>
            <i class="bi bi-chevron-down hist-chevron"></i>
          </span>
        </button>
        <div class="collapse" id="${collapseId}">
          <div class="hist-student-body">${groupHtml}</div>
        </div>
      </div>`;
  }).join("");

  /* Bind edit buttons */
  container.querySelectorAll("[data-hist-edit]").forEach(btn =>
    btn.addEventListener("click", () => openEditResultModal(btn.dataset.histEdit)));

  /* Scroll-end indicator: hide the right-edge gradient when the user
     has scrolled to the end of each .hist-table-scroll container */
  container.querySelectorAll(".hist-table-scroll").forEach(wrap => {
    const update = () => {
      const atEnd = wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 2;
      wrap.classList.toggle("scroll-end", atEnd);
    };
    // Set initial state (table may already fit without scrolling)
    update();
    wrap.addEventListener("scroll", update, { passive: true });
  });

  renderHistPagination(totalPages);
}

function groupResultsBySessionSem(resultArr) {
  const map = new Map();
  resultArr.forEach(r => {
    const key = `${r.session}|${r.semester}`;
    if (!map.has(key)) map.set(key, { session: r.session, semester: r.semester, results: [] });
    map.get(key).results.push(r);
  });
  return Array.from(map.values()).sort((a, b) =>
    a.session !== b.session ? a.session.localeCompare(b.session) : a.semester - b.semester
  );
}

function renderHistPagination(totalPages) {
  const list = document.getElementById("histPaginationList");
  if (totalPages <= 1) { list.innerHTML = ""; return; }
  let html = `<li class="page-item${histPage === 1 ? " disabled" : ""}"><button class="page-link" data-page="${histPage - 1}">&lsaquo;</button></li>`;
  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7 && Math.abs(i - histPage) > 2 && i !== 1 && i !== totalPages) {
      if (i === 2 || i === totalPages - 1) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
      continue;
    }
    html += `<li class="page-item${i === histPage ? " active" : ""}"><button class="page-link" data-page="${i}">${i}</button></li>`;
  }
  html += `<li class="page-item${histPage === totalPages ? " disabled" : ""}"><button class="page-link" data-page="${histPage + 1}">&rsaquo;</button></li>`;
  list.innerHTML = html;
  list.querySelectorAll("[data-page]").forEach(btn =>
    btn.addEventListener("click", () => { histPage = Number(btn.dataset.page); renderHistAccordion(); }));
}

function openEditResultModal(id) {
  const r = results.find(res => String(res.id) === String(id));
  if (!r) return;
  editingResultId = id;
  const student = students.find(s => String(s.id) === String(r.studentId));
  const course  = courses.find(c => String(c.id) === String(r.courseId));
  document.getElementById("editResultMeta").textContent =
    `${student ? student.firstName + " " + student.lastName : "Unknown"} · ${course?.courseCode ?? "?"} · ${r.session} Sem ${r.semester}`;
  document.getElementById("editResultScore").value = r.score;
  hideAlert("editResultAlert");
  _editResultModal.show();
}

async function handleEditResultSubmit(e) {
  e.preventDefault();
  hideAlert("editResultAlert");
  const score = Number(document.getElementById("editResultScore").value);
  if (isNaN(score) || score < 0 || score > 100) {
    showAlert("editResultAlert", "Score must be between 0 and 100.");
    return;
  }
  try {
    const updated = await updateResult(editingResultId, { score });
    const idx = results.findIndex(r => String(r.id) === String(editingResultId));
    results[idx] = { ...results[idx], ...updated };
    buildHistStudents();
    renderHistAccordion();
    _editResultModal.hide();
  } catch (err) {
    console.error(err);
    showAlert("editResultAlert", "Failed to update result. Please try again.");
  }
}

function showAlert(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.remove("d-none"); }
function hideAlert(id)      { const el = document.getElementById(id); el.textContent = "";  el.classList.add("d-none"); }

/* ── Save Draft (saves scores, published=false, invisible to students) ── */
/* ── Save & Publish (saves scores, published=true, immediately visible) ── */
async function saveAndPublish() {
  await persistScores({ publishImmediately: true });
}

/**
 * Core score persistence logic shared by Save Draft and Save & Publish.
 *
 * publishImmediately=false → stores published:false (draft, invisible to students)
 * publishImmediately=true  → stores published:true  (live immediately, no second step needed)
 *
 * IMPORTANT: studentId is always coerced to a Number before writing so that
 * all result records share the same type as the seeded data. json-server
 * beta.15 uses strict type matching on filter queries — if some records store
 * studentId as a string and others as a number, ?studentId=1 only returns
 * one set and the student portal silently misses the other.
 */
async function persistScores({ publishImmediately }) {
  const { session, semester } = getCurrFilters();
  const studentId  = Number(currSelectedStudentId); // always Number — matches seeded data type
  const rows       = Array.from(document.getElementById("scoreTbody").querySelectorAll("tr"));
  const saveBtn    = document.getElementById("saveDraftBtn");
  const pubBtn     = document.getElementById("saveAndPublishBtn");
  const statusEl   = document.getElementById("scorePublishStatus");
  const jobs       = [];

  rows.forEach(row => {
    const inp = row.querySelector(".score-input");
    const val = inp.value.trim();
    if (val === "") return;
    const score    = Number(val);
    if (isNaN(score) || score < 0 || score > 100) return;
    const courseId = Number(row.dataset.courseId); // Number to match seeded type
    const resultId = row.dataset.resultId;
    const level    = Number(row.dataset.level);
    const published = publishImmediately ? true : false;

    if (resultId) {
      /* Update existing record */
      const existing = results.find(r => String(r.id) === String(resultId));
      // When publishing, always set true; when drafting, don't downgrade an already-published record
      const newPublished = publishImmediately ? true : (existing?.published === true ? true : false);
      jobs.push(
        updateResult(resultId, { score, published: newPublished }).then(upd => {
          const idx = results.findIndex(r => String(r.id) === String(resultId));
          if (idx !== -1) results[idx] = { ...results[idx], ...upd };
          markRowStatus(row, newPublished);
        })
      );
    } else {
      /* Create new record */
      jobs.push(
        createResult({ studentId, courseId, session, semester, level, score, published }).then(created => {
          results.push(created);
          row.dataset.resultId = created.id;
          markRowStatus(row, published);
        })
      );
    }
  });

  if (jobs.length === 0) { statusEl.textContent = "No scores to save."; return; }

  saveBtn.disabled = true;
  pubBtn.disabled  = true;
  statusEl.innerHTML = `<span class="text-muted"><i class="bi bi-hourglass-split"></i> Saving…</span>`;

  try {
    await Promise.all(jobs);
    if (publishImmediately) {
      statusEl.innerHTML =
        `<span class="text-success"><i class="bi bi-check-circle-fill"></i> ${jobs.length} score${jobs.length === 1 ? "" : "s"} saved and published to the student portal.</span>`;
    } else {
      statusEl.innerHTML =
        `<span class="text-success"><i class="bi bi-floppy-fill"></i> ${jobs.length} score${jobs.length === 1 ? "" : "s"} saved as draft. Use "Save &amp; Publish" to make visible to students.</span>`;
    }
    renderCurrStudents();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Some scores failed to save. Please try again.";
  } finally {
    saveBtn.disabled = false;
    pubBtn.disabled  = false;
  }
}

/* ── Publish confirm ─────────────────────────────────────── */
function markRowStatus(row, published) {
  if (published) {
    row.classList.remove("table-warning");
    row.classList.add("table-success");
    row.querySelector("td:last-child").innerHTML =
      `<span class="status-badge status-badge--completed">Published</span>`;
  } else {
    row.classList.remove("table-success");
    row.classList.add("table-warning");
    row.querySelector("td:last-child").innerHTML =
      `<span class="status-badge status-badge--pending" style="background:var(--warn-100);color:var(--warn);">Draft</span>`;
  }
}

/* ════════════════════════════════════════════════════════
   CURRENT SEMESTER — COURSE-CENTRIC VIEW (overrides old per-student version)
   Shows each unique course registered this semester.
   • Courses with a lecturer submission → "Review in Approvals"
   • Courses with NO submission → "Enter Scores" (direct admin entry)
   ════════════════════════════════════════════════════════ */
function renderCurrStudents() {
  const { deptId, level, session, semester } = getCurrFilters();

  document.getElementById("scoreEntryPanel").classList.add("d-none");
  document.getElementById("currFilterPrompt").classList.add("d-none");
  document.getElementById("currStudentArea").classList.remove("d-none");

  /* Get all registrations for this session/semester */
  let semRegs = registrations.filter(r =>
    r.session === session && Number(r.semester) === semester
  );

  /* Optional dept/level filters */
  if (deptId || level) {
    const filteredStudentIds = new Set(
      students.filter(s =>
        (!deptId || String(s.departmentId) === String(deptId)) &&
        (!level  || Number(s.level) === Number(level))
      ).map(s => String(s.id))
    );
    semRegs = semRegs.filter(r => filteredStudentIds.has(String(r.studentId)));
  }

  /* Build unique course list */
  const courseMap = new Map();
  semRegs.forEach(reg => {
    const cId = String(reg.courseId);
    if (!courseMap.has(cId)) {
      courseMap.set(cId, { courseId: cId, studentIds: new Set() });
    }
    courseMap.get(cId).studentIds.add(String(reg.studentId));
  });

  /* Search filter */
  const q = (document.getElementById("rCurrSearch")?.value || "").trim().toLowerCase();

  let courseRows = Array.from(courseMap.values())
    .map(row => {
      const course = courses.find(c => String(c.id) === String(row.courseId));
      return { ...row, course };
    })
    .filter(row => row.course)
    .filter(row => !q ||
      row.course.courseCode.toLowerCase().includes(q) ||
      row.course.courseTitle.toLowerCase().includes(q)
    )
    .sort((a, b) => a.course.courseCode.localeCompare(b.course.courseCode));

  document.getElementById("rCurrStudentCount").textContent =
    `${courseRows.length} course${courseRows.length === 1 ? "" : "s"}`;

  const totalPages = Math.max(1, Math.ceil(courseRows.length / PAGE_SIZE));
  if (currPage > totalPages) currPage = totalPages;
  const start = (currPage - 1) * PAGE_SIZE;
  const paged = courseRows.slice(start, start + PAGE_SIZE);

  document.getElementById("currPaginationInfo").textContent =
    courseRows.length ? `Showing ${start+1}–${Math.min(start+PAGE_SIZE, courseRows.length)} of ${courseRows.length}` : "";

  const tbody = document.getElementById("currStudentsTbody");
  const empty = document.getElementById("currStudentsEmpty");

  if (paged.length === 0) { tbody.innerHTML = ""; empty.classList.remove("d-none"); renderCurrPagination(0); return; }
  empty.classList.add("d-none");

  tbody.innerHTML = paged.map(row => {
    const { course, studentIds } = row;

    /* Check if a submission exists for this course/session/semester */
    const sub = submissions.find(s =>
      String(s.courseId) === String(course.id) &&
      s.session === session &&
      Number(s.semester) === semester
    );

    /* Submission status badge */
    let subBadge, actionBtn;
    if (sub) {
      const badgeStyle = {
        pending:  "background:var(--warn-100);color:var(--warn);",
        approved: "background:var(--success-100);color:var(--success);",
        rejected: "background:var(--danger-100);color:var(--danger);",
      }[sub.status] || "";
      const icon = {
        pending: "bi-hourglass-split",
        approved: "bi-check-circle-fill",
        rejected: "bi-x-circle-fill",
      }[sub.status] || "bi-circle";
      subBadge = `<span class="status-badge" style="${badgeStyle}"><i class="bi ${icon} me-1"></i>${sub.status}</span>`;
      actionBtn = `<a href="/assets/pages/admin/admin-approvals.html" class="btn btn-secondary-outline btn-sm">
        <i class="bi bi-eye"></i> Review in Approvals
      </a>`;
    } else {
      subBadge = `<span class="status-badge status-badge--pending">No submission</span>`;
      actionBtn = `<button class="btn btn-brand btn-sm" data-action="enter" data-course-id="${course.id}">
        <i class="bi bi-pencil-square"></i> Enter Scores
      </button>`;
    }

    return `<tr>
      <td class="fw-semibold">${course.courseCode}</td>
      <td>${course.courseTitle}</td>
      <td>${course.level}</td>
      <td>${studentIds.size}</td>
      <td>${subBadge}</td>
      <td class="text-end">${actionBtn}</td>
    </tr>`;
  }).join("");

  /* Wire Enter Scores buttons */
  tbody.querySelectorAll("[data-action='enter']").forEach(btn =>
    btn.addEventListener("click", () => openScoreEntryByCourse(btn.dataset.courseId))
  );

  renderCurrPagination(totalPages);
}

/* ── Score entry by course (no submission) ──────────────── */
function openScoreEntryByCourse(courseId) {
  const { session, semester } = getCurrFilters();
  const course = courses.find(c => String(c.id) === String(courseId));
  if (!course) return;

  currSelectedStudentId = null;   // not used in course-based entry
  document.getElementById("currStudentArea").classList.add("d-none");
  document.getElementById("scoreEntryPanel").classList.remove("d-none");
  document.getElementById("scoreStudentName").textContent = `${course.courseCode} — ${course.courseTitle}`;
  document.getElementById("scoreStudentMeta").textContent = `${session}, Semester ${semester} · ${course.level} Level · Direct admin entry`;
  document.getElementById("scorePublishStatus").textContent = "";

  /* Get all students registered for this course */
  const courseRegs = registrations.filter(r =>
    String(r.courseId) === String(courseId) &&
    r.session === session && Number(r.semester) === semester
  );

  const tbody = document.getElementById("scoreTbody");
  tbody.innerHTML = courseRegs.map(reg => {
    const student = students.find(s => String(s.id) === String(reg.studentId));
    if (!student) return "";
    const existing = results.find(r =>
      String(r.studentId) === String(student.id) &&
      String(r.courseId)  === String(courseId) &&
      r.session === session && Number(r.semester) === semester
    );
    const score = existing ? existing.score : "";
    const grade = existing ? scoreToGrade(existing.score).grade : "—";
    let statusLabel;
    if (!existing) {
      statusLabel = `<span class="status-badge status-badge--pending">Pending</span>`;
    } else if (existing.published === false) {
      statusLabel = `<span class="status-badge status-badge--pending" style="background:var(--warn-100);color:var(--warn);">Draft</span>`;
    } else {
      statusLabel = `<span class="status-badge status-badge--completed">Published</span>`;
    }
    const rowClass = existing ? (existing.published === false ? "table-warning" : "table-success") : "";
    return `<tr class="${rowClass}"
      data-student-id="${student.id}"
      data-course-id="${courseId}"
      data-result-id="${existing ? existing.id : ""}"
      data-level="${course.level}">
      <td class="fw-semibold">${student.firstName} ${student.lastName}</td>
      <td class="text-muted-cell">${student.matricNumber}</td>
      <td colspan="2">
        <input type="number" class="form-control form-control-sm score-input" style="width:90px"
          min="0" max="100" value="${score}" placeholder="0–100">
      </td>
      <td class="grade-cell fw-semibold">${grade}</td>
      <td>${statusLabel}</td>
    </tr>`;
  }).join("");

  /* Update table header to match new column layout */
  tbody.closest("table").querySelector("thead tr").innerHTML =
    `<th>Student</th><th>Matric No.</th><th>Score (0–100)</th><th></th><th>Grade</th><th>Status</th>`;

  /* Live grade preview */
  tbody.querySelectorAll(".score-input").forEach(inp => {
    inp.addEventListener("input", () => {
      const row = inp.closest("tr");
      const val = inp.value.trim();
      row.querySelector(".grade-cell").textContent = val === "" ? "—" : scoreToGrade(Number(val)).grade;
    });
  });
}

/* ── Override showStudentList to go back to course list ─── */
function showStudentList() {
  document.getElementById("scoreEntryPanel").classList.add("d-none");
  document.getElementById("currStudentArea").classList.remove("d-none");
  currSelectedStudentId = null;
  renderCurrStudents();
}

/* ── Override saveDraft for course-based entry ──────────── */
async function saveDraft() {
  const { session, semester } = getCurrFilters();
  const rows     = Array.from(document.getElementById("scoreTbody").querySelectorAll("tr"));
  const saveBtn  = document.getElementById("saveDraftBtn");
  const statusEl = document.getElementById("scorePublishStatus");
  const jobs     = [];

  rows.forEach(row => {
    const inp = row.querySelector(".score-input");
    if (!inp) return;
    const val = inp.value.trim();
    if (val === "") return;
    const score     = Number(val);
    if (isNaN(score) || score < 0 || score > 100) return;
    const studentId = row.dataset.studentId;
    const courseId  = row.dataset.courseId;
    const resultId  = row.dataset.resultId;
    const level     = Number(row.dataset.level);

    if (resultId) {
      const existing = results.find(r => String(r.id) === String(resultId));
      const alreadyPublished = existing?.published === true;
      jobs.push(
        updateResult(resultId, { score, published: alreadyPublished }).then(upd => {
          const idx = results.findIndex(r => String(r.id) === String(resultId));
          if (idx !== -1) results[idx] = { ...results[idx], ...upd };
          markRowDraft(row, alreadyPublished);
        })
      );
    } else {
      jobs.push(
        createResult({ studentId: Number(studentId), courseId: Number(courseId), session, semester, level, score, published: false }).then(created => {
          results.push(created);
          row.dataset.resultId = created.id;
          markRowDraft(row, false);
        })
      );
    }
  });

  if (jobs.length === 0) { statusEl.textContent = "No scores to save."; return; }
  saveBtn.disabled = true;
  statusEl.innerHTML = `<span class="text-muted"><i class="bi bi-hourglass-split"></i> Saving…</span>`;
  try {
    await Promise.all(jobs);
    statusEl.innerHTML = `<span class="text-success"><i class="bi bi-floppy-fill"></i> ${jobs.length} score${jobs.length === 1 ? "" : "s"} saved as draft.</span>`;
    renderResultsMetrics();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Some scores failed to save. Please try again.";
  } finally { saveBtn.disabled = false; }
}

/* ── Override openPublishConfirm for course-based entry ─── */
function openPublishConfirm() {
  const { session, semester } = getCurrFilters();

  /* Gather courseId from first data row */
  const firstRow = document.querySelector("#scoreTbody tr[data-course-id]");
  if (!firstRow) return;
  const courseId = firstRow.dataset.courseId;
  const course   = courses.find(c => String(c.id) === String(courseId));

  const draftCount = results.filter(r =>
    String(r.courseId) === String(courseId) &&
    r.session === session && Number(r.semester) === semester &&
    r.published === false
  ).length;

  const unsavedCount = Array.from(document.querySelectorAll("#scoreTbody .score-input")).filter(i =>
    i.value.trim() !== "" && !i.closest("tr").dataset.resultId
  ).length;

  if (draftCount === 0 && unsavedCount === 0) {
    document.getElementById("scorePublishStatus").innerHTML =
      `<span class="text-muted">No draft scores to publish. Save scores first.</span>`;
    return;
  }
  if (unsavedCount > 0 && draftCount === 0) {
    document.getElementById("scorePublishStatus").innerHTML =
      `<span class="text-warning"><i class="bi bi-exclamation-triangle-fill"></i> Click <strong>Save Draft</strong> first, then Publish.</span>`;
    return;
  }

  document.getElementById("publishConfirmBody").textContent =
    `This will publish ${draftCount} draft result${draftCount === 1 ? "" : "s"} for ${course?.courseCode ?? "this course"} to the student portal.`;
  publishConfirmModal.show();
}

/* ── Override confirmPublish for course-based entry ─────── */
async function confirmPublish() {
  const { session, semester } = getCurrFilters();
  const statusEl  = document.getElementById("scorePublishStatus");
  const confirmBtn = document.getElementById("confirmPublishBtn");

  /* Get all draft results visible in the score table */
  const firstRow = document.querySelector("#scoreTbody tr[data-course-id]");
  if (!firstRow) return;
  const courseId = firstRow.dataset.courseId;

  const drafts = results.filter(r =>
    String(r.courseId) === String(courseId) &&
    r.session === session && Number(r.semester) === semester &&
    r.published === false
  );

  if (drafts.length === 0) { publishConfirmModal.hide(); statusEl.textContent = "No drafts to publish."; return; }

  confirmBtn.disabled = true;
  confirmBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Publishing…`;

  try {
    await Promise.all(drafts.map(r =>
      updateResult(r.id, { published: true }).then(upd => {
        const idx = results.findIndex(res => String(res.id) === String(r.id));
        if (idx !== -1) results[idx] = { ...results[idx], ...upd, published: true };
      })
    ));
    publishConfirmModal.hide();
    statusEl.innerHTML = `<span class="text-success"><i class="bi bi-check-circle-fill"></i> ${drafts.length} result${drafts.length === 1 ? "" : "s"} published.</span>`;
    /* Refresh score table status column */
    openScoreEntryByCourse(courseId);
    renderCurrStudents();
    renderResultsMetrics();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Failed to publish. Please try again.";
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = `<i class="bi bi-cloud-upload"></i> Yes, Publish`;
  }
}