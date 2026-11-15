# BunText – Adobe Premiere Pro UXP Plugin

BunText is a native Adobe Premiere Pro plugin built on the Unified Extensibility Platform (UXP) that embeds Motion Graphics Templates (`.mogrt`) and allows editors to apply them directly to their active timeline sequence with a single click.

---

## Features

- **Embedded MOGRT**: Directly packages `hello 2.mogrt` in `assets/hello 2.mogrt`.
- **Visual Preview Card**: Displays the template thumbnail (`assets/preview.png`), duration (`10.0s`), resolution (`1920x1080`), and editable text parameter (`"HELLO"`).
- **Timeline Playhead Placement**: Automatically inserts the template at the current playhead position (Current Time Indicator / CTI) using Premiere Pro's `TickTime` API, or at sequence start (`00:00:00:00`).
- **Configurable Track Targeting**: Target video tracks (V1, V2, V3, etc.) directly from the panel.
- **Adobe Premiere Pro Dark Theme**: Custom UI matching Premiere Pro's native Spectrum aesthetic.
- **Built-in Diagnostics**: Live expandable console in the panel showing host status, resolved file paths, and API execution events.

---

## Technical Architecture & API Investigation

### Official Premiere Pro UXP API Analysis
Adobe Premiere Pro v25+ (and v26+) introduced native JavaScript UXP DOM APIs under the `premierepro` module:

1. **Host Module**:
   ```javascript
   const ppro = require("premierepro");
   ```
2. **Project & Sequence Access**:
   ```javascript
   const project = await ppro.Project.getActiveProject();
   const sequence = await project.getActiveSequence();
   ```
3. **Playhead Tracking**:
   The active sequence provides `sequence.getPlayerPosition()`, which returns a `ppro.TickTime` object representing the exact timeline timestamp of the CTI.
4. **MOGRT Insertion (`SequenceEditor`)**:
   Under Premiere Pro's DOM, `ppro.SequenceEditor.getEditor(sequence)` provides:
   ```javascript
   editor.insertMogrtFromPath(
     mogrtNativePath, // absolute path to local .mogrt file
     insertTime,      // TickTime (playhead position or TickTime.TIME_ZERO)
     videoTrackIndex, // 0-based video track (1 for V2)
     audioTrackIndex  // audio track (0)
   );
   ```
   This is wrapped in `project.lockedAccess()` to ensure safe timeline mutation.
5. **Fallback Mechanism**:
   If running on a host build where `SequenceEditor.insertMogrtFromPath` is not yet present, the plugin gracefully falls back to `sequence.importMGT(path, timeTicks, trackIndex, 0)`.

---

## Project Structure

```
BunText/
├── manifest.json              # Official Adobe UXP v5 Manifest
├── index.html                 # Panel DOM & interface layout
├── styles.css                 # Premiere Pro dark theme styling
├── index.js                   # Application logic & UXP DOM integration
├── hello 2.mogrt              # Original workspace MOGRT (preserved)
├── assets/
│   ├── hello 2.mogrt          # Packaged template asset
│   ├── preview.png            # Extracted thumbnail preview
│   └── icons/
│       ├── dark.svg           # Panel icon (dark theme)
│       ├── light.svg          # Panel icon (light theme)
│       └── plugin-icon.svg    # Plugin list icon
└── README.md
```

---

## How to Install and Test in Adobe Premiere Pro

### Step 1: Install Adobe UXP Developer Tool (UDT)
If you do not have the Adobe UXP Developer Tool installed:
1. Open the **Adobe Creative Cloud Desktop** app.
2. Go to the **Apps** tab.
3. Under Categories, click **Manage Plugins** or search for **UXP Developer Tool**.
4. Click **Install**.

### Step 2: Add the Plugin to UDT
1. Launch **Adobe UXP Developer Tool**.
2. Click **Add Plugin** in the top-right corner.
3. Navigate to this directory:
   `c:\Users\imnha\OneDrive\Máy tính\Nhat data\Coding\BunText`
4. Select `manifest.json` and click **Open**.
5. You should now see **BunText** listed in your plugins table.

### Step 3: Load into Premiere Pro
1. Launch **Adobe Premiere Pro** (v25.0+ or v26.0+).
2. Open or create a project with an active sequence in the timeline.
3. In the **UXP Developer Tool**, locate **BunText** and ensure the host application is selected as **Adobe Premiere Pro**.
4. Click the **Actions (•••)** menu next to BunText and select **Load**.
5. The **BunText** panel will open inside Premiere Pro (or can be opened via `Window > Extensions / Plugins > BunText`).

### Step 4: Test Applying the MOGRT
1. In Premiere Pro, move your timeline playhead (CTI) to any desired timestamp.
2. In the **BunText** panel, verify the host status displays `Connected`.
3. Choose your desired target track (default: `V2`).
4. Click **Apply to Timeline**.
5. The `hello 2.mogrt` graphic is instantly imported and placed on your timeline at the playhead position!
