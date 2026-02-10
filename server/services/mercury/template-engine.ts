/**
 * Mercury Bridge — Template Engine
 * 
 * Safe Mustache-compatible template renderer for Mercury email templates.
 * Supports:
 *   {{varName}}       — HTML-escaped variable substitution
 *   {{{varName}}}     — Raw (unescaped) variable substitution
 *   {{#if varName}}...{{/if}} — Conditional blocks
 *   {{else}}          — Else clause within conditionals
 * 
 * Security: All variables are HTML-escaped by default (double braces).
 * Use triple braces only for pre-sanitized HTML content.
 */

/**
 * HTML-escape a string to prevent XSS in email templates.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a Mustache-style template with variable substitution.
 * 
 * @param template - The template string with {{var}}, {{{raw}}}, {{#if}} blocks
 * @param variables - Key-value pairs for substitution
 * @returns Rendered string
 */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  let result = template;

  // 1. Process {{#if varName}}...{{else}}...{{/if}} blocks
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, varName: string, innerContent: string) => {
      const value = variables[varName];
      const hasValue = value !== undefined && value !== null && value !== '' && value !== 'false';

      // Check for {{else}} clause
      const elseParts = innerContent.split(/\{\{else\}\}/);
      if (hasValue) {
        return elseParts[0] || '';
      } else {
        return elseParts[1] || '';
      }
    }
  );

  // 2. Process {{{rawVar}}} (unescaped)
  result = result.replace(
    /\{\{\{(\w+)\}\}\}/g,
    (_match, varName: string) => {
      const value = variables[varName];
      return value !== undefined && value !== null ? value : '';
    }
  );

  // 3. Process {{var}} (escaped)
  result = result.replace(
    /\{\{(\w+)\}\}/g,
    (_match, varName: string) => {
      const value = variables[varName];
      return value !== undefined && value !== null ? escapeHtml(value) : '';
    }
  );

  return result;
}

/**
 * Extract variable names from a template string.
 * Returns unique variable names found in the template.
 */
export function extractTemplateVariables(template: string): string[] {
  const vars = new Set<string>();
  const patterns = [
    /\{\{\{(\w+)\}\}\}/g,     // {{{raw}}}
    /\{\{(\w+)\}\}/g,          // {{escaped}}
    /\{\{#if\s+(\w+)\}\}/g,   // {{#if var}}
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(template)) !== null) {
      vars.add(match[1]);
    }
  }
  return Array.from(vars);
}

/**
 * Validate that all required variables are present in the provided variables map.
 * Returns an array of missing variable names.
 */
export function validateTemplateVariables(
  requiredVars: Array<{ name: string; required: boolean; defaultValue?: string }>,
  providedVars: Record<string, string>,
): string[] {
  const missing: string[] = [];
  for (const v of requiredVars) {
    if (v.required && !v.defaultValue && !(v.name in providedVars)) {
      missing.push(v.name);
    }
  }
  return missing;
}

/**
 * Apply default values from template variable definitions to a variables map.
 */
export function applyDefaults(
  varDefs: Array<{ name: string; defaultValue?: string; exampleValue?: string }>,
  providedVars: Record<string, string>,
): Record<string, string> {
  const merged = { ...providedVars };
  for (const def of varDefs) {
    if (!(def.name in merged) && def.defaultValue) {
      merged[def.name] = def.defaultValue;
    }
  }
  return merged;
}

/**
 * Generate a sample variables map from template variable definitions (for preview).
 */
export function generateSampleVariables(
  varDefs: Array<{ name: string; exampleValue?: string; defaultValue?: string }>,
): Record<string, string> {
  const sample: Record<string, string> = {};
  for (const def of varDefs) {
    sample[def.name] = def.exampleValue || def.defaultValue || `[${def.name}]`;
  }
  return sample;
}
