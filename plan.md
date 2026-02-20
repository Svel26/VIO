

# Autonomous Hybrid Computer-Controlling Agent: Architecture & Best Practices

## 1. Core Architectural Challenge: Vision-to-Action Reliability

### 1.1 Critical Finding on GPT-4.1/GPT-4o Vision Limitations

#### 1.1.1 Coordinate Return Inaccuracy

The foundational assumption of the proposed architecture—that GPT-4.1 or GPT-4o can reliably return pixel-accurate coordinates for UI interaction—faces substantial empirical challenges that necessitate architectural revision. Multiple independent research sources and practitioner reports confirm that **vision-language models systematically struggle with precise spatial localization tasks**, exhibiting errors that render direct coordinate dependency unacceptable for autonomous agent operation.

The technical root cause lies in the **vision encoder's architectural design**. GPT-4.1 and GPT-4o process images through patch-based transformers that compress spatial information into semantic latent representations. This compression prioritizes object recognition and scene understanding over metric accuracy, with **documented mean centroid errors of 20–147 pixels** depending on evaluation context . For typical UI elements measuring 20–80 pixels in dimension, such errors guarantee interaction failure.

Empirical evidence from production implementations reinforces this theoretical limitation. The Kadoa engineering team documented explicit experiments with GPT-4V for web automation, finding that **"coordinates can be off by tens of pixels"** with systematic offset patterns that resist prompt engineering mitigation . A LinkedIn technical analysis of similar automation projects reported that **dedicated YOLO models achieved only 81% accuracy even with specialized training**, with 19% of UI element detections requiring fallback to alternative methods . The OpenAI Community Forum contains multiple practitioner reports of **"relatively poor" coordinate accuracy**, with one expert concluding that **"that is not something that gpt-4 vision can do, alone"** .

Benchmark comparisons quantify the performance gap decisively. On UI element detection tasks, **specialized YOLOv8 models achieve 0.85–0.92 mAP** (mean Average Precision) while **GPT-4V direct prediction achieves only 0.62–0.71** . This **20–30 percentage point differential** translates directly to operational reliability: a 30% element misidentification rate is incompatible with autonomous 24/7 operation where errors compound across multi-step workflows.

| Model/Approach | UI Detection mAP | Coordinate Error | Production Viability |
|:---|:---|:---|:---|
| GPT-4V direct coordinate prediction | 0.62–0.71 | 20–147 pixels | **Unacceptable** |
| GPT-4V with grid overlay augmentation | ~0.75 | 10–30 pixels | Marginal |
| YOLOv8n fine-tuned on UI datasets | 0.85–0.92 | 3–8 pixels | **Excellent** |
| YOLOv8x with full training | 0.89–0.94 | 2–5 pixels | Excellent (higher compute) |
| DOM-based selector targeting | N/A (exact) | 0 pixels | **Ideal for browser** |

The **resizing artifact problem** compounds these limitations. OpenAI's vision API preprocesses images through multiple scaling operations that **"mess the coordinates horribly"** according to documented API behavior . The model receives a **"twice-resized image"** rather than original pixels, making absolute coordinate mapping from model output to screen space fundamentally unreliable regardless of model capability .

#### 1.1.2 Implications for click_ui Implementation

The coordinate inaccuracy finding necessitates **fundamental architectural revision** to the `click_ui` tool and the broader vision-action pipeline. The original specification—where the LLM directly outputs x, y coordinates for nut-js execution—must be replaced with an **indirection layer that separates semantic reasoning from metric spatial execution**.

Three implementation paths emerge from research and practice, with distinct trade-offs:

| Approach | Accuracy | Implementation Complexity | Runtime Cost | Best For |
|:---|:---|:---|:---|:---|
| **Pure LLM coordinates (original)** | Poor | Minimal | Low (single API call) | Prototyping only—**rejected** |
| **Local YOLO + LLM reasoning** | High | Moderate | Medium (local inference + API) | General desktop automation |
| **Browser CDP/DOM + LLM** | Exact | Moderate | Low–medium (no vision API) | **Web-primary workloads** |
| **Cloud vision API** | High | Low | High (per-image cost) | Avoided—violates free tier constraint |

The **hybrid approach combining YOLO-based vision with DOM-centric browser automation** emerges as optimal for the specified requirements: general-purpose capability with primary browser interaction, 24/7 operation, and free Copilot resource constraints.

Key architectural changes required:

- **Observation layer enhancement**: Raw screenshots augmented with **structured element detection output** before LLM ingestion
- **Reasoning context restructuring**: LLM receives **element lists with pre-computed coordinates** rather than estimating coordinates from pixels
- **Action execution indirection**: `click_ui` accepts **semantic identifiers** (element ID, text label, role) with **internal coordinate resolution** from detection cache
- **Verification integration**: Post-action screenshot comparison confirms expected state changes, triggering retry or escalation

### 1.2 Established Solution Patterns from Research

#### 1.2.1 Dedicated UI Detection Models

The research literature converges on **specialized computer vision models for UI element detection** as the most reliable solution to coordinate accuracy requirements. These models are explicitly trained on large datasets of annotated interface screenshots, learning to recognize interactive elements with bounding box regression objectives that develop precise spatial calibration.

**YOLOv8-Based Pipelines**

The **OmniParser framework** exemplifies production-viable YOLO integration for UI automation. It employs a **fine-tuned YOLOv8 model trained on 400,000+ annotated screenshots** from the Common Crawl-based CC-UI dataset, with **2.8 million UI element bounding boxes** across seven categories: button, link, input field, image, text block, container, and icon . Performance characteristics demonstrate suitability for 24/7 operation: **inference time of 15–35ms per 1920×1080 screenshot on GPU, 45–120ms on CPU**, with **mAP@0.5 of 0.89** on the SeeClick benchmark .

The **YOLOv8n (nano) variant** specifically addresses resource-constrained deployment. At **3.2MB model size and ~12.8ms CPU inference time**, it achieves **37.3 mAP on COCO** with minimal computational overhead—acceptable for continuous background operation . For UI-specific tasks, fine-tuned variants achieve **0.85–0.92 mAP**, approaching the accuracy of larger models at fraction of the computational cost.

Integration pattern for the agent architecture:

| Stage | Component | Output |
|:---|:---|:---|
| 1. Screenshot capture | Platform-native APIs | Raw image buffer (PNG/JPEG) |
| 2. Preprocessing | Resize, normalize, tensor conversion | 640×640×3 float32 tensor |
| 3. YOLO inference | ONNX Runtime Node.js | Raw detection tensors |
| 4. Postprocessing | NMS, thresholding, coordinate transform | Structured element list |
| 5. OCR augmentation | PaddleOCR/EasyOCR on text regions | Text content for detected elements |
| 6. Context assembly | JSON serialization | LLM-ready structured input |

**Alternative Specialized Models**

**TinyClick** offers extreme efficiency optimization: **1.9MB model size, 8ms CPU inference, 0.84 mAP on mobile UI benchmarks** through neural architecture search-optimized design . Its direct output of **element center coordinates, confidence scores, and predicted interaction type** (click, type, scroll) streamlines integration with agent action selection.

**Florence-2** provides flexible **open-vocabulary detection** accepting arbitrary referring expressions ("the blue login button in the top right"), but at **2–4 seconds inference time** versus YOLO's sub-100ms latency . For 24/7 operation with frequent screenshot processing, YOLO's speed advantage outweighs Florence-2's flexibility unless dynamic element description is critical.

#### 1.2.2 DOM-Centric Interaction Approaches

For **browser-specific automation—the stated primary use case**—an alternative paradigm bypasses pixel-coordinate dependency entirely through **direct Document Object Model manipulation**. This approach achieves **theoretically perfect element targeting** by operating on semantic selectors rather than visual position.

The **Kadoa blog's recommended architecture** explicitly advocates this pattern: **"Instead of relying on coordinates, we can map the GPT-4V responses back to DOM elements and then interact with them"** . Implementation involves browser extension injection of unique element identifiers, LLM reasoning over semantic descriptions, and JavaScript execution for direct manipulation.

Technical implementation via **Chrome DevTools Protocol (CDP)** or **Playwright**:

| Capability | CDP Direct | Playwright Abstraction |
|:---|:---|:---|
| Element enumeration | `Accessibility.getFullAXTree` | `page.accessibility.snapshot()` |
| JavaScript execution | `Runtime.evaluate` | `page.evaluate()` |
| Navigation | `Page.navigate` | `page.goto()` |
| Network monitoring | `Network.enable` events | `page.on('response')` |
| Cross-browser support | Chrome/Edge only | Chromium, Firefox, WebKit |

The **correlation pipeline** between visual detection and DOM nodes enables hybrid robustness: YOLO provides fast initial localization, DOM query validates and refines targeting, with **cross-validation detecting discrepancies** that indicate dynamic content or rendering issues .

DOM-centric interaction's **limitation to browser contexts** suggests architectural bifurcation: **CDP/Playwright primary path for web content**, **YOLO-based vision fallback for native applications**. Given software development workflows—documentation, GitHub, cloud IDEs, CI/CD dashboards—this prioritization aligns with operational patterns.

#### 1.2.3 Hybrid Multi-Model Architectures

The **Meka Agent pattern** and broader multi-agent system literature demonstrate **separation of perception, reasoning, and action** into coordinated specialized components . This decomposition optimizes resource allocation: **lightweight models for frequent perception tasks**, **capable LLMs for complex reasoning**, with **intelligent routing** based on task characteristics.

For the Copilot SDK context, this translates to:

| Agent Component | Model/Technology | Responsibility | Invocation Frequency |
|:---|:---|:---|:---|
| **Perception Agent** | YOLOv8n/TinyClick (local) | Element detection, OCR, scene classification | Every observation cycle |
| **Reasoning Agent** | GPT-4.1 via Copilot SDK | Task planning, tool selection, error recovery | Per decision point |
| **Browser Agent** | Playwright/CDP (local) | DOM interaction, JavaScript execution | When browser context active |
| **Action Executor** | nut-js/child_process (local) | Coordinate translation, input simulation | Per reasoning instruction |

**Cost-performance optimization** is substantial. Local YOLO inference at **~50ms per screenshot** eliminates API costs entirely, while **reducing GPT-4.1 calls to essential reasoning moments**—potentially 1 call per 5–10 micro-actions versus 1:1 in naive architecture. This **5–10× reduction in API utilization** extends operational capacity within free tier limits and improves responsiveness through parallel local processing .

## 2. Refined Architecture: Three-Tier Vision-Reasoning-Action System

### 2.1 Tier 1: Observation Layer (Enhanced)

#### 2.1.1 Screen Capture Pipeline

The observation layer's foundation is **reliable, performant multi-modal state acquisition** across platforms. The Node.js runtime enables asynchronous I/O for parallel visual and terminal capture.

**Visual Stream Implementation**

| Platform | Primary Method | Fallback | Performance | Dependencies |
|:---|:---|:---|:---|:---|
| Windows | `node-screenshot` (WinAPI BitBlt) | `screenshot-desktop` | 50–150ms | `node-gyp`, Windows SDK |
| macOS | `screencapture` CLI | CoreGraphics N-API | 100–300ms | None (CLI) |
| Linux (Wayland) | `grim` + `slurp` | `wlroots` screencopy | 80–200ms | `grim`, `slurp` binaries |
| Linux (X11) | `import` (ImageMagick) | `scrot` | 100–250ms | ImageMagick or `scrot` |

Critical implementation details: **fixed capture resolution with explicit scaling factors** to mitigate resizing artifacts; **PNG encoding for lossless quality** (or JPEG 85–90 for bandwidth-constrained scenarios); **Base64 URL-safe alphabet** for SDK transmission; **sub-100ms acquisition latency** target for responsive interaction .

**Terminal Stream Implementation**

Parallel `child_process` execution captures CLI context without screenshot dependency:

```typescript
interface TerminalState {
  workingDirectory: string;
  lastCommand: string;
  lastExitCode: number;
  environmentSnapshot: Record<string, string>;
  recentOutput: string; // truncated to 2KB
}
```

This dual-channel observation—**visual + textual**—enables intelligent routing: shell-available operations prefer `execute_cli`, GUI interaction reserved for visual-only contexts.

#### 2.1.2 Vision Pre-Processing Module

The **critical architectural addition** transforms raw screenshots into structured, actionable representations through **local inference with zero API cost**.

**YOLOv8n/ONNX Integration**

```typescript
interface DetectedElement {
  elementId: number;           // Sequential or UUID
  elementType: 'button' | 'link' | 'input' | 'image' | 
               'text' | 'container' | 'icon' | 'unknown';
  bounds: { x1: number; y1: number; x2: number; y2: number; };
  center: { x: number; y: number; };  // Computed for click targeting
  textContent?: string;        // From OCR integration
  confidence: number;          // Detection confidence 0–1
  ocrConfidence?: number;      // Text recognition confidence
}
```

**Inference pipeline stages**:

| Stage | Operation | Latency | Output |
|:---|:---|:---|:---|
| 1. Preprocessing | Resize to 640×640, normalize [0,1], NCHW layout | 5–10ms | Float32 tensor |
| 2. ONNX inference | YOLOv8n forward pass | 30–80ms CPU, 10–20ms GPU | Raw detection tensors |
| 3. NMS | Non-maximum suppression, IoU threshold 0.45 | 2–5ms | Filtered detections |
| 4. Coordinate transform | Denormalize to screen coordinates | <1ms | Pixel-accurate bounds |
| 5. OCR (conditional) | PaddleOCR on text regions | 20–50ms per region | Extracted text content |
| **Total** | | **50–150ms typical** | Structured element list |

**ONNX Runtime Node.js bindings** (`onnxruntime-node`) enable this pipeline without Python dependency, preserving the single-language codebase advantage. Model initialization at application startup amortizes session creation cost; warm-up inference prevents first-call latency .

#### 2.1.3 DOM Snapshot Integration (Browser Context)

For browser automation, **CDP/Playwright integration provides exact structural information** inaccessible to pixel-based vision.

**Accessibility tree extraction** via `page.accessibility.snapshot()` yields:

```typescript
interface DOMElement {
  role: string;           // 'button', 'textbox', 'link', etc.
  name?: string;          // Accessible name/label
  value?: string;         // Current value (inputs)
  properties: {
    disabled?: boolean;
    required?: boolean;
    checked?: boolean;
    // ARIA states
  };
  bounds?: DOMRect;       // Document-relative coordinates
  children: DOMElement[]; // Hierarchical structure
}
```

**Vision-DOM correlation algorithm** matches YOLO detections to DOM nodes:

1. **Spatial overlap**: YOLO bounds intersect DOM `getBoundingClientRect()` with >0.3 IoU
2. **Type consistency**: YOLO `elementType` compatible with DOM `role`
3. **Text matching**: OCR content matches DOM `name`, `innerText`, or `aria-label`
4. **Hierarchical validation**: Parent-child relationships consistent across representations

Successfully correlated elements enrich output with **dual targeting capability**: visual coordinates for physical interaction, DOM selectors for JavaScript execution. Discrepancies trigger **confidence-weighted fallback** or **re-observation** .

### 2.2 Tier 2: Reasoning Layer (Copilot SDK + GPT-4.1)

#### 2.2.1 Context Assembly Strategy

The Copilot SDK receives **carefully curated context** optimized for reliable decision-making within context window constraints.

**Message Structure**

| Component | Format | Token Estimate | Purpose |
|:---|:---|:---|:---|
| System prompt | Text | 200–400 | Tool definitions, routing priorities, output schema |
| Rolling action summary | Text | 300–800 | Compressed history, failure patterns, progress indicator |
| Structured element list | JSON | 500–2,000 | Pre-detected elements with coordinates, text, confidence |
| Current screenshot | Base64 PNG | 1,000–1,500 | Visual reference for anomaly detection |
| Terminal state | Text | 100–300 | CLI context for routing decisions |
| Task objective | Text | 50–200 | Goal specification with completion criteria |
| **Total typical** | | **2,500–5,200** | Well within 128K context limit |

**Critical protocol: single-image retention with purge-before-send**. Historical images are explicitly removed from message array, replaced with placeholder text: `[Screenshot: see rolling summary and element list]`. This prevents the **~60K token accumulation** that would occur with 30-image retention, preserving reasoning quality for extended workflows .

**Rolling summary compression** employs LLM-based condensation every N steps:

- **Recent 3–5 actions**: Full detail (tool, parameters, outcome, timestamp)
- **Older actions**: Semantic summary ("Completed repository setup including clone, dependency installation, and initial build with 2 test failures")
- **Failure patterns**: Explicit preservation for error mode recognition

#### 2.2.2 Tool Selection Logic

Explicit **priority routing** encoded in system prompt and tool descriptions:

| Priority | Tool | Selection Criteria | Rationale |
|:---|:---|:---|:---|
| **1** | `execute_cli` | File paths, git operations, package management, text processing, data extraction | **Fastest, most reliable, clearest signals** |
| **2** | `execute_javascript` | Browser page manipulation, form submission, data extraction when DOM available | **Exact targeting, no coordinate uncertainty** |
| **3** | `click_ui_enhanced` | Native application interaction, unsupported browsers, CLI/JS insufficient | **Vision-guided with pre-computed coordinates** |
| **4** | `type_text` / `key_combo` | Text input, navigation shortcuts after focus establishment | **Direct input simulation** |

The LLM's tool calls for GUI interaction **reference elements by identifier**, not coordinates:

```json
{
  "tool": "click_ui_enhanced",
  "parameters": {
    "elementText": "Submit",
    "elementType": "button",
    "retryStrategy": "scroll_reveal"
  }
}
```

Coordinate resolution occurs in **Tier 3 execution layer**, mapping semantic reference to pre-detected bounding box center .

#### 2.2.3 Error Recovery and Re-planning

**Failure detection** operates at multiple levels:

| Detection Method | Trigger | Response |
|:---|:---|:---|
| Element not found | Identifier unmatched in current detection | Re-detection, OCR fallback, alternative description |
| Click verification fail | Post-action screenshot shows no state change | Retry with offset, keyboard alternative, scroll-to-reveal |
| CLI error | Non-zero exit code, stderr pattern match | Error parsing, suggested fix, alternative approach |
| Navigation timeout | Page load exceeds threshold | Network check, wait condition modification, URL validation |
| Stagnation loop | Repeated same action without progress | Force re-observation, task decomposition, human escalation |

**Escalation to `request_clarification`** occurs when: confidence below threshold (configurable, default 0.6), repeated failure (3+ consecutive), explicit uncertainty in LLM reasoning, or safety-critical action with destructive potential. The async pause mechanism preserves full state for resume, compatible with 24/7 operation .

### 2.3 Tier 3: Action Layer (Precision Execution)

#### 2.3.1 CLI Execution Path (execute_cli)

The `child_process` implementation handles **long-running operations, streaming output, and graceful termination**:

| Feature | Implementation | Purpose |
|:---|:---|:---|
| Streaming capture | `stdout`/`stderr` event handlers with circular buffer | Real-time progress for builds, installations |
| Timeout management | Configurable with SIGTERM → SIGKILL escalation | Prevent indefinite hangs |
| Output truncation | Last 10KB stdout, 5KB stderr for context window | Memory bounds without information loss |
| Exit code analysis | Pattern matching for common errors (permission denied, not found) | Automatic suggestion generation |
| PTY allocation | `node-pty` for interactive programs (vim, less, password prompts) | Full terminal emulation when needed |

**Process lifecycle**: `spawn` with environment inheritance → streaming capture → timeout monitoring → exit handling with zombie prevention → result serialization .

#### 2.3.2 GUI Execution Path (Enhanced click_ui)

The enhanced implementation **resolves semantic identifiers to pre-computed coordinates**:

```typescript
async function clickUiEnhanced(params: ClickUiParams): Promise<ActionResult> {
  // Resolution chain: exact ID → text match → fuzzy match → OCR search
  const element = await resolveElement(params, detectionCache);
  
  if (!element) {
    return { 
      success: false, 
      error: 'ELEMENT_NOT_FOUND',
      suggestion: generateAlternativeStrategies(params)
    };
  }
  
  // Coordinate computation with optional offset
  const targetX = element.center.x + (params.offsetX ?? 0);
  const targetY = element.center.y + (params.offsetY ?? 0);
  
  // nut-js execution with human-like motion
  await nutJs.mouse.move(straightTo({ x: targetX, y: targetY }));
  await sleep(random(50, 150)); // Variable delay
  await nutJs.mouse.click(Button.LEFT);
  
  // Verification: post-action screenshot and state comparison
  const verification = await verifyStateChange(preScreenshot);
  
  return {
    success: verification.changed,
    clickedAt: { x: targetX, y: targetY },
    targetElement: element,
    verificationResult: verification
  };
}
```

**Retry strategies** on verification failure: immediate re-detection (screen may have changed), coordinate jitter (±5px for precision issues), alternative element (semantic near-match), keyboard navigation (Tab to equivalent control), escalation .

#### 2.3.3 Text Input and Navigation (type_text, key_combo)

**Smart input adaptation** based on content and context:

| Scenario | Method | Rationale |
|:---|:---|:---|
| Short text (<50 chars), password fields | Keystroke simulation with 10–50ms delays | Mimic human typing, avoid clipboard exposure |
| Long text (>100 chars), code blocks | Clipboard paste (Ctrl+V / Cmd+V) | Speed, avoid keystroke overhead |
| Special characters, Unicode | Clipboard mandatory | Encoding reliability |
| Form with validation | Character-by-character with field blur check | Trigger validation feedback |

**Window management** via `key_combo`: platform detection for correct modifier mapping (Cmd vs. Ctrl), focus verification through active window title or screenshot region check, restoration of previous focus post-action .

## 3. Tool Registry: Extended Hybrid Engine

### 3.1 Fast-Path Tools

#### 3.1.1 execute_cli

**Function signature**:

```typescript
interface ExecuteCliParams {
  command: string;
  cwd?: string;           // Working directory
  timeoutMs?: number;     // Default: 300000 (5 minutes)
  env?: Record<string, string>;  // Environment variable overrides
  streaming?: boolean;    // Real-time output for long operations
}

interface ExecuteCliResult {
  success: boolean;
  stdout: string;         // Truncated to 10KB
  stderr: string;         // Truncated to 5KB
  exitCode: number;
  durationMs: number;
  suggestion?: string;    // Parsed error suggestion if failed
}
```

**Model instruction**: *"Default to execute_cli for all file operations, git workflows, package management (npm, pip, docker), text processing (grep, sed, awk, jq), and data extraction. CLI provides deterministic outcomes with comprehensive error reporting and superior speed to GUI alternatives."*

### 3.2 Vision-Guided GUI Tools

#### 3.2.1 click_ui_enhanced

**Critical revision from original specification**: **input parameters are semantic identifiers, not raw coordinates**.

| Parameter | Type | Description | Required |
|:---|:---|:---|:---|
| `elementId` | `number` | Direct reference to detection output ID | Optional* |
| `elementText` | `string` | Visible text to match against detected elements | Optional* |
| `elementType` | `enum` | Filter by type when text ambiguous | Optional |
| `offsetX` / `offsetY` | `number` | Fine adjustment from element center (pixels) | Optional, default 0 |
| `retryStrategy` | `enum` | Recovery approach on failure | Optional, default 'immediate' |
| `verification` | `boolean` | Require post-action state confirmation | Optional, default true |

*At least one of `elementId` or `elementText` required.

**Internal resolution pipeline**:

| Stage | Operation | Fallback on Failure |
|:---|:---|:---|
| 1. Exact match | `elementId` lookup in detection cache | Proceed to text search |
| 2. Text search | Substring match in `textContent` fields | Fuzzy matching (Levenshtein) |
| 3. Type filter | Apply `elementType` constraint if specified | Broader type categories |
| 4. OCR fallback | Full-screenshot OCR for unmatched text | Failure with suggestions |
| 5. Coordinate compute | Center of matched bounds + offset | — |

**Verification and retry**: Post-action screenshot capture → structural similarity comparison (SSIM or pHash) → success if change detected above threshold → retry with adjusted parameters if unchanged .

#### 3.2.2 type_text and key_combo

**type_text enhancements**:

| Parameter | Type | Default | Description |
|:---|:---|:---|:---|
| `content` | `string` | — | Text to input |
| `method` | `'keystroke' \| 'clipboard' \| 'auto'` | `'auto'` | Input method selection |
| `delayMs` | `number` | 10 | Inter-keystroke delay (keystroke method) |
| `chunkSize` | `number` | 50 | Clipboard threshold (auto method) |

**Auto method selection**: `content.length > chunkSize` or contains non-ASCII → clipboard; else keystroke with `delayMs` adaptation based on measured application response.

**key_combo**: Array of key names with platform-aware modifier mapping. Execution: ordered press → hold duration (50ms) → reverse-ordered release.

### 3.3 Browser-Specific Tools

#### 3.3.1 execute_javascript

**Direct DOM manipulation bypassing coordinate dependency entirely**.

| Parameter | Type | Description |
|:---|:---|:---|
| `script` | `string` | JavaScript code to execute in page context |
| `frameSelector` | `string?` | Target iframe if not main document |
| `args` | `any[]?` | Serializable arguments passed to script |
| `awaitPromise` | `boolean?` | Wait for returned Promise resolution |
| `timeoutMs` | `number?` | Execution timeout (default 30000) |

**Return value**: serialized result, captured `console.log/warn/error` output, detected page changes (URL, title, element count).

**Example patterns**:

| Task | Script Pattern |
|:---|:---|
| Form submission | `document.querySelector('form#login').submit()` |
| Value extraction | `document.querySelector('.price').textContent` |
| Event triggering | `document.querySelector('button').click()` |
| Complex interaction | `await new Promise(r => setTimeout(r, 100)); document.querySelector('.menu').classList.add('open')` |

#### 3.3.2 navigate_to

| Parameter | Type | Default | Description |
|:---|:---|:---|:---|
| `url` | `string` | — | Target URL |
| `waitUntil` | `'load' \| 'domcontentloaded' \| 'networkidle' \| 'commit'` | `'networkidle'` | Completion condition |
| `timeoutMs` | `number` | 30000 | Maximum navigation duration |
| `referer` | `string?` | — | HTTP Referer header |

**Wait condition selection**: `networkidle` for SPAs with dynamic content (no connections for 500ms); `domcontentloaded` for static pages; `load` for maximum compatibility; `commit` for fastest continuation (navigation committed, content loading).

#### 3.3.3 extract_page_data

**Structured data extraction combining selector and natural language approaches**.

| Parameter | Type | Description |
|:---|:---|:---|
| `description` | `string` | Natural language description of desired data |
| `schema` | `JSONSchema` | Expected output structure for validation |
| `selectorHint` | `string?` | Optional CSS/XPath starting point |
| `method` | `'selector' \| 'llm' \| 'hybrid'` | Extraction strategy |

**Hybrid method**: LLM generates selector from description and DOM context → execute with `document.querySelectorAll` → validate against schema → fallback to LLM direct extraction if validation fails.

### 3.4 Control Tools

#### 3.4.1 declare_success

| Parameter | Type | Required | Description |
|:---|:---|:---|:---|
| `summary` | `string` | Yes | Human-readable completion description |
| `evidence` | `object` | No | Supporting attachments |
| `evidence.screenshot` | `string` | No | Base64 final state image |
| `evidence.outputFiles` | `string[]` | No | Paths to generated artifacts |
| `evidence.metrics` | `Record<string, number>` | No | Quantitative results |

**Verification**: Optional completion criteria check against accumulated task state. Failure to satisfy criteria throws `COMPLETION_CRITERIA_UNSATISFIED` with details, allowing retry or clarification.

#### 3.4.2 request_clarification

**New tool for operational robustness in 24/7 deployment**.

| Parameter | Type | Description |
|:---|:---|:---|
| `question` | `string` | Specific information needed from human |
| `context.currentObjective` | `string` | Current task goal |
| `context.stepsTaken` | `number` | Progress indicator |
| `context.lastActions` | `string[]` | Recent action summaries |
| `context.currentState` | `enum` | `'blocked' \| 'ambiguous' \| 'error_recovery_exhausted'` |
| `options` | `string[]?` | Multiple choice if applicable |
| `timeoutMs` | `number?` | Auto-resume with default if no response |
| `defaultAction` | `string?` | Fallback action on timeout |

**Async pause mechanism**: Full agent state serialized to disk; notification dispatched (webhook, email, messaging); await human response; state restoration and resume on receipt. Compatible with indefinite human response latency without resource consumption .

## 4. Context Window Management: Optimized Strategy

### 4.1 Image Lifecycle Protocol

#### 4.1.1 Single Image Retention

**Strict enforcement**: Only current screenshot retained in active LLM context. Implementation:

```typescript
function prepareSdkMessages(history: Message[], current: Observation): Message[] {
  // Purge all historical image content
  const textOnlyHistory = history.map(msg => 
    containsImage(msg) 
      ? replaceImageWithPlaceholder(msg) 
      : msg
  );
  
  // Assemble current context with single image
  return [
    systemPrompt,
    ...textOnlyHistory.slice(-10), // Recent text exchanges
    {
      role: 'user',
      content: [
        { type: 'text', text: formatObservationText(current) },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${current.screenshot}` } },
        { type: 'text', text: formatElementList(current.detectedElements) },
        { type: 'text', text: `Objective: ${current.objective}` }
      ]
    }
  ];
}
```

**Token impact**: Single 1024×1024 image ~1,000 tokens versus 30-image accumulation ~30,000 tokens. **97% reduction** preserves context capacity for reasoning and tool definitions .

#### 4.1.2 Structured Vision Cache

Element detection results cached with **validity management**:

| Cache Property | Purpose | Invalidation Trigger |
|:---|:---|:---|
| `timestamp` | Age-based expiration | >5 seconds (active interaction) or >30 seconds (observation) |
| `screenshotHash` | Change detection | Perceptual hash distance > threshold (5–10) |
| `elements` | Structured output | Explicit invalidation on action execution |

**Incremental update**: For minor changes (hash distance 5–20), run detection only on changed regions, merging with retained valid detections. Reduces average latency from 150ms to ~60ms for stable interfaces .

### 4.2 Text Summary Engineering

#### 4.2.1 Action Log Compression

| Recency | Detail Level | Example |
|:---|:---|:---|
| Last 3 actions | Full | `Step 12: execute_cli("git status") → exit 0, "On branch main..."` |
| Actions 4–10 | Condensed | `Steps 7–11: Repository setup (clone, install, build) with 2 test failures` |
| Older actions | Aggregated | `6 prior navigation actions, 4 form interactions` |

**LLM-generated condensation** every 5 steps maintains narrative coherence while bounding token consumption.

#### 4.2.2 State Differential Encoding

Explicit change detection focuses attention:

```
State changes since last action:
+ [NEW] Modal dialog "Confirm Delete" appeared (center, high confidence 0.96)
~ [MODIFIED] Button "Submit" → disabled, text changed to "Processing..."
- [REMOVED] Form fields (covered by modal)
= [STABLE] 23 other elements unchanged
```

## 5. Resource Management for Free Copilot Tier

### 5.1 Model Invocation Optimization

#### 5.1.1 Vision Pre-Processing Cost Amortization

| Cost Component | Cloud Vision (GPT-4.1) | Local YOLO | Savings |
|:---|:---|:---|:---|
| Per-screenshot cost | ~$0.005–0.015 | $0 (electricity ~$0.0001) | **100%** |
| 24/7 operation (100/hour) | $12–36/day | ~$0.24/day | **99%** |
| Latency | 500–2000ms | 50–150ms | **10× faster** |
| Rate limit exposure | High (40–80/min) | None | Unbounded |

**YOLOv8n at 10 screenshots/minute**: ~5% CPU on modern 4-core mobile processor, negligible for 24/7 background operation .

#### 5.1.2 Batched and Conditional Reasoning

| Optimization | Mechanism | Impact |
|:---|:---|:---|
| Micro-action batching | Single LLM call for confident sequences | 3–5× reduction in API calls |
| Rule-based shortcuts | State machines for login, navigation patterns | 60–80% of routine operations |
| Confidence gating | Local classifier for LLM necessity | Skip reasoning for obvious actions |

**Target**: <10% of iterations require GPT-4.1 invocation; remainder handled by local inference and deterministic rules.

### 5.2 Alternative SDK Evaluation

#### 5.2.1 Vercel ai-sdk Compatibility

| Feature | Copilot SDK | ai-sdk |
|:---|:---|:---|
| Model routing | GitHub Copilot only | OpenAI, Anthropic, Google, local |
| Tool calling | Native | Standardized Zod schemas |
| Streaming | Supported | Unified `streamObject` interface |
| Migration effort | — | Adapter layer, ~2 weeks |

**Recommendation**: Implement abstraction layer preserving tool registry schemas; enables future migration without architectural disruption .

#### 5.2.2 Browser Use Framework Assessment

| Criterion | Browser Use | Custom Architecture |
|:---|:---|:---|
| Vision integration | Built-in GPT-4V | Flexible (YOLO/DOM hybrid) |
| Browser control | Playwright-based | Playwright/CDP direct |
| Native app support | None | Full (nut-js) |
| Customization | Plugin system | Unlimited |
| Language | Python | Node.js/TypeScript (specified) |

**Decision**: Custom architecture for Node.js commitment and native application capability; Browser Use patterns inform design.

## 6. Implementation Roadmap & Risk Mitigation

### 6.1 Phase 1: Foundation (Weeks 1–2)

#### 6.1.1 Core Loop Implementation

Deliverables:
- TypeScript project scaffold with `src/{agent,tools,vision,utils}/` structure
- Basic while-loop with Copilot SDK integration
- `execute_cli` implementation with streaming and timeout handling
- `declare_success` control flow
- Structured logging and telemetry

Success criteria: **100 consecutive CLI-only tasks with reliable completion detection**.

#### 6.1.2 Screenshot Capture Integration

Platform matrix implementation with unified interface:

| Platform | Method | Validation |
|:---|:---|:---|
| Windows | `node-screenshot` (WinAPI) | Manual coordinate verification |
| macOS | `screencapture` CLI | Permission handling, temporary file cleanup |
| Linux | `grim` (Wayland) / `import` (X11) | Desktop environment auto-detection |

### 6.2 Phase 2: Vision Enhancement (Weeks 3–4)

#### 6.2.1 YOLOv8n Integration

| Task | Details |
|:---|:---|
| Model acquisition | Download YOLOv8n ONNX from Ultralytics or UI-fine-tuned variant |
| ONNX Runtime setup | `onnxruntime-node` with execution provider selection |
| Preprocessing pipeline | 640×640 resize, normalization, NCHW tensor conversion |
| Postprocessing | NMS, confidence thresholding, coordinate denormalization |
| Integration | `detectElements()` returning structured output |

**Validation**: Detection accuracy on 50 target application screenshots; latency benchmarking; memory profiling.

#### 6.2.2 Enhanced click_ui Implementation

| Component | Implementation |
|:---|:---|
| Identifier resolution | ID → text → fuzzy → OCR fallback chain |
| Coordinate computation | Center + optional offset, boundary clamping |
| nut-js execution | Move duration, click verification |
| Retry logic | Immediate, scroll-reveal, alternative, escalate |
| Verification | Post-action screenshot comparison |

**Test coverage**: Unit tests for resolution pipeline; integration tests for full interaction sequences; failure injection for recovery validation.

### 6.3 Phase 3: Browser Specialization (Weeks 5–6)

#### 6.3.1 Playwright/CDP Integration

| Component | Implementation |
|:---|:---|
| Browser launch | Headful (not headless) for maximum compatibility |
| CDP session | `Accessibility.getFullAXTree`, `Runtime.evaluate` |
| Playwright abstraction | `page.evaluate`, `page.goto`, `page.accessibility.snapshot` |
| DOM-vision correlation | Position overlap matching, text validation |
| Tool implementation | `execute_javascript`, `navigate_to`, `extract_page_data` |

### 6.4 Critical Risks & Contingencies

| Risk | Likelihood | Impact | Mitigation |
|:---|:---|:---|:---|
| **YOLO detection accuracy insufficient** | Medium | High | Hybrid DOM+vision; domain-specific fine-tuning; human verification gate |
| **Copilot SDK availability changes** | Low | High | ai-sdk abstraction; alternative provider evaluation; local model fallback (Ollama) |
| **Application bot detection** | Medium | Medium | Human-like timing variation; focus on legitimate automation use cases |
| **24/7 stability degradation** | Medium | High | Health monitoring; automatic restart; state persistence; circuit breaker |
| **Platform capture API changes** | Low | Medium | Abstraction layer; multiple backend implementations |

