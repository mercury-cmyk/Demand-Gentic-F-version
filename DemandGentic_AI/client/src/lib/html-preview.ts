export function sanitizeHtmlForIframePreview(html: string): string {
  if (!html) return html;

  // Remove script tags (email HTML should never rely on JS).
  let sanitized = html.replace(/]*>[\s\S]*?/gi, '');

  // Remove inline event handlers (onload=, onclick=, etc).
  sanitized = sanitized.replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Prevent nested iframes/embeds in previews.
  sanitized = sanitized.replace(/]*>[\s\S]*?/gi, '');
  sanitized = sanitized.replace(/]*\/>/gi, '');
  sanitized = sanitized.replace(/]*>[\s\S]*?/gi, '');
  sanitized = sanitized.replace(/]*\/?>/gi, '');

  return sanitized;
}