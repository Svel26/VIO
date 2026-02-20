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

---

## Project Structure
- `src/agent/`: Core reasoning loop and Copilot integration.
- `src/tools/`: The action library (CLI, Browser, Mouse, Keyboard).
- `src/vision/`: Image capture, display enumeration, and element detection.
- `models/`: YOLOv8 ONNX model storage.

---
*Created by the VIO Dev Team.*
