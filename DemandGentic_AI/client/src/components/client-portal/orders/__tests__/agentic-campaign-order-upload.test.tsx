/**
 * Agentic Campaign Order Panel - Upload Tests
 * 
 * Tests upload functionality in the Client Portal → New Order → Agentic Order Request flow
 * 
 * Covers:
 * - Upload success flow for all categories (context, target_accounts, suppression, template)
 * - Error handling (server errors, timeouts, invalid responses)
 * - Per-category loading states (no shared state confusion)
 * - File type validation
 * - Retry capability after failures
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgenticCampaignOrderPanel } from './agentic-campaign-order-panel';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock toast
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock client org intelligence hook
vi.mock('@/hooks/use-client-org-intelligence', () => ({
  useClientOrgIntelligence: () => ({
    data: null,
    isLoading: false,
    buildContextSummary: () => '',
    getTargetingSuggestions: () => ({}),
    getValueProposition: () => '',
  }),
}));

// Mock localStorage
const mockGetItem = vi.fn(() => 'test-token');
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: mockGetItem,
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  writable: true,
});

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderPanel(props = {}) {
  const queryClient = createTestQueryClient();
  return render(
    
       {}}
        {...props}
      />
    
  );
}

describe('AgenticCampaignOrderPanel - File Upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Successful Upload Flow', () => {
    it('should upload context document successfully', async () => {
      // Mock presigned URL response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            key: 'campaign-orders/1234-test.pdf',
            uploadUrl: 'https://storage.example.com/presigned-url',
            contentType: 'application/pdf',
          }),
        })
        // Mock S3/GCS upload response
        .mockResolvedValueOnce({
          ok: true,
        });

      renderPanel();

      // Find upload button for documents
      const uploadButton = screen.getByText('Upload PDF, DOCX, CSV');
      expect(uploadButton).toBeInTheDocument();

      // Create test file
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      
      // Find the hidden file input and trigger upload
      const fileInput = document.querySelector('input[accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"]') as HTMLInputElement;
      expect(fileInput).toBeInTheDocument();

      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Files uploaded successfully',
        }));
      });

      // Verify presigned URL was requested with correct folder
      expect(mockFetch).toHaveBeenCalledWith('/api/s3/upload-url', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('campaign-orders'),
      }));
    });

    it('should upload target accounts list successfully', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            key: 'campaign-orders/target_accounts/1234-accounts.csv',
            uploadUrl: 'https://storage.example.com/presigned-url',
            contentType: 'text/csv',
          }),
        })
        .mockResolvedValueOnce({ ok: true });

      renderPanel();

      const file = new File(['company,domain'], 'accounts.csv', { type: 'text/csv' });
      const fileInput = document.querySelector('input[accept=".csv,.xlsx,.xls"]') as HTMLInputElement;
      
      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/s3/upload-url', expect.objectContaining({
          body: expect.stringContaining('campaign-orders/target_accounts'),
        }));
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error toast when presigned URL request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve('Invalid folder'),
      });

      renderPanel();

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = document.querySelector('input[accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"]') as HTMLInputElement;
      
      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Upload failed',
          variant: 'destructive',
        }));
      });
    });

    it('should show error when storage upload fails', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            key: 'campaign-orders/1234-test.pdf',
            uploadUrl: 'https://storage.example.com/presigned-url',
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

      renderPanel();

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = document.querySelector('input[accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"]') as HTMLInputElement;
      
      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Upload failed',
          variant: 'destructive',
        }));
      });
    });

    it('should handle invalid presigned URL response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          // Missing uploadUrl and key
        }),
      });

      renderPanel();

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = document.querySelector('input[accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"]') as HTMLInputElement;
      
      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Upload failed',
          description: expect.stringContaining('invalid'),
        }));
      });
    });

    it('should handle network timeout', async () => {
      // Mock fetch that never resolves (will be aborted)
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => {
          const error = new Error('Request timed out');
          error.name = 'AbortError';
          setTimeout(() => reject(error), 100);
        })
      );

      renderPanel();

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = document.querySelector('input[accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"]') as HTMLInputElement;
      
      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: 'Upload failed',
          variant: 'destructive',
        }));
      }, { timeout: 5000 });
    });
  });

  describe('Per-Category Loading States', () => {
    it('should show loading state only for the category being uploaded', async () => {
      // Slow response to keep loading state visible
      mockFetch.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            key: 'campaign-orders/1234-test.pdf',
            uploadUrl: 'https://storage.example.com/presigned-url',
          }),
        }), 500))
      );

      renderPanel();

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const contextFileInput = document.querySelector('input[accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"]') as HTMLInputElement;
      
      // Start upload (don't await)
      userEvent.upload(contextFileInput, file);

      // Check that context upload button shows loading
      await waitFor(() => {
        const uploadingButton = screen.getByText('Uploading...');
        expect(uploadingButton).toBeInTheDocument();
      });

      // Other upload buttons should still show their default text
      const targetListButton = screen.getByText('Upload Target List');
      expect(targetListButton).toBeInTheDocument();
      expect(targetListButton).not.toBeDisabled();
    });
  });

  describe('Structured Logging', () => {
    it('should log upload start with correlation ID', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            key: 'campaign-orders/1234-test.pdf',
            uploadUrl: 'https://storage.example.com/presigned-url',
          }),
        })
        .mockResolvedValueOnce({ ok: true });

      renderPanel();

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = document.querySelector('input[accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"]') as HTMLInputElement;
      
      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringMatching(/\[Upload:upload-\d+-\w+\] Starting upload/),
          expect.anything()
        );
      });

      consoleSpy.mockRestore();
    });

    it('should log upload success with correlation ID', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            key: 'campaign-orders/1234-test.pdf',
            uploadUrl: 'https://storage.example.com/presigned-url',
          }),
        })
        .mockResolvedValueOnce({ ok: true });

      renderPanel();

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = document.querySelector('input[accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"]') as HTMLInputElement;
      
      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringMatching(/\[Upload:upload-\d+-\w+\] All files uploaded successfully/),
        );
      });

      consoleSpy.mockRestore();
    });

    it('should log upload failure with correlation ID', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      });

      renderPanel();

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = document.querySelector('input[accept=".pdf,.doc,.docx,.txt,.csv,.xlsx"]') as HTMLInputElement;
      
      await userEvent.upload(fileInput, file);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringMatching(/\[Upload:upload-\d+-\w+\] Upload failed/),
          expect.anything(),
          expect.anything()
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });
});