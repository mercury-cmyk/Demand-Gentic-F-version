/**
 * Text Sanitization Utilities
 * Fixes character encoding corruption and normalizes text
 */

/**
 * Sanitize text to remove corrupt characters and normalize encoding
 * Fixes common UTF-8 corruption patterns (mojibake)
 * 
 * @param text - Text to sanitize
 * @returns Sanitized text or null if input is null/empty
 */
export function sanitizeText(text: string | null | undefined): string | null {
  if (!text || typeof text !== 'string') return null;
  
  return text
    // Remove BOM (Byte Order Mark)
    .replace(/^\uFEFF/, '')
    
    // Fix common UTF-8 corruption patterns (mojibake)
    // These occur when UTF-8 text is incorrectly decoded as Latin-1/Windows-1252
    .replace(/â€™/g, "'")  // Right single quotation mark (U+2019)
    .replace(/â€˜/g, "'")  // Left single quotation mark (U+2018)
    .replace(/â€œ/g, '"')  // Left double quotation mark (U+201C)
    .replace(/â€/g, '"')   // Right double quotation mark (U+201D)
    .replace(/â€"/g, '–')  // En dash (U+2013)
    .replace(/â€"/g, '—')  // Em dash (U+2014)
    .replace(/â€¦/g, '…')  // Horizontal ellipsis (U+2026)
    
    // French/European characters
    .replace(/Ã©/g, 'é')   // e with acute
    .replace(/Ã¨/g, 'è')   // e with grave
    .replace(/Ãª/g, 'ê')   // e with circumflex
    .replace(/Ã /g, 'à')   // a with grave
    .replace(/Ã¢/g, 'â')   // a with circumflex
    .replace(/Ã§/g, 'ç')   // c with cedilla
    .replace(/Ã´/g, 'ô')   // o with circumflex
    .replace(/Ã¹/g, 'ù')   // u with grave
    .replace(/Ã»/g, 'û')   // u with circumflex
    .replace(/Ã¼/g, 'ü')   // u with diaeresis
    .replace(/Ã«/g, 'ë')   // e with diaeresis
    .replace(/Ã¯/g, 'ï')   // i with diaeresis
    
    // Spanish characters
    .replace(/Ã±/g, 'ñ')   // n with tilde
    .replace(/Ã¡/g, 'á')   // a with acute
    .replace(/Ã³/g, 'ó')   // o with acute
    .replace(/Ãº/g, 'ú')   // u with acute
    .replace(/Ã­/g, 'í')   // i with acute
    
    // German characters
    .replace(/Ã¤/g, 'ä')   // a with diaeresis
    .replace(/Ã¶/g, 'ö')   // o with diaeresis
    .replace(/ÃŸ/g, 'ß')   // sharp s (eszett)
    
    // Other common patterns
    .replace(/Â°/g, '°')   // Degree sign
    .replace(/Â®/g, '®')   // Registered trademark
    .replace(/Â©/g, '©')   // Copyright sign
    .replace(/Â£/g, '£')   // Pound sign
    .replace(/â‚¬/g, '€')  // Euro sign
    
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if text contains corrupt characters (mojibake)
 * 
 * @param text - Text to check
 * @returns True if text contains corruption patterns
 */
export function hasCorruptCharacters(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') return false;
  
  // Common corruption patterns
  const corruptionPatterns = [
    /â€[™˜œ"]/,  // UTF-8 quotes corrupted
    /Ã[©èêàâçôùûüëï±áóúí]/,  // Accented characters corrupted
    /Â[°®©£]/,  // Special symbols corrupted
    /â‚¬/,      // Euro sign corrupted
  ];
  
  return corruptionPatterns.some(pattern => pattern.test(text));
}

/**
 * Bulk sanitize multiple text fields in an object
 * 
 * @param obj - Object containing text fields
 * @param fields - Array of field names to sanitize
 * @returns Sanitized object
 */
export function sanitizeFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const sanitized = { ...obj };
  
  for (const field of fields) {
    if (typeof sanitized[field] === 'string') {
      sanitized[field] = sanitizeText(sanitized[field] as string) as any;
    }
  }
  
  return sanitized;
}
