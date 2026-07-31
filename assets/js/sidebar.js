/**
 * sidebar.js
 * ─────────────────────────────────────────────────────────
 * Shared mobile sidebar / drawer logic used by every page
 * across all three portals (student, lecturer, admin).
 *
 * Responsibilities:
 *   ✓ Wire the hamburger toggle button
 *   ✓ Wire the scrim (backdrop) to close the drawer
 *   ✓ Inject a close (✕) button inside the drawer header
 *   ✓ Auto-close the drawer when any nav link is tapped
 *   ✓ Restore aria-expanded on open/close
 *
 * Usage:
 *   import { initMobileSidebar } from "../sidebar.js";
 *   initMobileSidebar();   // call once after DOMContentLoaded
 *
 * The function is a no-op when the elements don't exist on
 * the current page, so it's safe to call unconditionally.
 */

export function initMobileSidebar() {
  const toggle  = document.getElementById("sidebarToggleBtn");
  const sidebar = document.getElementById("appSidebar");
  const scrim   = document.getElementById("appSidebarScrim");

  if (!toggle || !sidebar) return;

  /* ── Open / close helpers ─────────────────────────────── */
  function open() {
    sidebar.classList.add("is-open");
    scrim?.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
  }
  function close() {
    sidebar.classList.remove("is-open");
    scrim?.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }

  /* ── Hamburger toggle ─────────────────────────────────── */
  toggle.addEventListener("click", () =>
    sidebar.classList.contains("is-open") ? close() : open()
  );

  /* ── Scrim click closes drawer ────────────────────────── */
  scrim?.addEventListener("click", close);

  /* ── Inject close button once ─────────────────────────── */
  if (!sidebar.querySelector(".sidebar-close-btn")) {
    const closeBtn = document.createElement("button");
    closeBtn.className     = "sidebar-close-btn";
    closeBtn.type          = "button";
    closeBtn.setAttribute("aria-label", "Close menu");
    closeBtn.innerHTML     = `<i class="bi bi-x-lg"></i>`;
    closeBtn.addEventListener("click", close);
    /* Insert as the very first child of the sidebar so it floats
       at the top-right corner via absolute positioning */
    sidebar.insertBefore(closeBtn, sidebar.firstChild);
  }

  /* ── Auto-close when any nav link is tapped ───────────── */
  sidebar.querySelectorAll(".app-sidebar-link").forEach(link =>
    link.addEventListener("click", close)
  );

  /* ── Close on Escape key ──────────────────────────────── */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebar.classList.contains("is-open")) close();
  });
}
