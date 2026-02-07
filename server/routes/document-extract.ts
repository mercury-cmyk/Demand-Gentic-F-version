/**
 * Document Extraction API
 *
 * Extracts campaign context from uploaded documents using AI (Gemini)
 * Supports: PDF, DOCX, TXT, MD files
 */

import { Router } from "express";
import { requireAuth } from "../auth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from "multer";
import { createRequire } from "module";

// Create require for CommonJS modules in ESM context
const require = createRequire(import.meta.url);

// Dynamic requires for CommonJS modules
async function parsePDF(buffer: Buffer): Promise<string> {
  // pdf-parse 1.x exports a function that takes buffer and returns { text, numpages, info }
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  return data.text;
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth").then(m => m.default || m);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/markdown',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, DOCX, DOC, TXT, MD`));
    }
  },
});

/**
 * Extract text content from uploaded file
 */
async function extractTextFromFile(file: Express.Multer.File): Promise<string> {
  const { mimetype, buffer } = file;

  if (mimetype === 'application/pdf') {
    try {
      return await parsePDF(buffer);
    } catch (error) {
      console.error('[Document Extract] PDF parsing failed:', error);
      throw new Error('Failed to parse PDF document');
    }
  }

  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimetype === 'application/msword') {
    try {
      return await parseDocx(buffer);
    } catch (error) {
      console.error('[Document Extract] DOCX parsing failed:', error);
      throw new Error('Failed to parse Word document');
    }
  }

  if (mimetype === 'text/plain' || mimetype === 'text/markdown') {
    return buffer.toString('utf-8');
  }

  throw new Error(`Unsupported file type: ${mimetype}`);
}

/**
 * POST /api/documents/extract-campaign-context
 *
 * Uploads a document and uses AI to extract campaign context:
 * - Campaign objective
 * - Talking points
 * - Product/service info
 * - Target audience description
 * - Success criteria
 * - Common objections
 */
router.post("/extract-campaign-context", requireAuth, upload.single('document'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "No document uploaded" });
    }

    console.log(`[Document Extract] Processing ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);

    // Extract text from document
    const documentText = await extractTextFromFile(file);

    if (!documentText || documentText.trim().length < 50) {
      return res.status(400).json({
        message: "Document appears to be empty or too short to extract meaningful content"
      });
    }

    console.log(`[Document Extract] Extracted ${documentText.length} characters from document`);

    // Use Gemini to extract campaign context
    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!geminiApiKey) {
      return res.status(503).json({
        message: "AI service not configured. Set GEMINI_API_KEY to enable document extraction."
      });
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-001" });

    const prompt = `You are an expert B2B telemarketing strategist analyzing a document to extract comprehensive campaign context.

Your task is to thoroughly analyze this document and extract ALL relevant information for an AI-powered sales development campaign. Be extremely thorough - capture specific product names, features, benefits, pricing if mentioned, case studies, statistics, compliance info, and any competitive advantages.

DOCUMENT CONTENT:
---
${documentText.substring(0, 20000)}
---

Extract the following information in JSON format. Be THOROUGH and SPECIFIC - extract actual content from the document, not generic summaries. If something isn't explicitly in the document, use null.

{
  "campaignObjective": "The specific business goal (e.g., 'Book discovery calls with IT directors at mid-market companies to discuss cloud migration solutions')",

  "productServiceInfo": "DETAILED description including: product/service name, key features, pricing tiers if mentioned, deployment options, integrations, compliance certifications, and unique selling points. Be specific!",

  "talkingPoints": [
    "Extract 5-10 SPECIFIC value propositions, statistics, and proof points directly from the document",
    "Include specific numbers, percentages, or metrics mentioned",
    "Include any ROI claims, cost savings, or efficiency improvements",
    "Include competitive differentiators",
    "Include any customer success metrics or testimonials"
  ],

  "targetAudienceDescription": "Specific titles, industries, company sizes, pain points, and buyer personas mentioned in the document",

  "successCriteria": "What specific outcome defines success (e.g., 'Prospect agrees to schedule a 30-minute demo call')",

  "commonObjections": [
    {"objection": "Specific objection from the document", "response": "Suggested response based on document content"},
    "Include objections and responses if mentioned, or common objections for this type of product"
  ],

  "keyFacts": [
    "ALL statistics, numbers, percentages mentioned in the document",
    "Customer counts, revenue figures, growth metrics",
    "Awards, certifications, compliance standards",
    "Case study results or customer success stories",
    "Any specific claims that can be used as proof points"
  ],

  "companyBackground": "Company name, founding date, headquarters, size, market position, and any credibility indicators",

  "callToAction": "The specific next step (e.g., 'Schedule a personalized demo', 'Request a proposal', 'Attend an upcoming webinar')",

  "suggestedOpeningStatement": "A natural, conversational opening for a sales call that references specific value from the document",

  "qualificationQuestions": [
    "Suggested questions to ask prospects to qualify them, based on the product/service",
    "Questions that uncover pain points, timeline, budget, authority"
  ],

  "competitiveAdvantages": [
    "Any competitive differentiators or unique features mentioned",
    "What makes this solution different from alternatives"
  ]
}

IMPORTANT:
- Extract ACTUAL content from the document, not generic placeholder text
- Include specific numbers, names, and details
- If the document contains pricing, features, or statistics, include them exactly as stated
- Be thorough - it's better to extract more than less

Return ONLY valid JSON, no markdown formatting or explanation.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON response
    let extractedContext;
    try {
      // Clean up response (remove markdown code blocks if present)
      let jsonText = responseText.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      }
      extractedContext = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('[Document Extract] Failed to parse AI response:', responseText);
      return res.status(500).json({
        message: "Failed to parse extracted content. Please try again.",
        rawResponse: responseText.substring(0, 500)
      });
    }

    console.log('[Document Extract] Successfully extracted campaign context');

    res.json({
      success: true,
      filename: file.originalname,
      extractedContext,
      documentLength: documentText.length,
    });

  } catch (error: any) {
    console.error("[Document Extract] Error:", error);
    console.error("[Document Extract] Error stack:", error?.stack);
    console.error("[Document Extract] Error name:", error?.name);

    if (error instanceof multer.MulterError) {
      return res.status(400).json({
        message: error.code === 'LIMIT_FILE_SIZE'
          ? 'File too large. Maximum size is 10MB.'
          : `Upload error: ${error.message}`
      });
    }

    // Provide more detailed error info for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = {
      name: error?.name,
      message: errorMessage,
      code: error?.code,
    };

    res.status(500).json({
      message: "Failed to extract document content",
      error: errorMessage,
      details: errorDetails
    });
  }
});

export default router;
