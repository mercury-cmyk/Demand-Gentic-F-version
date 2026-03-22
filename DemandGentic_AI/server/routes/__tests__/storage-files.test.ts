/**
 * Storage Files API Tests
 * Tests for presigned URL generation and file upload workflow
 * 
 * Covers:
 * - Approved folder validation (including campaign-orders paths)
 * - Presigned URL generation success/failure
 * - Invalid folder rejection
 * - Content type validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import storageFilesRouter from '../storage-files';

// Mock storage lib
vi.mock('../../lib/storage', () => ({
  isS3Configured: vi.fn(() => true),
  generateStorageKey: vi.fn((folder: string, filename: string) => `${folder}/${Date.now()}-${filename}`),
  getPresignedUploadUrl: vi.fn(() => Promise.resolve('https://storage.example.com/presigned-url')),
  getPresignedDownloadUrl: vi.fn(() => Promise.resolve('https://storage.example.com/download-url')),
}));

import { isS3Configured, generateStorageKey, getPresignedUploadUrl } from '../../lib/storage';

describe('Storage Files API - /api/s3/upload-url', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(storageFilesRouter);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Approved Folder Validation', () => {
    it('should accept "uploads" folder', async () => {
      const response = await request(app)
        .post('/api/s3/upload-url')
        .send({
          filename: 'test.csv',
          contentType: 'text/csv',
          folder: 'uploads',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.uploadUrl).toBeDefined();
      expect(response.body.key).toBeDefined();
    });

    it('should accept "campaign-orders" folder', async () => {
      const response = await request(app)
        .post('/api/s3/upload-url')
        .send({
          filename: 'brief.pdf',
          contentType: 'application/pdf',
          folder: 'campaign-orders',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.uploadUrl).toBeDefined();
    });

    it('should accept "campaign-orders/target_accounts" folder', async () => {
      const response = await request(app)
        .post('/api/s3/upload-url')
        .send({
          filename: 'accounts.csv',
          contentType: 'text/csv',
          folder: 'campaign-orders/target_accounts',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should accept "campaign-orders/suppression" folder', async () => {
      const response = await request(app)
        .post('/api/s3/upload-url')
        .send({
          filename: 'dnc-list.csv',
          contentType: 'text/csv',
          folder: 'campaign-orders/suppression',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should accept "campaign-orders/template" folder', async () => {
      const response = await request(app)
        .post('/api/s3/upload-url')
        .send({
          filename: 'email-template.html',
          contentType: 'text/html',
          folder: 'campaign-orders/template',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject unapproved folder paths', async () => {
      const response = await request(app)
        .post('/api/s3/upload-url')
        .send({
          filename: 'test.csv',
          contentType: 'text/csv',
          folder: 'malicious-folder',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });

    it('should reject path traversal attempts', async () => {
      const response = await request(app)
        .post('/api/s3/upload-url')
        .send({
          filename: 'test.csv',
          contentType: 'text/csv',
          folder: '../../../etc',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });
  });

  describe('Required Fields Validation', () => {
    it('should require filename', async () => {
      const response = await request(app)
        .post('/api/s3/upload-url')
        .send({
          contentType: 'text/csv',
          folder: 'uploads',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid request');
    });

    it('should use default folder when not specified', async () => {
      const response = await request(app)
        .post('/api/s3/upload-url')
        .send({
          filename: 'test.csv',
          contentType: 'text/csv',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('S3/GCS Configuration', () => {
    it('should return 503 when storage is not configured', async () => {
      vi.mocked(isS3Configured).mockReturnValueOnce(false);

      const response = await request(app)
        .post('/api/s3/upload-url')
        .send({
          filename: 'test.csv',
          contentType: 'text/csv',
          folder: 'uploads',
        });

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('S3 storage not configured');
    });

    it('should handle presigned URL generation errors', async () => {
      vi.mocked(getPresignedUploadUrl).mockRejectedValueOnce(new Error('GCS signing error'));

      const response = await request(app)
        .post('/api/s3/upload-url')
        .send({
          filename: 'test.csv',
          contentType: 'text/csv',
          folder: 'uploads',
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to generate upload URL');
    });
  });

  describe('Response Structure', () => {
    it('should return correct response shape on success', async () => {
      const response = await request(app)
        .post('/api/s3/upload-url')
        .send({
          filename: 'test.csv',
          contentType: 'text/csv',
          folder: 'uploads',
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        key: expect.any(String),
        uploadUrl: expect.any(String),
        contentType: 'text/csv',
        expiresIn: 900,
      });
    });
  });
});

describe('Storage Files API - /api/s3/download-url', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(storageFilesRouter);
    vi.clearAllMocks();
  });

  it('should generate download URL for valid key', async () => {
    const response = await request(app)
      .post('/api/s3/download-url')
      .send({
        key: 'uploads/1234567890-test.csv',
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.downloadUrl).toBeDefined();
  });

  it('should require key parameter', async () => {
    const response = await request(app)
      .post('/api/s3/download-url')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid request');
  });
});

describe('Storage Files API - /api/s3/status', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(storageFilesRouter);
    vi.clearAllMocks();
  });

  it('should return storage configuration status', async () => {
    const response = await request(app).get('/api/s3/status');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('configured');
    expect(response.body).toHaveProperty('provider');
  });
});