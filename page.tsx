import PromptHistoryClient from '@/components/prompts/PromptHistoryClient';
import { PrismaClient } from '@prisma/client';
import Link from 'next/link';

const prisma = new PrismaClient();

async function getInitialPrompts(agentName: string) {
  const prompts = await prisma.systemPrompt.findMany({
    where: { agentName },
    orderBy: { version: 'desc' },
  });
  return prompts;
}

export default async function PromptHistoryPage({ params }: { params: { agentName: string } }) {
  const { agentName } = params;
  const initialPrompts = await getInitialPrompts(agentName);

  return (
    <div className="container mx-auto p-4 md:p-8">
      <Link href="/prompts" className="text-blue-600 hover:underline mb-4 block">&larr; Back to All Agents</Link>
      <h1 className="text-3xl font-bold mb-6">Prompt History for <span className="text-blue-600">{decodeURIComponent(agentName)}</span></h1>
      <PromptHistoryClient initialPrompts={JSON.parse(JSON.stringify(initialPrompts))} agentName={agentName} />
    </div>
  );
}