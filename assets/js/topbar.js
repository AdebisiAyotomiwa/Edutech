/**
 * topbar.js
 * Shared topbar logic for all student portal pages.
 * Handles:
 *  - Profile avatar population (image + initials fallback)
 *  - Profile dropdown open/close/outside-click
 *  - Sidebar mobile toggle
 *  - Logout from dropdown button
 */

import { logout } from "./auth.js";
import { initMobileSidebar } from "./sidebar.js";

function resolveImagePath(raw) {
  if (!raw || !raw.trim()) return "";
  if (raw.startsWith("/") || raw.startsWith("http")) return raw;
  return "/" + raw;
}

/**
 * Initialise the topbar for a student page.
 * @param {Object} student  - The logged-in student object
 */
export function initTopbar(student) {
  const initials = (student.firstName[0] + student.lastName[0]).toUpperCase();
  const name     = `${student.firstName} ${student.lastName}`;
  const sub      = student.matricNumber;

  /* ── Avatar + name ─────────────────────────────────────── */
  const avatarWrap  = document.getElementById("topbarAvatar");
  const avatarImg   = document.getElementById("topbarAvatarImg");
  const avatarIni   = document.getElementById("topbarAvatarInitials");
  const nameEl      = document.getElementById("topbarUserName");
  const subEl       = document.getElementById("topbarUserSub");

  if (nameEl) nameEl.textContent = name;
  if (subEl)  subEl.textContent  = sub;

  if (avatarImg && avatarIni) {
    if (student.profileImage?.trim()) {
      avatarImg.src = resolveImagePath(student.profileImage);
      avatarImg.onerror = () => {
        avatarImg.classList.add("d-none");
        avatarIni.textContent = initials;
        avatarIni.style.display = "flex";
      };
      avatarImg.classList.remove("d-none");
      avatarIni.style.display = "none";
    } else {
      avatarIni.textContent = initials;
      avatarIni.style.display = "flex";
    }
  }

  /* ── Profile dropdown toggle ────────────────────────────── */
  const profileBtn      = document.getElementById("topbarProfileBtn");
  const profileDropdown = document.getElementById("topbarProfileDropdown");

  if (profileBtn && profileDropdown) {
    profileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = profileDropdown.classList.toggle("is-open");
      profileBtn.setAttribute("aria-expanded", isOpen);
    });

    /* Close when clicking outside */
    document.addEventListener("click", (e) => {
      if (!profileDropdown.contains(e.target) && e.target !== profileBtn) {
        profileDropdown.classList.remove("is-open");
        profileBtn.setAttribute("aria-expanded", "false");
      }
    });

    /* Close on Escape */
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        profileDropdown.classList.remove("is-open");
        profileBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ── Logout from dropdown ───────────────────────────────── */
  const logoutDropdownBtn = document.getElementById("logoutDropdownBtn");
  if (logoutDropdownBtn) {
    logoutDropdownBtn.addEventListener("click", () => {
      logout();
      window.location.href = "/index.html";
    });
  }

  /* ── Sidebar mobile toggle ──────────────────────────────── */
  initMobileSidebar();
}
