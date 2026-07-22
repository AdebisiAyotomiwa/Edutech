import {
    getCurrentStudent,
    logout,
    requireAuth
} from "./auth.js";

import { getStudentDisplayName } from "./utils.js";
/* =========================================================
   Protect this page
========================================================= */

requireAuth();

/* =========================================================
   Get logged in student
========================================================= */

const student = getCurrentStudent();

/* =========================================================
   DOM
========================================================= */

const welcomeName = document.querySelector("#welcomeName");

const profileAvatarImg = document.querySelector("#profileAvatarImg");
const profileAvatarInitials = document.querySelector("#profileAvatarInitials");

const logoutBtn = document.querySelector("#logoutBtn");


/* =========================================================
   Populate page
========================================================= */

if (student) {

    welcomeName.textContent = getStudentDisplayName(student);

    if (student.profileImage) {

        profileAvatarImg.src = student.profileImage;

        profileAvatarImg.alt =
            `${student.firstName} ${student.lastName}`;

        profileAvatarImg.classList.remove("d-none");

        profileAvatarInitials.classList.add("d-none");

    } else {

        const initials =
            student.firstName.charAt(0).toUpperCase() +
            student.lastName.charAt(0).toUpperCase();

        profileAvatarInitials.textContent = initials;

    }

}

/* =========================================================
   Logout
========================================================= */

logoutBtn.addEventListener("click", () => {

    logout();

    window.location.href = "/assets/pages/login.html";

});

/* =========================================================
   Mobile Navigation
========================================================= */


// Mobile sidebar toggle — same pattern as dashboard.js
const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
const appSidebar = document.getElementById("appSidebar");
const appSidebarScrim = document.getElementById("appSidebarScrim");

sidebarToggleBtn.addEventListener("click", () => {
  const isOpen = appSidebar.classList.toggle("is-open");
  appSidebarScrim.classList.toggle("is-open");
  sidebarToggleBtn.setAttribute("aria-expanded", isOpen);
});

appSidebarScrim.addEventListener("click", () => {
  appSidebar.classList.remove("is-open");
  appSidebarScrim.classList.remove("is-open");
  sidebarToggleBtn.setAttribute("aria-expanded", "false");
});

// Mobile sidebar's own logout button reuses the same confirm modal
// as the desktop dropdown's logout button — wire both to trigger it
const mobileSidebarLogoutBtn = document.getElementById("mobileSidebarLogoutBtn");
mobileSidebarLogoutBtn.addEventListener("click", () => {
  document.getElementById("logoutBtn").click();
});