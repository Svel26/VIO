# VIO (Visual Interface Operator)

**VIO** is an autonomous, hybrid computer-controlling agent designed to operate seamlessly across web browsers and native operating system environments. It combines high-level LLM reasoning with computer vision and stealth automation.

---

## Core Capabilities

### Vision Tier (Visual Intelligence)
- **Multi-Display Support**: Fully aware of multi-monitor setups with global coordinate mapping.
- **YOLOv8 Integration**: Real-time UI element detection via ONNX Runtime.
- **Skeptical Verification**: Cross-verifies "success" signals by visually confirming page content to avoid decoy screens.

### Stealth & Evasion
- **Stealth Browser**: Powered by `playwright-extra` and `puppeteer-extra-plugin-stealth` to bypass bot detection (Cloudflare, Akamai, etc.).
- **Manual Fallback**: `wait_for_human` tool allows VIO to pause and request user intervention for complex CAPTCHAs or sensitive approvals.

### Action Tier (Cross-App Coordination)
- **Hybrid Control**: Switches dynamically between DOM-based interaction (Playwright) and Visual/Pixel-based interaction.
- **OS-Level Tasks**: Automates native applications (e.g., Notepad, CLI) using PowerShell orchestration and simulated input.

---

## Architecture

VIO operates on a triple-tier architecture:

1.  **Tier 1: Perception**: Captures screenshots and accessibility trees. Identifies UI widgets via YOLO.
2.  **Tier 2: Reasoning**: Powered by the GitHub Copilot SDK. Analyzes observations and plans the next semantic step.
3.  **Tier 3: Execution**: A suite of specialized tools (`navigate_to`, `click_ui_enhanced`, `execute_cli`) that transform plans into physical computer actions.

---

## Getting Started

### Prerequisites
- Node.js (v24+ recommended)
- Playwright-compatible browser binaries (`npx playwright install`)
- A valid GitHub Copilot token (configured via SDK)

### Installation
```bash
npm install
```

### Usage
Start VIO with a high-level objective:
```bash
npx tsx src/index.ts "Go to GitHub, find the latest version of React, and type it into a new Notepad window."
```

#### Command-line options
You can now pass a few flags directly to the agent instead of relying on environment variables or positional arguments:

```bash
# specify objective explicitly
npx tsx src/index.ts --objective "Open Notepad and type Hello"

# specify a browser profile directory for persistent state
npx tsx src/index.ts --profile "C:\Users\...\Chrome\User Data\Default" --objective "Visit gmail.com"

# combine both
npx tsx src/index.ts --profile "..." --objective "..."
```

The `--profile` flag is simply a convenience that sets `VIO_USER_DATA_DIR` for you. If you prefer, you can still export that variable yourself instead.

#### Interactive mode
Pass `--interactive` (or set it in the script) to start a short questionnaire before the agent launches. You'll be asked whether to use an existing profile and what objective to give the agent:

```bash
npx tsx src/index.ts --interactive
# or via npm script
echo 'starting...' && npm start -- --interactive
```

Interactive mode is handy when you're playing with the system and don't want to remember flags each time.

### Using Your Regular Browser/Profile
By default VIO launches a fresh Chromium instance with a temporary profile. If you want the agent to use the same browser that a human normally runs (complete with your saved logins, extensions and cookies) you can point it at an existing user data directory. Set the environment variable `VIO_USER_DATA_DIR` (or the alias `CHROME_USER_DATA_DIR`) to the path of your Chrome/Edge/Chromium profile folder before starting the agent, or use the new `--profile` CLI flag:

```bash
# Environment variable method (Windows cmd.exe)
set VIO_USER_DATA_DIR="C:\Users\%USERNAME%\AppData\Local\Google\Chrome\User Data\Default"
npm start "Go to mail.google.com and tell me if you're logged in."

# CLI flag method (any shell)
npm start -- --profile "C:\Users\%USERNAME%\AppData\Local\Google\Chrome\User Data\Default" --objective "Check Gmail login status"
```

An interactive mode is also available (see below) which will ask you whether to use a profile path.

The browser will launch visibly and use your real profile; cookies and session state are preserved, so you won't hit the "browser not secure" page when resuming from a `wait_for_human` pause. Be aware that reusing a profile also carries the usual risks of automation (extensions might interfere, credentials could be accidentally exposed, etc.).

### Automated Scenario Tests
A simple framework has been added to let you execute a series of predefined objectives to exercise VIO's capabilities. Scenario files live under `tests/scenarios` and are plain JSON arrays containing an `objective` string and a human-readable `description`.

To run all scenarios in sequence:

```bash
# install dependencies first if you haven't already
npm install

# execute the runner (requires Node.js and a UI environment)
npx tsx tests/runScenarios.ts
```

You can also target a single scenario file or run interactively:

```bash
# run only the "easy" scenarios
npx tsx tests/runScenarios.ts --file easy

# show prompts to pick a profile path and scenario
npx tsx tests/runScenarios.ts --interactive
```

You can add your own scenario files or modify the existing ones (`easy.json`, `medium.json`, `hard.json`).

Each run logs progress to the console and will automatically call the core loop with the supplied objective.

> **Note:** These tests are primarily intended for experimentation and manual observation rather than strict assertions, since VIO controls actual applications and may require human intervention (e.g. solving CAPTCHAs or entering sensitive credentials). Use `wait_for_human` if the agent gets stuck in a hard scenario.
>
> **Browser login warning:** Some web services (Gmail, banking sites, etc.) detect automation at the browser level. Even if you pause and log in manually, the Playwright/stealth context will often still trigger a “browser not secure” or similar block when the agent resumes. For these services it’s better to either:
> 
> 1. Perform the entire interaction in a real browser outside of VIO, then hand off data via the clipboard or API, or
> 2. Use official service APIs with proper credentials instead of driving the UI.
>
> The Gmail scenario in `hard.json` is provided for experimentation but is expected to fail or produce the warning you saw; it’s not a reliable automation path.

---

## Project Structure
- `src/agent/`: Core reasoning loop and Copilot integration.
- `src/tools/`: The action library (CLI, Browser, Mouse, Keyboard).
- `src/vision/`: Image capture, display enumeration, and element detection.
- `models/`: YOLOv8 ONNX model storage.

---
*Created by the VIO Dev Team.*
