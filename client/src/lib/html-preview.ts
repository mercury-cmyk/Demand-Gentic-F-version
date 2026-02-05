export function sanitizeHtmlForIframePreview(html: string): string {
  if (!html) return html;

  // Remove script tags (email HTML should never rely on JS).
  let sanitized = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

  // Remove inline event handlers (onload=, onclick=, etc).
  sanitized = sanitized.replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Prevent nested iframes/embeds in previews.
  sanitized = sanitized.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
  sanitized = sanitized.replace(/<iframe\b[^>]*\/>/gi, '');
  sanitized = sanitized.replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '');
  sanitized = sanitized.replace(/<embed\b[^>]*\/?>/gi, '');

  return sanitized;
}

