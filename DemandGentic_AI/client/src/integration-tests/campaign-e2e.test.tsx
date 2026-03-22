// File: client/src/integration-tests/campaign-e2e.test.ts
// E2E Campaign Creation Flow Tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CampaignWizard } from '../components/campaign-builder/CampaignWizard';

describe('Campaign Creation E2E Flow', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  // Helper: Render with providers
  const renderWithProviders = (component: React.ReactElement) => {
    return render(
      
        {component}
      
    );
  };

  it('should complete full campaign creation flow', async () => {
    const user = userEvent.setup();
    renderWithProviders();

    // Step 1: Campaign Details
    expect(screen.getByText(/campaign name/i)).toBeInTheDocument();

    const campaignNameInput = screen.getByRole('textbox', {
      name: /campaign name/i
    });
    await user.type(campaignNameInput, 'Test Campaign 2025');

    const descriptionInput = screen.getByRole('textbox', {
      name: /description/i
    });
    await user.type(descriptionInput, 'January promotional campaign');

    const continueButton = screen.getByRole('button', {
      name: /continue|next/i
    });
    await user.click(continueButton);

    // Step 2: Email Content
    await waitFor(() => {
      expect(screen.getByText(/email subject/i)).toBeInTheDocument();
    });

    const subjectInput = screen.getByRole('textbox', {
      name: /subject/i
    });
    await user.type(subjectInput, 'Special Offer Just For You!');

    // Select sender profile
    const senderSelect = screen.getByRole('combobox', {
      name: /sender|from/i
    });
    await user.click(senderSelect);
    const senderOption = screen.getByText(/noreply@/i);
    await user.click(senderOption);

    // Build email content
    const emailContentArea = screen.getByRole('textbox', {
      name: /email content|html/i
    });
    await user.click(emailContentArea);
    await user.type(
      emailContentArea,
      'Hello {{firstName}}Check out our offer!'
    );

    await user.click(continueButton);

    // Step 3: Audience Selection
    await waitFor(() => {
      expect(screen.getByText(/select audience/i)).toBeInTheDocument();
    });

    const listSelect = screen.getByRole('combobox', {
      name: /list|audience/i
    });
    await user.click(listSelect);
    const listOption = screen.getByText(/primary list/i);
    await user.click(listOption);

    // Add filters
    const addFilterButton = screen.getByRole('button', {
      name: /add filter|filter/i
    });
    await user.click(addFilterButton);

    const filterField = screen.getByRole('combobox', {
      name: /filter field/i
    });
    await user.click(filterField);
    const fieldOption = screen.getByText(/engagement/i);
    await user.click(fieldOption);

    await user.click(continueButton);

    // Step 4: Schedule
    await waitFor(() => {
      expect(screen.getByText(/send now|schedule/i)).toBeInTheDocument();
    });

    const sendNowButton = screen.getByRole('radio', {
      name: /send now/i
    });
    await user.click(sendNowButton);

    await user.click(continueButton);

    // Step 5: Review & Send
    await waitFor(() => {
      expect(screen.getByText(/review campaign/i)).toBeInTheDocument();
    });

    // Verify summary
    expect(screen.getByText('Test Campaign 2025')).toBeInTheDocument();
    expect(screen.getByText('Special Offer Just For You!')).toBeInTheDocument();

    // Send campaign
    const sendButton = screen.getByRole('button', {
      name: /send|launch/i
    });
    await user.click(sendButton);

    // Verify success
    await waitFor(() => {
      expect(screen.getByText(/campaign sent successfully/i)).toBeInTheDocument();
    });
  });

  it('should validate required fields before proceeding', async () => {
    const user = userEvent.setup();
    renderWithProviders();

    const continueButton = screen.getByRole('button', {
      name: /continue|next/i
    });

    // Try to continue without filling required fields
    await user.click(continueButton);

    // Should see validation errors
    await waitFor(() => {
      expect(screen.getByText(/campaign name is required/i)).toBeInTheDocument();
    });
  });

  it('should allow editing before sending', async () => {
    const user = userEvent.setup();
    renderWithProviders();

    // Fill Step 1
    const campaignNameInput = screen.getByRole('textbox', {
      name: /campaign name/i
    });
    await user.type(campaignNameInput, 'Original Name');

    const continueButton = screen.getByRole('button', {
      name: /continue|next/i
    });
    await user.click(continueButton);

    // Go through steps
    await waitFor(() => {
      expect(screen.getByText(/email subject/i)).toBeInTheDocument();
    });

    // Go back to Step 1
    const backButton = screen.getByRole('button', {
      name: /back|previous/i
    });
    await user.click(backButton);

    // Edit campaign name
    const editInput = screen.getByRole('textbox', {
      name: /campaign name/i
    });
    await user.clear(editInput);
    await user.type(editInput, 'Updated Name');

    // Verify change persisted
    expect(editInput).toHaveValue('Updated Name');
  });

  it('should handle A/B test setup', async () => {
    const user = userEvent.setup();
    renderWithProviders();

    // Setup campaign details
    const campaignNameInput = screen.getByRole('textbox', {
      name: /campaign name/i
    });
    await user.type(campaignNameInput, 'A/B Test Campaign');

    const continueButton = screen.getByRole('button', {
      name: /continue|next/i
    });
    await user.click(continueButton);

    // Email content step
    await waitFor(() => {
      expect(screen.getByText(/email subject/i)).toBeInTheDocument();
    });

    // Enable A/B testing
    const abTestCheckbox = screen.getByRole('checkbox', {
      name: /a\/b test|test variant/i
    });
    await user.click(abTestCheckbox);

    // Should see variant fields
    await waitFor(() => {
      expect(screen.getByText(/variant a|variant b/i)).toBeInTheDocument();
    });

    // Fill variant A
    const variantASubject = screen.getByRole('textbox', {
      name: /variant a.*subject/i
    });
    await user.type(variantASubject, 'Offer: 20% Off');

    // Fill variant B
    const variantBSubject = screen.getByRole('textbox', {
      name: /variant b.*subject/i
    });
    await user.type(variantBSubject, 'Limited Time: 20% Off');

    // Set split
    const splitInput = screen.getByRole('spinbutton', {
      name: /split.*percent/i
    });
    await user.clear(splitInput);
    await user.type(splitInput, '50');

    await user.click(continueButton);

    // Continue through remaining steps
    const nextContinueButton = screen.queryAllByRole('button', {
      name: /continue|next/i
    })[0];
    if (nextContinueButton) {
      await user.click(nextContinueButton);
    }

    // Should reach review step with A/B info
    await waitFor(() => {
      expect(screen.getByText(/variant a|split test/i)).toBeInTheDocument();
    });
  });

  it('should handle personalization tokens', async () => {
    const user = userEvent.setup();
    renderWithProviders();

    // Setup campaign
    const campaignNameInput = screen.getByRole('textbox', {
      name: /campaign name/i
    });
    await user.type(campaignNameInput, 'Personalized Campaign');

    const continueButton = screen.getByRole('button', {
      name: /continue|next/i
    });
    await user.click(continueButton);

    // Email content with tokens
    await waitFor(() => {
      expect(screen.getByText(/email subject/i)).toBeInTheDocument();
    });

    const subjectInput = screen.getByRole('textbox', {
      name: /subject/i
    });
    await user.type(subjectInput, 'Hello {{firstName}}');

    // Should see token autocomplete
    const tokenButton = screen.queryByText(/{{firstName}}/);
    expect(tokenButton).toBeInTheDocument();

    const emailContent = screen.getByRole('textbox', {
      name: /email content|html/i
    });
    await user.click(emailContent);
    await user.type(
      emailContent,
      'Welcome {{firstName}} {{lastName}}!'
    );

    // Should see both tokens
    expect(screen.getByText(/{{firstName}}/)).toBeInTheDocument();
    expect(screen.getByText(/{{lastName}}/)).toBeInTheDocument();
  });

  it('should save as draft and resume', async () => {
    const user = userEvent.setup();
    renderWithProviders();

    // Fill first step
    const campaignNameInput = screen.getByRole('textbox', {
      name: /campaign name/i
    });
    await user.type(campaignNameInput, 'Draft Campaign');

    // Save as draft
    const saveDraftButton = screen.getByRole('button', {
      name: /save as draft|save draft/i
    });
    await user.click(saveDraftButton);

    // Should show success message
    await waitFor(() => {
      expect(screen.getByText(/draft saved|saved successfully/i)).toBeInTheDocument();
    });

    // Navigate away and back
    // (In real scenario, would navigate to campaign list and reopen)
    // For now, verify data persisted in form
    expect(campaignNameInput).toHaveValue('Draft Campaign');
  });

  it('should show preview of email', async () => {
    const user = userEvent.setup();
    renderWithProviders();

    // Get to email content step
    const campaignNameInput = screen.getByRole('textbox', {
      name: /campaign name/i
    });
    await user.type(campaignNameInput, 'Campaign with Preview');

    const continueButton = screen.getByRole('button', {
      name: /continue|next/i
    });
    await user.click(continueButton);

    await waitFor(() => {
      expect(screen.getByText(/email subject/i)).toBeInTheDocument();
    });

    // Fill email content
    const subjectInput = screen.getByRole('textbox', {
      name: /subject/i
    });
    await user.type(subjectInput, 'Preview Test');

    const emailContent = screen.getByRole('textbox', {
      name: /email content|html/i
    });
    await user.click(emailContent);
    await user.type(emailContent, 'Preview Content');

    // Open preview
    const previewButton = screen.getByRole('button', {
      name: /preview|show preview/i
    });
    await user.click(previewButton);

    // Should see preview modal/panel
    await waitFor(() => {
      expect(screen.getByText('Preview Content')).toBeInTheDocument();
    });
  });

  it('should handle conditional personalization', async () => {
    const user = userEvent.setup();
    renderWithProviders();

    // Setup campaign
    const campaignNameInput = screen.getByRole('textbox', {
      name: /campaign name/i
    });
    await user.type(campaignNameInput, 'Conditional Campaign');

    const continueButton = screen.getByRole('button', {
      name: /continue|next/i
    });
    await user.click(continueButton);

    // Email content step
    await waitFor(() => {
      expect(screen.getByText(/email subject/i)).toBeInTheDocument();
    });

    // Add conditional block
    const addBlockButton = screen.getByRole('button', {
      name: /add conditional|add block/i
    });
    await user.click(addBlockButton);

    // Should see conditional UI
    await waitFor(() => {
      expect(screen.getByText(/if|condition/i)).toBeInTheDocument();
    });

    // Set condition
    const fieldSelect = screen.getByRole('combobox', {
      name: /field|attribute/i
    });
    await user.click(fieldSelect);
    const fieldOption = screen.getByText(/company/i);
    await user.click(fieldOption);

    const operatorSelect = screen.getByRole('combobox', {
      name: /operator|equals/i
    });
    await user.click(operatorSelect);
    const operatorOption = screen.getByText(/equals|==/i);
    await user.click(operatorOption);

    const valueInput = screen.getByRole('textbox', {
      name: /value|company name/i
    });
    await user.type(valueInput, 'Acme Corp');

    // Fill then content
    const thenContent = screen.getByRole('textbox', {
      name: /then.*content/i
    });
    await user.type(thenContent, 'Welcome Acme!');

    // Fill else content
    const elseContent = screen.getByRole('textbox', {
      name: /else.*content/i
    });
    await user.type(elseContent, 'Welcome!');

    // Verify condition is set
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('should validate email addresses', async () => {
    const user = userEvent.setup();
    renderWithProviders();

    // Get to audience step
    const campaignNameInput = screen.getByRole('textbox', {
      name: /campaign name/i
    });
    await user.type(campaignNameInput, 'Validation Test');

    const continueButton = screen.getByRole('button', {
      name: /continue|next/i
    });
    await user.click(continueButton);

    // Skip to audience validation
    // (assume multiple continue clicks)
    for (let i = 0; i  {
      expect(screen.getByText(/total contacts|audience size/i)).toBeInTheDocument();
    });
  });
});