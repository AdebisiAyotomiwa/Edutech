import { requireAdminAuth, getCurrentAdmin, adminLogout } from "../adminAuth.js";
import { getResultSubmissions, changePassword } from "../api.js";

requireAdminAuth();

let admin       = null;
let submissions = [];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    admin = getCurrentAdmin();
    if (!admin) { window.location.href = "/assets/pages/admin/admin-login.html"; return; }

    /* Load submissions only for the pending badge count */
    submissions = await getResultSubmissions();

    setupSidebar();
    setupLogout();
    setupChangePassword();

    document.getElementById("pageLoading").classList.add("d-none");
    document.getElementById("pageContent").classList.remove("d-none");

    renderProfile();
  } catch (err) {
    console.error(err);
    document.getElementById("pageLoading").innerHTML =
      `<div class="alert alert-danger mb-0">Failed to load profile.</div>`;
  }
}

/* ── Sidebar ────────────────────────────────────────────── */
function setupSidebar() {
  const initials = (admin.name || "A").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

  document.getElementById("sidebarAvatarInitials").textContent = initials;
  document.getElementById("sidebarUserName").textContent       = admin.name  || "Admin";
  document.getElementById("sidebarUserMeta").textContent       = admin.email || "";
  document.getElementById("topbarAvatarInitials").textContent  = initials;
  document.getElementById("topbarUserName").textContent        = admin.name  || "Admin";

  /* Pending approval badge */
  const pendingCount = submissions.filter(s => s.status === "pending").length;
  const badge = document.getElementById("sidebarPendingBadge");
  if (badge && pendingCount > 0) { badge.textContent = pendingCount; badge.style.display = ""; }

  /* Mobile drawer */
  const toggle  = document.getElementById("sidebarToggleBtn");
  const sidebar = document.getElementById("appSidebar");
  const scrim   = document.getElementById("appSidebarScrim");

  const open  = () => { sidebar.classList.add("is-open");    scrim.classList.add("is-open");    toggle.setAttribute("aria-expanded", "true");  };
  const close = () => { sidebar.classList.remove("is-open"); scrim.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); };

  toggle.addEventListener("click", () => sidebar.classList.contains("is-open") ? close() : open());
  scrim.addEventListener("click", close);
  sidebar.querySelectorAll(".app-sidebar-link").forEach(link => link.addEventListener("click", close));
}

/* ── Logout ─────────────────────────────────────────────── */
function setupLogout() {
  const modal = new bootstrap.Modal(document.getElementById("logoutConfirmModal"));
  document.getElementById("logoutBtn").addEventListener("click", () => modal.show());
  document.getElementById("confirmLogoutBtn").addEventListener("click", () => {
    adminLogout();
    window.location.href = "/assets/pages/admin/admin-login.html";
  });
}

/* ── Render profile ─────────────────────────────────────── */
function renderProfile() {
  const initials = (admin.name || "A").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  document.getElementById("profileAvatarInitials").textContent = initials;
  document.getElementById("profileFullName").textContent       = admin.name  || "—";
  document.getElementById("profileName").textContent           = admin.name  || "—";
  document.getElementById("profileEmail").textContent          = admin.email || "—";
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
      const input  = document.getElementById(btn.dataset.pwToggle);
      const hidden = input.type === "password";
      input.type   = hidden ? "text" : "password";
      btn.querySelector("i").className = hidden ? "bi bi-eye-slash" : "bi bi-eye";
    });
  });

  saveBtn.addEventListener("click", async () => {
    showAlert("", "");
    const current = document.getElementById("pwCurrent").value.trim();
    const next    = document.getElementById("pwNew").value;
    const confirm = document.getElementById("pwConfirm").value;

    /* Client-side validation */
    if (!current)        return showAlert("Please enter your current password.", "danger");
    if (next.length < 6) return showAlert("New password must be at least 6 characters.", "danger");
    if (next !== confirm) return showAlert("New passwords do not match.", "danger");
    if (next === current) return showAlert("New password must differ from the current one.", "danger");

    setSaving(true);
    try {
      const result = await changePassword({
        collection: "admins",
        id: admin.id,
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
