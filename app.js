(function () {
  "use strict";

  var SOURCES = {
    build: "https://mhwilds.wiki-db.com/sim/?hl=zh-hant",
    damage: "https://kuroyonhon.com/mhwilds/d/dame.php",
  };
  var STORAGE_KEY = "mhwilds-hub-records";
  var SYNC_KEY = "mhwilds-hub-sync-settings";
  var records = loadRecords();
  var syncSettings = loadSyncSettings();
  var autoSyncTimer = null;
  var isAutoSyncing = false;
  var bowGuidesCache = null;
  var recordFilter = "all";
  var searchFilters = [
    "\u5168\u90e8",
    "\u9b54\u7269",
    "\u6b66\u5668",
    "\u9632\u5177",
    "\u6280\u80fd",
    "\u9053\u5177",
    "\u4efb\u52d9",
    "\u88dd\u98fe\u54c1",
    "\u8b77\u77f3",
    "\u4f7f\u547d\u6e05\u55ae",
    "\u98df\u4e8b\u6280\u80fd",
    "\u96a8\u5f9e\u6b66\u5668",
    "\u96a8\u5f9e\u9632\u5177",
    "\u52f3\u7ae0",
    "\u7375\u87f2",
  ];

  var labels = {
    build: "\u914d\u88dd",
    damage: "\u50b7\u5bb3",
    other: "\u5176\u4ed6",
    open: "\u958b\u555f",
    remove: "\u522a\u9664",
    noNote: "\u6c92\u6709\u5099\u8a3b",
  };

  var weapons = [
    item("\u5927\u528d", "Great Sword", "\u84c4\u529b\u3001\u62b5\u6d88\u3001\u771f\u84c4\u7bc0\u594f"),
    item("\u592a\u5200", "Long Sword", "\u7df4\u6c23\u3001\u770b\u7834\u3001\u6c23\u5203\u5168\u65cb"),
    item("\u55ae\u624b\u528d", "Sword & Shield", "\u9748\u6d3b\u9053\u5177\u3001\u7cbe\u6e96\u9632\u79a6"),
    item("\u96d9\u528d", "Dual Blades", "\u9b3c\u4eba\u5316\u3001\u5c6c\u6027\u8207\u8010\u529b\u7ba1\u7406"),
    item("\u5927\u9318", "Hammer", "\u84c4\u529b\u3001\u660f\u53a5\u3001\u982d\u90e8\u58d3\u5236"),
    item("\u72e9\u7375\u7b1b", "Hunting Horn", "\u65cb\u5f8b\u3001\u652f\u63f4\u8207\u6253\u64ca\u8f38\u51fa"),
    item("\u9577\u69cd", "Lance", "\u9632\u79a6\u53cd\u64ca\u3001\u8cbc\u8eab\u58d3\u5236"),
    item("\u9283\u69cd", "Gunlance", "\u7832\u64ca\u3001\u88dd\u586b\u3001\u9f8d\u64ca\u7832"),
    item("\u65ac\u64ca\u65a7", "Switch Axe", "\u528d\u65a7\u5207\u63db\u3001\u89ba\u9192\u7206\u767c"),
    item("\u5145\u80fd\u65a7", "Charge Blade", "\u74f6\u7ba1\u7406\u3001\u8d85\u89e3\u8207\u76fe\u5f37\u5316"),
    item("\u64cd\u87f2\u68cd", "Insect Glaive", "\u7375\u87f2\u8403\u53d6\u3001\u7a7a\u6230\u8207\u9023\u6bb5"),
    item("\u8f15\u5f29\u69cd", "Light Bowgun", "\u901f\u5c04\u3001\u5f48\u7a2e\u8207\u6a5f\u52d5\u8f38\u51fa"),
    item("\u91cd\u5f29\u69cd", "Heavy Bowgun", "\u706b\u529b\u3001\u76fe\u724c\u8207\u7279\u6b8a\u5f48"),
    item("\u5f13", "Bow", "\u84c4\u529b\u968e\u6bb5\u3001\u74f6\u7a2e\u8207\u8010\u529b\u5faa\u74b0", "", "bow"),
  ];

  function item(name, en, summary, guideUrl, guideKey) {
    return { name: name, en: en, summary: summary, guideUrl: guideUrl || "", guideKey: guideKey || "" };
  }

  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  function loadRecords() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (error) {
      return [];
    }
  }

  function saveRecords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function defaultSyncSettings() {
    return {
      token: "",
      owner: "squaretsai",
      repo: "wilds-hub",
      branch: "main",
      path: "data/user-records.json",
      autoSync: true,
    };
  }

  function loadSyncSettings() {
    var defaults = defaultSyncSettings();
    var stored;

    try {
      stored = JSON.parse(localStorage.getItem(SYNC_KEY) || "{}");
    } catch (error) {
      stored = {};
    }

    return {
      token: stored.token || defaults.token,
      owner: stored.owner || defaults.owner,
      repo: stored.repo || defaults.repo,
      branch: stored.branch || defaults.branch,
      path: stored.path || defaults.path,
      autoSync: stored.autoSync !== false,
    };
  }

  function saveSyncSettings(settings) {
    syncSettings = settings;
    localStorage.setItem(SYNC_KEY, JSON.stringify(syncSettings));
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }

  function filenameStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function detectRecordType(url) {
    if (url.indexOf("mhwilds.wiki-db.com/sim") !== -1) return "build";
    if (url.indexOf("kuroyonhon.com/mhwilds/d/dame.php") !== -1) return "damage";
    return "other";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[char];
    });
  }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, "");
  }

  function normalizeRecord(raw) {
    var url;

    if (!raw || typeof raw !== "object") return null;
    try {
      url = new URL(String(raw.url || "").trim()).href;
    } catch (error) {
      return null;
    }

    return {
      id: String(raw.id || makeId()),
      name: String(raw.name || "\u672a\u547d\u540d\u7d00\u9304").trim(),
      type: ["build", "damage", "other"].indexOf(raw.type) === -1 ? detectRecordType(url) : raw.type,
      url: url,
      note: String(raw.note || "").trim(),
      createdAt: raw.createdAt && !Number.isNaN(Date.parse(raw.createdAt)) ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
    };
  }

  function parseRecordPayload(text) {
    var parsed = JSON.parse(text);
    var source = Array.isArray(parsed) ? parsed : parsed.records;
    var imported;

    if (!Array.isArray(source)) {
      throw new Error("\u627e\u4e0d\u5230\u7d00\u9304\u9663\u5217");
    }

    imported = source.map(normalizeRecord).filter(Boolean);
    if (!imported.length && source.length) {
      throw new Error("\u6c92\u6709\u53ef\u7528\u7684\u7d00\u9304");
    }
    return imported;
  }

  function mergeRecords(imported) {
    return mergeRecordCollections(records, imported);
  }

  function mergeRecordCollections(primary, secondary) {
    var existingByKey = {};
    var merged = [];

    primary.concat(secondary).forEach(function (record) {
      var key = record.url;
      if (existingByKey[key]) {
        return;
      }
      existingByKey[key] = true;
      merged.push(record);
    });

    return merged.sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  function encodeContent(text) {
    var bytes;
    var binary = "";
    var i;
    var chunk;

    if (window.TextEncoder) {
      bytes = new TextEncoder().encode(text);
      for (i = 0; i < bytes.length; i += 8192) {
        chunk = bytes.slice(i, i + 8192);
        binary += String.fromCharCode.apply(null, chunk);
      }
      return btoa(binary);
    }
    return btoa(unescape(encodeURIComponent(text)));
  }

  function decodeContent(content) {
    var binary = atob(String(content || "").replace(/\s+/g, ""));
    var bytes;
    var i;

    if (window.TextDecoder) {
      bytes = new Uint8Array(binary.length);
      for (i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder("utf-8").decode(bytes);
    }
    return decodeURIComponent(escape(binary));
  }

  function encodedPath(path) {
    return String(path || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
  }

  function collectSyncSettings() {
    return {
      token: $("#syncToken").value.trim(),
      owner: $("#syncOwner").value.trim(),
      repo: $("#syncRepo").value.trim(),
      branch: $("#syncBranch").value.trim(),
      path: $("#syncPath").value.trim(),
      autoSync: $("#syncAuto").checked,
    };
  }

  function githubHeaders(settings) {
    var headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    if (settings.token) {
      headers.Authorization = "Bearer " + settings.token;
    }
    return headers;
  }

  function githubContentUrl(settings) {
    return "https://api.github.com/repos/" + encodeURIComponent(settings.owner) + "/" + encodeURIComponent(settings.repo) + "/contents/" + encodedPath(settings.path);
  }

  function validateSyncSettings(settings, needsToken) {
    if (!settings.owner || !settings.repo || !settings.branch || !settings.path) {
      throw new Error("GitHub \u8a2d\u5b9a\u4e0d\u5b8c\u6574");
    }
    if (needsToken && !settings.token) {
      throw new Error("\u4e0a\u50b3\u9700\u8981 GitHub Token");
    }
  }

  function fetchGitHubRecords(settings) {
    var url = githubContentUrl(settings) + "?ref=" + encodeURIComponent(settings.branch);

    return fetch(url, {
      headers: githubHeaders(settings),
      cache: "no-store",
    }).then(function (response) {
      if (response.status === 404) return null;
      if (!response.ok) {
        return response.text().then(function (text) {
          throw new Error("GitHub \u8b80\u53d6\u5931\u6557 (" + response.status + "): " + text.slice(0, 120));
        });
      }
      return response.json();
    }).then(function (payload) {
      if (!payload) return null;
      return {
        sha: payload.sha,
        records: parseRecordPayload(decodeContent(payload.content || "")),
      };
    });
  }

  function putGitHubRecords(settings, outgoingRecords, sha) {
    var body = {
      message: "Update MH Wilds records",
      branch: settings.branch,
      content: encodeContent(JSON.stringify({
        updatedAt: new Date().toISOString(),
        records: outgoingRecords,
      }, null, 2)),
    };

    if (sha) body.sha = sha;

    return fetch(githubContentUrl(settings), {
      method: "PUT",
      headers: Object.assign({
        "Content-Type": "application/json",
      }, githubHeaders(settings)),
      body: JSON.stringify(body),
    }).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (text) {
          throw new Error("GitHub \u4e0a\u50b3\u5931\u6557 (" + response.status + "): " + text.slice(0, 120));
        });
      }
      return response.json();
    });
  }

  function setSyncMessage(text, isError) {
    var message = $("#syncMessage");
    if (!message) return;
    message.textContent = text || "";
    message.className = "inline-message" + (isError ? " error" : "");
  }

  function setSyncBusy(isBusy) {
    $$("[data-sync-busy], #saveSyncSettings, #syncPullRecords, #syncPushRecords, #syncMergeRecords").forEach(function (button) {
      button.disabled = isBusy;
    });
  }

  function runSync(action) {
    var settings;

    setSyncMessage("", false);
    try {
      settings = collectSyncSettings();
      validateSyncSettings(settings, action !== "pull");
      saveSyncSettings(settings);
    } catch (error) {
      setSyncMessage(error.message, true);
      return;
    }

    setSyncBusy(true);

    return (action === "pull" ? fetchGitHubRecords(settings).then(function (remote) {
      if (!remote) throw new Error("GitHub \u9084\u6c92\u6709\u7d00\u9304\u6a94\uff0c\u5148\u5f9e\u6709\u7d00\u9304\u7684\u96fb\u8166\u4e0a\u50b3");
      records = remote.records;
      saveRecords();
      renderRecords();
      setSyncMessage("\u5df2\u5f9e GitHub \u4e0b\u8f09 " + records.length + " \u7b46\u7d00\u9304\u3002", false);
    }) : fetchGitHubRecords(settings).then(function (remote) {
      var outgoing = action === "merge" && remote ? mergeRecordCollections(records, remote.records) : records;
      var sha = remote && remote.sha;

      records = outgoing;
      saveRecords();
      renderRecords();
      return putGitHubRecords(settings, records, sha).then(function () {
        setSyncMessage((action === "merge" ? "\u5df2\u96d9\u5411\u5408\u4f75\u4e26\u4e0a\u50b3 " : "\u5df2\u4e0a\u50b3 ") + records.length + " \u7b46\u7d00\u9304\u5230 GitHub\u3002", false);
      });
    })).catch(function (error) {
      setSyncMessage(error.message, true);
    }).finally(function () {
      setSyncBusy(false);
    });
  }

  function recordsChanged(before, after) {
    return JSON.stringify(before) !== JSON.stringify(after);
  }

  function autoSyncNow(reason) {
    var settings = syncSettings;

    if (!settings.autoSync || isAutoSyncing) return Promise.resolve();
    if (!settings.owner || !settings.repo || !settings.branch || !settings.path) return Promise.resolve();

    isAutoSyncing = true;
    setSyncMessage("\u6b63\u5728\u81ea\u52d5\u540c\u6b65...", false);

    return fetchGitHubRecords(settings).then(function (remote) {
      var merged = remote ? mergeRecordCollections(records, remote.records) : records;
      var shouldUpload = !!settings.token && (!remote || recordsChanged(remote.records, merged) || reason === "local-change");

      if (recordsChanged(records, merged)) {
        records = merged;
        saveRecords();
        renderRecords();
      }

      if (!shouldUpload) {
        setSyncMessage(remote ? "\u5df2\u81ea\u52d5\u540c\u6b65 GitHub\u3002" : "GitHub \u9084\u6c92\u6709\u7d00\u9304\u6a94\u3002", !remote && !settings.token);
        return null;
      }

      return putGitHubRecords(settings, records, remote && remote.sha).then(function () {
        setSyncMessage("\u5df2\u81ea\u52d5\u540c\u6b65\u5230 GitHub\u3002", false);
      });
    }).catch(function (error) {
      setSyncMessage("\u81ea\u52d5\u540c\u6b65\u5931\u6557\uff1a" + error.message, true);
    }).finally(function () {
      isAutoSyncing = false;
    });
  }

  function scheduleAutoSync() {
    if (!syncSettings.autoSync || !syncSettings.token) return;
    window.clearTimeout(autoSyncTimer);
    autoSyncTimer = window.setTimeout(function () {
      autoSyncNow("local-change");
    }, 900);
  }

  function applyImportedRecords(mode) {
    var imported;
    var text = $("#importText").value.trim();

    if (!text) {
      setMessage("\u8acb\u5148\u9078\u64c7 JSON \u6a94\u6216\u8cbc\u4e0a JSON \u5167\u5bb9\u3002", true);
      return;
    }

    try {
      imported = parseRecordPayload(text);
      records = mode === "replace" ? imported : mergeRecords(imported);
      saveRecords();
      renderRecords();
      closeDialog($("#importDialog"));
      $("#importText").value = "";
      $("#importFile").value = "";
      setMessage((mode === "replace" ? "\u5df2\u53d6\u4ee3\u672c\u6a5f\u7d00\u9304\uff1a" : "\u5df2\u5408\u4f75\u532f\u5165\uff1a") + imported.length + " \u7b46\u3002", false);
      scheduleAutoSync();
    } catch (error) {
      setMessage("\u532f\u5165\u5931\u6557\uff1a" + error.message, true);
    }
  }

  function downloadRecords() {
    var blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
    var link = document.createElement("a");

    link.href = URL.createObjectURL(blob);
    link.download = "mhwilds-records-" + filenameStamp() + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function setMessage(text, isError) {
    var message = $("#recordMessage");
    if (!message) return;
    message.textContent = text || "";
    message.className = "inline-message" + (isError ? " error" : "");
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      return;
    }
    dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") {
      dialog.close();
      return;
    }
    dialog.removeAttribute("open");
  }

  function renderRecords() {
    var list = $("#recordList");
    var visible;
    if (!list) return;

    visible = records.filter(function (record) {
      return recordFilter === "all" || record.type === recordFilter;
    });

    if (!visible.length) {
      list.innerHTML = '<article class="record-card"><p>\u76ee\u524d\u6c92\u6709\u7d00\u9304\u3002\u8cbc\u4e0a\u914d\u88dd\u6216\u50b7\u5bb3\u8a08\u7b97\u7db2\u5740\u5f8c\uff0c\u9019\u88e1\u6703\u8b8a\u6210\u4f60\u7684\u56de\u8a2a\u6e05\u55ae\u3002</p></article>';
      return;
    }

    list.innerHTML = visible.map(function (record) {
      return [
        '<article class="record-card">',
        "<header>",
        "<h3>" + escapeHtml(record.name) + "</h3>",
        '<span class="tag">' + (labels[record.type] || labels.other) + "</span>",
        "</header>",
        "<p>" + escapeHtml(record.note || labels.noNote) + "</p>",
        "<small>" + new Date(record.createdAt).toLocaleString("zh-TW") + "</small>",
        '<div class="card-actions">',
        '<a class="button small primary" href="' + escapeHtml(record.url) + '" target="_blank" rel="noreferrer">' + labels.open + "</a>",
        '<button class="button small danger" type="button" data-delete-record="' + escapeHtml(record.id) + '">' + labels.remove + "</button>",
        "</div>",
        "</article>",
      ].join("");
    }).join("");
  }

  function initRecords() {
    var form = $("#recordForm");
    if (!form) return;

    form.addEventListener("submit", function (event) {
      var url;
      var selectedType;

      event.preventDefault();
      setMessage("", false);
      url = $("#recordUrl").value.trim();
      selectedType = $("#recordType").value;

      try {
        new URL(url);
      } catch (error) {
        setMessage("\u7db2\u5740\u683c\u5f0f\u4e0d\u6b63\u78ba\uff0c\u8acb\u8cbc\u4e0a\u5b8c\u6574 URL\u3002", true);
        return;
      }

      records.unshift({
        id: makeId(),
        name: $("#recordName").value.trim(),
        type: selectedType === "auto" ? detectRecordType(url) : selectedType,
        url: url,
        note: $("#recordNote").value.trim(),
        createdAt: new Date().toISOString(),
      });

      try {
        saveRecords();
        event.currentTarget.reset();
        renderRecords();
        setMessage("\u5df2\u5132\u5b58\u7d00\u9304\u3002", false);
        scheduleAutoSync();
      } catch (error) {
        setMessage("\u5132\u5b58\u5931\u6557\uff1a\u700f\u89bd\u5668\u53ef\u80fd\u7981\u7528\u672c\u5730\u5132\u5b58\u3002", true);
      }
    });

    $("#recordUrl").addEventListener("input", function (event) {
      if ($("#recordType").value === "auto") return;
      $("#recordType").value = detectRecordType(event.target.value);
    });

    $("#recordList").addEventListener("click", function (event) {
      var id = event.target.getAttribute("data-delete-record");
      if (!id) return;
      records = records.filter(function (record) {
        return record.id !== id;
      });
      saveRecords();
      renderRecords();
      setMessage("\u5df2\u522a\u9664\u7d00\u9304\u3002", false);
      scheduleAutoSync();
    });

    $$("[data-record-filter]").forEach(function (button) {
      button.addEventListener("click", function () {
        recordFilter = button.getAttribute("data-record-filter");
        $$("[data-record-filter]").forEach(function (item) {
          item.classList.toggle("active", item === button);
        });
        renderRecords();
      });
    });

    $("#exportRecords").addEventListener("click", function () {
      $("#exportText").value = JSON.stringify(records, null, 2);
      openDialog($("#exportDialog"));
    });

    $("#downloadRecords").addEventListener("click", downloadRecords);

    $("#importRecords").addEventListener("click", function () {
      $("#importText").value = "";
      $("#importFile").value = "";
      openDialog($("#importDialog"));
    });

    $("#importFile").addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      var reader;

      if (!file) return;
      reader = new FileReader();
      reader.addEventListener("load", function () {
        $("#importText").value = String(reader.result || "");
      });
      reader.addEventListener("error", function () {
        setMessage("\u8b80\u53d6\u6a94\u6848\u5931\u6557\uff0c\u8acb\u6539\u7528\u8cbc\u4e0a JSON\u3002", true);
      });
      reader.readAsText(file);
    });

    $("#mergeRecords").addEventListener("click", function () {
      applyImportedRecords("merge");
    });

    $("#replaceRecords").addEventListener("click", function () {
      applyImportedRecords("replace");
    });

    initRecordSync();

    $("#clearRecords").addEventListener("click", function () {
      records = [];
      saveRecords();
      renderRecords();
      setMessage("\u5df2\u6e05\u7a7a\u6240\u6709\u7d00\u9304\u3002", false);
      scheduleAutoSync();
    });

    renderRecords();
  }

  function initRecordSync() {
    if (!$("#syncToken")) return;

    $("#syncToken").value = syncSettings.token;
    $("#syncOwner").value = syncSettings.owner;
    $("#syncRepo").value = syncSettings.repo;
    $("#syncBranch").value = syncSettings.branch;
    $("#syncPath").value = syncSettings.path;
    $("#syncAuto").checked = syncSettings.autoSync;

    $("#saveSyncSettings").addEventListener("click", function () {
      try {
        saveSyncSettings(collectSyncSettings());
        setSyncMessage("\u5df2\u5132\u5b58 GitHub \u540c\u6b65\u8a2d\u5b9a\u3002", false);
        autoSyncNow("settings");
      } catch (error) {
        setSyncMessage(error.message, true);
      }
    });

    $("#syncPullRecords").addEventListener("click", function () {
      runSync("pull");
    });

    $("#syncPushRecords").addEventListener("click", function () {
      runSync("push");
    });

    $("#syncMergeRecords").addEventListener("click", function () {
      runSync("merge");
    });

    window.setTimeout(function () {
      autoSyncNow("load");
    }, 500);
  }

  function renderWeaponDetail(weapon) {
    var detail = $("#weaponDetail");
    if (!detail || !weapon) return;
    detail.onclick = null;
    if (weapon.guideKey === "bow") {
      renderBowGuideDetail(detail, weapon);
      return;
    }
    if (weapon.guideUrl) {
      detail.innerHTML = [
        '<div class="guide-embed-head">',
        '<div><h2>' + escapeHtml(weapon.name) + ' <span class="tag">' + escapeHtml(weapon.en) + '</span></h2>',
        '<p>' + escapeHtml(weapon.summary) + '</p></div>',
        '<a class="button small primary" href="' + escapeHtml(weapon.guideUrl) + '" target="_blank" rel="noreferrer">\u53e6\u958b\u653b\u7565</a>',
        '</div>',
        '<iframe class="guide-frame" src="' + escapeHtml(weapon.guideUrl) + '" title="' + escapeHtml(weapon.name) + '\u653b\u7565"></iframe>',
      ].join("");
      return;
    }
    detail.innerHTML = [
      "<h2>" + escapeHtml(weapon.name) + ' <span class="tag">' + escapeHtml(weapon.en) + "</span></h2>",
      "<p>" + escapeHtml(weapon.summary) + "</p>",
      '<div class="placeholder-box">',
      "<strong>\u653b\u7565\u5167\u5bb9\u9810\u7559\u5340</strong>",
      "<p>\u9019\u88e1\u5148\u4e0d\u653e\u9023\u7d50\u3002\u7b49\u4f60\u88dc\u4e0a\u5f13\u6216\u5176\u4ed6\u6b66\u5668\u653b\u7565\u9801\u9762\uff0c\u6211\u518d\u628a\u5167\u5bb9\u5d4c\u5165\u9019\u500b\u7248\u9762\u3002</p>",
      "</div>",
    ].join("");
  }

  function loadBowGuides() {
    if (bowGuidesCache) return Promise.resolve(bowGuidesCache);
    return fetch("data/bow-guides.json", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("missing bow guide data");
        return response.json();
      })
      .then(function (payload) {
        bowGuidesCache = payload;
        return bowGuidesCache;
      });
  }

  function renderGuideTags(tags) {
    return (tags || []).map(function (tag) {
      return '<span class="tag">' + escapeHtml(tag) + "</span>";
    }).join("");
  }

  function renderBowArticle(guide) {
    return [
      '<article class="guide-article">',
      '<div class="guide-article-head">',
      '<p class="eyebrow">' + escapeHtml(guide.date || "") + "</p>",
      "<h2>" + escapeHtml(guide.title) + "</h2>",
      "<p>" + escapeHtml(guide.summary) + "</p>",
      '<div class="tags">' + renderGuideTags(guide.tags) + "</div>",
      "</div>",
      '<section class="takeaway inline-takeaway">',
      "<h3>\u4e00\u53e5\u8a71\u91cd\u9ede</h3>",
      "<p>" + escapeHtml(guide.takeaway) + "</p>",
      "</section>",
      (guide.sections || []).map(function (section) {
        return [
          '<section class="guide-section native-guide-section">',
          "<h3>" + escapeHtml(section.heading) + "</h3>",
          "<ul>",
          (section.items || []).map(function (text) {
            return "<li>" + escapeHtml(text) + "</li>";
          }).join(""),
          "</ul>",
          "</section>",
        ].join("");
      }).join(""),
      guide.sourceUrl ? '<div class="guide-source"><span>\u4f86\u6e90</span><a href="' + escapeHtml(guide.sourceUrl) + '" target="_blank" rel="noreferrer">' + escapeHtml(guide.sourceUrl) + "</a></div>" : "",
      "</article>",
    ].join("");
  }

  function renderBowGuidePanel(detail, weapon, payload, selectedId) {
    var guides = payload.guides || [];
    var active = guides.find(function (guide) {
      return guide.id === selectedId;
    }) || guides[0];

    detail.innerHTML = [
      '<div class="native-guide-head">',
      '<div><h2>' + escapeHtml(weapon.name) + ' <span class="tag">' + escapeHtml(weapon.en) + '</span></h2>',
      '<p>' + escapeHtml(weapon.summary) + '</p></div>',
      '<span class="tag">\u6700\u5f8c\u66f4\u65b0 ' + escapeHtml(payload.updatedAt || "") + "</span>",
      "</div>",
      '<div class="bow-guide-shell">',
      '<aside class="bow-guide-list" aria-label="\u5f13\u653b\u7565\u6e05\u55ae">',
      guides.map(function (guide) {
        return [
          '<button class="bow-guide-card' + (guide === active ? " active" : "") + '" type="button" data-bow-guide="' + escapeHtml(guide.id) + '">',
          "<small>" + escapeHtml(guide.date || "") + "</small>",
          "<strong>" + escapeHtml(guide.title) + "</strong>",
          "<span>" + escapeHtml(guide.summary) + "</span>",
          '<span class="tags">' + renderGuideTags((guide.tags || []).slice(0, 3)) + "</span>",
          "</button>",
        ].join("");
      }).join(""),
      "</aside>",
      '<div class="bow-guide-content">',
      active ? renderBowArticle(active) : '<article class="guide-article"><p>\u5c1a\u7121\u5f13\u653b\u7565\u3002</p></article>',
      "</div>",
      "</div>",
      '<div class="guide-maintenance-note">',
      '<strong>\u5f8c\u7e8c\u66f4\u65b0\u65b9\u5f0f</strong>',
      '<p>\u4ee5\u5f8c\u4f60\u8cbc YouTube \u7559\u8a00\u6216\u5b57\u5e55\u5167\u5bb9\u7d66\u6211\uff0c\u6211\u6703\u6574\u7406\u6210\u540c\u4e00\u7a2e\u7d50\u69cb\uff0c\u52a0\u5165 <code>data/bow-guides.json</code>\uff0c\u4e26\u81ea\u52d5\u5e36\u5165\u7576\u5929\u65e5\u671f\u3002</p>',
      "</div>",
    ].join("");
  }

  function renderBowGuideDetail(detail, weapon) {
    detail.innerHTML = '<div class="placeholder-box"><p>\u6b63\u5728\u8f09\u5165\u5f13\u653b\u7565...</p></div>';
    loadBowGuides()
      .then(function (payload) {
        renderBowGuidePanel(detail, weapon, payload);
        detail.onclick = function (event) {
          var button = event.target.closest("[data-bow-guide]");
          if (!button) return;
          renderBowGuidePanel(detail, weapon, payload, button.getAttribute("data-bow-guide"));
        };
      })
      .catch(function () {
        detail.innerHTML = '<div class="placeholder-box"><p>\u5f13\u653b\u7565\u8cc7\u6599\u8f09\u5165\u5931\u6557\u3002</p></div>';
      });
  }

  function initWeapons() {
    var select = $("#weaponSelect");
    if (!select) return;

    select.innerHTML = weapons.map(function (weapon, index) {
      return '<option value="' + index + '">' + escapeHtml(weapon.name) + " / " + escapeHtml(weapon.en) + "</option>";
    }).join("");
    select.addEventListener("change", function () {
      renderWeaponDetail(weapons[Number(select.value)]);
    });
    renderWeaponDetail(weapons[0]);
  }

  function scoreCategoryItem(item, query) {
    var haystack = normalize(item.name + " " + item.summary + " " + item.path);
    var needle = normalize(query);
    var score = 0;
    var cursor = 0;
    var i;
    var found;

    if (!needle) return 1;
    found = haystack.indexOf(needle);
    if (found !== -1) return 1000 - found;
    for (i = 0; i < needle.length; i += 1) {
      found = haystack.indexOf(needle.charAt(i), cursor);
      if (found === -1) return 0;
      score += Math.max(1, 20 - (found - cursor));
      cursor = found + 1;
    }
    return score;
  }

  function renderCategoryItems(container, countNode, payload, query) {
    var matched = payload.items.map(function (item) {
      return {
        name: item.name,
        summary: item.summary,
        path: item.path,
        score: scoreCategoryItem(item, query),
      };
    }).filter(function (item) {
      return item.score > 0;
    }).sort(function (a, b) {
      return b.score - a.score || a.name.localeCompare(b.name, "zh-Hant");
    });

    countNode.textContent = matched.length + " / " + payload.count + " \u7b46";
    container.innerHTML = matched.slice(0, 200).map(function (item) {
      return [
        '<article class="category-item">',
        "<header>",
        "<h2>" + escapeHtml(item.name) + "</h2>",
        '<span class="tag">' + escapeHtml(payload.label) + "</span>",
        "</header>",
        "<p>" + escapeHtml(item.summary || "\u5c1a\u7121\u6458\u8981") + "</p>",
        '<code class="path-label">' + escapeHtml(item.path) + "</code>",
        "</article>",
      ].join("");
    }).join("") || '<article class="category-item"><p>\u6c92\u6709\u627e\u5230\u76f8\u95dc\u8cc7\u6599\u3002</p></article>';
  }

  function initCategoryPage() {
    var page = document.querySelector("[data-category-page]");
    var list;
    var count;
    var filter;
    var category;

    if (!page) return;
    category = page.getAttribute("data-category-page");
    list = page.querySelector("[data-category-list]");
    count = page.querySelector("[data-category-count]");
    filter = page.querySelector("[data-category-filter]");

    fetch("./data/categories/" + category + ".json", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("missing category json");
        return response.json();
      })
      .then(function (payload) {
        renderCategoryItems(list, count, payload, "");
        filter.addEventListener("input", function () {
          renderCategoryItems(list, count, payload, filter.value);
        });
      })
      .catch(function () {
        count.textContent = "\u8f09\u5165\u5931\u6557";
        list.innerHTML = '<article class="category-item"><p>\u5206\u985e\u7d22\u5f15\u8f09\u5165\u5931\u6557\uff0c\u8acb\u78ba\u8a8d data/categories \u6a94\u6848\u5df2\u7522\u751f\u3002</p></article>';
      });
  }

  function scoreGlobalItem(item, query) {
    var haystack = item._searchText;
    var needle = normalize(query);
    var score = 0;
    var found;
    var cursor = 0;
    var i;

    if (!needle) return 0;
    found = normalize(item.title).indexOf(needle);
    if (found !== -1) return 5000 - found;
    found = haystack.indexOf(needle);
    if (found !== -1) return 2500 - found;

    for (i = 0; i < needle.length; i += 1) {
      found = haystack.indexOf(needle.charAt(i), cursor);
      if (found === -1) return 0;
      score += Math.max(2, 24 - (found - cursor));
      cursor = found + 1;
    }
    return score;
  }

  function renderGlobalResults(container, root, items, query, activeFilter) {
    var hasQuery = Boolean(query.trim());
    var matched = items.filter(function (item) {
      return activeFilter === "\u5168\u90e8" || item.category === activeFilter;
    }).map(function (item) {
      return {
        title: item.title,
        category: item.category,
        summary: item.summary,
        href: item.href,
        path: item.path,
        score: hasQuery ? scoreGlobalItem(item, query) : 1,
      };
    }).filter(function (item) {
      return item.score > 0;
    }).sort(function (a, b) {
      return b.score - a.score || a.title.localeCompare(b.title, "zh-Hant");
    }).slice(0, 30);

    if (!hasQuery && activeFilter === "\u5168\u90e8") {
      container.hidden = true;
      container.innerHTML = "";
      return;
    }

    container.hidden = false;
    if (!matched.length) {
      container.innerHTML = '<div class="k-search-empty">\u6c92\u6709\u627e\u5230\u76f8\u95dc\u8cc7\u6599</div>';
      return;
    }

    container.innerHTML = matched.map(function (item, index) {
      return [
        '<a class="k-search-result" href="' + escapeHtml(root + item.href) + '" data-search-rank="' + index + '">',
        '<span class="tag">' + escapeHtml(item.category) + '</span>',
        '<strong>' + escapeHtml(item.title) + '</strong>',
        '<small>' + escapeHtml(item.summary || item.path || "") + '</small>',
        '</a>',
      ].join("");
    }).join("");
  }

  function renderSearchFilters(container, activeFilter) {
    container.innerHTML = searchFilters.map(function (filter) {
      return [
        '<button class="k-search-filter',
        filter === activeFilter ? " active" : "",
        '" type="button" data-search-filter="' + escapeHtml(filter) + '">',
        escapeHtml(filter),
        '</button>',
      ].join("");
    }).join("");
  }

  function initGlobalSearch() {
    var widgets = $$(".k-global-search");
    if (!widgets.length) return;

    widgets.forEach(function (widget) {
      var input = widget.querySelector("[data-global-search-input]");
      var results = widget.querySelector("[data-global-search-results]");
      var root = widget.getAttribute("data-search-root") || "";
      var filterBar = document.createElement("div");
      var activeFilter = "\u5168\u90e8";
      var indexItems = [];
      var loaded = false;

      filterBar.className = "k-search-filters";
      filterBar.setAttribute("aria-label", "\u641c\u5c0b\u5206\u985e\u7be9\u9078");
      input.insertAdjacentElement("afterend", filterBar);
      renderSearchFilters(filterBar, activeFilter);

      function loadIndex() {
        if (loaded) return Promise.resolve(indexItems);
        return fetch(root + "data/local-search-index.json", { cache: "no-store" })
          .then(function (response) {
            if (!response.ok) throw new Error("missing search index");
            return response.json();
          })
          .then(function (items) {
            indexItems = items.map(function (item) {
              item._searchText = normalize([
                item.title,
                item.category,
                item.summary,
                item.path,
              ].join(" "));
              return item;
            });
            loaded = true;
            return indexItems;
          });
      }

      function updateResults() {
        var query = input.value;
        loadIndex()
          .then(function () {
            renderGlobalResults(results, root, indexItems, query, activeFilter);
          })
          .catch(function () {
            results.hidden = false;
            results.innerHTML = '<div class="k-search-empty">\u641c\u5c0b\u7d22\u5f15\u8f09\u5165\u5931\u6557</div>';
          });
      }

      input.addEventListener("input", function () {
        updateResults();
      });

      input.addEventListener("focus", function () {
        updateResults();
      });

      input.addEventListener("keydown", function (event) {
        var firstResult;
        if (event.key !== "Enter") return;
        firstResult = results.querySelector(".k-search-result");
        if (!firstResult) return;
        event.preventDefault();
        window.location.href = firstResult.getAttribute("href");
      });

      filterBar.addEventListener("click", function (event) {
        var button = event.target.closest("[data-search-filter]");
        if (!button) return;
        activeFilter = button.getAttribute("data-search-filter") || "\u5168\u90e8";
        renderSearchFilters(filterBar, activeFilter);
        updateResults();
        input.focus();
      });
    });

    document.addEventListener("click", function (event) {
      if (event.target.closest(".k-global-search")) return;
      $$(".k-search-results").forEach(function (results) {
        results.hidden = true;
      });
    });
  }

  function initMonsterVisuals() {
    var detail = $(".k-detail");
    var rootWidget = $(".k-global-search");
    var root = rootWidget ? rootWidget.getAttribute("data-search-root") || "" : "";
    var slug;
    var title;

    if (document.body.classList.contains("k-monsters-page")) {
      $(".k-list-page") && $(".k-list-page").classList.add("monster-card-list");
    }

    if (!detail || window.location.pathname.indexOf("/database/monsters/") === -1) return;
    if (detail.querySelector(".k-monster-hero")) return;

    title = detail.querySelector("h1");
    if (!title) return;
    slug = decodeURIComponent(window.location.pathname.split("/").pop() || "");

    fetch(root + "database-monsters.html", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("missing monster list");
        return response.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var row = Array.prototype.find.call(doc.querySelectorAll("tr"), function (candidate) {
          var link = candidate.querySelector('a[href*="database/monsters/"]');
          var href = link ? link.getAttribute("href") || "" : "";
          return href.slice(href.lastIndexOf("/") + 1) === slug;
        });
        var image = row && row.querySelector("img");
        var cells = row ? row.querySelectorAll("td") : [];
        var summary = cells[2] ? cells[2].textContent.trim() : "";
        var hero;
        var portrait;
        var copy;

        if (!image) return;

        hero = document.createElement("div");
        hero.className = "k-monster-hero";
        portrait = document.createElement("div");
        portrait.className = "k-monster-portrait";
        portrait.innerHTML = '<img src="' + escapeHtml(image.getAttribute("src") || "") + '" alt="">';
        copy = document.createElement("div");
        copy.className = "k-monster-hero-copy";
        copy.innerHTML = '<p class="eyebrow">\u9b54\u7269\u8cc7\u6599</p>';
        title.parentNode.insertBefore(hero, title);
        hero.appendChild(portrait);
        hero.appendChild(copy);
        copy.appendChild(title);
        if (summary) {
          copy.insertAdjacentHTML("beforeend", "<p>" + escapeHtml(summary) + "</p>");
        }
      })
      .catch(function () {
        return null;
      });
  }

  function init() {
    initRecords();
    initWeapons();
    initCategoryPage();
    initGlobalSearch();
    initMonsterVisuals();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}());
