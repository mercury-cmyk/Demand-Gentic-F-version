/**
 * Vertex AI Vector Search Service
 *
 * Provides semantic search capabilities for:
 * - Knowledge base retrieval
 * - Similar account/contact finding
 * - Agent memory and learning
 * - Campaign performance pattern matching
 */

import { generateEmbedding, generateEmbeddings } from "./vertex-client";
import { db } from "../../db";
import { accounts, contacts, callSessions } from "@shared/schema";
import { eq, sql, desc } from "drizzle-orm";

// ==================== TYPES ====================

export interface VectorDocument {
  id: string;
  type: "account" | "contact" | "call" | "knowledge" | "campaign";
  content: string;
  embedding?: number[];
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface SearchResult {
  document: VectorDocument;
  score: number;
  rank: number;
}

export interface VectorIndex {
  name: string;
  documents: VectorDocument[];
  dimension: number;
}

// ==================== IN-MEMORY VECTOR STORE ====================
// Note: For production, use Vertex AI Vector Search (Matching Engine)

class InMemoryVectorStore {
  private indices: Map<string, VectorIndex> = new Map();
  private defaultDimension = 768; // text-embedding-004 dimension

  /**
   * Create or get an index
   */
  getOrCreateIndex(name: string): VectorIndex {
    if (!this.indices.has(name)) {
      this.indices.set(name, {
        name,
        documents: [],
        dimension: this.defaultDimension,
      });
    }
    return this.indices.get(name)!;
  }

  /**
   * Add document to index
   */
  async addDocument(indexName: string, doc: Omit<VectorDocument, "embedding">): Promise<VectorDocument> {
    const index = this.getOrCreateIndex(indexName);

    // Generate embedding
    const embedding = await generateEmbedding(doc.content, "RETRIEVAL_DOCUMENT");

    const fullDoc: VectorDocument = {
      ...doc,
      embedding,
    };

    // Remove existing document with same ID
    index.documents = index.documents.filter(d => d.id !== doc.id);

    // Add new document
    index.documents.push(fullDoc);

    return fullDoc;
  }

  /**
   * Add multiple documents
   */
  async addDocuments(indexName: string, docs: Omit<VectorDocument, "embedding">[]): Promise<VectorDocument[]> {
    const index = this.getOrCreateIndex(indexName);

    // Generate embeddings in batch
    const contents = docs.map(d => d.content);
    const embeddings = await generateEmbeddings(contents, "RETRIEVAL_DOCUMENT");

    const fullDocs: VectorDocument[] = docs.map((doc, i) => ({
      ...doc,
      embedding: embeddings[i],
    }));

    // Remove existing documents with same IDs
    const newIds = new Set(docs.map(d => d.id));
    index.documents = index.documents.filter(d => !newIds.has(d.id));

    // Add new documents
    index.documents.push(...fullDocs);

    return fullDocs;
  }

  /**
   * Search by vector similarity
   */
  async search(
    indexName: string,
    query: string,
    options: { limit?: number; filter?: (doc: VectorDocument) => boolean } = {}
  ): Promise<SearchResult[]> {
    const index = this.indices.get(indexName);
    if (!index || index.documents.length === 0) {
      return [];
    }

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query, "RETRIEVAL_QUERY");

    // Calculate similarities
    let results = index.documents
      .filter(d => d.embedding && (!options.filter || options.filter(d)))
      .map(doc => ({
        document: doc,
        score: this.cosineSimilarity(queryEmbedding, doc.embedding!),
        rank: 0,
      }));

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Assign ranks and limit
    results = results.slice(0, options.limit || 10).map((r, i) => ({
      ...r,
      rank: i + 1,
    }));

    return results;
  }

  /**
   * Calculate cosine similarity
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Delete document
   */
  deleteDocument(indexName: string, docId: string): boolean {
    const index = this.indices.get(indexName);
    if (!index) return false;

    const initialLength = index.documents.length;
    index.documents = index.documents.filter(d => d.id !== docId);
    return index.documents.length < initialLength;
  }

  /**
   * Clear index
   */
  clearIndex(indexName: string): void {
    const index = this.indices.get(indexName);
    if (index) {
      index.documents = [];
    }
  }

  /**
   * Get index stats
   */
  getIndexStats(indexName: string): { documentCount: number; dimension: number } | null {
    const index = this.indices.get(indexName);
    if (!index) return null;

    return {
      documentCount: index.documents.length,
      dimension: index.dimension,
    };
  }
}

// ==================== VECTOR SEARCH SERVICE ====================

const vectorStore = new InMemoryVectorStore();

/**
 * Index accounts for semantic search
 */
export async function indexAccounts(accountIds?: string[]): Promise<number> {
  let query = db.select().from(accounts);

  if (accountIds && accountIds.length > 0) {
    query = query.where(sql`${accounts.id} = ANY(${accountIds})`) as any;
  }

  const accountList = await query.limit(1000);

  const docs: Omit<VectorDocument, "embedding">[] = accountList.map(account => ({
    id: `account-${account.id}`,
    type: "account" as const,
    content: [
      account.name,
      account.industry || "",
      account.description || "",
      account.specialties?.join(" ") || "",
      `${account.employeeCount || 0} employees`,
      account.revenueRange || "",
      account.hqCity || "",
      account.hqCountry || "",
    ].filter(Boolean).join(" | "),
    metadata: {
      accountId: account.id,
      name: account.name,
      industry: account.industry,
      domain: account.domain,
    },
    createdAt: new Date(),
  }));

  await vectorStore.addDocuments("accounts", docs);
  return docs.length;
}

/**
 * Index contacts for semantic search
 */
export async function indexContacts(contactIds?: string[]): Promise<number> {
  let query = db.select().from(contacts);

  if (contactIds && contactIds.length > 0) {
    query = query.where(sql`${contacts.id} = ANY(${contactIds})`) as any;
  }

  const contactList = await query.limit(1000);

  const docs: Omit<VectorDocument, "embedding">[] = contactList.map(contact => ({
    id: `contact-${contact.id}`,
    type: "contact" as const,
    content: [
      `${contact.firstName} ${contact.lastName}`,
      contact.title || "",
      contact.department || "",
      contact.seniorityLevel || "",
    ].filter(Boolean).join(" | "),
    metadata: {
      contactId: contact.id,
      accountId: contact.accountId,
      name: `${contact.firstName} ${contact.lastName}`,
      title: contact.title,
    },
    createdAt: new Date(),
  }));

  await vectorStore.addDocuments("contacts", docs);
  return docs.length;
}

/**
 * Index call transcripts for pattern learning
 */
export async function indexCallTranscripts(limit: number = 100): Promise<number> {
  const calls = await db
    .select()
    .from(callSessions)
    .where(sql`${callSessions.transcript} IS NOT NULL AND ${callSessions.transcript} != ''`)
    .orderBy(desc(callSessions.createdAt))
    .limit(limit);

  const docs: Omit<VectorDocument, "embedding">[] = calls.map(call => ({
    id: `call-${call.id}`,
    type: "call" as const,
    content: call.transcript || "",
    metadata: {
      callId: call.id,
      campaignId: call.campaignId,
      disposition: call.disposition,
      duration: call.callDuration,
      createdAt: call.createdAt,
    },
    createdAt: new Date(),
  }));

  await vectorStore.addDocuments("calls", docs);
  return docs.length;
}

/**
 * Add knowledge document
 */
export async function addKnowledge(
  id: string,
  content: string,
  metadata: Record<string, any> = {}
): Promise<VectorDocument> {
  return vectorStore.addDocument("knowledge", {
    id: `knowledge-${id}`,
    type: "knowledge",
    content,
    metadata,
    createdAt: new Date(),
  });
}

/**
 * Search for similar accounts
 */
export async function findSimilarAccounts(
  query: string,
  options: { limit?: number; industryFilter?: string } = {}
): Promise<SearchResult[]> {
  return vectorStore.search("accounts", query, {
    limit: options.limit || 10,
    filter: options.industryFilter
      ? doc => doc.metadata.industry === options.industryFilter
      : undefined,
  });
}

/**
 * Search for similar contacts
 */
export async function findSimilarContacts(
  query: string,
  options: { limit?: number; accountId?: string } = {}
): Promise<SearchResult[]> {
  return vectorStore.search("contacts", query, {
    limit: options.limit || 10,
    filter: options.accountId
      ? doc => doc.metadata.accountId === options.accountId
      : undefined,
  });
}

/**
 * Search call transcripts for patterns
 */
export async function searchCallPatterns(
  query: string,
  options: { limit?: number; dispositionFilter?: string } = {}
): Promise<SearchResult[]> {
  return vectorStore.search("calls", query, {
    limit: options.limit || 10,
    filter: options.dispositionFilter
      ? doc => doc.metadata.disposition === options.dispositionFilter
      : undefined,
  });
}

/**
 * Search knowledge base
 */
export async function searchKnowledge(
  query: string,
  options: { limit?: number } = {}
): Promise<SearchResult[]> {
  return vectorStore.search("knowledge", query, {
    limit: options.limit || 10,
  });
}

/**
 * Find successful call patterns for a given scenario
 */
export async function findSuccessPatterns(
  scenario: string,
  limit: number = 5
): Promise<{ pattern: string; score: number; disposition: string }[]> {
  const results = await searchCallPatterns(scenario, {
    limit: limit * 2,
    dispositionFilter: "qualified_lead",
  });

  return results.slice(0, limit).map(r => ({
    pattern: r.document.content.slice(0, 500),
    score: r.score,
    disposition: r.document.metadata.disposition,
  }));
}

/**
 * Get vector store stats
 */
export function getVectorStats(): Record<string, { documentCount: number; dimension: number } | null> {
  return {
    accounts: vectorStore.getIndexStats("accounts"),
    contacts: vectorStore.getIndexStats("contacts"),
    calls: vectorStore.getIndexStats("calls"),
    knowledge: vectorStore.getIndexStats("knowledge"),
  };
}

// ==================== VERTEX AI MATCHING ENGINE INTEGRATION ====================
// Note: For production scale, integrate with Vertex AI Matching Engine

export interface MatchingEngineConfig {
  projectId: string;
  location: string;
  indexEndpoint: string;
  deployedIndexId: string;
}

/**
 * Initialize Vertex AI Matching Engine (production)
 * This is a placeholder for the full Matching Engine integration
 */
export async function initializeMatchingEngine(config: MatchingEngineConfig): Promise<void> {
  console.log(`[VectorSearch] Matching Engine would be initialized with:`, config);
  console.log(`[VectorSearch] Using in-memory store for development. Configure Matching Engine for production.`);
}

export default {
  indexAccounts,
  indexContacts,
  indexCallTranscripts,
  addKnowledge,
  findSimilarAccounts,
  findSimilarContacts,
  searchCallPatterns,
  searchKnowledge,
  findSuccessPatterns,
  getVectorStats,
  initializeMatchingEngine,
};
