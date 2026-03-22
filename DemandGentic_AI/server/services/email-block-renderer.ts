/**
 * Email Block Renderer Service
 *
 * Converts email builder blocks to email-safe HTML with:
 * - Table-based layouts for maximum client compatibility
 * - Inline CSS styles (Gmail strips  tags)
 * - MSO/VML conditionals for Outlook
 * - Mobile-responsive design
 * - Tested patterns for Gmail, Outlook, Apple Mail, Yahoo
 *
 * KEY RULES FOR EMAIL HTML:
 * 1. Use tables for ALL layouts (no div, flexbox, grid)
 * 2. ALL CSS must be inline (Gmail strips  tags)
 * 3. Use bgcolor attribute + background-color property
 * 4. Use align/valign attributes + text-align property
 * 5. Avoid CSS shorthand (use padding-top, not padding: x y)
 * 6. Use web-safe fonts with fallbacks
 * 7. Max width 600px, min font 14px
 * 8. Use VML for Outlook buttons/shapes
 * 9. Use role="presentation" on layout tables
 * 10. Explicit widths on all table cells
 */

import { BrandKit, EmailBuilderBlock } from '../../shared/schema';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface RenderOptions {
  width?: number;
  backgroundColor?: string;
  brandKit?: Partial;
  previewText?: string;
  previewMode?: boolean;
  renderMobileVersion?: boolean;
}

export interface BrandKitStyles {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  linkColor?: string;
  headingFont?: string;
  bodyFont?: string;
  headingFontSize?: string;
  bodyFontSize?: string;
  lineHeight?: string;
}

export interface BlockContent {
  text?: string;
  level?: string;
  align?: string;
  html?: string;
  src?: string;
  imageUrl?: string;
  alt?: string;
  width?: string;
  link?: string;
  linkUrl?: string;
  buttonText?: string;
  buttonUrl?: string;
  url?: string;
  buttonStyle?: 'primary' | 'secondary' | 'outline';
  backgroundColor?: string;
  style?: string;
  color?: string;
  height?: number;
  title?: string;
  subtitle?: string;
  backgroundImage?: string;
  heroCta?: { text: string; url: string };
  socialLinks?: Array;
  links?: Array;
  items?: string[];
  listStyle?: 'bullet' | 'numbered' | 'checkmark';
  companyName?: string;
  address?: string;
  includeUnsubscribe?: boolean;
  columns?: Array;
  [key: string]: unknown;
}

export interface BlockStyles {
  backgroundColor?: string;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  marginTop?: number;
  marginBottom?: number;
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  textAlign?: 'left' | 'center' | 'right';
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  lineHeight?: number;
  width?: string | number;
  maxWidth?: number;
  [key: string]: unknown;
}

// =============================================================================
// DEFAULT BRAND CONFIGURATION
// =============================================================================

const DEFAULT_BRAND = {
  colors: {
    primary: '#2563eb',
    secondary: '#64748b',
    accent: '#f59e0b',
    background: '#ffffff',
    text: '#1f2937',
    textLight: '#6b7280',
    link: '#2563eb',
    headerBg: '#1f2937',
    footerBg: '#f8fafc',
    border: '#e5e7eb',
  },
  typography: {
    // Web-safe font stacks for maximum compatibility
    headingFont: 'Arial, Helvetica, sans-serif',
    bodyFont: 'Arial, Helvetica, sans-serif',
    headingSize: 24,
    bodySize: 16,
    lineHeight: 1.5,
  },
  buttonStyles: {
    borderRadius: 6,
    paddingX: 24,
    paddingY: 12,
    fontSize: 16,
    fontWeight: '700',
  },
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Escape HTML entities to prevent XSS
 */
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(//g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Convert hex color to RGB for VML
 */
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return `rgb(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)})`;
  }
  return hex;
}

/**
 * Merge brand kit with defaults
 */
function mergeBrandKit(brandKit?: Partial): typeof DEFAULT_BRAND {
  if (!brandKit) return DEFAULT_BRAND;

  return {
    colors: {
      ...DEFAULT_BRAND.colors,
      primary: brandKit.primaryColor || DEFAULT_BRAND.colors.primary,
      secondary: brandKit.secondaryColor || DEFAULT_BRAND.colors.secondary,
      accent: brandKit.accentColor || DEFAULT_BRAND.colors.accent,
      background: brandKit.backgroundColor || DEFAULT_BRAND.colors.background,
      text: brandKit.textColor || DEFAULT_BRAND.colors.text,
      link: brandKit.linkColor || DEFAULT_BRAND.colors.link,
    },
    typography: {
      headingFont: brandKit.headingFont || DEFAULT_BRAND.typography.headingFont,
      bodyFont: brandKit.bodyFont || DEFAULT_BRAND.typography.bodyFont,
      headingSize: brandKit.headingFontSize ? parseInt(brandKit.headingFontSize) : DEFAULT_BRAND.typography.headingSize,
      bodySize: brandKit.bodyFontSize ? parseInt(brandKit.bodyFontSize) : DEFAULT_BRAND.typography.bodySize,
      lineHeight: brandKit.lineHeight ? parseFloat(brandKit.lineHeight) : DEFAULT_BRAND.typography.lineHeight,
    },
    buttonStyles: DEFAULT_BRAND.buttonStyles,
  };
}

// =============================================================================
// BLOCK RENDERERS
// =============================================================================

/**
 * Render text/paragraph block
 * Gmail-safe: Uses explicit inline styles, no shorthand
 */
function renderTextBlock(content: BlockContent, styles: BlockStyles, brand: typeof DEFAULT_BRAND): string {
  const align = content.align || styles.textAlign || 'left';
  const fontSize = styles.fontSize || brand.typography.bodySize;
  const textColor = styles.color || brand.colors.text;
  const bgColor = styles.backgroundColor || '';
  const pTop = styles.paddingTop ?? 12;
  const pBottom = styles.paddingBottom ?? 12;
  const pLeft = styles.paddingLeft ?? 24;
  const pRight = styles.paddingRight ?? 24;

  const text = content.html || content.text || '';

  return `

  
    ${text}
  
`;
}

/**
 * Render heading block
 * Outlook-safe: Uses explicit font styles on heading elements
 */
function renderHeadingBlock(content: BlockContent, styles: BlockStyles, brand: typeof DEFAULT_BRAND): string {
  const align = content.align || styles.textAlign || 'left';
  const level = content.level || 'h2';
  const fontSize = level === 'h1' ? 32 : level === 'h2' ? 24 : level === 'h3' ? 20 : 18;
  const textColor = styles.color || brand.colors.text;
  const bgColor = styles.backgroundColor || '';
  const pTop = styles.paddingTop ?? 24;
  const pBottom = styles.paddingBottom ?? 12;
  const pLeft = styles.paddingLeft ?? 24;
  const pRight = styles.paddingRight ?? 24;

  const text = escapeHtml(content.text || 'Heading');

  return `

  
    
      ${text}
    
  
`;
}

/**
 * Render image block
 * Key: Always specify width/height, use display:block, border:0
 */
function renderImageBlock(content: BlockContent, styles: BlockStyles, brand: typeof DEFAULT_BRAND): string {
  const align = content.align || styles.textAlign || 'center';
  const bgColor = styles.backgroundColor || '';
  const pTop = styles.paddingTop ?? 16;
  const pBottom = styles.paddingBottom ?? 16;
  const pLeft = styles.paddingLeft ?? 0;
  const pRight = styles.paddingRight ?? 0;

  const imageUrl = content.src || content.imageUrl || 'https://placehold.co/600x300/e5e7eb/9ca3af?text=Image';
  const altText = escapeHtml(content.alt || 'Email image');
  const imgWidth = content.width || '100%';
  const borderRadius = styles.borderRadius || 0;
  const linkUrl = content.link || content.linkUrl || '';

  // Calculate max-width based on container
  const maxWidth = imgWidth === '100%' ? '600' : imgWidth.replace('%', '');

  let imgHtml = ``;

  if (linkUrl) {
    imgHtml = `${imgHtml}`;
  }

  return `

  
    ${imgHtml}
  
`;
}

/**
 * Render button block
 * Uses VML for Outlook rounded button support
 * Critical: MSO conditional comments for Outlook rendering
 */
function renderButtonBlock(content: BlockContent, styles: BlockStyles, brand: typeof DEFAULT_BRAND): string {
  const align = content.align || styles.textAlign || 'center';
  const bgColor = styles.backgroundColor || '';
  const pTop = styles.paddingTop ?? 24;
  const pBottom = styles.paddingBottom ?? 24;
  const pLeft = styles.paddingLeft ?? 24;
  const pRight = styles.paddingRight ?? 24;

  const buttonText = escapeHtml(content.buttonText || content.text || 'Click Here');
  const buttonUrl = content.buttonUrl || content.url || '#';
  const buttonStyle = content.buttonStyle || content.style || 'primary';
  const customBgColor = content.backgroundColor;

  // Determine button colors
  const isOutline = buttonStyle === 'outline';
  const btnBgColor = customBgColor || (isOutline ? 'transparent' : (buttonStyle === 'secondary' ? brand.colors.secondary : brand.colors.primary));
  const btnTextColor = isOutline ? brand.colors.primary : '#ffffff';
  const borderStyle = isOutline ? `2px solid ${brand.colors.primary}` : 'none';

  const btnRadius = brand.buttonStyles.borderRadius;
  const btnPaddingY = brand.buttonStyles.paddingY;
  const btnPaddingX = brand.buttonStyles.paddingX;
  const btnFontSize = brand.buttonStyles.fontSize;
  const btnHeight = btnPaddingY * 2 + btnFontSize + 4;
  const btnWidth = 200;

  return `

  
    
      
        
          
          
            
            
              ${buttonText}
            
          
          
          
          
            ${buttonText}
          
          
        
      
    
  
`;
}

/**
 * Render divider/horizontal rule block
 * Uses table-based divider for consistency
 */
function renderDividerBlock(content: BlockContent, styles: BlockStyles, brand: typeof DEFAULT_BRAND): string {
  const bgColor = styles.backgroundColor || '';
  const dividerColor = content.color || styles.borderColor || brand.colors.border;
  const dividerStyle = content.style || 'solid';
  const pTop = styles.paddingTop ?? 24;
  const pBottom = styles.paddingBottom ?? 24;
  const pLeft = styles.paddingLeft ?? 24;
  const pRight = styles.paddingRight ?? 24;

  return `

  
    
      
        &nbsp;
      
    
  
`;
}

/**
 * Render spacer block
 * Uses explicit height with &nbsp; for Outlook
 */
function renderSpacerBlock(content: BlockContent, styles: BlockStyles): string {
  const height = content.height || styles.paddingTop || 32;

  return `

  &nbsp;
`;
}

/**
 * Render hero/banner block
 * Uses background image with VML fallback for Outlook
 */
function renderHeroBlock(content: BlockContent, styles: BlockStyles, brand: typeof DEFAULT_BRAND): string {
  const bgColor = styles.backgroundColor || brand.colors.primary;
  const bgImage = content.backgroundImage || '';
  const textColor = styles.color || '#ffffff';
  const title = escapeHtml(content.title || 'Hero Title');
  const subtitle = escapeHtml(content.subtitle || 'Add your subtitle here');
  const ctaText = content.heroCta?.text || content.buttonText || '';
  const ctaUrl = content.heroCta?.url || content.buttonUrl || '#';

  const heroHeight = 300;

  let ctaHtml = '';
  if (ctaText) {
    ctaHtml = `
    
      
        
          
            ${escapeHtml(ctaText)}
          
        
      
    `;
  }

  // If there's a background image, use VML for Outlook
  if (bgImage) {
    return `

  
    
    
      
      
    
    
      
        
          
            
              ${title}
            
            
              ${subtitle}
            
            ${ctaHtml}
          
        
      
    
    
      
    
    
  
`;
  }

  // No background image - simple colored hero
  return `

  
    
      ${title}
    
    
      ${subtitle}
    
    ${ctaHtml}
  
`;
}

/**
 * Render two-column layout
 * Uses ghost table technique for Outlook
 */
function renderColumnsBlock(content: BlockContent, styles: BlockStyles, brand: typeof DEFAULT_BRAND): string {
  const bgColor = styles.backgroundColor || '';
  const pTop = styles.paddingTop ?? 16;
  const pBottom = styles.paddingBottom ?? 16;
  const pLeft = styles.paddingLeft ?? 24;
  const pRight = styles.paddingRight ?? 24;

  const columns = content.columns || [{ content: 'Column 1' }, { content: 'Column 2' }];
  const colWidth = Math.floor((600 - pLeft - pRight - 24) / columns.length);

  const columnsHtml = columns.map((col: any, i: number) => `
        
        
        
        
          
            
              
                ${col.content || ''}
              
            
          
        
        
        
        `).join('\n');

  return `

  
    
    
    
    
    
      ${columnsHtml}
    
    
    
    
    
  
`;
}

/**
 * Render bulleted/numbered list
 * Uses table-based list for consistent rendering
 */
function renderListBlock(content: BlockContent, styles: BlockStyles, brand: typeof DEFAULT_BRAND): string {
  const bgColor = styles.backgroundColor || '';
  const textColor = styles.color || brand.colors.text;
  const pTop = styles.paddingTop ?? 16;
  const pBottom = styles.paddingBottom ?? 16;
  const pLeft = styles.paddingLeft ?? 24;
  const pRight = styles.paddingRight ?? 24;

  const items = content.items || ['Item 1', 'Item 2', 'Item 3'];
  const listStyle = content.listStyle || content.style || 'bullet';

  const getMarker = (index: number) => {
    switch (listStyle) {
      case 'numbered':
        return `${index + 1}.`;
      case 'checkmark':
        return '✓';
      default:
        return '•';
    }
  };

  const itemsHtml = items.map((item: string, i: number) => `
      
        
          ${getMarker(i)}
        
        
          ${escapeHtml(item)}
        
      `).join('\n');

  return `

  
    
      ${itemsHtml}
    
  
`;
}

/**
 * Render social links block
 * Uses hosted social icons for reliability
 */
function renderSocialBlock(content: BlockContent, styles: BlockStyles, brand: typeof DEFAULT_BRAND): string {
  const align = styles.textAlign || 'center';
  const bgColor = styles.backgroundColor || '';
  const pTop = styles.paddingTop ?? 24;
  const pBottom = styles.paddingBottom ?? 24;
  const pLeft = styles.paddingLeft ?? 24;
  const pRight = styles.paddingRight ?? 24;

  // Use reliable CDN-hosted social icons
  const socialIcons: Record = {
    facebook: { icon: 'https://cdn-icons-png.flaticon.com/32/733/733547.png', color: '#1877f2' },
    twitter: { icon: 'https://cdn-icons-png.flaticon.com/32/733/733579.png', color: '#1da1f2' },
    linkedin: { icon: 'https://cdn-icons-png.flaticon.com/32/733/733561.png', color: '#0077b5' },
    instagram: { icon: 'https://cdn-icons-png.flaticon.com/32/733/733558.png', color: '#e4405f' },
    youtube: { icon: 'https://cdn-icons-png.flaticon.com/32/733/733646.png', color: '#ff0000' },
  };

  const links = content.socialLinks || content.links || [];

  if (links.length === 0) {
    return '';
  }

  const iconsHtml = links.map((link: any) => {
    const platform = link.platform?.toLowerCase() || 'linkedin';
    const iconData = socialIcons[platform] || socialIcons.linkedin;
    return `
          
            
              
            
          `;
  }).join('\n');

  return `

  
    
      
        ${iconsHtml}
      
    
  
`;
}

/**
 * Render footer block with unsubscribe link
 */
function renderFooterBlock(content: BlockContent, styles: BlockStyles, brand: typeof DEFAULT_BRAND): string {
  const bgColor = styles.backgroundColor || brand.colors.footerBg;
  const textColor = styles.color || brand.colors.textLight;

  const companyName = escapeHtml(content.companyName || '{{company_name}}');
  const address = escapeHtml(content.address || '{{company_address}}');
  const includeUnsubscribe = content.includeUnsubscribe !== false;

  return `

  
    
      
        
          ${companyName}
        
      
      
        
          ${address}
        
      
      ${includeUnsubscribe ? `
      
        
          Unsubscribe
          |
          Manage Preferences
        
      ` : ''}
    
  
`;
}

// =============================================================================
// MAIN RENDER FUNCTIONS
// =============================================================================

/**
 * Render a single block to HTML
 */
export function renderBlock(
  block: { blockType: string; content: any; styles?: any },
  brand: typeof DEFAULT_BRAND = DEFAULT_BRAND
): string {
  const { blockType, content = {}, styles = {} } = block;

  switch (blockType) {
    case 'text':
      return renderTextBlock(content, styles, brand);
    case 'heading':
      return renderHeadingBlock(content, styles, brand);
    case 'image':
      return renderImageBlock(content, styles, brand);
    case 'button':
      return renderButtonBlock(content, styles, brand);
    case 'divider':
      return renderDividerBlock(content, styles, brand);
    case 'spacer':
      return renderSpacerBlock(content, styles);
    case 'hero':
      return renderHeroBlock(content, styles, brand);
    case 'columns':
      return renderColumnsBlock(content, styles, brand);
    case 'list':
      return renderListBlock(content, styles, brand);
    case 'social':
      return renderSocialBlock(content, styles, brand);
    case 'footer':
      return renderFooterBlock(content, styles, brand);
    default:
      return renderTextBlock(content, styles, brand);
  }
}

/**
 * Render complete email from blocks
 * Produces Gmail/Outlook compatible HTML
 */
export function renderEmail(
  blocks: Array,
  brandKit?: Partial,
  previewText?: string
): string {
  const width = 600;
  const backgroundColor = '#f4f4f5';
  const brand = mergeBrandKit(brandKit);
  const preview = escapeHtml(previewText || '');

  // Render all visible blocks
  const blocksHtml = blocks
    .filter((b) => b.isVisible !== false)
    .map((block) => renderBlock({
      blockType: block.type || block.blockType || 'text',
      content: block.content,
      styles: block.styles,
    }, brand))
    .join('\n');

  return `


  
  
  
  
  
  Email
  
  
    
      
        
        96
      
    
  
  
    table {border-collapse: collapse;}
    td,th {border-collapse: collapse;mso-line-height-rule: exactly;}
    a {text-decoration: none;}
  
  
  
    /* Reset styles - Critical for consistent rendering */
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      outline: none;
      text-decoration: none;
    }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
    }
    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
    }
    /* Mobile styles */
    @media only screen and (max-width: 620px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .fluid {
        max-width: 100% !important;
        height: auto !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }
      .stack-column,
      .stack-column-center {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        direction: ltr !important;
      }
      .stack-column-center {
        text-align: center !important;
      }
      .mobile-padding {
        padding-left: 16px !important;
        padding-right: 16px !important;
      }
      .mobile-hide {
        display: none !important;
        max-height: 0 !important;
        overflow: hidden !important;
      }
    }
  


  
  
    ${preview}${'&nbsp;&zwnj;'.repeat(50)}
  

  
  
    
      
        
        
        
        
        

        
        
          ${blocksHtml}
        

        
        
        
        
        
      
    
  

`;
}

/**
 * Generate plain text version from blocks
 */
export function renderPlainText(
  blocks: Array
): string {
  const lines: string[] = [];

  for (const block of blocks.filter((b) => b.isVisible !== false)) {
    const blockType = block.type || block.blockType;
    const content = block.content || {};

    switch (blockType) {
      case 'text':
        if (content.text) {
          lines.push(content.text.replace(/]+>/g, '').trim());
        }
        lines.push('');
        break;
      case 'heading':
        if (content.text) {
          lines.push(content.text.toUpperCase());
        }
        lines.push('');
        break;
      case 'button':
        const btnText = content.buttonText || content.text;
        const btnUrl = content.buttonUrl || content.url;
        if (btnText && btnUrl) {
          lines.push(`${btnText}: ${btnUrl}`);
        }
        lines.push('');
        break;
      case 'hero':
        if (content.title) lines.push(content.title.toUpperCase());
        if (content.subtitle) lines.push(content.subtitle);
        if (content.heroCta || content.buttonText) {
          const ctaText = content.heroCta?.text || content.buttonText;
          const ctaUrl = content.heroCta?.url || content.buttonUrl;
          if (ctaText && ctaUrl) lines.push(`${ctaText}: ${ctaUrl}`);
        }
        lines.push('');
        break;
      case 'list':
        if (content.items) {
          const style = content.listStyle || 'bullet';
          content.items.forEach((item: string, i: number) => {
            const marker = style === 'numbered' ? `${i + 1}.` : style === 'checkmark' ? '✓' : '•';
            lines.push(`${marker} ${item}`);
          });
        }
        lines.push('');
        break;
      case 'divider':
        lines.push('---');
        lines.push('');
        break;
      case 'footer':
        lines.push('');
        lines.push(content.companyName || '{{company_name}}');
        lines.push(content.address || '{{company_address}}');
        lines.push('');
        if (content.includeUnsubscribe !== false) {
          lines.push('Unsubscribe: {{unsubscribe_url}}');
        }
        break;
    }
  }

  return lines.join('\n').trim();
}

// =============================================================================
// EXPORTS
// =============================================================================

export const emailBlockRenderer = {
  renderBlock,
  renderEmail,
  renderPlainText,
  DEFAULT_BRAND,
  mergeBrandKit,
};

export default emailBlockRenderer;