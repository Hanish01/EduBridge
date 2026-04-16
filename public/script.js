function escapeHtml(value) {
  const str = String(value == null ? "" : value);
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const errMsg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(errMsg);
  }
  return data;
}

function setMessage(el, text, variant) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("ok", "err", "show");
  if (variant === "ok") el.classList.add("ok");
  if (variant === "err") el.classList.add("err");
  if (text) el.classList.add("show");
}

function buildVideoCard(video, actions) {
  const title = escapeHtml(video.title || "");
  const subject = escapeHtml(video.subject || "");
  const createdBy = escapeHtml(video.createdBy || "");
  const url = video.url || "";

  const card = document.createElement("div");
  card.className = "video-card";
  card.dataset.videoId = video.id;

  const videoEl = `<video controls preload="metadata" src="${escapeHtml(url)}"></video>`;

  const actionsHtml = actions
    ? `
      <div class="actions">
        ${actions
          .map(
            (a) =>
              `<button type="button" class="${escapeHtml(a.className)}" data-action="${escapeHtml(a.action)}" data-id="${escapeHtml(video.id)}">${escapeHtml(a.label)}</button>`
          )
          .join("")}
      </div>
    `
    : "";

  card.innerHTML = `
    <h3 class="video-title">${title}</h3>
    <p class="meta">${subject} • by ${createdBy}</p>
    ${videoEl}
    ${actionsHtml}
  `;

  return card;
}

async function initUploadPage() {
  const form = document.getElementById("upload-form");
  if (!form) return;

  const msgEl = document.getElementById("upload-message");
  const btn = document.getElementById("upload-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      setMessage(msgEl, "", "");
      btn.disabled = true;
      btn.textContent = "Uploading...";

      const formData = new FormData(form);
      const data = await fetchJSON("/upload-video", { method: "POST", body: formData });

      if (!data || !data.success) throw new Error((data && data.error) || "Upload failed.");

      setMessage(msgEl, "Upload successful! Waiting for admin approval.", "ok");
      form.reset();
    } catch (err) {
      console.error("Upload error:", err);
      let userMsg = err && err.message ? err.message : "Upload failed.";
      if (userMsg.toLowerCase().includes("failed to fetch")) {
        userMsg = "Failed to fetch `/upload-video`. Open pages from `http://localhost:3000/` and keep server running.";
      }
      setMessage(msgEl, userMsg, "err");
    } finally {
      btn.disabled = false;
      btn.textContent = "Upload";
    }
  });
}

async function initAdminPage() {
  const container = document.getElementById("pending-videos");
  if (!container) return;

  const msgEl = document.getElementById("admin-message");
  setMessage(msgEl, "", "");
  container.innerHTML = `<div class="loading">Loading pending videos...</div>`;

  async function loadPending() {
    try {
      setMessage(msgEl, "", "");
      container.innerHTML = `<div class="loading">Loading pending videos...</div>`;

      const data = await fetchJSON("/admin/videos");
      const videos = Array.isArray(data) ? data : [];

      if (videos.length === 0) {
        container.innerHTML = `<div class="empty">No pending videos.</div>`;
        return;
      }

      container.innerHTML = "";
      videos.forEach((v) => {
        container.appendChild(
          buildVideoCard(v, [
            { action: "approve", label: "Approve", className: "btn-approve" },
            { action: "reject", label: "Reject", className: "btn-reject" },
          ])
        );
      });
    } catch (err) {
      console.error(err);
      setMessage(msgEl, err && err.message ? err.message : "Failed to load pending videos.", "err");
      container.innerHTML = `<div class="empty">Could not load videos.</div>`;
    }
  }

  container.addEventListener("click", async (e) => {
    const btn = e.target && e.target.closest ? e.target.closest("button") : null;
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (!id || !action) return;

    try {
      btn.disabled = true;
      const endpoint =
        action === "approve"
          ? `/admin/approve/${encodeURIComponent(id)}`
          : `/admin/reject/${encodeURIComponent(id)}`;
      await fetchJSON(endpoint, { method: "POST" });
      const card = btn.closest(".video-card");
      if (card) card.remove();
    } catch (err) {
      console.error("Admin action error:", err);
      setMessage(msgEl, err && err.message ? err.message : "Action failed.", "err");
      btn.disabled = false;
    }
  });

  await loadPending();
}

async function initStudentPage() {
  const container = document.getElementById("approved-videos");
  if (!container) return;

  const msgEl = document.getElementById("student-message");
  setMessage(msgEl, "", "");
  container.innerHTML = `<div class="loading">Loading approved videos...</div>`;

  try {
    const data = await fetchJSON("/videos");
    const videos = Array.isArray(data) ? data : [];

    if (videos.length === 0) {
      container.innerHTML = `<div class="empty">No approved videos yet.</div>`;
      return;
    }

    container.innerHTML = "";
    videos.forEach((v) => container.appendChild(buildVideoCard(v, null)));
  } catch (err) {
    console.error(err);
    setMessage(msgEl, err && err.message ? err.message : "Failed to load approved videos.", "err");
    container.innerHTML = `<div class="empty">Could not load videos.</div>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initUploadPage();
  initAdminPage();
  initStudentPage();
});

