import 'dotenv/config';
import { db } from '../server/db';
import { mercuryTemplates } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { DEFAULT_TEMPLATES } from '../server/services/mercury/default-templates';

async function main() {
  const template = DEFAULT_TEMPLATES.find((t) => t.templateKey === 'showcase_recordings_shared');

  if (!template) {
    throw new Error('Default template showcase_recordings_shared not found in code');
  }

  const [updated] = await db
    .update(mercuryTemplates)
    .set({
      subjectTemplate: template.subjectTemplate,
      htmlTemplate: template.htmlTemplate,
      textTemplate: template.textTemplate,
      variables: template.variables as any,
      updatedAt: new Date(),
    })
    .where(eq(mercuryTemplates.templateKey, 'showcase_recordings_shared'))
    .returning({
      id: mercuryTemplates.id,
      templateKey: mercuryTemplates.templateKey,
      updatedAt: mercuryTemplates.updatedAt,
      subjectTemplate: mercuryTemplates.subjectTemplate,
    });

  if (!updated) {
    throw new Error('Template showcase_recordings_shared not found in DB');
  }

  const [verify] = await db
    .select({
      templateKey: mercuryTemplates.templateKey,
      htmlTemplate: mercuryTemplates.htmlTemplate,
      textTemplate: mercuryTemplates.textTemplate,
    })
    .from(mercuryTemplates)
    .where(eq(mercuryTemplates.templateKey, 'showcase_recordings_shared'))
    .limit(1);

  const hasCorrectDomain =
    verify?.htmlTemplate?.includes('https://demandgentic.ai') &&
    verify?.textTemplate?.includes('https://demandgentic.ai');

  console.log(
    JSON.stringify(
      {
        updatedTemplate: updated,
        hasCorrectDomain,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to fix showcase template domain:', error);
    process.exit(1);
  });
