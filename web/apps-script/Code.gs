const CONFIG = {
  // 你的 Google Sheet ID（已先填入你提供的試算表）
  spreadsheetId: "1M75GxuQGQ1GpNxRT0qvHB6ecwIcb54vUGlPXiLma_Io",
  // 目標工作表名稱；留空則使用第一個工作表
  sheetName: "",
  // 建議設 token 防止任意寫入；不用可留空
  accessToken: "",
  headerEnabled: "是否啟用",
  headerThreshold: "門檻值",
  listCacheSeconds: 60
};

function doGet() {
  return jsonResponse({ ok: true, message: "Google Sheet endpoint is running" });
}

function doPost(e) {
  let lock = null;
  try {
    const params = (e && e.parameter) || {};
    checkToken_(params);

    const action = String(params.action || "append").trim();
    lock = LockService.getScriptLock();
    lock.tryLock(10000);

    const sheetCtx = getSheetContext_();

    if (action === "listProjects") {
      const status = normalizeStatus_(params.status || "enabled");
      return jsonResponse({ ok: true, projects: listProjectsByStatusCached_(sheetCtx, status) });
    }

    if (action === "setProjectStatus") {
      const rowNumber = Number(params.rowNumber || 0);
      const status = normalizeStatus_(params.status || "enabled");
      setProjectStatusByRow_(sheetCtx, rowNumber, status);
      clearListCache_();
      return jsonResponse({ ok: true });
    }

    if (action === "setProjectThreshold") {
      const rowNumber = Number(params.rowNumber || 0);
      const threshold = String(params.threshold || "").trim();
      setProjectThresholdByRow_(sheetCtx, rowNumber, threshold);
      clearListCache_();
      return jsonResponse({ ok: true });
    }

    // 相容舊 action
    if (action === "listEnabled") {
      return jsonResponse({ ok: true, projects: listProjectsByStatus_(sheetCtx, "enabled") });
    }

    if (action === "disableProject") {
      const rowNumber = Number(params.rowNumber || 0);
      setProjectStatusByRow_(sheetCtx, rowNumber, "disabled");
      clearListCache_();
      return jsonResponse({ ok: true });
    }

    if (!params.payload) {
      return jsonResponse({ ok: false, error: "Missing payload" });
    }

    const payload = JSON.parse(params.payload);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return jsonResponse({ ok: false, error: "Invalid payload" });
    }

    appendPayloadRow_(sheetCtx, payload);
    clearListCache_();
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error && error.message ? error.message : error) });
  } finally {
    if (lock && lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function checkToken_(params) {
  if (!CONFIG.accessToken) return;

  const token = String(params.token || "").trim();
  if (token !== CONFIG.accessToken) {
    throw new Error("Invalid token");
  }
}

function getSheetContext_() {
  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = CONFIG.sheetName
    ? spreadsheet.getSheetByName(CONFIG.sheetName)
    : spreadsheet.getSheets()[0];

  if (!sheet) {
    throw new Error("Sheet not found");
  }

  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map((header) => String(header || "").trim());

  const indexMap = {};
  headers.forEach((header, idx) => {
    if (header) indexMap[header] = idx;
  });

  return { sheet, headers, indexMap };
}

function appendPayloadRow_(ctx, payload) {
  const row = ctx.headers.map((header) => {
    if (!header) return "";
    const value = payload[header];
    return value === undefined || value === null ? "" : String(value);
  });

  ctx.sheet.appendRow(row);
}

function listProjectsByStatus_(ctx, status) {
  const enabledIndex = ctx.indexMap[CONFIG.headerEnabled];
  if (enabledIndex === undefined) {
    throw new Error('找不到「是否啟用」欄位');
  }

  const lastRow = ctx.sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const dataRows = ctx.sheet.getRange(2, 1, lastRow - 1, ctx.headers.length).getValues();

  const projects = [];
  dataRows.forEach((row, idx) => {
    const isEnabled = isEnabledValue_(row[enabledIndex]);
    const matched = status === "enabled" ? isEnabled : !isEnabled;
    if (!matched) return;

    const rowObj = { __rowNumber: idx + 2 };
    ctx.headers.forEach((header, colIdx) => {
      if (!header) return;
      rowObj[header] = String(row[colIdx] || "");
    });
    projects.push(rowObj);
  });

  return projects;
}

function listProjectsByStatusCached_(ctx, status) {
  const cache = CacheService.getScriptCache();
  const key = getListCacheKey_(status);
  const cached = cache.get(key);
  if (cached) {
    return JSON.parse(cached);
  }

  const projects = listProjectsByStatus_(ctx, status);
  cache.put(key, JSON.stringify(projects), CONFIG.listCacheSeconds);
  return projects;
}

function setProjectStatusByRow_(ctx, rowNumber, status) {
  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    throw new Error("Invalid rowNumber");
  }

  const enabledIndex = ctx.indexMap[CONFIG.headerEnabled];
  if (enabledIndex === undefined) {
    throw new Error('找不到「是否啟用」欄位');
  }

  const lastRow = ctx.sheet.getLastRow();
  if (rowNumber > lastRow) {
    throw new Error("Row does not exist");
  }

  const text = status === "enabled" ? "是" : "否";
  ctx.sheet.getRange(rowNumber, enabledIndex + 1).setValue(text);
}

function setProjectThresholdByRow_(ctx, rowNumber, threshold) {
  if (!Number.isInteger(rowNumber) || rowNumber < 2) {
    throw new Error("Invalid rowNumber");
  }

  if (threshold === "") {
    throw new Error("Threshold is required");
  }

  const thresholdIndex = ctx.indexMap[CONFIG.headerThreshold];
  if (thresholdIndex === undefined) {
    throw new Error('找不到「門檻值」欄位');
  }

  const lastRow = ctx.sheet.getLastRow();
  if (rowNumber > lastRow) {
    throw new Error("Row does not exist");
  }

  ctx.sheet.getRange(rowNumber, thresholdIndex + 1).setValue(threshold);
}

function normalizeStatus_(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["enabled", "enable", "on", "啟用", "是", "true", "1", "yes", "y"].indexOf(normalized) >= 0) {
    return "enabled";
  }
  if (["disabled", "disable", "off", "關閉", "否", "false", "0", "no", "n"].indexOf(normalized) >= 0) {
    return "disabled";
  }
  throw new Error("Invalid status");
}

function isEnabledValue_(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["是", "啟用", "true", "1", "yes", "y", "enabled", "on"].indexOf(normalized) >= 0;
}

function getListCacheKey_(status) {
  return ["projects", CONFIG.spreadsheetId, CONFIG.sheetName || "_first", status].join(":");
}

function clearListCache_() {
  const cache = CacheService.getScriptCache();
  cache.remove(getListCacheKey_("enabled"));
  cache.remove(getListCacheKey_("disabled"));
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
