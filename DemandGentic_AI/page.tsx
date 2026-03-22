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
    
      &larr; Back to All Agents
      Prompt History for {decodeURIComponent(agentName)}
      
    
  );
}