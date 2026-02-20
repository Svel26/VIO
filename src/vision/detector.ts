import fs from 'fs';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import { DETECTION_CONF_THRESHOLD, NMS_IOU_THRESHOLD, MODEL_INPUT_SIZE } from '../utils/config.js';

export interface DetectedElement {
    id: number;
    type: string;
    bounds: { x1: number; y1: number; x2: number; y2: number };
    center: { x: number; y: number };
    confidence: number;
    text?: string;
}

export class UIDetector {
    private session: ort.InferenceSession | null = null;
    private modelPath: string;

    constructor(modelPath: string = 'models/yolov8n-ui.onnx') {
        this.modelPath = modelPath;
    }

    async initialize() {
        try {
            logger.info(`Initializing ONNX session with model: ${this.modelPath}`);

            // Check if model file exists
            if (!fs.existsSync(this.modelPath)) {
                logger.warn(`Model file not found at ${this.modelPath}. Element detection will be disabled.`);
                return;
            }

            this.session = await ort.InferenceSession.create(this.modelPath);
            logger.info('Detector ONNX session initialized successfully.');
        } catch (error) {
            logger.error('Failed to initialize detector:', error);
        }
    }

    /**
 * Run detection on a raw image buffer.  The buffer should contain
 * a screenshot (PNG, JPEG, etc.) and the caller must provide the
 * original width/height of the screenshot so that coordinate scaling
 * can be computed correctly.
 */
    async detect(imageBuffer: Buffer, originalWidth: number, originalHeight: number): Promise<DetectedElement[]> {
        if (!this.session) {
            logger.warn('Detector session not initialized. Returning empty detections.');
            return [];
        }

        try {
            const tensor = await this.preprocessBuffer(imageBuffer);
            const outputs = await this.session.run({ images: tensor });
            const detections = this.postprocess(outputs, originalWidth, originalHeight);
            return detections;
        } catch (error) {
            logger.error('Detection failed:', error);
            return [];
        }
    }

    /**
     * Preprocess the raw image buffer using sharp.  This avoids the
     * expensive canvas conversion and base64 round-trip previously used.
     */
    private async preprocessBuffer(buffer: Buffer): Promise<ort.Tensor> {
        // Resize to MODEL_INPUT_SIZE × MODEL_INPUT_SIZE conceptually, but keep aspect ratio via letterboxing.
        const resized = await sharp(buffer)
            .resize({ width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE, fit: 'contain', background: { r: 114, g: 114, b: 114 } })
            .ensureAlpha() // make sure we have 4 channels
            .raw()
            .toBuffer();

        const numPixels = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
        const float32Data = new Float32Array(3 * numPixels);

        // sharp returns data in RGBA order by default (4 bytes per pixel)
        for (let i = 0; i < numPixels; i++) {
            const r = resized[i * 4 + 0];
            const g = resized[i * 4 + 1];
            const b = resized[i * 4 + 2];
            // ignore alpha channel at index i*4 + 3

            // fill NCHW format
            float32Data[i] = r / 255.0;                       // R plane
            float32Data[numPixels + i] = g / 255.0;           // G plane
            float32Data[2 * numPixels + i] = b / 255.0;       // B plane
        }

        return new ort.Tensor('float32', float32Data, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
    }

    private classMapping: { [key: number]: string } = {
        0: 'DOB', 1: 'address', 2: 'age input', 3: 'age', 4: 'button', 5: 'checkbox',
        6: 'city', 7: 'company', 8: 'country dropdown', 9: 'country input', 10: 'date',
        11: 'day dropdown', 12: 'doc-upload', 13: 'dropdown', 14: 'email-input',
        15: 'emp id', 16: 'first-name', 17: 'gender dropdown', 18: 'gender', 19: 'input',
        20: 'job role', 21: 'last-name', 22: 'message', 23: 'month dropdown', 24: 'name',
        25: 'otp', 26: 'password', 27: 'phone-num', 28: 'radio_button', 29: 'region',
        30: 'reminder checkbox', 31: 'state dropdown', 32: 'state input-', 33: 'state',
        34: 'terms checkbox', 35: 'username', 36: 'web url-', 37: 'year dropdown', 38: 'zip code'
    };

    private postprocess(outputs: ort.InferenceSession.ReturnType, originalWidth: number, originalHeight: number): DetectedElement[] {
        logger.info('Post-processing YOLOv8 detection outputs...');

        // Assuming standard YOLOv8 output name is 'output0'
        const output = outputs[Object.keys(outputs)[0]];
        const data = output.data as Float32Array;

        // YOLOv8 shape is typically [batch, dimensions, anchors] -> [1, 4 + classes, 8400]
        const numDimensions = output.dims[1];
        const numAnchors = output.dims[2];
        const numClasses = numDimensions - 4;

        const confThreshold = DETECTION_CONF_THRESHOLD;
        let candidates: DetectedElement[] = [];

        // Scale factors to map the 640x640 detection back to your real screen resolution
        // Calculate the scaling factor based on the longest edge
        const scale = Math.max(originalWidth, originalHeight) / MODEL_INPUT_SIZE;
        // Calculate padding offsets
        const padX = (MODEL_INPUT_SIZE - (originalWidth / scale)) / 2;
        const padY = (MODEL_INPUT_SIZE - (originalHeight / scale)) / 2;

        for (let i = 0; i < numAnchors; i++) {
            let maxClassConf = 0;
            let classId = -1;

            // Find the class with the highest confidence for this anchor
            for (let c = 0; c < numClasses; c++) {
                const conf = data[(4 + c) * numAnchors + i];
                if (conf > maxClassConf) {
                    maxClassConf = conf;
                    classId = c;
                }
            }

            if (maxClassConf > confThreshold) {
                // Extract bounding box (cx, cy, w, h)
                const cx = data[0 * numAnchors + i];
                const cy = data[1 * numAnchors + i];
                const w = data[2 * numAnchors + i];
                const h = data[3 * numAnchors + i];

                // Convert to original screen pixels (x1, y1, x2, y2), subtracting zero-padding
                const x1 = ((cx - w / 2) - padX) * scale;
                const y1 = ((cy - h / 2) - padY) * scale;
                const x2 = ((cx + w / 2) - padX) * scale;
                const y2 = ((cy + h / 2) - padY) * scale;

                candidates.push({
                    id: candidates.length, // Temporary ID
                    type: this.classMapping[classId] || `class_${classId}`,
                    bounds: { x1, y1, x2, y2 },
                    center: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
                    confidence: maxClassConf
                });
            }
        }

        // Apply Non-Maximum Suppression (NMS) to remove duplicate overlapping boxes
        return this.applyNMS(candidates, NMS_IOU_THRESHOLD);
    }

    private applyNMS(boxes: DetectedElement[], iouThreshold: number): DetectedElement[] {
        // Sort boxes by confidence (highest first)
        boxes.sort((a, b) => b.confidence - a.confidence);
        const selected: DetectedElement[] = [];

        for (const box of boxes) {
            let shouldSelect = true;
            for (const selectedBox of selected) {
                if (this.calculateIoU(box.bounds, selectedBox.bounds) > iouThreshold) {
                    shouldSelect = false;
                    break;
                }
            }
            if (shouldSelect) {
                box.id = selected.length; // Re-assign sequential IDs
                selected.push(box);
            }
        }
        return selected;
    }

    private calculateIoU(box1: any, box2: any): number {
        const x1 = Math.max(box1.x1, box2.x1);
        const y1 = Math.max(box1.y1, box2.y1);
        const x2 = Math.min(box1.x2, box2.x2);
        const y2 = Math.min(box1.y2, box2.y2);

        const intersectionArea = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        const box1Area = (box1.x2 - box1.x1) * (box1.y2 - box1.y1);
        const box2Area = (box2.x2 - box2.x1) * (box2.y2 - box2.y1);

        return intersectionArea / (box1Area + box2Area - intersectionArea);
    }
}
