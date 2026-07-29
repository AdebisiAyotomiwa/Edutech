/* =========================================================
   historyComponent.js
   ---------------------------------------------------------
   Purpose:
   A small, reusable "History" expandable panel that reads
   auditLog entries filtered by entityType + entityId and
   renders them as a collapsed-by-default timeline.

   Usage:
     import { renderHistory } from "../historyComponent.js";
     await renderHistory(document.getElementById("historyContainer"), {
       entityType: "resultSubmission",
       entityId: sub.id,
       title: "Submission history",
     });

   Reusable across: student result view, lecturer submission
   view, admin approval view, registration management.
   ========================================================= */

import { getAuditLog } from "./api.js";

const ACTION_ICONS = {
  submitted:   "bi-upload",
  resubmitted: "bi-arrow-repeat",
  updated:     "bi-pencil-square",
  approved:    "bi-check-circle-fill",
  rejected:    "bi-x-circle-fill",
  added:       "bi-plus-circle-fill",
  removed:     "bi-dash-circle-fill",
  generated:   "bi-magic",
  confirmed:   "bi-check2-circle",
};

function iconFor(action) {
  return ACTION_ICONS[action] || "bi-clock-history";
}

function formatActor(entry) {
  const role = entry.actorRole ? entry.actorRole[0].toUpperCase() + entry.actorRole.slice(1) : "System";
  return `${role} #${entry.actorId ?? "—"}`;
}

/**
 * Renders a collapsed-by-default "History" panel into `container`.
 * @param {HTMLElement} container
 * @param {Object} opts
 * @param {string} opts.entityType
 * @param {string|number} opts.entityId
 * @param {string} [opts.title="History"]
 */
export async function renderHistory(container, { entityType, entityId, title = "History" }) {
  if (!container) return;

  const panelId = `hist-${entityType}-${entityId}`.replace(/[^a-zA-Z0-9_-]/g, "");

  container.innerHTML = `
    <div class="history-panel">
      <button type="button" class="history-toggle" id="${panelId}-toggle" aria-expanded="false">
        <i class="bi bi-clock-history"></i>
        <span>${title}</span>
        <i class="bi bi-chevron-down history-chevron"></i>
      </button>
      <div class="history-body d-none" id="${panelId}-body">
        <div class="text-muted small p-3">Loading…</div>
      </div>
    </div>`;

  const toggleBtn = container.querySelector(`#${panelId}-toggle`);
  const body      = container.querySelector(`#${panelId}-body`);
  let loaded = false;

  toggleBtn.addEventListener("click", async () => {
    const isOpen = !body.classList.contains("d-none");
    if (isOpen) {
      body.classList.add("d-none");
      toggleBtn.setAttribute("aria-expanded", "false");
      toggleBtn.classList.remove("is-open");
      return;
    }

    body.classList.remove("d-none");
    toggleBtn.setAttribute("aria-expanded", "true");
    toggleBtn.classList.add("is-open");

    if (!loaded) {
      loaded = true;
      try {
        const entries = await getAuditLog({ entityType, entityId });
        renderEntries(body, entries);
      } catch (err) {
        console.error(err);
        body.innerHTML = `<div class="text-danger small p-3">Failed to load history.</div>`;
      }
    }
  });
}

function renderEntries(body, entries) {
  if (!entries || entries.length === 0) {
    body.innerHTML = `<div class="text-muted small p-3">No history recorded yet.</div>`;
    return;
  }

  const sorted = [...entries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  body.innerHTML = sorted.map(entry => `
    <div class="history-row">
      <i class="bi ${iconFor(entry.action)} history-row-icon"></i>
      <div class="flex-grow-1">
        <div class="history-row-title">
          <span class="fw-semibold text-capitalize">${entry.action}</span>
          <span class="text-muted small">· ${formatActor(entry)}</span>
        </div>
        ${entry.note ? `<div class="history-row-note">${entry.note}</div>` : ""}
      </div>
      <div class="history-row-time text-muted small">
        ${entry.timestamp ? new Date(entry.timestamp).toLocaleString("en-GB") : ""}
      </div>
    </div>
  `).join("");
}