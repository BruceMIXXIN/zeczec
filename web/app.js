const CONFIG = {
  // 部署 Google Apps Script 後，貼上 Web App URL
  webAppUrl: "https://script.google.com/macros/s/AKfycbxEVv8prznKMn6yUUKZKPq4JKgIjjS3SqgwClALoici2AEbYHNols7KR7joZf-WdBVM1Q/exec",
  // 若你有在 Apps Script 設 token，這裡同步填入；不需要可留空
  accessToken: "",
  // 欄位 name 必須與 Google Sheet 第一列標題完全相同
  fields: [
    { name: "專案名稱", label: "專案名稱", type: "text", required: true, placeholder: "請輸入專案名稱" },
    { name: "噴噴網址", label: "嘖嘖網址", type: "url", required: true, placeholder: "https://..." },
    { name: "門檻值", label: "門檻值", type: "number", required: true, placeholder: "例如 10" },
    { name: "Webhook", label: "Webhook", type: "url", required: true, placeholder: "https://chat.googleapis.com/..." },
    { name: "是否啟用", label: "是否啟用", type: "choice", required: true, options: ["是", "否"], defaultValue: "是" },
    { name: "負責人", label: "負責人", type: "text", required: true, placeholder: "請輸入負責人" },
    { name: "備註", label: "備註", type: "textarea", required: false, placeholder: "其他資訊" }
  ]
};

const formEl = document.getElementById("sheet-form");
const fieldsEl = document.getElementById("fields");
const submitBtnEl = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const projectListEl = document.getElementById("enabled-list");
const projectStatusEl = document.getElementById("enabled-status");
const refreshBtnEl = document.getElementById("refresh-enabled-btn");
const statusTabs = Array.from(document.querySelectorAll(".js-status-tab"));

let currentStatusView = "enabled";

function renderFields() {
  fieldsEl.innerHTML = "";

  CONFIG.fields.forEach((field) => {
    const wrap = document.createElement("div");
    wrap.className = "field";

    const label = document.createElement("label");
    label.setAttribute("for", field.name);
    label.textContent = `${field.label}${field.required ? " *" : ""}`;

    let input;
    if (field.type === "choice") {
      const group = document.createElement("div");
      group.className = "toggle-group";
      group.setAttribute("role", "radiogroup");
      group.setAttribute("aria-label", field.label);

      (field.options || []).forEach((option, idx) => {
        const optionId = `${field.name}-${idx}`;
        const item = document.createElement("label");
        item.className = "toggle-item";
        item.setAttribute("for", optionId);

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.id = optionId;
        radio.name = field.name;
        radio.value = option;
        radio.checked = field.defaultValue ? field.defaultValue === option : idx === 0;
        radio.required = Boolean(field.required && idx === 0);

        const text = document.createElement("span");
        text.textContent = option;

        item.appendChild(radio);
        item.appendChild(text);
        group.appendChild(item);
      });

      input = group;
    } else if (field.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 4;
    } else {
      input = document.createElement("input");
      input.type = field.type || "text";
    }

    if (field.type !== "choice") {
      input.id = field.name;
      input.name = field.name;
      input.required = Boolean(field.required);
      input.placeholder = field.placeholder || "";
    }

    wrap.appendChild(label);
    wrap.appendChild(input);
    fieldsEl.appendChild(wrap);
  });
}

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${tone}`.trim();
}

function setProjectStatus(message, tone = "") {
  projectStatusEl.textContent = message;
  projectStatusEl.className = `status ${tone}`.trim();
}

function setActiveTab(status) {
  statusTabs.forEach((tab) => {
    const isActive = tab.getAttribute("data-status") === status;
    tab.classList.toggle("is-active", isActive);
  });
}

function collectPayload() {
  const formData = new FormData(formEl);
  const payload = {};

  CONFIG.fields.forEach((field) => {
    payload[field.name] = String(formData.get(field.name) || "").trim();
  });

  payload.提交時間 = new Date().toISOString();
  return payload;
}

function ensureConfigured() {
  if (!CONFIG.webAppUrl || CONFIG.webAppUrl.includes("PASTE_YOUR")) {
    throw new Error("請先在 app.js 設定 webAppUrl。");
  }
}

async function postToApi(params) {
  ensureConfigured();

  const body = new URLSearchParams({
    ...params,
    token: CONFIG.accessToken
  });

  const res = await fetch(CONFIG.webAppUrl, {
    method: "POST",
    body
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.error || "請求失敗");
  }

  return data;
}

async function submitToSheet(payload) {
  return postToApi({
    action: "append",
    payload: JSON.stringify(payload)
  });
}

function renderProjects(projects, status) {
  if (!Array.isArray(projects) || projects.length === 0) {
    const text = status === "enabled" ? "目前沒有狀態是「是」的專案。" : "目前沒有狀態是「否」的專案。";
    projectListEl.innerHTML = `<p class="empty">${text}</p>`;
    return;
  }

  const html = projects
    .map((project) => {
      const projectName = project["專案名稱"] || "(未命名專案)";
      const owner = project["負責人"] || "-";
      const threshold = project["門檻值"] || "";
      const url = project["噴噴網址"] || "";
      const note = project["備註"] || "";
      const rowNumber = Number(project.__rowNumber || 0);
      const nextStatus = status === "enabled" ? "disabled" : "enabled";
      const actionText = status === "enabled" ? "改成否" : "改成是";
      const actionClass = status === "enabled" ? "btn-danger" : "btn-success";

      return `
        <article class="project-item" data-row="${rowNumber}">
          <div class="project-main">
            <h3>${escapeHtml(projectName)}</h3>
            <p>負責人：${escapeHtml(owner)}</p>
            <div class="threshold-editor">
              <label for="threshold-${rowNumber}">門檻值</label>
              <div class="threshold-controls">
                <input id="threshold-${rowNumber}" class="threshold-input" type="number" step="1" data-row="${rowNumber}" value="${escapeAttr(threshold)}" />
                <button class="btn btn-ghost btn-small js-threshold-save" type="button" data-row="${rowNumber}">儲存門檻值</button>
              </div>
            </div>
            ${url ? `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>` : ""}
            ${note ? `<p class="note">備註：${escapeHtml(note)}</p>` : ""}
          </div>
          <button class="btn ${actionClass} js-switch-btn" type="button" data-row="${rowNumber}" data-next-status="${nextStatus}">${actionText}</button>
        </article>
      `;
    })
    .join("");

  projectListEl.innerHTML = html;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

async function loadProjectsByStatus(status = currentStatusView) {
  currentStatusView = status;
  setActiveTab(status);
  refreshBtnEl.disabled = true;

  const label = status === "enabled" ? "是" : "否";
  setProjectStatus(`讀取狀態為${label}的專案中...`, "pending");

  try {
    const data = await postToApi({ action: "listProjects", status });
    renderProjects(data.projects || [], status);
    setProjectStatus(`已載入 ${data.projects ? data.projects.length : 0} 筆狀態為${label}的專案。`, "success");
  } catch (error) {
    projectListEl.innerHTML = '<p class="empty">目前無法讀取資料。</p>';
    setProjectStatus(`讀取失敗：${error.message}`, "error");
  } finally {
    refreshBtnEl.disabled = false;
  }
}

async function switchProjectStatus(rowNumber, nextStatus, buttonEl) {
  const row = Number(rowNumber || 0);
  if (!row) {
    setProjectStatus("找不到可更新的列號。", "error");
    return;
  }

  buttonEl.disabled = true;
  setProjectStatus("更新中...", "pending");

  try {
    await postToApi({ action: "setProjectStatus", rowNumber: String(row), status: nextStatus });
    setProjectStatus("已更新專案狀態。", "success");
    await loadProjectsByStatus(currentStatusView);
  } catch (error) {
    setProjectStatus(`更新失敗：${error.message}`, "error");
    buttonEl.disabled = false;
  }
}

async function updateProjectThreshold(rowNumber, value, buttonEl) {
  const row = Number(rowNumber || 0);
  if (!row) {
    setProjectStatus("找不到可更新的列號。", "error");
    return;
  }

  if (value === "") {
    setProjectStatus("門檻值不可空白。", "error");
    return;
  }

  buttonEl.disabled = true;
  setProjectStatus("儲存門檻值中...", "pending");

  try {
    await postToApi({ action: "setProjectThreshold", rowNumber: String(row), threshold: String(value) });
    setProjectStatus("門檻值已更新。", "success");
  } catch (error) {
    setProjectStatus(`門檻值更新失敗：${error.message}`, "error");
  } finally {
    buttonEl.disabled = false;
  }
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    ensureConfigured();
  } catch (error) {
    setStatus(error.message, "error");
    return;
  }

  if (!formEl.reportValidity()) {
    setStatus("請先完成必填欄位。", "error");
    return;
  }

  submitBtnEl.disabled = true;
  setStatus("送出中...", "pending");

  try {
    const payload = collectPayload();
    await submitToSheet(payload);
    setStatus("送出成功，資料已寫入 Google Sheet。", "success");
    formEl.reset();
    await loadProjectsByStatus(currentStatusView);
  } catch (error) {
    setStatus(`送出失敗：${error.message}`, "error");
  } finally {
    submitBtnEl.disabled = false;
  }
});

refreshBtnEl.addEventListener("click", () => {
  loadProjectsByStatus(currentStatusView);
});

statusTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const status = tab.getAttribute("data-status") || "enabled";
    loadProjectsByStatus(status);
  });
});

projectListEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.classList.contains("js-switch-btn")) {
    const rowNumber = target.getAttribute("data-row") || "";
    const nextStatus = target.getAttribute("data-next-status") || "enabled";
    switchProjectStatus(rowNumber, nextStatus, target);
    return;
  }

  if (target.classList.contains("js-threshold-save")) {
    const rowNumber = target.getAttribute("data-row") || "";
    const inputEl = projectListEl.querySelector(`.threshold-input[data-row="${rowNumber}"]`);
    const value = inputEl instanceof HTMLInputElement ? inputEl.value.trim() : "";
    updateProjectThreshold(rowNumber, value, target);
  }
});

renderFields();
loadProjectsByStatus("enabled");
