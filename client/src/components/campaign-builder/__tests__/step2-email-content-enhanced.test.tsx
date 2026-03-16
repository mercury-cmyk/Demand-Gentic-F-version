import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Step2EmailContentEnhanced } from "@/components/campaign-builder/step2-email-content-enhanced";
import * as queryClient from "@/lib/queryClient";

const toast = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

vi.mock("@/components/email-builder", () => ({
  EmailBuilderPro: ({
    initialSubject,
    initialPreheader,
    onDraftChange,
    onSave,
  }: {
    initialSubject?: string;
    initialPreheader?: string;
    onDraftChange?: (draft: { subject: string; preheader: string; htmlContent: string }) => void;
    onSave?: (draft: { subject: string; preheader: string; htmlContent: string }) => void;
  }) => (
    <div data-testid="mock-email-builder">
      <div data-testid="mock-builder-subject">{initialSubject}</div>
      <div data-testid="mock-builder-preheader">{initialPreheader}</div>
      <button
        type="button"
        onClick={() =>
          onDraftChange?.({
            subject: "Live synced subject",
            preheader: "Live synced preheader",
            htmlContent: "<p>Live synced body</p>",
          })
        }
      >
        Emit Draft Change
      </button>
      <button
        type="button"
        onClick={() =>
          onSave?.({
            subject: "Saved subject",
            preheader: "Saved preheader",
            htmlContent: "<p>Saved body</p>",
          })
        }
      >
        Emit Builder Save
      </button>
    </div>
  ),
  TemplateSelectorModal: ({
    open,
    onSelectTemplate,
  }: {
    open: boolean;
    onSelectTemplate: (template: { id: string; name: string; subject: string; htmlContent: string }) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onSelectTemplate({
            id: "template-1",
            name: "Template One",
            subject: "Template subject",
            htmlContent: "<p>Template body</p>",
          })
        }
      >
        Use Mock Template
      </button>
    ) : null,
}));

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  };
}

describe("Step2EmailContentEnhanced", () => {
  const mockApiRequest = vi.mocked(queryClient.apiRequest);
  const mockOnNext = vi.fn();
  const mockOnBack = vi.fn();

  const baseData = {
    name: "Q2 Expansion Push",
    organizationId: "org-1",
    clientAccountId: "client-1",
    projectId: "project-1",
    audience: {
      estimatedCount: 428,
      sampleContacts: [
        {
          id: "1",
          firstName: "John",
          lastName: "Doe",
          company: "Acme Corp",
          email: "john@acme.com",
        },
      ],
    },
    content: {
      subject: "Initial subject",
      preheader: "Initial preview",
      html: "<p>Existing draft body</p>",
      senderProfileId: "profile-1",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === "GET" && url === "/api/sender-profiles") {
        return jsonResponse([
          {
            id: "profile-1",
            name: "Support",
            email: "support@company.com",
            isVerified: true,
          },
          {
            id: "profile-2",
            name: "Marketing",
            email: "marketing@company.com",
            isVerified: false,
          },
        ]);
      }

      if (method === "GET" && url === "/api/client-portal/admin/clients") {
        return jsonResponse([{ id: "client-1", name: "Acme Corp" }]);
      }

      if (method === "GET" && url === "/api/client-portal/admin/clients/client-1") {
        return jsonResponse({
          projects: [
            {
              id: "project-1",
              name: "Q2 Expansion",
              description: "Grow qualified pipeline with a focused outbound motion.",
            },
          ],
        });
      }

      if (method === "POST" && url === "/api/ai/generate-email") {
        return jsonResponse({
          usedAi: true,
          subject: "New AI Subject",
          body: "<p>AI generated body</p>",
          rawContent: {
            preheader: "AI preview text",
          },
        });
      }

      if (method === "POST" && url === "/api/ai/suggest-subject") {
        return jsonResponse({ subject: "Suggested subject line" });
      }

      if (method === "POST" && url === "/api/campaigns/send-test") {
        return jsonResponse({ success: true });
      }

      throw new Error(`Unhandled request: ${method} ${url}`);
    });
  });

  it("loads sender profiles and renders the guided content step", async () => {
    render(<Step2EmailContentEnhanced data={baseData} onNext={mockOnNext} onBack={mockOnBack} />);

    expect(screen.getByText(/AI Draft Studio/i)).toBeInTheDocument();
    expect(screen.getByText(/Message Studio/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith("GET", "/api/sender-profiles");
    });

    expect(screen.getByText(/Support <support@company.com>/i)).toBeInTheDocument();
    expect(screen.getByText(/Acme Corp/i)).toBeInTheDocument();
  });

  it("applies the AI draft to the live message snapshot", async () => {
    const user = userEvent.setup();
    render(<Step2EmailContentEnhanced data={baseData} onNext={mockOnNext} onBack={mockOnBack} />);

    await user.click(screen.getByRole("button", { name: /Generate AI Draft/i }));

    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        "POST",
        "/api/ai/generate-email",
        expect.objectContaining({
          campaignName: "Q2 Expansion Push",
          clientName: "Acme Corp",
          projectName: "Q2 Expansion",
        }),
      );
    });

    expect(screen.getByText("New AI Subject")).toBeInTheDocument();
    expect(screen.getByText("AI preview text")).toBeInTheDocument();
    expect(screen.getByText(/AI drafted the current message/i)).toBeInTheDocument();
  });

  it("uses the live builder draft when continuing without a separate builder save", async () => {
    const user = userEvent.setup();
    render(<Step2EmailContentEnhanced data={baseData} onNext={mockOnNext} onBack={mockOnBack} />);

    await user.click(screen.getByRole("button", { name: /Emit Draft Change/i }));
    await user.click(screen.getByRole("button", { name: /Continue to Scheduling/i }));

    await waitFor(() => {
      expect(mockOnNext).toHaveBeenCalledWith({
        content: expect.objectContaining({
          subject: "Live synced subject",
          preheader: "Live synced preheader",
          html: "<p>Live synced body</p>",
          senderProfileId: "profile-1",
        }),
      });
    });
  });

  it("validates missing subject and content before continuing", async () => {
    const user = userEvent.setup();
    render(
      <Step2EmailContentEnhanced
        data={{
          ...baseData,
          content: {
            subject: "",
            preheader: "",
            html: "",
            senderProfileId: "profile-1",
          },
        }}
        onNext={mockOnNext}
        onBack={mockOnBack}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Continue to Scheduling/i }));

    expect(await screen.findByText(/Subject line is required/i)).toBeInTheDocument();
    expect(screen.getByText(/Email content is required/i)).toBeInTheDocument();
    expect(mockOnNext).not.toHaveBeenCalled();
  });

  it("loads the selected template into the draft", async () => {
    const user = userEvent.setup();
    render(<Step2EmailContentEnhanced data={baseData} onNext={mockOnNext} onBack={mockOnBack} />);

    await user.click(screen.getByRole("button", { name: /Load Template/i }));
    await user.click(screen.getByRole("button", { name: /Use Mock Template/i }));

    expect(screen.getByText("Template subject")).toBeInTheDocument();
  });
});
