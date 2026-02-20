import * as ort from 'onnxruntime-node';
import { createCanvas, loadImage, Image } from 'canvas';
import { logger } from '../utils/logger.js';

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
            // Note: This requires the .onnx file to exist
            // this.session = await ort.InferenceSession.create(this.modelPath);
            logger.info('Detector initialized (Waiting for model file).');
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
        const canvas = createCanvas(640, 640);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 640, 640);

        // Convert canvas to Float32 tensor [1, 3, 640, 640]
        const imageData = ctx.getImageData(0, 0, 640, 640).data;
        const float32Data = new Float32Array(3 * 640 * 640);

        // NCHW format
        for (let c = 0; c < 3; c++) {
            for (let i = 0; i < 640 * 640; i++) {
                float32Data[c * 640 * 640 + i] = imageData[i * 4 + c] / 255.0;
            }
        }

        return new ort.Tensor('float32', float32Data, [1, 3, 640, 640]);
    }

    private postprocess(outputs: ort.InferenceSession.ReturnType, originalWidth: number, originalHeight: number): DetectedElement[] {
        // Stub: Implement Non-Maximum Suppression (NMS) and mapping back to original dims
        // This part is complex and depends on the specific YOLOv8 output tensor shape [1, 84, 8400]
        logger.info('Post-processing detection outputs (Stub)...');
        return [];
    }
}
