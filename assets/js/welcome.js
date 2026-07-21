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

const navToggleBtn = document.querySelector("#navToggleBtn");
const navCloseBtn = document.querySelector("#navCloseBtn");

const mobileNavPanel = document.querySelector("#mobileNavPanel");
const mobileNavScrim = document.querySelector("#mobileNavScrim");

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

navToggleBtn.addEventListener("click", () => {

    mobileNavPanel.classList.add("is-open");

    mobileNavScrim.classList.add("is-open");

});

function closeMenu() {

    mobileNavPanel.classList.remove("is-open");

    mobileNavScrim.classList.remove("is-open");

}

navCloseBtn.addEventListener("click", closeMenu);

mobileNavScrim.addEventListener("click", closeMenu);