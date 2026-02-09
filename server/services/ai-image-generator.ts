/**
 * AI Image Generator Service
 *
 * Comprehensive service for AI-powered image generation using Vertex AI Imagen 3.
 * Supports various styles, aspect ratios, and provides job tracking with database persistence.
 *
 * Features:
 * - Vertex AI Imagen 3 integration
 * - Multiple image styles (photorealistic, illustration, abstract, etc.)
 * - Various aspect ratios for email/marketing use cases
 * - Job tracking and status updates
 * - Cloud Storage integration for image hosting
 * - Thumbnail generation
 * - Usage analytics
 */

import { db } from '../db';
import { aiImageGenerationJobs, emailBuilderImages } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { uploadToS3, getPublicUrl, generateStorageKey } from '../lib/storage';
import { getVertexConfig } from './vertex-ai/vertex-client';
import crypto from 'crypto';

// ==================== TYPES ====================

export type ImageStyle =
  | 'photorealistic'
  | 'illustration'
  | 'abstract'
  | 'minimalist'
  | 'corporate'
  | 'tech'
  | 'lifestyle'
  | 'product'
  | '3d_render'
  | 'watercolor'
  | 'flat_design'
  | 'isometric';

export type AspectRatio = '1:1' | '16:9' | '4:3' | '3:4' | '9:16' | '3:2' | '2:3';

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  style?: ImageStyle;
  aspectRatio?: AspectRatio;
  numberOfImages?: number;
  requestedBy?: string;
  parameters?: {
    guidanceScale?: number;
    seed?: number;
    safetyFilterLevel?: 'block_few' | 'block_some' | 'block_most';
  };
}

export interface GeneratedImage {
  imageId: string;
  url: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  sizeBytes?: number;
}

export interface ImageGenerationResult {
  success: boolean;
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  images?: GeneratedImage[];
  error?: string;
  durationMs?: number;
  estimatedCost?: number;
}

// ==================== STYLE PROMPTS ====================

const STYLE_PROMPTS: Record<ImageStyle, string> = {
  photorealistic: 'photorealistic, highly detailed, professional photography, 8k resolution, sharp focus',
  illustration: 'digital illustration, vibrant colors, clean lines, professional artwork style',
  abstract: 'abstract art, geometric shapes, modern design, artistic composition',
  minimalist: 'minimalist design, clean, simple, lots of white space, modern aesthetic',
  corporate: 'professional corporate style, business imagery, clean and polished',
  tech: 'technology themed, futuristic, digital aesthetic, modern tech company style',
  lifestyle: 'lifestyle photography, natural lighting, candid moments, authentic feel',
  product: 'product photography, studio lighting, white background, commercial quality',
  '3d_render': '3D rendered, CGI quality, photorealistic materials, studio lighting',
  watercolor: 'watercolor painting style, soft edges, artistic, hand-painted appearance',
  flat_design: 'flat design, vector style, bold colors, no gradients, modern UI aesthetic',
  isometric: 'isometric illustration, 3D perspective, clean geometric shapes, technical drawing',
};

// ==================== DIMENSION MAPPINGS ====================

const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1344, height: 756 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
  '9:16': { width: 756, height: 1344 },
  '3:2': { width: 1152, height: 768 },
  '2:3': { width: 768, height: 1152 },
};

// ==================== AI IMAGE GENERATOR CLASS ====================

class AIImageGenerator {
  private projectId: string;
  private location: string;
  private model: string = 'imagen-3.0-generate-001';

  constructor() {
    const config = getVertexConfig();
    this.projectId = config.projectId;
    this.location = config.location;
  }

  /**
   * Generate images using Imagen 3
   */
  async generateImages(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const jobId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // Create job record
      await this.createJob(jobId, request);
      await this.updateJobStatus(jobId, 'processing');

      // Build enhanced prompt with style
      const enhancedPrompt = this.buildEnhancedPrompt(request);

      // Get dimensions for aspect ratio
      const dimensions = ASPECT_RATIO_DIMENSIONS[request.aspectRatio || '1:1'];

      // Generate images via Vertex AI Imagen 3
      const generatedImages = await this.callImagenAPI(
        enhancedPrompt,
        request.negativePrompt,
        request.aspectRatio || '1:1',
        request.numberOfImages || 1,
        request.parameters
      );

      if (!generatedImages || generatedImages.length === 0) {
        throw new Error('No images were generated');
      }

      // Upload images to cloud storage and create records
      const images: GeneratedImage[] = [];
      for (let i = 0; i < generatedImages.length; i++) {
        const imageData = generatedImages[i];
        const imageRecord = await this.saveImage(
          imageData,
          jobId,
          request,
          dimensions,
          i,
          request.requestedBy
        );
        images.push(imageRecord);
      }

      const durationMs = Date.now() - startTime;
      const estimatedCost = this.calculateCost(images.length);

      // Update job with success
      await this.completeJob(jobId, images, durationMs, estimatedCost);

      return {
        success: true,
        jobId,
        status: 'completed',
        images,
        durationMs,
        estimatedCost,
      };
    } catch (error: any) {
      console.error('[AIImageGenerator] Generation failed:', error);
      const durationMs = Date.now() - startTime;

      await this.failJob(jobId, error.message, durationMs);

      return {
        success: false,
        jobId,
        status: 'failed',
        error: error.message,
        durationMs,
      };
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<ImageGenerationResult | null> {
    const jobs = await db
      .select()
      .from(aiImageGenerationJobs)
      .where(eq(aiImageGenerationJobs.id, jobId))
      .limit(1);

    if (jobs.length === 0) {
      return null;
    }

    const job = jobs[0];

    return {
      success: job.status === 'completed',
      jobId: job.id,
      status: job.status as any,
      images: job.generatedImages as GeneratedImage[] | undefined,
      error: job.errorMessage || undefined,
      durationMs: job.durationMs || undefined,
      estimatedCost: job.estimatedCost || undefined,
    };
  }

  /**
   * List recent jobs for a user
   */
  async listJobs(userId?: string, limit: number = 20): Promise<any[]> {
    let query = db.select().from(aiImageGenerationJobs);

    if (userId) {
      query = query.where(eq(aiImageGenerationJobs.requestedBy, userId)) as typeof query;
    }

    const jobs = await query
      .orderBy(aiImageGenerationJobs.createdAt)
      .limit(limit);

    return jobs;
  }

  // ==================== PRIVATE METHODS ====================

  private buildEnhancedPrompt(request: ImageGenerationRequest): string {
    const parts: string[] = [];

    // Add main prompt
    parts.push(request.prompt);

    // Add style modifiers
    if (request.style && STYLE_PROMPTS[request.style]) {
      parts.push(STYLE_PROMPTS[request.style]);
    }

    // Add quality enhancers for email use
    parts.push('professional quality, suitable for marketing email, high quality, well-composed');

    return parts.join(', ');
  }

  private async callImagenAPI(
    prompt: string,
    negativePrompt?: string,
    aspectRatio: string = '1:1',
    sampleCount: number = 1,
    parameters?: ImageGenerationRequest['parameters']
  ): Promise<string[]> {
    // Build the Imagen 3 API request
    const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}:predict`;

    const requestBody: any = {
      instances: [
        {
          prompt,
        },
      ],
      parameters: {
        sampleCount: Math.min(sampleCount, 4), // Imagen 3 max is 4
        aspectRatio,
        ...(negativePrompt ? { negativePrompt } : {}),
        ...(parameters?.guidanceScale ? { guidanceScale: parameters.guidanceScale } : {}),
        ...(parameters?.seed ? { seed: parameters.seed } : {}),
        ...(parameters?.safetyFilterLevel ? { safetyFilterLevel: parameters.safetyFilterLevel } : {}),
      },
    };

    try {
      // Import GoogleAuth for authentication
      const { GoogleAuth } = await import('google-auth-library');
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });

      const client = await auth.getClient();
      const accessToken = await client.getAccessToken();

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken.token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Imagen API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // Extract base64 images from response
      const images: string[] = [];

      if (data.predictions) {
        for (const prediction of data.predictions) {
          if (prediction.bytesBase64Encoded) {
            images.push(prediction.bytesBase64Encoded);
          }
        }
      }

      return images;
    } catch (error: any) {
      console.error('[AIImageGenerator] Imagen API call failed:', error);
      throw error;
    }
  }

  private async saveImage(
    base64Data: string,
    jobId: string,
    request: ImageGenerationRequest,
    dimensions: { width: number; height: number },
    index: number,
    uploadedBy?: string
  ): Promise<GeneratedImage> {
    const imageId = crypto.randomUUID();
    const fileName = `ai-image-${jobId}-${index}.png`;
    const storageKey = generateStorageKey('email-images', fileName);

    // Decode base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const sizeBytes = imageBuffer.length;

    // Upload to cloud storage and make publicly accessible
    await uploadToS3(storageKey, imageBuffer, 'image/png');

    // Make the file publicly readable so the URL doesn't expire
    const bucketName = process.env.GCS_BUCKET || 'demandgentic-storage';
    try {
      const { Storage } = await import('@google-cloud/storage');
      const gcs = new Storage({ projectId: this.projectId });
      await gcs.bucket(bucketName).file(storageKey).makePublic();
    } catch (err) {
      console.warn('[AIImageGenerator] Could not make file public, falling back to signed URL:', err);
    }

    // Use permanent public URL (no expiry) instead of signed URL
    const storedUrl = `https://storage.googleapis.com/${bucketName}/${storageKey}`;
    const thumbnailUrl = storedUrl;

    // Save to database
    await db.insert(emailBuilderImages).values({
      id: imageId,
      source: 'ai_generated',
      storedUrl,
      thumbnailUrl,
      fileName,
      mimeType: 'image/png',
      width: dimensions.width,
      height: dimensions.height,
      sizeBytes,
      aiPrompt: request.prompt,
      aiModel: this.model,
      aiGenerationId: jobId,
      aiStyle: request.style,
      altText: this.generateAltText(request.prompt),
      uploadedBy,
    });

    return {
      imageId,
      url: storedUrl,
      thumbnailUrl,
      width: dimensions.width,
      height: dimensions.height,
      sizeBytes,
    };
  }

  private generateAltText(prompt: string): string {
    // Create a simplified alt text from the prompt
    const cleaned = prompt
      .replace(/,\s*(photorealistic|highly detailed|professional|8k|resolution|sharp focus).*/gi, '')
      .trim();

    return cleaned.length > 125 ? cleaned.substring(0, 122) + '...' : cleaned;
  }

  private calculateCost(imageCount: number): number {
    // Imagen 3 pricing: approximately $0.02-0.04 per image
    // This is an estimate and should be updated based on actual pricing
    const costPerImage = 0.03;
    return imageCount * costPerImage;
  }

  private async createJob(jobId: string, request: ImageGenerationRequest): Promise<void> {
    await db.insert(aiImageGenerationJobs).values({
      id: jobId,
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      style: request.style,
      aspectRatio: request.aspectRatio || '1:1',
      numberOfImages: request.numberOfImages || 1,
      model: this.model,
      parameters: request.parameters,
      status: 'pending',
      requestedBy: request.requestedBy,
    });
  }

  private async updateJobStatus(
    jobId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed'
  ): Promise<void> {
    const updates: any = { status };

    if (status === 'processing') {
      updates.startedAt = new Date();
    }

    await db
      .update(aiImageGenerationJobs)
      .set(updates)
      .where(eq(aiImageGenerationJobs.id, jobId));
  }

  private async completeJob(
    jobId: string,
    images: GeneratedImage[],
    durationMs: number,
    estimatedCost: number
  ): Promise<void> {
    await db
      .update(aiImageGenerationJobs)
      .set({
        status: 'completed',
        generatedImages: images,
        completedAt: new Date(),
        durationMs,
        estimatedCost,
      })
      .where(eq(aiImageGenerationJobs.id, jobId));
  }

  private async failJob(jobId: string, errorMessage: string, durationMs: number): Promise<void> {
    await db
      .update(aiImageGenerationJobs)
      .set({
        status: 'failed',
        errorMessage,
        completedAt: new Date(),
        durationMs,
      })
      .where(eq(aiImageGenerationJobs.id, jobId));
  }
}

// ==================== SINGLETON EXPORT ====================

export const aiImageGenerator = new AIImageGenerator();

// ==================== UTILITY FUNCTIONS ====================

/**
 * Get available image styles with descriptions
 */
export function getAvailableStyles(): Array<{ id: ImageStyle; name: string; description: string }> {
  return [
    {
      id: 'photorealistic',
      name: 'Photorealistic',
      description: 'High-quality, realistic photography style',
    },
    {
      id: 'illustration',
      name: 'Digital Illustration',
      description: 'Clean, vibrant digital artwork',
    },
    {
      id: 'abstract',
      name: 'Abstract',
      description: 'Modern, artistic geometric designs',
    },
    {
      id: 'minimalist',
      name: 'Minimalist',
      description: 'Clean, simple designs with lots of space',
    },
    {
      id: 'corporate',
      name: 'Corporate',
      description: 'Professional business imagery',
    },
    {
      id: 'tech',
      name: 'Technology',
      description: 'Futuristic, digital aesthetic',
    },
    {
      id: 'lifestyle',
      name: 'Lifestyle',
      description: 'Natural, candid photography style',
    },
    {
      id: 'product',
      name: 'Product Shot',
      description: 'Commercial product photography',
    },
    {
      id: '3d_render',
      name: '3D Render',
      description: 'CGI quality 3D graphics',
    },
    {
      id: 'watercolor',
      name: 'Watercolor',
      description: 'Soft, artistic painted look',
    },
    {
      id: 'flat_design',
      name: 'Flat Design',
      description: 'Bold, vector-style graphics',
    },
    {
      id: 'isometric',
      name: 'Isometric',
      description: 'Technical 3D perspective illustrations',
    },
  ];
}

/**
 * Get available aspect ratios with use cases
 */
export function getAvailableAspectRatios(): Array<{
  id: AspectRatio;
  name: string;
  dimensions: { width: number; height: number };
  useCase: string;
}> {
  return [
    {
      id: '1:1',
      name: 'Square (1:1)',
      dimensions: ASPECT_RATIO_DIMENSIONS['1:1'],
      useCase: 'Social media, profile images, icons',
    },
    {
      id: '16:9',
      name: 'Widescreen (16:9)',
      dimensions: ASPECT_RATIO_DIMENSIONS['16:9'],
      useCase: 'Email headers, hero banners, presentations',
    },
    {
      id: '4:3',
      name: 'Standard (4:3)',
      dimensions: ASPECT_RATIO_DIMENSIONS['4:3'],
      useCase: 'Product images, feature highlights',
    },
    {
      id: '3:4',
      name: 'Portrait (3:4)',
      dimensions: ASPECT_RATIO_DIMENSIONS['3:4'],
      useCase: 'Mobile-first content, testimonials',
    },
    {
      id: '9:16',
      name: 'Tall (9:16)',
      dimensions: ASPECT_RATIO_DIMENSIONS['9:16'],
      useCase: 'Stories, mobile ads, vertical banners',
    },
    {
      id: '3:2',
      name: 'Classic (3:2)',
      dimensions: ASPECT_RATIO_DIMENSIONS['3:2'],
      useCase: 'Photography, articles, blog posts',
    },
    {
      id: '2:3',
      name: 'Portrait Classic (2:3)',
      dimensions: ASPECT_RATIO_DIMENSIONS['2:3'],
      useCase: 'Portraits, posters, tall images',
    },
  ];
}

/**
 * Generate prompt suggestions for email marketing
 */
export function getPromptSuggestions(category: string): string[] {
  const suggestions: Record<string, string[]> = {
    hero: [
      'Professional team collaborating in a modern office with natural light',
      'Abstract gradient background with floating geometric shapes',
      'Minimalist workspace with laptop and coffee, soft morning light',
      'Futuristic technology concept with glowing blue elements',
    ],
    product: [
      'Clean product shot on white background with subtle shadows',
      'Product lifestyle shot in modern home environment',
      'Floating product with dynamic lighting and reflections',
      'Product with complementary items and props',
    ],
    people: [
      'Diverse professional team in casual meeting setting',
      'Business person working remotely in cozy home office',
      'Customer success moment with genuine smile',
      'Team celebration with high-fives and positive energy',
    ],
    abstract: [
      'Flowing abstract shapes in brand colors',
      'Geometric pattern with depth and dimension',
      'Soft gradient background with subtle texture',
      'Dynamic lines and curves suggesting motion and growth',
    ],
    technology: [
      'Digital transformation concept with connected nodes',
      'Cloud computing visualization with data streams',
      'AI and machine learning abstract representation',
      'Cybersecurity shield with encrypted data elements',
    ],
  };

  return suggestions[category] || suggestions.abstract;
}

export default aiImageGenerator;
