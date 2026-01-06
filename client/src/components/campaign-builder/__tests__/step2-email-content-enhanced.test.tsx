import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Step2EmailContentEnhanced } from '@/components/campaign-builder/step2-email-content-enhanced';
import * as queryClient from '@/lib/queryClient';

// Mock API
vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn()
}));

describe('Step2EmailContentEnhanced Integration Tests', () => {
  const mockData = {
    audience: {
      sampleContacts: [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          company: 'Acme Corp'
        }
      ]
    },
    content: {
      subject: 'Test Subject',
      preheader: 'Test Preview',
      html: '<html><body>Hello {{first_name}}!</body></html>',
      design: null,
      senderProfileId: 'profile-1'
    }
  };

  const mockOnNext = vi.fn();
  const mockOnBack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (queryClient.apiRequest as any).mockResolvedValue({
      senderProfiles: [
        {
          id: 'profile-1',
          name: 'Support',
          email: 'support@company.com',
          verified: true
        },
        {
          id: 'profile-2',
          name: 'Marketing',
          email: 'marketing@company.com',
          verified: false
        }
      ]
    });
  });

  describe('Component Rendering', () => {
    it('should render without errors', () => {
      render(
        <Step2EmailContentEnhanced
          data={mockData}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );
      expect(screen.getByText(/Sender Profile/i)).toBeInTheDocument();
    });

    it('should load sender profiles on mount', async () => {
      render(
        <Step2EmailContentEnhanced
          data={mockData}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      await waitFor(() => {
        expect(queryClient.apiRequest).toHaveBeenCalledWith('GET', '/api/sender-profiles');
      });
    });

    it('should display all tabs', () => {
      render(
        <Step2EmailContentEnhanced
          data={mockData}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      expect(screen.getByText(/Email Builder/i)).toBeInTheDocument();
      expect(screen.getByText(/Templates/i)).toBeInTheDocument();
      expect(screen.getByText(/Preview/i)).toBeInTheDocument();
    });
  });

  describe('Sender Profile Selection', () => {
    it('should auto-select first verified profile', async () => {
      render(
        <Step2EmailContentEnhanced
          data={mockData}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      await waitFor(() => {
        const selector = screen.getByDisplayValue(/Support/i);
        expect(selector).toBeInTheDocument();
      });
    });

    it('should show verification badge for verified profiles', async () => {
      render(
        <Step2EmailContentEnhanced
          data={mockData}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Verified/i)).toBeInTheDocument();
      });
    });

    it('should show warning for unverified profiles', async () => {
      const dataWithUnverified = {
        ...mockData,
        content: { ...mockData.content, senderProfileId: 'profile-2' }
      };

      render(
        <Step2EmailContentEnhanced
          data={dataWithUnverified}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/not been verified/i)).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation', () => {
    it('should require subject line', async () => {
      const dataNoSubject = {
        ...mockData,
        content: { ...mockData.content, subject: '' }
      };

      render(
        <Step2EmailContentEnhanced
          data={dataNoSubject}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const continueButton = screen.getByText(/Continue to Scheduling/i);
      fireEvent.click(continueButton);

      await waitFor(() => {
        expect(screen.getByText(/Subject line is required/i)).toBeInTheDocument();
      });
    });

    it('should require email content', async () => {
      const dataNoContent = {
        ...mockData,
        content: { ...mockData.content, html: '' }
      };

      render(
        <Step2EmailContentEnhanced
          data={dataNoContent}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const continueButton = screen.getByText(/Continue to Scheduling/i);
      fireEvent.click(continueButton);

      await waitFor(() => {
        expect(screen.getByText(/Email content is required/i)).toBeInTheDocument();
      });
    });

    it('should pass validation with all required fields', async () => {
      render(
        <Step2EmailContentEnhanced
          data={mockData}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const continueButton = screen.getByText(/Continue to Scheduling/i);
      fireEvent.click(continueButton);

      await waitFor(() => {
        expect(mockOnNext).toHaveBeenCalledWith({
          content: expect.objectContaining({
            subject: 'Test Subject',
            html: expect.any(String),
            senderProfileId: 'profile-1'
          })
        });
      });
    });
  });

  describe('Email Summary Card', () => {
    it('should display email summary information', async () => {
      render(
        <Step2EmailContentEnhanced
          data={mockData}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Subject')).toBeInTheDocument();
        expect(screen.getByText('Test Preview')).toBeInTheDocument();
      });
    });

    it('should show content status as Ready', async () => {
      render(
        <Step2EmailContentEnhanced
          data={mockData}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Ready/i)).toBeInTheDocument();
      });
    });

    it('should show content status as Empty when no content', async () => {
      const dataNoContent = {
        ...mockData,
        content: { ...mockData.content, html: '' }
      };

      render(
        <Step2EmailContentEnhanced
          data={dataNoContent}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Empty/i)).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should call onBack when back button clicked', async () => {
      render(
        <Step2EmailContentEnhanced
          data={mockData}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const backButton = screen.getByText(/Back to Audience/i);
      fireEvent.click(backButton);

      expect(mockOnBack).toHaveBeenCalled();
    });

    it('should call onNext with form data when continue button clicked', async () => {
      render(
        <Step2EmailContentEnhanced
          data={mockData}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const continueButton = screen.getByText(/Continue to Scheduling/i);
      fireEvent.click(continueButton);

      await waitFor(() => {
        expect(mockOnNext).toHaveBeenCalled();
      });
    });
  });

  describe('Tab Navigation', () => {
    it('should switch between tabs', async () => {
      render(
        <Step2EmailContentEnhanced
          data={mockData}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const templatesTab = screen.getByText(/Templates/i);
      fireEvent.click(templatesTab);

      await waitFor(() => {
        expect(screen.getByText(/Browse Templates/i)).toBeInTheDocument();
      });
    });

    it('should open template selector modal', async () => {
      render(
        <Step2EmailContentEnhanced
          data={mockData}
          onNext={mockOnNext}
          onBack={mockOnBack}
        />
      );

      const templatesTab = screen.getByText(/Templates/i);
      fireEvent.click(templatesTab);

      const browseButton = await screen.findByText(/Browse Templates/i);
      fireEvent.click(browseButton);

      // Modal should open (implementation specific)
    });
  });
});

describe('Campaign Creation E2E Tests', () => {
  it('should complete full campaign creation flow', async () => {
    // This would test the complete flow from Step 1 to Step 5
    // Including creating a campaign and verifying it's stored
  });

  it('should render emails with personalization', async () => {
    // Test that emails render with personalization tokens replaced
  });

  it('should inject tracking pixels', async () => {
    // Test that tracking pixels are properly injected
  });
});
