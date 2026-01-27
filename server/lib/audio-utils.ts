
// G.711 mu-law lookup tables and utilities
// Based on standard G.711 implementations

const BIAS = 0x84;
const CLIP = 32635;

const muLawToLinearTable = new Int16Array(256);
const linearToMuLawTable = new Uint8Array(65536);

// Initialize tables
(function initTables() {
    for (let i = 0; i < 256; i++) {
        let mu = ~i;
        let sign = (mu & 0x80) ? -1 : 1;
        let exponent = (mu >> 4) & 0x07;
        let mantissa = mu & 0x0f;
        let sample = ((mantissa << 3) + 0x84) << exponent;
        sample -= 0x84;
        muLawToLinearTable[i] = sign * sample;
    }

    for (let i = -32768; i < 32768; i++) {
        let sign = (i < 0) ? 0x80 : 0x00;
        let sample = (i < 0) ? -i : i;
        sample = Math.min(sample, CLIP);
        sample += BIAS;
        
        let exponent = 0;
        if (sample > 0x7FFF) exponent = 7;
        else if (sample > 0x3FFF) exponent = 6;
        else if (sample > 0x1FFF) exponent = 5;
        else if (sample > 0x0FFF) exponent = 4;
        else if (sample > 0x07FF) exponent = 3;
        else if (sample > 0x03FF) exponent = 2;
        else if (sample > 0x01FF) exponent = 1;

        let mantissa = (sample >> (exponent + 3)) & 0x0F;
        let mu = ~(sign | (exponent << 4) | mantissa);
        
        // Map signed 16-bit to index (offset by 32768)
        linearToMuLawTable[i + 32768] = mu;
    }
})();

export function ulawToLinear(ulawBuffer: Buffer): Int16Array {
    const len = ulawBuffer.length;
    const result = new Int16Array(len);
    for (let i = 0; i < len; i++) {
        result[i] = muLawToLinearTable[ulawBuffer[i]];
    }
    return result;
}

export function linearToUlaw(pcmBuffer: Int16Array): Buffer {
    const len = pcmBuffer.length;
    const result = Buffer.alloc(len);
    for (let i = 0; i < len; i++) {
        result[i] = linearToMuLawTable[pcmBuffer[i] + 32768];
    }
    return result;
}

/**
 * Downsamples from 24kHz to 8kHz (Simple Decimation/Averaging)
 * Input: 24kHz Int16Array
 * Output: 8kHz Int16Array
 */
export function downsample24kTo8k(input: Int16Array): Int16Array {
    const outputLength = Math.floor(input.length / 3);
    const output = new Int16Array(outputLength);
    
    // Simple averaging of every 3 samples to avoid aliasing
    for (let i = 0; i < outputLength; i++) {
        const inputIdx = i * 3;
        // Check bounds
        if (inputIdx + 2 < input.length) {
            const sum = input[inputIdx] + input[inputIdx + 1] + input[inputIdx + 2];
            output[i] = Math.round(sum / 3);
        } else {
             output[i] = input[inputIdx]; // Fallback
        }
    }
    return output;
}

/**
 * Upsamples from 8kHz to 16kHz (Linear Interpolation)
 * Input: 8kHz Int16Array
 * Output: 16kHz Int16Array
 */
export function upsample8kTo16k(input: Int16Array): Int16Array {
    const outputLength = input.length * 2;
    const output = new Int16Array(outputLength);
    
    for (let i = 0; i < input.length; i++) {
        const current = input[i];
        const next = (i + 1 < input.length) ? input[i + 1] : current;
        
        output[i * 2] = current;
        // Interpolate the midway point
        output[i * 2 + 1] = Math.round((current + next) / 2);
    }
    return output;
}
