// Content Context object and schema for DemanGent Email Generation
// This interface defines the structure for all content assets (webinar, guide, solution brief, etc.).

export interface ContentContext {
  asset_type: string;
  asset_title: string;
  asset_format: string;
  primary_theme: string;
  who_it_is_for: string;
  what_problem_it_helps_explore: string;
  what_it_does_not_claim: string[];
}

export function isContentContext(value: unknown): value is ContentContext {
  if (!value || typeof value !== "object") return false;
  const context = value as ContentContext;

  return Boolean(
    context.asset_type &&
    context.asset_title &&
    context.asset_format &&
    context.primary_theme &&
    context.who_it_is_for &&
    context.what_problem_it_helps_explore &&
    Array.isArray(context.what_it_does_not_claim)
  );
}
