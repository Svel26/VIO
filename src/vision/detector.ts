import fs from 'fs';
import * as ort from 'onnxruntime-node';
import { createCanvas, loadImage, Image } from 'canvas';
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
     * Run detection on a base64 image string.
     */
    async detect(base64Image: string): Promise<DetectedElement[]> {
        if (!this.session) {
            logger.warn('Detector session not initialized. Returning empty detections.');
            return [];
        }

        try {
            const img = await loadImage(`data:image/png;base64,${base64Image}`);
            const tensor = this.preprocess(img);

            const outputs = await this.session.run({ images: tensor });
            const detections = this.postprocess(outputs, img.width, img.height);

            return detections;
        } catch (error) {
            logger.error('Detection failed:', error);
            return [];
        }
    }

    private preprocess(img: Image): ort.Tensor {
        const canvas = createCanvas(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

        // Convert canvas to Float32 tensor [1, 3, H, W]
        const imageData = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE).data;
        const float32Data = new Float32Array(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);

        // NCHW format
        for (let c = 0; c < 3; c++) {
            for (let i = 0; i < MODEL_INPUT_SIZE * MODEL_INPUT_SIZE; i++) {
                float32Data[c * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE + i] = imageData[i * 4 + c] / 255.0;
            }
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
        const scaleX = originalWidth / MODEL_INPUT_SIZE;
        const scaleY = originalHeight / MODEL_INPUT_SIZE;

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

                // Convert to original screen pixels (x1, y1, x2, y2)
                const x1 = (cx - w / 2) * scaleX;
                const y1 = (cy - h / 2) * scaleY;
                const x2 = (cx + w / 2) * scaleX;
                const y2 = (cy + h / 2) * scaleY;

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
