import { requireAuth, getCurrentStudent, logout } from "./auth.js";
import { getDepartmentById } from "./api.js";
import { initTopbar } from "./topbar.js";

/* Normalise a profile image path to an absolute URL so it resolves
   correctly regardless of which sub-folder the page lives in.
   "assets/images/image/foo.jpg"  → "/assets/images/image/foo.jpg"
   "/assets/images/image/foo.jpg" → "/assets/images/image/foo.jpg"  (unchanged)
   ""  or null                    → ""  (caller treats as "no image") */
function resolveImagePath(raw) {
  if (!raw || !raw.trim()) return "";
  if (raw.startsWith("/") || raw.startsWith("http")) return raw;
  return "/" + raw;
}

/* ========================================================
   Protect Profile Page
======================================================== */
requireAuth();

/* ========================================================
   Global State
======================================================== */
let student = null;
let department = null;

/* ========================================================
   DOM Elements
======================================================== */
const profileLoading = document.getElementById("profileLoading");
const profileContent = document.getElementById("profileContent");

const sidebarUserName = document.getElementById("sidebarUserName");
const sidebarUserMeta = document.getElementById("sidebarUserMeta");
const sidebarAvatarImg = document.getElementById("sidebarAvatarImg");
const sidebarAvatarInitials = document.getElementById("sidebarAvatarInitials");

const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar = document.getElementById("appSidebar");
const appSidebarScrim = document.getElementById("appSidebarScrim");

const logoutBtn = document.getElementById("logoutBtn");

const profileAvatarImg = document.getElementById("profileAvatarImg");
const profileAvatarInitials = document.getElementById("profileAvatarInitials");

/* ========================================================
   Start
======================================================== */
document.addEventListener("DOMContentLoaded", initProfilePage);

async function initProfilePage() {
  try {
    student = getCurrentStudent();

    if (!student) {
      window.location.href = "/index.html";
      return;
    }

    initialiseSidebar();
    initialiseLogout();

    department = await getDepartmentById(student.departmentId);

    profileLoading.classList.add("d-none");
    profileContent.classList.remove("d-none");

    renderProfile();
  } catch (error) {
    console.error(error);
    profileLoading.innerHTML = `
      <div class="alert alert-danger mb-0">Failed to load profile.</div>
    `;
  }
}

/* ========================================================
   Sidebar / Logout
======================================================== */
function initialiseSidebar() {
  sidebarUserName.textContent = `${student.firstName} ${student.lastName}`;
  sidebarUserMeta.textContent = student.matricNumber;
  const initials = student.firstName.charAt(0) + student.lastName.charAt(0);
  if (student.profileImage && student.profileImage.trim() !== "") {
    sidebarAvatarImg.src = resolveImagePath(student.profileImage);
    sidebarAvatarImg.onerror = () => { sidebarAvatarImg.classList.add("d-none"); sidebarAvatarInitials.style.display = "flex"; sidebarAvatarInitials.textContent = initials; };
    sidebarAvatarImg.classList.remove("d-none"); sidebarAvatarInitials.style.display = "none";
  } else { sidebarAvatarInitials.style.display = "flex"; sidebarAvatarInitials.textContent = initials; }
  initTopbar(student);
}

function initialiseLogout() {
  const modal = new bootstrap.Modal(document.getElementById("logoutConfirmModal"));
  logoutBtn.addEventListener("click", () => modal.show());
  document.getElementById("confirmLogoutBtn").addEventListener("click", () => {
    logout(); window.location.href = "/index.html";
  });
}

/* ========================================================
   Render Profile
======================================================== */
function renderProfile() {
  const initials = student.firstName.charAt(0) + student.lastName.charAt(0);

  // Same fallback pattern as the sidebar: attempt the photo, fall back
  // to initials cleanly if the file doesn't exist yet (or ever fails
  // to load) — layout never breaks either way.
  if (student.profileImage && student.profileImage.trim() !== "") {
    profileAvatarImg.src = resolveImagePath(student.profileImage);
    profileAvatarImg.onerror = () => {
      profileAvatarImg.classList.add("d-none");
      profileAvatarInitials.style.display = "flex";
      profileAvatarInitials.textContent = initials;
    };
    profileAvatarImg.classList.remove("d-none");
    profileAvatarInitials.style.display = "none";
  } else {
    profileAvatarInitials.style.display = "flex";
    profileAvatarInitials.textContent = initials;
  }

  document.getElementById("profileFullName").textContent =
    `${student.firstName} ${student.lastName}${student.otherName ? " " + student.otherName : ""}`;
  document.getElementById("profileMatric").textContent = student.matricNumber;

  document.getElementById("profileEmail").textContent = student.email;
  document.getElementById("profilePhone").textContent = student.phone;
  document.getElementById("profileGender").textContent = student.gender;
  document.getElementById("profileDepartment").textContent = department?.name ?? "N/A";
  document.getElementById("profileProgramme").textContent = student.programme;
  document.getElementById("profileLevel").textContent = `${student.level} Level`;
  document.getElementById("profileAdmissionYear").textContent = student.admissionYear;
  document.getElementById("profileStatus").textContent = student.status;
}