/*************************************************************************
 * BunText - Premiere Pro UXP Plugin
 * Handles embedding, customizing, and applying hello 2.mogrt to the timeline.
 *************************************************************************/

// Environment references
let ppro = null;
let uxp = null;
let panelInitialized = false;

// Diagnostics logging helper
function logDiag(message) {
  const timestamp = new Date().toLocaleTimeString();
  const logElem = document.getElementById("diagnosticsLog");
  if (logElem) {
    logElem.textContent += `\n[${timestamp}] ${message}`;
    logElem.scrollTop = logElem.scrollHeight;
  }
  console.log(`[BunText ${timestamp}]`, message);
}

// Notification banner helper
function showNotification(text, type = "info") {
  const box = document.getElementById("notificationBox");
  if (!box) return;
  box.textContent = text;
  box.className = `notification-box ${type}`;
}

// Safe check for UXP & Premiere Pro host
function initEnvironment() {
  logDiag("Detecting environment...");

  // Check UXP
  try {
    uxp = window.require ? window.require("uxp") : null;
    if (uxp) {
      logDiag("UXP module detected.");
    }
  } catch (e) {
    logDiag("UXP module not available: " + e.message);
  }

  // Check Premiere Pro DOM
  try {
    ppro = window.require ? window.require("premierepro") : null;
    if (ppro) {
      logDiag("Premiere Pro DOM module ('premierepro') loaded successfully.");
    }
  } catch (e) {
    logDiag("Premiere Pro module not available in this context: " + e.message);
  }

  updateHostStatus();
}

// Update connection badge in UI
async function updateHostStatus() {
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");

  if (!statusDot || !statusText) return;

  if (!ppro) {
    statusDot.className = "status-dot disconnected";
    statusText.textContent = "Preview Mode (Host: Not connected)";
    logDiag("Running in standalone preview mode. Premiere Pro host not attached.");
    return;
  }

  try {
    let project = null;
    if (ppro.Project && typeof ppro.Project.getActiveProject === "function") {
      project = await ppro.Project.getActiveProject();
    } else if (ppro.app && ppro.app.project) {
      project = ppro.app.project;
    }

    if (project) {
      const sequence = typeof project.getActiveSequence === "function"
        ? await project.getActiveSequence()
        : project.activeSequence;

      statusDot.className = "status-dot connected";
      if (sequence && sequence.name) {
        statusText.textContent = `Connected: Seq "${sequence.name}"`;
      } else {
        statusText.textContent = `Connected: Project active (No sequence)`;
      }
      logDiag(`Connected to Premiere Pro. Project: ${project.name || "Open"}, Sequence: ${sequence ? sequence.name : "None"}`);
    } else {
      statusDot.className = "status-dot disconnected";
      statusText.textContent = "Connected: No project open";
      logDiag("Connected to Premiere Pro host, but no active project is open.");
    }
  } catch (err) {
    statusDot.className = "status-dot disconnected";
    statusText.textContent = "Connected: Standby";
    logDiag("Host status check notice: " + err.message);
  }
}

/**
 * Resolves the absolute native path of the packaged MOGRT template.
 */
async function getMogrtNativePath() {
  const relativeAsset = "assets/hello 2.mogrt";

  if (uxp && uxp.storage && uxp.storage.localFileSystem) {
    try {
      const pluginFolder = await uxp.storage.localFileSystem.getPluginFolder();
      const mogrtEntry = await pluginFolder.getEntry(relativeAsset);
      if (mogrtEntry) {
        const nativePath = uxp.storage.localFileSystem.getNativePath(mogrtEntry) || mogrtEntry.nativePath;
        if (nativePath) {
          logDiag(`Resolved MOGRT native path via UXP storage: ${nativePath}`);
          return nativePath;
        }
      }
    } catch (err) {
      logDiag(`UXP storage resolution note: ${err.message}. Trying direct path.`);
    }
  }

  return relativeAsset;
}

/**
 * Updates customizable parameters on a target MOGRT TrackItem
 */
async function updateTrackItemProperties(trackItem, customText, customFontSize) {
  if (!trackItem) {
    logDiag("No trackItem provided to update properties.");
    return false;
  }

  let textUpdated = false;

  // Method 1: Using getMGTComponent (Official Premiere Pro MOGRT API)
  try {
    const mgt = typeof trackItem.getMGTComponent === "function"
      ? trackItem.getMGTComponent()
      : (trackItem.mgtComponent || null);

    if (mgt && mgt.properties) {
      const props = mgt.properties;
      const count = props.numItems !== undefined ? props.numItems : (props.length || 0);
      logDiag(`Found MGT Component with ${count} properties.`);

      // 1. Try finding by display name "Text"
      if (typeof props.getParamForDisplayName === "function") {
        const textParam = props.getParamForDisplayName("Text");
        if (textParam && typeof textParam.setValue === "function") {
          textParam.setValue(customText);
          textUpdated = true;
          logDiag(`Updated 'Text' parameter to: "${customText}" via getParamForDisplayName`);
        }
      }

      // 2. Scan all properties if not updated yet
      if (!textUpdated && count > 0) {
        for (let i = 0; i < count; i++) {
          const param = props[i];
          if (!param) continue;
          const pName = param.displayName || param.name || "";
          logDiag(`MGT Param [${i}]: ${pName}`);

          if (pName.toLowerCase().includes("text") || i === 0) {
            if (typeof param.setValue === "function") {
              param.setValue(customText);
              textUpdated = true;
              logDiag(`Updated MGT parameter [${i}] (${pName}) to: "${customText}"`);
              break;
            }
          }
        }
      }
    }
  } catch (mgtErr) {
    logDiag("getMGTComponent notice: " + mgtErr.message);
  }

  // Method 2: Using ComponentChain (Modern Premiere Pro UXP DOM)
  if (!textUpdated && typeof trackItem.getComponentChain === "function") {
    try {
      const chain = await trackItem.getComponentChain();
      const compCount = chain.getComponentCount();
      logDiag(`Checking ComponentChain (${compCount} components)...`);

      for (let i = 0; i < compCount; i++) {
        const comp = chain.getComponentAtIndex(i);
        const compName = await comp.getDisplayName();
        logDiag(`Component [${i}]: ${compName}`);

        if (comp.properties && comp.properties.length > 0) {
          for (let p of comp.properties) {
            const propName = p.displayName || p.name || "";
            if (propName.toLowerCase().includes("text")) {
              if (typeof p.setValue === "function") {
                p.setValue(customText);
                textUpdated = true;
                logDiag(`Set property ${propName} via component chain.`);
                break;
              }
            }
          }
        }
      }
    } catch (chainErr) {
      logDiag("ComponentChain inspection note: " + chainErr.message);
    }
  }

  return textUpdated;
}

/**
 * Applies the MOGRT to the active sequence with user-customized properties
 */
async function applyMogrt() {
  const btnApply = document.getElementById("btnApply");
  const trackIndex = parseInt(document.getElementById("trackSelect").value, 10) || 1;
  const positionMode = document.getElementById("positionSelect").value;
  const customText = document.getElementById("propText").value.trim() || "HELLO";
  const customFontSize = parseInt(document.getElementById("propFontSize").value, 10) || 180;

  btnApply.disabled = true;
  btnApply.querySelector("span").textContent = "Đang chèn...";
  showNotification(`Đang chèn template với chữ: "${customText}"...`, "info");

  try {
    if (!ppro) {
      throw new Error(
        "Premiere Pro API ('premierepro') is not accessible in this environment. " +
        "Please ensure BunText is loaded inside Adobe Premiere Pro."
      );
    }

    // 1. Get active project
    let project = null;
    if (ppro.Project && typeof ppro.Project.getActiveProject === "function") {
      project = await ppro.Project.getActiveProject();
    } else if (ppro.app && ppro.app.project) {
      project = ppro.app.project;
    }

    if (!project) {
      throw new Error("Không tìm thấy Project nào đang mở. Vui lòng mở Project trong Premiere Pro trước.");
    }

    // 2. Get active sequence
    let sequence = null;
    if (typeof project.getActiveSequence === "function") {
      sequence = await project.getActiveSequence();
    } else if (project.activeSequence) {
      sequence = project.activeSequence;
    }

    if (!sequence) {
      throw new Error("Không tìm thấy Sequence nào đang mở trên Timeline. Vui lòng mở Sequence trước.");
    }

    logDiag(`Target sequence: ${sequence.name || "Active Sequence"}`);

    // 3. Resolve MOGRT native file path
    const mogrtPath = await getMogrtNativePath();
    logDiag(`Using MOGRT path: ${mogrtPath}`);

    // 4. Determine insertion time
    let insertTime = ppro.TickTime ? ppro.TickTime.TIME_ZERO : "0";
    if (positionMode === "playhead") {
      try {
        if (typeof sequence.getPlayerPosition === "function") {
          const playhead = await sequence.getPlayerPosition();
          if (playhead) {
            insertTime = playhead;
            logDiag(`Playhead position: ${playhead.seconds || playhead.ticks || "current"}s`);
          }
        }
      } catch (posErr) {
        logDiag("Could not read playhead position, using TIME_ZERO: " + posErr.message);
      }
    } else {
      logDiag("Insertion set to sequence start (00:00:00:00).");
    }

    // 5. Execute MOGRT insertion
    let inserted = false;
    let insertedItem = null;
    let insertionDetail = "";

    // Primary official method: SequenceEditor.insertMogrtFromPath
    if (ppro.SequenceEditor && typeof ppro.SequenceEditor.getEditor === "function") {
      try {
        const editor = ppro.SequenceEditor.getEditor(sequence);
        if (typeof editor.insertMogrtFromPath === "function") {
          logDiag("Attempting insertion via SequenceEditor.insertMogrtFromPath...");
          let items = [];

          if (typeof project.lockedAccess === "function") {
            project.lockedAccess(() => {
              items = editor.insertMogrtFromPath(
                mogrtPath,
                insertTime,
                trackIndex,
                0 // audio track index
              );
            });
          } else {
            items = editor.insertMogrtFromPath(
              mogrtPath,
              insertTime,
              trackIndex,
              0
            );
          }

          if (items && items.length > 0) {
            inserted = true;
            insertedItem = items[0];
            insertionDetail = `Chèn thành công vào Track V${trackIndex + 1}.`;
          }
        }
      } catch (editorErr) {
        logDiag(`SequenceEditor attempt failed: ${editorErr.message}`);
      }
    }

    // Fallback method: sequence.importMGT
    if (!inserted && typeof sequence.importMGT === "function") {
      try {
        logDiag("Attempting insertion via sequence.importMGT...");
        const ticksVal = insertTime && insertTime.ticks ? insertTime.ticks : String(insertTime);
        const result = await sequence.importMGT(mogrtPath, ticksVal, trackIndex, 0);
        if (result) {
          inserted = true;
          insertedItem = result;
          insertionDetail = `Chèn thành công qua sequence.importMGT vào Track V${trackIndex + 1}.`;
        }
      } catch (importMgtErr) {
        logDiag(`sequence.importMGT fallback failed: ${importMgtErr.message}`);
      }
    }

    // 6. Apply customized properties if customText differs from default
    if (inserted) {
      if (insertedItem && customText) {
        logDiag(`Applying custom text: "${customText}" to new trackItem...`);
        const propOk = await updateTrackItemProperties(insertedItem, customText, customFontSize);
        if (propOk) {
          insertionDetail += ` Đã cập nhật chữ: "${customText}".`;
        }
      }

      showNotification(`Thành công! ${insertionDetail}`, "success");
      logDiag(`Applied hello 2.mogrt successfully! Detail: ${insertionDetail}`);
    } else {
      throw new Error(
        "Không thể chèn MOGRT vào Timeline. Vui lòng kiểm tra Track video trên timeline không bị khóa (Lock) " +
        "và file template hợp lệ."
      );
    }
  } catch (err) {
    showNotification(err.message, "error");
    logDiag("Apply error: " + err.message);
  } finally {
    btnApply.disabled = false;
    btnApply.querySelector("span").textContent = "Chèn vào Timeline";
  }
}

/**
 * Updates properties of the currently selected clip on the timeline
 */
async function updateSelectedClip() {
  const btnUpdate = document.getElementById("btnUpdateSelected");
  const customText = document.getElementById("propText").value.trim() || "HELLO";
  const customFontSize = parseInt(document.getElementById("propFontSize").value, 10) || 180;

  btnUpdate.disabled = true;
  showNotification(`Đang cập nhật chữ "${customText}" cho clip đang chọn...`, "info");

  try {
    if (!ppro) {
      throw new Error("Premiere Pro API không khả dụng.");
    }

    let project = null;
    if (ppro.Project && typeof ppro.Project.getActiveProject === "function") {
      project = await ppro.Project.getActiveProject();
    } else if (ppro.app && ppro.app.project) {
      project = ppro.app.project;
    }

    if (!project) throw new Error("Chưa mở Project.");

    const sequence = typeof project.getActiveSequence === "function"
      ? await project.getActiveSequence()
      : project.activeSequence;

    if (!sequence) throw new Error("Chưa mở Sequence trên Timeline.");

    // Retrieve selected track items
    let selectedItems = [];
    if (typeof sequence.getSelection === "function") {
      const selection = await sequence.getSelection();
      if (selection && typeof selection.getTrackItems === "function") {
        selectedItems = await selection.getTrackItems();
      }
    }

    if (!selectedItems || selectedItems.length === 0) {
      throw new Error("Vui lòng click chọn clip MOGRT trên Timeline trước khi bấm Cập nhật.");
    }

    logDiag(`Found ${selectedItems.length} selected item(s) on timeline.`);
    let anyUpdated = false;

    for (let item of selectedItems) {
      const ok = await updateTrackItemProperties(item, customText, customFontSize);
      if (ok) anyUpdated = true;
    }

    if (anyUpdated) {
      showNotification(`Đã cập nhật chữ: "${customText}" cho clip đang chọn!`, "success");
    } else {
      showNotification(`Đã gửi lệnh cập nhật chữ: "${customText}". (Nếu chưa thấy đổi ngay, hãy click vào clip trên timeline để refresh)`, "info");
    }
  } catch (err) {
    showNotification(err.message, "error");
    logDiag("Update selected error: " + err.message);
  } finally {
    btnUpdate.disabled = false;
  }
}

// Wire up events and UI interactions
function initPanelUI() {
  if (panelInitialized) return;
  panelInitialized = true;

  initEnvironment();

  const propText = document.getElementById("propText");
  const previewOverlay = document.getElementById("previewTextOverlay");
  const metaTextTag = document.getElementById("metaTextTag");
  const btnToggleCase = document.getElementById("btnToggleCase");
  const btnClearText = document.getElementById("btnClearText");
  const propFontSize = document.getElementById("propFontSize");
  const fontSizeDisplay = document.getElementById("fontSizeDisplay");
  const btnApply = document.getElementById("btnApply");
  const btnUpdateSelected = document.getElementById("btnUpdateSelected");

  // Sync text input with live preview overlay
  if (propText && previewOverlay) {
    const updatePreview = () => {
      const val = propText.value || "HELLO";
      previewOverlay.textContent = val;
      if (metaTextTag) metaTextTag.textContent = `✏️ Text: "${val}"`;
    };

    propText.addEventListener("input", updatePreview);
    propText.addEventListener("keyup", updatePreview);
  }

  // Case toggle
  let isUpperCase = true;
  if (btnToggleCase && propText) {
    btnToggleCase.addEventListener("click", () => {
      isUpperCase = !isUpperCase;
      if (isUpperCase) {
        propText.value = propText.value.toUpperCase();
        btnToggleCase.textContent = "AA";
      } else {
        propText.value = propText.value.toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());
        btnToggleCase.textContent = "Aa";
      }
      if (previewOverlay) previewOverlay.textContent = propText.value;
      if (metaTextTag) metaTextTag.textContent = `✏️ Text: "${propText.value}"`;
    });
  }

  // Clear text button
  if (btnClearText && propText) {
    btnClearText.addEventListener("click", () => {
      propText.value = "";
      if (previewOverlay) previewOverlay.textContent = "";
      propText.focus();
    });
  }

  // Font size slider
  if (propFontSize && fontSizeDisplay) {
    propFontSize.addEventListener("input", () => {
      const sizeVal = propFontSize.value;
      fontSizeDisplay.textContent = `${sizeVal} px`;
      if (previewOverlay) {
        const scaleRatio = Math.max(0.7, Math.min(1.5, sizeVal / 180));
        previewOverlay.style.fontSize = `${Math.round(11 * scaleRatio)}px`;
      }
    });
  }

  // Buttons
  if (btnApply) {
    btnApply.addEventListener("click", applyMogrt);
  }

  if (btnUpdateSelected) {
    btnUpdateSelected.addEventListener("click", updateSelectedClip);
  }

  // Diagnostics toggle
  const diagToggle = document.getElementById("diagnosticsToggle");
  const diagLog = document.getElementById("diagnosticsLog");
  if (diagToggle && diagLog) {
    diagToggle.addEventListener("click", () => {
      const isOpen = diagLog.classList.toggle("open");
      diagToggle.querySelector("span").innerHTML = isOpen
        ? "▼ Diagnostics &amp; API Details"
        : "▶ Diagnostics &amp; API Details";
    });
  }

  // Preview image error fallback
  const previewImg = document.getElementById("templatePreview");
  const previewFallback = document.getElementById("previewFallback");
  if (previewImg && previewFallback) {
    previewImg.addEventListener("error", () => {
      previewImg.style.display = "none";
      previewFallback.style.display = "flex";
    });
  }
}

// ─── UXP Entrypoints Registration ─────────────────────────────
try {
  const uxpMod = window.require ? window.require("uxp") : null;
  const ep = uxpMod && uxpMod.entrypoints ? uxpMod.entrypoints : null;
  if (ep && typeof ep.setup === "function") {
    ep.setup({
      plugin: {
        create() {
          logDiag("UXP plugin lifecycle create");
        },
        destroy() {
          logDiag("UXP plugin lifecycle destroy");
        }
      },
      panels: {
        "buntext-panel": {
          create(rootNode) {
            logDiag("UXP panel 'buntext-panel' create - DOM ready");
            initPanelUI();
          },
          show() {
            logDiag("UXP panel 'buntext-panel' show");
            updateHostStatus();
          }
        }
      }
    });
    logDiag("UXP entrypoints.setup completed for 'buntext-panel'.");
  }
} catch (e) {
  logDiag("Notice: entrypoints.setup not handled: " + e.message);
}

// DOM fallback if loaded standalone
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPanelUI);
} else {
  initPanelUI();
}
