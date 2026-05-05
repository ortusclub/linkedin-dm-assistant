"use strict";

const DEFAULT_DM_TEMPLATE = "Hi {first name}, thanks for connecting. I wanted to send this across while it is fresh.";
const DEFAULT_INTRO_NAME = "Antonio";
const DEFAULT_INTRO_SUBJECT_TEMPLATE = "Introduction: {first name} <> {intro name}";
const DEFAULT_INTRO_BODY_TEMPLATE = "Hi {first name}, introducing you to {intro name}.\n\n{intro name}, meet {first name}, {title} at {company}.\n\nI thought it made sense for you both to connect.";

const DM_TEMPLATE_KEY      = "dmTemplate";
const INTRO_NAME_KEY       = "introName";
const INTRO_SUBJECT_KEY    = "introSubjectTemplate";
const INTRO_BODY_KEY       = "introBodyTemplate";
const ENABLED_KEY          = "dmExtensionEnabled";
const BROWSER_MODE_KEY     = "dmBrowserMode";
const SHEET_URL_KEY        = "dmSheetUrl";
const CONTACTS_KEY         = "dmSheetContacts";
const HEADERS_KEY          = "dmSheetHeaders";
const ACTIVE_TAB_KEY       = "dmActiveTab";
const CONTENT_VERSION      = "1.2";
const BROWSER_MODE_NORMAL  = "normal";
const BROWSER_MODE_VM      = "vm";

const $ = (id) => document.getElementById(id);

const dom = {
  popup:                $("popup"),
  liveBadge:            $("liveBadge"),
  liveBadgeText:        $("liveBadgeText"),
  toggle:               $("extensionToggle"),
  toggleText:           $("extensionToggleText"),
  dossier:              $("dossier"),
  dossierEyebrow:       $("dossierEyebrow"),
  dossierName:          $("dossierName"),
  dossierRole:          $("dossierRole"),
  previewLabel:         $("previewLabel"),
  preview:              $("dmPreview"),
  copyDmBtn:            $("copyDmBtn"),
  copyIntroBtn:         $("copyIntroBtn"),
  copyStatus:           $("copyStatus"),
  tabSheet:             $("tab-sheet"),
  tabDm:                $("tab-dm"),
  tabIntro:             $("tab-intro"),
  tabShortcuts:         $("tab-shortcuts"),
  panelSheet:           $("panel-sheet"),
  panelDm:              $("panel-dm"),
  panelIntro:           $("panel-intro"),
  panelShortcuts:       $("panel-shortcuts"),
  sheetUrl:             $("sheetUrlInput"),
  syncSheet:            $("syncSheetBtn"),
  clearSheet:           $("clearSheetBtn"),
  sheetStatus:          $("sheetStatus"),
  contactCount:         $("contactCount"),
  dmTemplate:           $("dmTemplateInput"),
  dmTokenRow:           $("dmTokenRow"),
  saveDmBtn:            $("saveDmBtn"),
  resetDmBtn:           $("resetDmBtn"),
  dmTemplateStatus:     $("dmTemplateStatus"),
  introName:            $("introNameInput"),
  introSubject:         $("introSubjectInput"),
  introBody:            $("introBodyInput"),
  introTokenRow:        $("introTokenRow"),
  saveIntroBtn:         $("saveIntroBtn"),
  resetIntroBtn:        $("resetIntroBtn"),
  introTemplateStatus:  $("introTemplateStatus"),
  diagnose:             $("diagnoseBtn"),
  diagnoseStatus:       $("diagnoseStatus")
};

let state = {
  contacts: [],
  headers:  [],
  matched:  null,
  detectedName: "",
  introName: DEFAULT_INTRO_NAME,
  activeIntroField: null
};

function setStatus(el, message, type) {
  el.textContent = message || "";
  el.className = `status${type === "ok" ? " ok" : type === "error" ? " error" : ""}`;
}

function updateExtensionToggle(isEnabled) {
  dom.toggleText.textContent = isEnabled ? "Live" : "Paused";
  dom.toggle.setAttribute("aria-pressed", String(isEnabled));
  dom.popup.classList.toggle("paused", !isEnabled);
}

function setLiveBadge(stateName, label) {
  dom.liveBadge.dataset.state = stateName;
  dom.liveBadgeText.textContent = label;
}

/* ─── CSV parsing (lifted from QuickConnect) ─── */

function parseCsvRows(csvText) {
  const rows = [];
  let row = []; let current = ""; let inQuotes = false;
  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      row.push(current); current = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(current);
      if (row.some((v) => v.trim())) rows.push(row.map((v) => v.trim()));
      row = []; current = "";
    } else { current += ch; }
  }
  row.push(current);
  if (row.some((v) => v.trim())) rows.push(row.map((v) => v.trim()));
  return rows;
}

function normalizeHeaderKey(value) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function makeUniqueHeaders(headerRow) {
  const counts = new Map();
  return headerRow.map((raw) => {
    const base = (raw || "").trim();
    if (!base) return "";
    const key = base.toLowerCase();
    const count = counts.get(key) || 0;
    counts.set(key, count + 1);
    return count ? `${base} ${count + 1}` : base;
  });
}

function findHeaderIndex(normalized, aliases) {
  return normalized.findIndex((h) => aliases.includes(h));
}

function parseContactsCsv(csvText) {
  const rows = parseCsvRows(csvText);
  if (!rows.length) return { contacts: [], headers: [] };
  const headerNames = makeUniqueHeaders(rows[0]);
  const headers = headerNames.map(normalizeHeaderKey);
  const firstIdx = findHeaderIndex(headers, ["firstname", "first"]);
  const lastIdx  = findHeaderIndex(headers, ["lastname", "last", "surname"]);
  const titleIdx = findHeaderIndex(headers, ["title", "jobtitle", "position", "role"]);
  const compIdx  = findHeaderIndex(headers, ["company", "companyname", "accountname", "organization", "organisation", "employer"]);
  if (firstIdx === -1 || lastIdx === -1) {
    throw new Error("Missing required headers. Need: first name and last name.");
  }
  const contacts = rows.slice(1).map((r) => {
    const fields = {};
    headerNames.forEach((h, i) => { if (h) fields[h] = (r[i] || "").trim(); });
    return {
      firstName: (r[firstIdx] || "").trim(),
      lastName:  (r[lastIdx]  || "").trim(),
      title:     titleIdx === -1 ? "" : (r[titleIdx] || "").trim(),
      company:   compIdx  === -1 ? "" : (r[compIdx]  || "").trim(),
      fields
    };
  }).filter((c) => c.firstName && c.lastName);
  return { contacts, headers: headerNames.filter(Boolean) };
}

function toCsvExportUrl(sheetUrl) {
  const url = new URL(sheetUrl);
  if (url.hostname !== "docs.google.com") {
    throw new Error("Use a docs.google.com spreadsheet URL.");
  }
  const m = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) throw new Error("Invalid Google Sheet URL.");
  const gid = url.searchParams.get("gid") || "0";
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
}

/* ─── template rendering ─── */

function getFieldValue(contact, tokenName) {
  const target = normalizeHeaderKey(tokenName);
  if (target === "introname") return state.introName || DEFAULT_INTRO_NAME;
  if (!contact) return "";
  const fields = contact.fields && typeof contact.fields === "object" ? contact.fields : contact;
  const found = Object.keys(fields).find((k) => normalizeHeaderKey(k) === target);
  return found ? String(fields[found] || "").trim() : "";
}

function renderTemplate(template, contact) {
  return (template || "").replace(/\{([^{}]+)\}/g, (full, name) => {
    const v = getFieldValue(contact, name);
    return v || full;
  }).trim();
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function renderTemplateAsHtml(template, contact) {
  return escapeHtml(template || "").replace(/\{([^{}]+)\}/g, (full, name) => {
    const v = getFieldValue(contact, name);
    if (v) return `<span class="var">${escapeHtml(v)}</span>`;
    return `<span class="var" style="background:transparent;color:var(--ink-faint);border:1px dashed var(--rule-2)">${escapeHtml(full)}</span>`;
  });
}

/* ─── persistence ─── */

async function loadEnabled() {
  const r = await chrome.storage.sync.get({ [ENABLED_KEY]: true });
  updateExtensionToggle(r[ENABLED_KEY] !== false);
}
async function toggleEnabled() {
  const r = await chrome.storage.sync.get({ [ENABLED_KEY]: true });
  const next = r[ENABLED_KEY] === false;
  await chrome.storage.sync.set({ [ENABLED_KEY]: next });
  updateExtensionToggle(next);
}

async function loadBrowserMode() {
  await chrome.storage.sync.set({ [BROWSER_MODE_KEY]: BROWSER_MODE_VM });
}

async function loadTemplates() {
  const r = await chrome.storage.sync.get({
    [DM_TEMPLATE_KEY]:   DEFAULT_DM_TEMPLATE,
    [INTRO_NAME_KEY]:    DEFAULT_INTRO_NAME,
    [INTRO_SUBJECT_KEY]: DEFAULT_INTRO_SUBJECT_TEMPLATE,
    [INTRO_BODY_KEY]:    DEFAULT_INTRO_BODY_TEMPLATE
  });
  dom.dmTemplate.value  = r[DM_TEMPLATE_KEY]   || DEFAULT_DM_TEMPLATE;
  dom.introName.value   = r[INTRO_NAME_KEY]    || DEFAULT_INTRO_NAME;
  dom.introSubject.value = r[INTRO_SUBJECT_KEY] || DEFAULT_INTRO_SUBJECT_TEMPLATE;
  dom.introBody.value   = r[INTRO_BODY_KEY]    || DEFAULT_INTRO_BODY_TEMPLATE;
  state.introName       = r[INTRO_NAME_KEY]    || DEFAULT_INTRO_NAME;
  refreshDossierPreview();
}

async function saveDmTemplate() {
  const next = (dom.dmTemplate.value || "").trim() || DEFAULT_DM_TEMPLATE;
  await chrome.storage.sync.set({ [DM_TEMPLATE_KEY]: next });
  dom.dmTemplate.value = next;
  refreshDossierPreview();
  setStatus(dom.dmTemplateStatus, "DM saved.", "ok");
}
async function resetDmTemplate() {
  dom.dmTemplate.value = DEFAULT_DM_TEMPLATE;
  await saveDmTemplate();
}

async function saveIntroTemplate() {
  const introName = (dom.introName.value || "").trim() || DEFAULT_INTRO_NAME;
  const subject   = (dom.introSubject.value || "").trim() || DEFAULT_INTRO_SUBJECT_TEMPLATE;
  const body      = (dom.introBody.value || "").trim() || DEFAULT_INTRO_BODY_TEMPLATE;
  await chrome.storage.sync.set({
    [INTRO_NAME_KEY]:    introName,
    [INTRO_SUBJECT_KEY]: subject,
    [INTRO_BODY_KEY]:    body
  });
  dom.introName.value    = introName;
  dom.introSubject.value = subject;
  dom.introBody.value    = body;
  state.introName        = introName;
  refreshDossierPreview();
  setStatus(dom.introTemplateStatus, "Intro saved.", "ok");
}
async function resetIntroTemplate() {
  dom.introName.value    = DEFAULT_INTRO_NAME;
  dom.introSubject.value = DEFAULT_INTRO_SUBJECT_TEMPLATE;
  dom.introBody.value    = DEFAULT_INTRO_BODY_TEMPLATE;
  await saveIntroTemplate();
}

async function loadSheet() {
  const sync = await chrome.storage.sync.get({ [SHEET_URL_KEY]: "" });
  const local = await chrome.storage.local.get({
    [CONTACTS_KEY]: [],
    [HEADERS_KEY]:  []
  });
  dom.sheetUrl.value = sync[SHEET_URL_KEY] || "";
  state.contacts = Array.isArray(local[CONTACTS_KEY]) ? local[CONTACTS_KEY] : [];
  state.headers = Array.isArray(local[HEADERS_KEY])
    ? local[HEADERS_KEY].filter(Boolean)
    : inferHeadersFromContacts(state.contacts);
  dom.contactCount.textContent = String(state.contacts.length);
  renderTokenRows();
  setStatus(
    dom.sheetStatus,
    state.contacts.length
      ? `${state.contacts.length} contacts loaded.`
      : "No sheet data yet.",
    state.contacts.length ? "ok" : ""
  );
}

async function syncSheet() {
  const url = (dom.sheetUrl.value || "").trim();
  if (!url) { setStatus(dom.sheetStatus, "Paste a Google Sheet URL first.", "error"); return; }
  setStatus(dom.sheetStatus, "Syncing sheet…");
  setSheetLoading(true);
  try {
    const res = await fetch(toCsvExportUrl(url));
    if (!res.ok) throw new Error(`Fetch failed (${res.status}). Check sharing permissions.`);
    const { contacts, headers } = parseContactsCsv(await res.text());
    await chrome.storage.sync.set({ [SHEET_URL_KEY]: url });
    await chrome.storage.local.set({ [CONTACTS_KEY]: contacts, [HEADERS_KEY]: headers });
    state.contacts = contacts; state.headers = headers;
    dom.contactCount.textContent = String(contacts.length);
    renderTokenRows();
    refreshDossierPreview();
    setStatus(dom.sheetStatus, `Synced ${contacts.length} contacts.`, "ok");
  } catch (err) {
    setStatus(dom.sheetStatus, err.message || "Could not sync sheet.", "error");
  } finally {
    setSheetLoading(false);
  }
}

async function clearSheet() {
  await chrome.storage.local.set({ [CONTACTS_KEY]: [], [HEADERS_KEY]: [] });
  await chrome.storage.sync.set({ [SHEET_URL_KEY]: "" });
  dom.sheetUrl.value = "";
  state.contacts = []; state.headers = [];
  dom.contactCount.textContent = "0";
  renderTokenRows();
  refreshDossierPreview();
  setStatus(dom.sheetStatus, "Sheet data cleared.", "ok");
}

function setSheetLoading(loading) {
  dom.syncSheet.disabled  = loading;
  dom.clearSheet.disabled = loading;
  dom.sheetUrl.disabled   = loading;
  dom.syncSheet.textContent = loading ? "Syncing…" : "Sync sheet";
}

function inferHeadersFromContacts(contacts) {
  const c = contacts.find((x) => x && typeof x === "object");
  if (!c) return [];
  if (c.fields && typeof c.fields === "object") return Object.keys(c.fields);
  return [];
}

function renderTokenRows() {
  const baseTokens = state.headers.map((h) => `{${h}}`);
  // Always include {intro name} for the intro panel
  const introTokens = [...baseTokens];
  if (!introTokens.some((t) => normalizeHeaderKey(t.replace(/[{}]/g, "")) === "introname")) {
    introTokens.push("{intro name}");
  }
  fillTokenRow(dom.dmTokenRow, baseTokens.length ? baseTokens : ["{first name}", "{title}", "{company}"]);
  fillTokenRow(dom.introTokenRow, introTokens.length ? introTokens : ["{first name}", "{title}", "{company}", "{intro name}"]);
}

function fillTokenRow(row, tokens) {
  row.replaceChildren();
  tokens.forEach((tk) => {
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "token variable-btn";
    btn.dataset.token = tk; btn.textContent = tk;
    row.appendChild(btn);
  });
}

function insertTokenAtCursor(tk, target) {
  if (!target) return;
  const start = target.selectionStart ?? target.value.length;
  const end   = target.selectionEnd   ?? target.value.length;
  target.value = target.value.slice(0, start) + tk + target.value.slice(end);
  target.focus();
  target.setSelectionRange(start + tk.length, start + tk.length);
  refreshDossierPreview();
}

/* ─── dossier render ─── */

function refreshDossierPreview() {
  const dmTpl = dom.dmTemplate ? (dom.dmTemplate.value || DEFAULT_DM_TEMPLATE) : DEFAULT_DM_TEMPLATE;

  if (state.matched) {
    dom.dossier.classList.remove("standby");
    setLiveBadge("matched", "Matched");
    dom.dossierEyebrow.textContent = "From the open tab";
    dom.dossierName.innerHTML = formatNameHtml(state.matched.firstName, state.matched.lastName);
    dom.dossierRole.innerHTML = formatRole(state.matched);
    dom.previewLabel.textContent = "DM preview";
    dom.preview.innerHTML = renderTemplateAsHtml(dmTpl, state.matched);
    dom.copyDmBtn.disabled = false;
    dom.copyDmBtn.querySelector("span").textContent = "Copy DM";
    dom.copyIntroBtn.disabled = false;
    dom.copyIntroBtn.firstChild.textContent = "Copy intro";
    return;
  }

  if (state.detectedName) {
    dom.dossier.classList.remove("standby");
    setLiveBadge("nomatch", "No match");
    dom.dossierEyebrow.textContent = "Profile detected";
    dom.dossierName.textContent = state.detectedName;
    dom.dossierRole.textContent = "Not in your sheet — copy the raw template or add this contact.";
    dom.previewLabel.textContent = "DM preview · raw template";
    dom.preview.innerHTML = renderTemplateAsHtml(dmTpl, null);
    dom.copyDmBtn.disabled = false;
    dom.copyDmBtn.querySelector("span").textContent = "Copy raw DM";
    dom.copyIntroBtn.disabled = false;
    dom.copyIntroBtn.firstChild.textContent = "Copy raw intro";
    return;
  }

  // Standby
  dom.dossier.classList.add("standby");
  setLiveBadge("standby", "Standby");
  dom.dossierEyebrow.textContent = "Open a profile";
  dom.dossierName.textContent = "Open a LinkedIn profile to send a DM.";
  dom.dossierRole.textContent = "";
  dom.preview.innerHTML = "";
  dom.copyDmBtn.disabled = true;
  dom.copyDmBtn.querySelector("span").textContent = "Copy DM";
  dom.copyIntroBtn.disabled = true;
  dom.copyIntroBtn.firstChild.textContent = "Copy intro";
}

function formatNameHtml(first, last) {
  const f = (first || "").trim();
  const l = (last  || "").trim();
  if (!f && !l) return "";
  if (!l) return escapeHtml(f);
  return `${escapeHtml(f)} <em>${escapeHtml(l)}</em>`;
}

function formatRole(c) {
  const parts = [];
  if (c.title)   parts.push(escapeHtml(c.title));
  if (c.company) parts.push(escapeHtml(c.company));
  return parts.join(`<span class="sep">·</span>`);
}

/* ─── copy actions ─── */

async function copyDm() {
  const tpl = dom.dmTemplate.value || DEFAULT_DM_TEMPLATE;
  const text = renderTemplate(tpl, state.matched || null);
  try {
    await navigator.clipboard.writeText(text);
    setStatus(dom.copyStatus, "DM copied to clipboard.", "ok");
    setTimeout(() => setStatus(dom.copyStatus, ""), 2400);
  } catch (e) {
    setStatus(dom.copyStatus, "Could not copy. Click in the popup and retry.", "error");
  }
}

async function copyIntro() {
  const subjectTpl = dom.introSubject.value || DEFAULT_INTRO_SUBJECT_TEMPLATE;
  const bodyTpl    = dom.introBody.value    || DEFAULT_INTRO_BODY_TEMPLATE;
  const subject    = renderTemplate(subjectTpl, state.matched || null);
  const body       = renderTemplate(bodyTpl, state.matched || null);
  const text = `${subject}\n\n${body}`;
  try {
    await navigator.clipboard.writeText(text);
    setStatus(dom.copyStatus, "Intro (title + body) copied to clipboard.", "ok");
    setTimeout(() => setStatus(dom.copyStatus, ""), 2400);
  } catch (e) {
    setStatus(dom.copyStatus, "Could not copy. Click in the popup and retry.", "error");
  }
}

/* ─── tabs ─── */

const PANELS = [
  { tab: "tabSheet",     panel: "panelSheet",     name: "sheet" },
  { tab: "tabDm",        panel: "panelDm",        name: "dm" },
  { tab: "tabIntro",     panel: "panelIntro",     name: "intro" },
  { tab: "tabShortcuts", panel: "panelShortcuts", name: "shortcuts" }
];

async function loadActiveTab() {
  const r = await chrome.storage.sync.get({ [ACTIVE_TAB_KEY]: "sheet" });
  selectTab(r[ACTIVE_TAB_KEY]);
}
async function selectTab(name) {
  const target = PANELS.find((p) => p.name === name) || PANELS[0];
  PANELS.forEach((p) => {
    const isActive = p === target;
    dom[p.tab].setAttribute("aria-selected", String(isActive));
    dom[p.panel].hidden = !isActive;
  });
  await chrome.storage.sync.set({ [ACTIVE_TAB_KEY]: target.name });
}

/* ─── tab/profile detection ─── */

async function ensureContentScript(tabId) {
  const [{ result: loaded } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__ORTUS_DM_ASSISTANT_VERSION__ || null
  });
  if (loaded === CONTENT_VERSION) return;
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

async function detectActiveProfile() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\/([^/]+\.)?linkedin\.com\/in\//i.test(tab.url || "")) {
      state.matched = null;
      state.detectedName = "";
      return;
    }
    await ensureContentScript(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, {
      source: `ortus-dm:${CONTENT_VERSION}`,
      action: "getActiveProfileName"
    });
    const name = (response?.name || "").trim();
    if (!name) {
      state.matched = null;
      state.detectedName = "";
      return;
    }
    const matched = (typeof matchContact === "function")
      ? matchContact(name, state.contacts)
      : null;
    state.matched = matched;
    state.detectedName = matched ? "" : name;
  } catch (err) {
    console.warn("Ortus Club DM: profile detection failed", err);
    state.matched = null;
    state.detectedName = "";
  }
}

/* ─── diagnose ─── */

async function getActiveLinkedInTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:\/\/([^/]+\.)?linkedin\.com\//i.test(tab.url || "")) {
    throw new Error("Open a LinkedIn profile tab first.");
  }
  return tab;
}

async function runDiagnosis() {
  dom.diagnose.disabled = true;
  setStatus(dom.diagnoseStatus, "Running diagnosis…");
  try {
    const tab = await getActiveLinkedInTab();
    await ensureContentScript(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, {
      source: `ortus-dm:${CONTENT_VERSION}`,
      action: "diagnoseProfile"
    });
    if (!response?.ok) throw new Error(response?.error || "Diagnosis failed.");
    const report = JSON.stringify(response.report, null, 2);
    await navigator.clipboard.writeText(report);
    console.log("Ortus Club DM diagnosis", response.report);
    setStatus(dom.diagnoseStatus, "Diagnosis copied to clipboard.", "ok");
  } catch (e) {
    setStatus(dom.diagnoseStatus, e.message || "Could not run diagnosis.", "error");
  } finally {
    dom.diagnose.disabled = false;
  }
}

/* ─── wiring ─── */

dom.toggle.addEventListener("click", toggleEnabled);
dom.saveDmBtn.addEventListener("click", saveDmTemplate);
dom.resetDmBtn.addEventListener("click", resetDmTemplate);
dom.saveIntroBtn.addEventListener("click", saveIntroTemplate);
dom.resetIntroBtn.addEventListener("click", resetIntroTemplate);
dom.dmTemplate.addEventListener("input", refreshDossierPreview);
dom.introName.addEventListener("input", () => {
  state.introName = (dom.introName.value || "").trim() || DEFAULT_INTRO_NAME;
  refreshDossierPreview();
});
dom.syncSheet.addEventListener("click", syncSheet);
dom.clearSheet.addEventListener("click", clearSheet);
dom.diagnose.addEventListener("click", runDiagnosis);
dom.copyDmBtn.addEventListener("click", copyDm);
dom.copyIntroBtn.addEventListener("click", copyIntro);

// Tokens insert into the most recently focused editable field of their panel.
[dom.dmTemplate].forEach((f) => f.addEventListener("focus", () => state.activeDmField = f));
[dom.introSubject, dom.introBody].forEach((f) => f.addEventListener("focus", () => state.activeIntroField = f));
state.activeDmField = dom.dmTemplate;
state.activeIntroField = dom.introBody;

dom.dmTokenRow.addEventListener("click", (e) => {
  const btn = e.target.closest(".variable-btn");
  const tk = btn?.dataset?.token;
  if (tk) insertTokenAtCursor(tk, state.activeDmField || dom.dmTemplate);
});
dom.introTokenRow.addEventListener("click", (e) => {
  const btn = e.target.closest(".variable-btn");
  const tk = btn?.dataset?.token;
  if (tk) insertTokenAtCursor(tk, state.activeIntroField || dom.introBody);
});

PANELS.forEach((p) => dom[p.tab].addEventListener("click", () => selectTab(p.name)));

/* ─── boot ─── */

(async function boot() {
  await loadEnabled();
  await loadBrowserMode();
  await loadTemplates();
  await loadSheet();
  await loadActiveTab();
  await detectActiveProfile();
  refreshDossierPreview();
})();
