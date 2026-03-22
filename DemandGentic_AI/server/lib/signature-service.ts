import { db } from '../db';
import { emailSignatures } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';

export interface EmailSignature {
  id: string;
  userId: string;
  name: string;
  signatureHtml: string;
  signaturePlain?: string | null;
  isDefault: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSignatureInput {
  name: string;
  signatureHtml: string;
  signaturePlain?: string;
  isDefault?: boolean;
}

export interface UpdateSignatureInput {
  name?: string;
  signatureHtml?: string;
  signaturePlain?: string;
  isDefault?: boolean;
  active?: boolean;
}

export class SignatureService {
  async createSignature(userId: string, input: CreateSignatureInput): Promise {
    if (input.isDefault) {
      await db
        .update(emailSignatures)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(emailSignatures.userId, userId));
    }

    const [signature] = await db
      .insert(emailSignatures)
      .values({
        userId,
        name: input.name,
        signatureHtml: input.signatureHtml,
        signaturePlain: input.signaturePlain || null,
        isDefault: input.isDefault || false,
        active: true,
      })
      .returning();

    return signature;
  }

  async getUserSignatures(userId: string): Promise {
    const signatures = await db
      .select()
      .from(emailSignatures)
      .where(and(
        eq(emailSignatures.userId, userId),
        eq(emailSignatures.active, true)
      ))
      .orderBy(desc(emailSignatures.isDefault), desc(emailSignatures.createdAt));

    return signatures;
  }

  async getSignatureById(userId: string, signatureId: string): Promise {
    const [signature] = await db
      .select()
      .from(emailSignatures)
      .where(and(
        eq(emailSignatures.id, signatureId),
        eq(emailSignatures.userId, userId)
      ));

    return signature || null;
  }

  async getDefaultSignature(userId: string): Promise {
    const [signature] = await db
      .select()
      .from(emailSignatures)
      .where(and(
        eq(emailSignatures.userId, userId),
        eq(emailSignatures.isDefault, true),
        eq(emailSignatures.active, true)
      ));

    return signature || null;
  }

  async updateSignature(
    userId: string,
    signatureId: string,
    input: UpdateSignatureInput
  ): Promise {
    if (input.isDefault) {
      await db
        .update(emailSignatures)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(emailSignatures.userId, userId));
    }

    const [signature] = await db
      .update(emailSignatures)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(and(
        eq(emailSignatures.id, signatureId),
        eq(emailSignatures.userId, userId)
      ))
      .returning();

    return signature || null;
  }

  async deleteSignature(userId: string, signatureId: string): Promise {
    const [signature] = await db
      .update(emailSignatures)
      .set({ active: false, updatedAt: new Date() })
      .where(and(
        eq(emailSignatures.id, signatureId),
        eq(emailSignatures.userId, userId)
      ))
      .returning();

    return !!signature;
  }

  async setDefaultSignature(userId: string, signatureId: string): Promise {
    await db
      .update(emailSignatures)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(emailSignatures.userId, userId));

    const [signature] = await db
      .update(emailSignatures)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(
        eq(emailSignatures.id, signatureId),
        eq(emailSignatures.userId, userId),
        eq(emailSignatures.active, true)
      ))
      .returning();

    return signature || null;
  }
}

export const signatureService = new SignatureService();