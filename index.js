/*************************************************************************
 * BunText - Premiere Pro UXP Plugin
 * Handles embedding and applying hello 2.mogrt to the active timeline.
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

  // Fallback to relative or execution path
  return relativeAsset;
}

/**
 * Applies the MOGRT to the active sequence.
 */
async function applyMogrt() {
  const btnApply = document.getElementById("btnApply");
  const trackIndex = parseInt(document.getElementById("trackSelect").value, 10) || 1;
  const positionMode = document.getElementById("positionSelect").value;

  btnApply.disabled = true;
  btnApply.querySelector("span").textContent = "Applying...";
  showNotification("Preparing MOGRT insertion...", "info");

  try {
    if (!ppro) {
      throw new Error(
        "Premiere Pro API ('premierepro') is not accessible in this environment. " +
        "Please ensure BunText is loaded inside Adobe Premiere Pro via the UXP Developer Tool."
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
      throw new Error("No active project found. Please open or create a project in Premiere Pro.");
    }

    // 2. Get active sequence
    let sequence = null;
    if (typeof project.getActiveSequence === "function") {
      sequence = await project.getActiveSequence();
    } else if (project.activeSequence) {
      sequence = project.activeSequence;
    }

    if (!sequence) {
      throw new Error("No active sequence found. Please open a sequence in the timeline before applying.");
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
            logDiag(`Playhead position retrieved: ${playhead.seconds || playhead.ticks || "current"}s`);
          }
        }
      } catch (posErr) {
        logDiag("Could not read playhead position, falling back to TIME_ZERO: " + posErr.message);
      }
    } else {
      logDiag("Insertion set to sequence start (00:00:00:00).");
    }

    // 5. Execute MOGRT insertion via official Premiere Pro UXP APIs
    let inserted = false;
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

          inserted = items && items.length > 0;
          insertionDetail = `Inserted onto Track V${trackIndex + 1} via SequenceEditor.`;
        }
      } catch (editorErr) {
        logDiag(`SequenceEditor attempt failed: ${editorErr.message}`);
      }
    }

    // Fallback method: sequence.importMGT (ExtendScript / legacy bridge if exposed)
    if (!inserted && typeof sequence.importMGT === "function") {
      try {
        logDiag("Attempting insertion via sequence.importMGT...");
        const ticksVal = insertTime && insertTime.ticks ? insertTime.ticks : String(insertTime);
        const result = await sequence.importMGT(mogrtPath, ticksVal, trackIndex, 0);
        inserted = Boolean(result);
        insertionDetail = `Inserted onto Track V${trackIndex + 1} via sequence.importMGT.`;
      } catch (importMgtErr) {
        logDiag(`sequence.importMGT fallback failed: ${importMgtErr.message}`);
      }
    }

    // Final outcome
    if (inserted) {
      showNotification(`Success! ${insertionDetail}`, "success");
      logDiag(`Applied hello 2.mogrt successfully! Detail: ${insertionDetail}`);
    } else {
      throw new Error(
        "Could not insert MOGRT onto timeline. Please verify the active sequence track is unlocked " +
        "and that the file path is accessible."
      );
    }
  } catch (err) {
    showNotification(err.message, "error");
    logDiag("Apply error: " + err.message);
  } finally {
    btnApply.disabled = false;
    btnApply.querySelector("span").textContent = "Apply to Timeline";
  }
}

// Initialize panel UI and events
function initPanelUI() {
  if (panelInitialized) return;
  panelInitialized = true;

  initEnvironment();

  // Button apply
  const btnApply = document.getElementById("btnApply");
  if (btnApply) {
    btnApply.addEventListener("click", applyMogrt);
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

// DOM fallback if loaded standalone / outside UXP lifecycle
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPanelUI);
} else {
  initPanelUI();
}
