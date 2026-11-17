/*************************************************************************
 * BunText v1.2 - Premiere Pro UXP Plugin
 * Dynamic MOGRT Customization Studio & Timeline Integration
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

  try {
    uxp = window.require ? window.require("uxp") : null;
    if (uxp) logDiag("UXP module detected.");
  } catch (e) {
    logDiag("UXP module not available: " + e.message);
  }

  try {
    ppro = window.require ? window.require("premierepro") : null;
    if (ppro) logDiag("Premiere Pro DOM module ('premierepro') loaded successfully.");
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
 * Dynamically generates a customized .mogrt file on-the-fly using JSZip.
 * Patches definition.json with user's custom text, font, font size, and unlocks editing.
 */
/**
 * Saves generated binary buffer to a temporary .mogrt file and returns absolute path.
 */
async function saveCustomMogrtFile(buffer) {
  // Strategy 1: Try UXP storage temporary folder
  if (uxp && uxp.storage && uxp.storage.localFileSystem) {
    try {
      const tempFolder = await uxp.storage.localFileSystem.getTemporaryFolder();
      const uniqueFileName = `BunText_${Date.now()}.mogrt`;
      const tempFile = await tempFolder.createFile(uniqueFileName, { overwrite: true });
      await tempFile.write(buffer, { format: uxp.storage.formats.binary });
      if (tempFile.nativePath) {
        logDiag(`Custom MOGRT written via UXP storage: ${tempFile.nativePath}`);
        return tempFile.nativePath.replace(/\\/g, "/");
      }
    } catch (uxpErr) {
      logDiag(`UXP tempFolder save note: ${uxpErr.message}`);
    }
  }

  // Strategy 2: Try Node.js fs / os in UXP fullAccess environment
  try {
    const fs = window.require ? window.require("fs") : null;
    const os = window.require ? window.require("os") : null;
    const path = window.require ? window.require("path") : null;
    if (fs && os && path && typeof fs.writeFileSync === "function") {
      const tempDir = os.tmpdir();
      const filePath = path.join(tempDir, `BunText_${Date.now()}.mogrt`);
      fs.writeFileSync(filePath, Buffer.from(buffer));
      logDiag(`Custom MOGRT written via Node fs: ${filePath}`);
      return filePath.replace(/\\/g, "/");
    }
  } catch (fsErr) {
    logDiag(`Node fs temp save note: ${fsErr.message}`);
  }

  // Strategy 3: Try plugin folder itself if writable
  if (uxp && uxp.storage && uxp.storage.localFileSystem) {
    try {
      const pluginFolder = await uxp.storage.localFileSystem.getPluginFolder();
      const tempFile = await pluginFolder.createFile(`BunText_Custom.mogrt`, { overwrite: true });
      await tempFile.write(buffer, { format: uxp.storage.formats.binary });
      if (tempFile.nativePath) {
        logDiag(`Custom MOGRT written to pluginFolder: ${tempFile.nativePath}`);
        return tempFile.nativePath.replace(/\\/g, "/");
      }
    } catch (pfErr) {
      logDiag(`Plugin folder write note: ${pfErr.message}`);
    }
  }

  return null;
}

/**
 * Resolves base native path of hello 2.mogrt
 */
async function getBaseMogrtNativePath() {
  const relativeAsset = "assets/hello 2.mogrt";

  // 1. Try UXP pluginFolder entry
  if (uxp && uxp.storage && uxp.storage.localFileSystem) {
    try {
      const pluginFolder = await uxp.storage.localFileSystem.getPluginFolder();
      const mogrtEntry = await pluginFolder.getEntry(relativeAsset);
      if (mogrtEntry && mogrtEntry.nativePath) {
        return mogrtEntry.nativePath.replace(/\\/g, "/");
      }
    } catch (err) {
      logDiag("Storage getBaseMogrtNativePath note: " + err.message);
    }
  }

  // 2. Try Node fs search in known install directories
  try {
    const fs = window.require ? window.require("fs") : null;
    if (fs && typeof fs.existsSync === "function") {
      const candidatePaths = [
        "C:/Users/imnha/AppData/Roaming/Adobe/UXP/Plugins/External/com.buntext.premiere.plugin_1.0.0/assets/hello 2.mogrt",
        "C:/Users/imnha/AppData/Roaming/Adobe/UXP/extensions/BunText/assets/hello 2.mogrt",
        "C:/Program Files/Common Files/Adobe/UXP/extensions/BunText/assets/hello 2.mogrt",
        "C:/Users/imnha/OneDrive/Máy tính/Nhat data/Coding/BunText/assets/hello 2.mogrt"
      ];
      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          logDiag(`Found base MOGRT at: ${p}`);
          return p;
        }
      }
    }
  } catch (fsErr) {
    logDiag("Node fs getBaseMogrtNativePath note: " + fsErr.message);
  }

  // Fallback to primary AppData path
  return "C:/Users/imnha/AppData/Roaming/Adobe/UXP/Plugins/External/com.buntext.premiere.plugin_1.0.0/assets/hello 2.mogrt";
}

/**
 * Dynamically generates a customized .mogrt file on-the-fly using JSZip.
 * Patches definition.json with user's custom text, font, font size, and unlocks editing.
 */
async function generateCustomMogrt({ text, fontSize, fontName, isAllCaps, hexColor }) {
  const relativeAsset = "assets/hello 2.mogrt";
  logDiag(`Generating customized MOGRT for text: "${text}", font: ${fontName}, size: ${fontSize}, color: ${hexColor || 'default'}...`);

  try {
    let baseArrayBuffer = null;

    // 1. Try UXP pluginFolder entry read
    if (uxp && uxp.storage && uxp.storage.localFileSystem) {
      try {
        const pluginFolder = await uxp.storage.localFileSystem.getPluginFolder();
        const mogrtEntry = await pluginFolder.getEntry(relativeAsset);
        if (mogrtEntry) {
          baseArrayBuffer = await mogrtEntry.read({ format: uxp.storage.formats.binary });
        }
      } catch (entryErr) {
        logDiag("pluginFolder.getEntry read note: " + entryErr.message);
      }
    }

    // 2. Try Node fs readFileSync
    if (!baseArrayBuffer) {
      try {
        const fs = window.require ? window.require("fs") : null;
        if (fs && typeof fs.readFileSync === "function") {
          const basePath = await getBaseMogrtNativePath();
          if (basePath && fs.existsSync(basePath)) {
            const buf = fs.readFileSync(basePath);
            baseArrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
            logDiag(`Loaded base MOGRT buffer from filesystem: ${basePath}`);
          }
        }
      } catch (fsReadErr) {
        logDiag("Node fs readFileSync note: " + fsReadErr.message);
      }
    }

    // 3. Try fetch
    if (!baseArrayBuffer) {
      try {
        const resp = await fetch(relativeAsset);
        baseArrayBuffer = await resp.arrayBuffer();
      } catch (fetchErr) {
        logDiag("Fetch base asset note: " + fetchErr.message);
      }
    }

    if (!baseArrayBuffer) {
      throw new Error("Không thể đọc file base template hello 2.mogrt");
    }

    // Resolve JSZip instance
    const JSZip = (typeof window !== "undefined" && window.JSZip)
      || (typeof module !== "undefined" && module.exports && (module.exports.default || module.exports))
      || (typeof window.require === "function" ? window.require("./jszip.min.js") : null);

    if (!JSZip || typeof JSZip.loadAsync !== "function") {
      logDiag("JSZip library not available. Falling back to base MOGRT.");
      return await getBaseMogrtNativePath();
    }

    const zip = await JSZip.loadAsync(baseArrayBuffer);
    const defFile = zip.file("definition.json");
    if (!defFile) {
      throw new Error("definition.json not found inside base template.");
    }

    const defRaw = await defFile.async("string");
    const def = JSON.parse(defRaw);

    const finalText = isAllCaps ? text.toUpperCase() : text;
    const numFontSize = parseInt(fontSize, 10) || 180;
    const selectedFont = fontName || "Montserrat-ExtraBoldItalic";

    // Generate fresh unique UUID for capsuleID so Premiere Pro doesn't reuse cache
    const randomUUID = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    def.capsuleID = randomUUID;
    def.capsuleName = `BunText_${Date.now()}`;
    if (def.capsuleNameLocalized && def.capsuleNameLocalized.strDB && def.capsuleNameLocalized.strDB[0]) {
      def.capsuleNameLocalized.strDB[0].str = def.capsuleName;
    }
    if (def.usedFontsLocalized && def.usedFontsLocalized.en_US) {
      def.usedFontsLocalized.en_US = [selectedFont];
    }

    // 1. Update clientControls
    if (def.clientControls && def.clientControls.length > 0) {
      const ctrl = def.clientControls[0];
      if (ctrl.value && ctrl.value.strDB && ctrl.value.strDB.length > 0) {
        ctrl.value.strDB[0].str = finalText;
      }
      if (ctrl.fonteditinfo) {
        ctrl.fonteditinfo.capPropFontEdit = true;
        ctrl.fonteditinfo.capPropFontSizeEdit = true;
        ctrl.fonteditinfo.capPropFontFauxStyleEdit = true;
        ctrl.fonteditinfo.fontEditValue = selectedFont;
        ctrl.fonteditinfo.fontSizeEditValue = numFontSize;
        ctrl.fonteditinfo.fontFSAllCapsValue = isAllCaps;
      }
    }

    // 2. Update capsuleparams
    try {
      if (def.sourceInfoLocalized && def.sourceInfoLocalized.en_US) {
        const cap = def.sourceInfoLocalized.en_US.capsuleparams.capParams[0];
        if (cap) {
          cap.capPropDefault = finalText;
          cap.textEditValue = finalText;
          cap.fontTextRunLength = [finalText.length];
          cap.capPropFontEdit = true;
          cap.capPropFontSizeEdit = true;
          cap.capPropFontFauxStyleEdit = true;
          cap.fontEditValue = [selectedFont];
          cap.fontSizeEditValue = [numFontSize];
          cap.fontFSAllCapsValue = [isAllCaps];
        }
      }
    } catch (capErr) {
      logDiag("Capsuleparams patch note: " + capErr.message);
    }

    // Write updated definition.json back into zip
    zip.file("definition.json", JSON.stringify(def, null, 2));

    // 3. Patch Text Fill Color inside project.aegraphic -> test.aep if custom color provided
    if (hexColor && hexColor.startsWith("#") && hexColor.length === 7) {
      const aegraphicZipFile = zip.file("project.aegraphic");
      if (aegraphicZipFile) {
        try {
          const aegraphicBuffer = await aegraphicZipFile.async("arraybuffer");
          const aezip = await JSZip.loadAsync(aegraphicBuffer);
          const aepFile = aezip.file("test.aep");
          if (aepFile) {
            const aepBuf = await aepFile.async("arraybuffer");
            const aepBytes = new Uint8Array(aepBuf);

            const rFloat = parseInt(hexColor.slice(1, 3), 16) / 255.0;
            const gFloat = parseInt(hexColor.slice(3, 5), 16) / 255.0;
            const bFloat = parseInt(hexColor.slice(5, 7), 16) / 255.0;

            const targetView = new DataView(new ArrayBuffer(32));
            const newColorView = new DataView(new ArrayBuffer(32));
            for (let k = 0; k < 4; k++) targetView.setFloat64(k * 8, 1.0, false);
            newColorView.setFloat64(0, rFloat, false);
            newColorView.setFloat64(8, gFloat, false);
            newColorView.setFloat64(16, bFloat, false);
            newColorView.setFloat64(24, 1.0, false);

            const targetBytes = new Uint8Array(targetView.buffer);
            const newBytes = new Uint8Array(newColorView.buffer);

            let replacedCount = 0;
            for (let i = 0; i <= aepBytes.length - 32; i++) {
              let match = true;
              for (let j = 0; j < 32; j++) {
                if (aepBytes[i + j] !== targetBytes[j]) {
                  match = false;
                  break;
                }
              }
              if (match) {
                for (let j = 0; j < 32; j++) {
                  aepBytes[i + j] = newBytes[j];
                }
                replacedCount++;
                i += 31;
              }
            }

            if (replacedCount > 0) {
              logDiag(`Patched text fill color (${hexColor}) in test.aep: replaced ${replacedCount} color occurrences.`);
              aezip.file("test.aep", aepBytes);
              const newAegraphic = await aezip.generateAsync({
                type: "arraybuffer",
                compression: "DEFLATE",
                compressionOptions: { level: 6 }
              });
              zip.file("project.aegraphic", newAegraphic);
            }
          }
        } catch (colorPatchErr) {
          logDiag("Color patch in aegraphic note: " + colorPatchErr.message);
        }
      }
    }

    // Generate new MOGRT binary
    const newMogrtBuffer = await zip.generateAsync({
      type: "arraybuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    // Save customized MOGRT to disk
    const customNativePath = await saveCustomMogrtFile(newMogrtBuffer);
    if (customNativePath) {
      logDiag(`Customized MOGRT saved to: ${customNativePath}`);
      return customNativePath;
    }

    logDiag("Failed to save customized MOGRT to disk. Fallback to base MOGRT.");
    return await getBaseMogrtNativePath();
  } catch (err) {
    logDiag("MOGRT on-the-fly generation error: " + err.message + ". Using base template.");
    return await getBaseMogrtNativePath();
  }
}

/**
 * Updates parameters on an existing timeline clip using getMGTComponent
 */
async function updateTrackItemProperties(trackItem, customText, customFontSize) {
  if (!trackItem) return false;

  let textUpdated = false;

  try {
    const mgt = typeof trackItem.getMGTComponent === "function"
      ? trackItem.getMGTComponent()
      : (trackItem.mgtComponent || null);

    if (mgt && mgt.properties) {
      const props = mgt.properties;
      const count = props.numItems !== undefined ? props.numItems : (props.length || 0);
      logDiag(`Timeline clip MGT component has ${count} properties.`);

      const applyVal = (param) => {
        try {
          const raw = typeof param.getValue === "function" ? param.getValue() : null;
          if (typeof raw === "string" && (raw.includes("textEditValue") || raw.startsWith("{"))) {
            const obj = JSON.parse(raw);
            obj.textEditValue = customText;
            param.setValue(JSON.stringify(obj), true);
          } else {
            param.setValue(customText, true);
          }
          return true;
        } catch (e) {
          param.setValue(customText, true);
          return true;
        }
      };

      if (typeof props.getParamForDisplayName === "function") {
        const textParam = props.getParamForDisplayName("Text");
        if (textParam) {
          textUpdated = applyVal(textParam);
          logDiag(`Updated 'Text' parameter via getParamForDisplayName.`);
        }
      }

      if (!textUpdated && count > 0) {
        for (let i = 0; i < count; i++) {
          const param = props[i];
          if (!param) continue;
          const pName = (param.displayName || param.name || "").toLowerCase();
          if (pName.includes("text") || i === 0) {
            textUpdated = applyVal(param);
            logDiag(`Updated MGT property [${i}] (${param.displayName || param.name}).`);
            break;
          }
        }
      }
    }
  } catch (mgtErr) {
    logDiag("updateTrackItemProperties note: " + mgtErr.message);
  }

  return textUpdated;
}

/**
 * Main Apply Function - Generates customized MOGRT and applies to active sequence
 */
async function applyMogrt() {
  const btnApply = document.getElementById("btnApply");
  const trackIndex = parseInt(document.getElementById("trackSelect").value, 10) || 1;
  const positionMode = document.getElementById("positionSelect").value;

  const rawText = document.getElementById("propText").value.trim() || "HELLO";
  const fontFamily = document.getElementById("propFontFamily").value;
  const fontSize = parseInt(document.getElementById("propFontSize").value, 10) || 180;
  const hexColor = document.getElementById("propTextColor") ? document.getElementById("propTextColor").value : "#ffffff";
  const isAllCaps = rawText === rawText.toUpperCase() && /[A-Z]/.test(rawText);

  btnApply.disabled = true;
  btnApply.querySelector("span").textContent = "Đang tạo & chèn...";
  showNotification(`Đang tạo MOGRT tùy chỉnh với chữ: "${rawText}"...`, "info");

  let lastErrorDetail = "";

  try {
    if (!ppro) {
      throw new Error("Premiere Pro API không khả dụng trong môi trường này.");
    }

    // 1. Get active project & sequence
    let project = null;
    if (ppro.Project && typeof ppro.Project.getActiveProject === "function") {
      project = await ppro.Project.getActiveProject();
    } else if (ppro.app && ppro.app.project) {
      project = ppro.app.project;
    }

    if (!project) throw new Error("Chưa mở Project trong Premiere Pro.");

    let sequence = null;
    if (typeof project.getActiveSequence === "function") {
      sequence = await project.getActiveSequence();
    } else if (project.activeSequence) {
      sequence = project.activeSequence;
    }

    if (!sequence) throw new Error("Chưa mở Sequence trên Timeline. Vui lòng mở Sequence trước.");

    // 2. Determine insertion time using TickTime
    let insertTime = null;

    if (positionMode === "playhead") {
      try {
        if (typeof sequence.getPlayerPosition === "function") {
          insertTime = await sequence.getPlayerPosition();
          logDiag(`Read playhead position: ${insertTime ? (insertTime.seconds !== undefined ? insertTime.seconds + 's' : insertTime.ticks || 'OK') : 'null'}`);
        }
      } catch (posErr) {
        logDiag("Playhead read note: " + posErr.message);
      }
    }

    // If "start" or if playhead position was not obtained, create TickTime at 0
    if (!insertTime) {
      if (ppro.TickTime) {
        try {
          if (typeof ppro.TickTime.createWithSeconds === "function") {
            insertTime = await ppro.TickTime.createWithSeconds(0);
          } else if (typeof ppro.TickTime.createWithTicks === "function") {
            insertTime = await ppro.TickTime.createWithTicks("0");
          } else if (typeof ppro.TickTime.createZero === "function") {
            insertTime = await ppro.TickTime.createZero();
          } else if (ppro.TickTime.ZERO) {
            insertTime = ppro.TickTime.ZERO;
          }
        } catch (ttErr) {
          logDiag("TickTime creation note: " + ttErr.message);
        }
      }
    }

    logDiag(`Insert time resolved: ${insertTime ? (insertTime.seconds !== undefined ? insertTime.seconds + 's' : insertTime.ticks || 'TickTime instance') : '0'}`);

    // 3. Dynamically generate customized .mogrt file with user's text, font, size, and color
    const customMogrtPath = await generateCustomMogrt({
      text: rawText,
      fontSize: fontSize,
      fontName: fontFamily,
      isAllCaps: isAllCaps,
      hexColor: hexColor
    });

    logDiag(`Target MOGRT path for insertion: ${customMogrtPath}`);

    // 4. Insert onto timeline via SequenceEditor (Premiere Pro 25.6+)
    let inserted = false;
    let insertedItem = null;

    if (ppro.SequenceEditor && typeof ppro.SequenceEditor.getEditor === "function") {
      try {
        logDiag("Fetching SequenceEditor...");
        const editor = await ppro.SequenceEditor.getEditor(sequence);
        if (editor && typeof editor.insertMogrtFromPath === "function") {
          logDiag(`Executing editor.insertMogrtFromPath("${customMogrtPath}", time, trackIndex=${trackIndex}, audioTrackIndex=-1)...`);
          let items = null;
          try {
            items = await editor.insertMogrtFromPath(customMogrtPath, insertTime, trackIndex, -1);
          } catch (audioErr) {
            logDiag(`insertMogrtFromPath with audio=-1 note: ${audioErr.message}. Trying with audioTrack=0...`);
            try {
              items = await editor.insertMogrtFromPath(customMogrtPath, insertTime, trackIndex, 0);
            } catch (a0Err) {
              lastErrorDetail = a0Err.message;
              logDiag(`insertMogrtFromPath with audio=0 error: ${a0Err.message}`);
            }
          }

          if (items && items.length > 0) {
            inserted = true;
            insertedItem = items[0];
            logDiag(`SequenceEditor successfully inserted ${items.length} track items.`);
          } else if (items) {
            logDiag(`SequenceEditor call completed. Result: ${JSON.stringify(items)}`);
            inserted = true;
          }
        } else {
          logDiag("editor.insertMogrtFromPath is not available on editor.");
        }
      } catch (editorErr) {
        lastErrorDetail = editorErr.message;
        logDiag(`SequenceEditor attempt error: ${editorErr.message}\n${editorErr.stack || ""}`);
      }
    }

    // 5. Fallback: sequence.importMGT (legacy Premiere Pro DOM)
    if (!inserted && typeof sequence.importMGT === "function") {
      try {
        logDiag("Trying sequence.importMGT fallback...");
        const ticksVal = (insertTime && insertTime.ticks !== undefined) ? String(insertTime.ticks) : "0";
        const result = await sequence.importMGT(customMogrtPath, ticksVal, trackIndex, 0);
        if (result) {
          inserted = true;
          insertedItem = result;
          logDiag("sequence.importMGT succeeded.");
        }
      } catch (importErr) {
        lastErrorDetail = importErr.message;
        logDiag(`sequence.importMGT error: ${importErr.message}`);
      }
    }

    if (inserted) {
      setTimeout(async () => {
        if (insertedItem) {
          await updateTrackItemProperties(insertedItem, rawText, fontSize);
        }
      }, 350);

      showNotification(`Thành công! Đã chèn template với chữ: "${rawText}" vào Track V${trackIndex + 1}.`, "success");
      logDiag(`Applied MOGRT with custom text "${rawText}" successfully.`);
    } else {
      throw new Error(`Không thể chèn MOGRT vào Timeline. ${lastErrorDetail ? "Lỗi: " + lastErrorDetail : "Vui lòng kiểm tra lại Sequence và Track video."}`);
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
 * Updates selected clip on timeline with currently customized properties
 */
/**
 * Updates selected clip on timeline with currently customized properties (Smart Replace)
 */
async function updateSelectedClip() {
  const btnUpdate = document.getElementById("btnUpdateSelected");
  const rawText = document.getElementById("propText").value.trim() || "HELLO";
  const fontFamily = document.getElementById("propFontFamily").value;
  const fontSize = parseInt(document.getElementById("propFontSize").value, 10) || 180;
  const hexColor = document.getElementById("propTextColor") ? document.getElementById("propTextColor").value : "#ffffff";
  const isAllCaps = rawText === rawText.toUpperCase() && /[A-Z]/.test(rawText);
  const fallbackTrack = parseInt(document.getElementById("trackSelect").value, 10) || 1;

  btnUpdate.disabled = true;
  showNotification(`Đang cập nhật chữ "${rawText}" cho clip đang chọn...`, "info");

  try {
    if (!ppro) throw new Error("Premiere Pro API không khả dụng.");

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

    // 1. Get current selection from timeline
    let selectedItems = [];
    let selectionObj = null;
    if (typeof sequence.getSelection === "function") {
      selectionObj = await sequence.getSelection();
      if (selectionObj && typeof selectionObj.getTrackItems === "function") {
        selectedItems = await selectionObj.getTrackItems();
      }
    }

    if (!selectedItems || selectedItems.length === 0) {
      throw new Error("Vui lòng click chọn một clip trên Timeline trước khi bấm Cập nhật.");
    }

    const targetItem = selectedItems[0];
    let itemStart = null;
    if (typeof targetItem.getStart === "function") {
      itemStart = await targetItem.getStart();
    } else if (targetItem.start) {
      itemStart = targetItem.start;
    }

    if (!itemStart) {
      if (typeof sequence.getPlayerPosition === "function") {
        itemStart = await sequence.getPlayerPosition();
      }
    }

    logDiag(`Smart Replace: Target clip start position = ${itemStart ? (itemStart.seconds !== undefined ? itemStart.seconds + 's' : itemStart.ticks || 'OK') : '0'}`);

    // 2. Generate updated customized MOGRT with new text & color
    const customMogrtPath = await generateCustomMogrt({
      text: rawText,
      fontSize: fontSize,
      fontName: fontFamily,
      isAllCaps: isAllCaps,
      hexColor: hexColor
    });

    // 3. Replace old clip with new customized MOGRT
    let replaced = false;

    if (ppro.SequenceEditor && typeof ppro.SequenceEditor.getEditor === "function") {
      try {
        const editor = await ppro.SequenceEditor.getEditor(sequence);
        if (editor) {
          // Remove old selected clip
          if (typeof editor.createRemoveItemsAction === "function" && selectionObj) {
            try {
              const mediaTypeVal = (ppro.Constants && ppro.Constants.MediaType && ppro.Constants.MediaType.VIDEO !== undefined)
                ? ppro.Constants.MediaType.VIDEO
                : 1;
              const removeAction = editor.createRemoveItemsAction(selectionObj, false, mediaTypeVal, false);
              if (removeAction && typeof project.executeTransaction === "function") {
                await project.executeTransaction((compound) => {
                  compound.addAction(removeAction);
                }, "Replace BunText Clip");
                logDiag("Smart Replace: Old clip removed from timeline.");
              }
            } catch (remErr) {
              logDiag("createRemoveItemsAction note: " + remErr.message);
            }
          }

          // Insert newly customized MOGRT at the exact same start time
          let items = null;
          try {
            items = await editor.insertMogrtFromPath(customMogrtPath, itemStart, fallbackTrack, -1);
          } catch (audioErr) {
            items = await editor.insertMogrtFromPath(customMogrtPath, itemStart, fallbackTrack, 0);
          }

          if (items && items.length > 0) {
            replaced = true;
          }
        }
      } catch (repErr) {
        logDiag("Smart replace SequenceEditor note: " + repErr.message);
      }
    }

    if (replaced) {
      showNotification(`Thành công! Đã thay thế clip trên Timeline với chữ: "${rawText}".`, "success");
      logDiag(`Smart Replace completed for "${rawText}".`);
    } else {
      showNotification(`Đã tạo template mới. Hãy bấm 'Chèn vào Timeline' để đặt lên Track mong muốn.`, "info");
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
  const charCountChip = document.getElementById("charCountChip");
  const btnCaseUpper = document.getElementById("btnCaseUpper");
  const btnCaseTitle = document.getElementById("btnCaseTitle");
  const btnCaseLower = document.getElementById("btnCaseLower");
  const btnClearText = document.getElementById("btnClearText");
  const propFontFamily = document.getElementById("propFontFamily");
  const propFontSize = document.getElementById("propFontSize");
  const fontSizeDisplay = document.getElementById("fontSizeDisplay");
  const propTracking = document.getElementById("propTracking");
  const trackingDisplay = document.getElementById("trackingDisplay");
  const propTextColor = document.getElementById("propTextColor");
  const textColorHex = document.getElementById("textColorHex");
  const toggleStroke = document.getElementById("toggleStroke");
  const propStrokeColor = document.getElementById("propStrokeColor");
  const toggleShadow = document.getElementById("toggleShadow");
  const btnResetAll = document.getElementById("btnResetAll");
  const btnApply = document.getElementById("btnApply");
  const btnUpdateSelected = document.getElementById("btnUpdateSelected");

  // Live preview update engine
  function updateLivePreview() {
    if (!previewOverlay) return;

    const val = (propText ? propText.value : "") || "HELLO";
    previewOverlay.textContent = val;

    if (charCountChip) {
      charCountChip.textContent = `${val.length} ký tự`;
    }

    // Font Family
    if (propFontFamily) {
      const fVal = propFontFamily.value;
      if (fVal.includes("Montserrat")) {
        previewOverlay.style.fontFamily = "'Montserrat', sans-serif";
        previewOverlay.style.fontStyle = fVal.includes("Italic") ? "italic" : "normal";
        previewOverlay.style.fontWeight = "800";
      } else if (fVal.includes("Impact")) {
        previewOverlay.style.fontFamily = "Impact, sans-serif";
        previewOverlay.style.fontStyle = "normal";
        previewOverlay.style.fontWeight = "900";
      } else if (fVal.includes("Times")) {
        previewOverlay.style.fontFamily = "'Times New Roman', serif";
        previewOverlay.style.fontWeight = "700";
        previewOverlay.style.fontStyle = "normal";
      } else {
        previewOverlay.style.fontFamily = "system-ui, sans-serif";
        previewOverlay.style.fontWeight = "700";
        previewOverlay.style.fontStyle = "normal";
      }
    }

    // Font Size / Scale
    if (propFontSize) {
      const sizeVal = parseInt(propFontSize.value, 10) || 180;
      const scale = Math.max(0.6, Math.min(2.0, sizeVal / 180));
      previewOverlay.style.fontSize = `${Math.round(13 * scale)}px`;
    }

    // Letter Spacing / Tracking
    if (propTracking) {
      const trackVal = parseInt(propTracking.value, 10) || 0;
      previewOverlay.style.letterSpacing = `${trackVal / 10}px`;
    }

    // Text Color
    if (propTextColor) {
      previewOverlay.style.color = propTextColor.value;
    }

    // Stroke / Outline
    let strokeStyle = "";
    if (toggleStroke && toggleStroke.checked && propStrokeColor) {
      const sc = propStrokeColor.value;
      previewOverlay.style.webkitTextStroke = `1px ${sc}`;
    } else {
      previewOverlay.style.webkitTextStroke = "none";
    }

    // Drop Shadow
    if (toggleShadow && toggleShadow.checked) {
      previewOverlay.style.textShadow = "0 2px 8px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)";
    } else {
      previewOverlay.style.textShadow = "none";
    }
  }

  // Text input listeners
  if (propText) {
    propText.addEventListener("input", updateLivePreview);
    propText.addEventListener("keyup", updateLivePreview);
  }

  // Case buttons
  if (btnCaseUpper && propText) {
    btnCaseUpper.addEventListener("click", () => {
      propText.value = propText.value.toUpperCase();
      updateLivePreview();
    });
  }

  if (btnCaseTitle && propText) {
    btnCaseTitle.addEventListener("click", () => {
      propText.value = propText.value.toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());
      updateLivePreview();
    });
  }

  if (btnCaseLower && propText) {
    btnCaseLower.addEventListener("click", () => {
      propText.value = propText.value.toLowerCase();
      updateLivePreview();
    });
  }

  // Clear text
  if (btnClearText && propText) {
    btnClearText.addEventListener("click", () => {
      propText.value = "";
      updateLivePreview();
      propText.focus();
    });
  }

  // Font family selector
  if (propFontFamily) {
    propFontFamily.addEventListener("change", updateLivePreview);
  }

  // Font size slider
  if (propFontSize && fontSizeDisplay) {
    propFontSize.addEventListener("input", () => {
      fontSizeDisplay.textContent = `${propFontSize.value} px`;
      updateLivePreview();
    });
  }

  // Tracking slider
  if (propTracking && trackingDisplay) {
    propTracking.addEventListener("input", () => {
      trackingDisplay.textContent = `${propTracking.value} px`;
      updateLivePreview();
    });
  }

  // Position segmented buttons
  document.querySelectorAll(".btn-segment").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".btn-segment").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const pos = btn.getAttribute("data-pos");
      if (previewOverlay) {
        previewOverlay.className = `preview-text-overlay pos-${pos}`;
      }
    });
  });

  // Text color picker
  if (propTextColor && textColorHex) {
    propTextColor.addEventListener("input", () => {
      textColorHex.textContent = propTextColor.value.toUpperCase();
      document.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("active"));
      updateLivePreview();
    });
  }

  // Color swatches
  document.querySelectorAll(".color-swatch").forEach(swatch => {
    swatch.addEventListener("click", () => {
      document.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("active"));
      swatch.classList.add("active");
      const colorVal = swatch.getAttribute("data-color");
      if (propTextColor && textColorHex) {
        propTextColor.value = colorVal;
        textColorHex.textContent = colorVal.toUpperCase();
      }
      updateLivePreview();
    });
  });

  // Stroke toggle
  if (toggleStroke && propStrokeColor) {
    toggleStroke.addEventListener("change", () => {
      propStrokeColor.disabled = !toggleStroke.checked;
      updateLivePreview();
    });
    propStrokeColor.addEventListener("input", updateLivePreview);
  }

  // Shadow toggle
  if (toggleShadow) {
    toggleShadow.addEventListener("change", updateLivePreview);
  }

  // Reset all button
  if (btnResetAll) {
    btnResetAll.addEventListener("click", () => {
      if (propText) propText.value = "HELLO";
      if (propFontFamily) propFontFamily.value = "Montserrat-ExtraBoldItalic";
      if (propFontSize) {
        propFontSize.value = 180;
        if (fontSizeDisplay) fontSizeDisplay.textContent = "180 px";
      }
      if (propTracking) {
        propTracking.value = 0;
        if (trackingDisplay) trackingDisplay.textContent = "0 px";
      }
      if (propTextColor) {
        propTextColor.value = "#ffffff";
        if (textColorHex) textColorHex.textContent = "#FFFFFF";
      }
      document.querySelectorAll(".color-swatch").forEach((s, idx) => {
        s.classList.toggle("active", idx === 0);
      });
      if (toggleStroke) toggleStroke.checked = false;
      if (propStrokeColor) {
        propStrokeColor.value = "#000000";
        propStrokeColor.disabled = true;
      }
      if (toggleShadow) toggleShadow.checked = true;

      document.querySelectorAll(".btn-segment").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-pos") === "center");
      });
      if (previewOverlay) {
        previewOverlay.className = "preview-text-overlay pos-center";
      }

      updateLivePreview();
      showNotification("Đã đặt lại mọi thông số về chuẩn mặc định.", "info");
    });
  }

  // Action buttons
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

  updateLivePreview();
}

// ─── UXP Entrypoints Registration ─────────────────────────────
try {
  const uxpMod = window.require ? window.require("uxp") : null;
  const ep = uxpMod && uxpMod.entrypoints ? uxpMod.entrypoints : null;
  if (ep && typeof ep.setup === "function") {
    ep.setup({
      plugin: {
        create() { logDiag("UXP plugin lifecycle create"); },
        destroy() { logDiag("UXP plugin lifecycle destroy"); }
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
