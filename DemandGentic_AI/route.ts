import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// PATCH /api/prompts/:id/activate
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  try {
    const promptToActivate = await prisma.systemPrompt.findUnique({
      where: { id },
    });

    if (!promptToActivate) {
      return NextResponse.json({ error: 'Prompt not found.' }, { status: 404 });
    }

    // Use a transaction to ensure atomicity
    const [, updatedPrompt] = await prisma.$transaction([
      // 1. Deactivate all other prompts for this agent
      prisma.systemPrompt.updateMany({
        where: {
          agentName: promptToActivate.agentName,
          NOT: { id: id },
        },
        data: { isActive: false },
      }),
      // 2. Activate the selected prompt
      prisma.systemPrompt.update({
        where: { id: id },
        data: { isActive: true },
      }),
    ]);

    return NextResponse.json(updatedPrompt);
  } catch (error) {
    console.error(`[API_ERROR] /api/prompts/${id}/activate:`, error);
    return NextResponse.json({ error: 'Failed to activate prompt.' }, { status: 500 });
  }
}