/**
 * Email Block Renderer Service
 *
 * Converts email builder blocks to email-safe HTML with:
 * - Table-based layouts for maximum client compatibility
 * - Inline CSS styles (Gmail strips <style> tags)
 * - MSO/VML conditionals for Outlook
 * - Mobile-responsive design
 * - Tested patterns for Gmail, Outlook, Apple Mail, Yahoo
 *
 * KEY RULES FOR EMAIL HTML:
 * 1. Use tables for ALL layouts (no div, flexbox, grid)
 * 2. ALL CSS must be inline (Gmail strips <style> tags)
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
  brandKit?: Partial<BrandKitStyles>;
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
  socialLinks?: Array<{ platform: string; url: string }>;
  links?: Array<{ platform: string; url: string }>;
  items?: string[];
  listStyle?: 'bullet' | 'numbered' | 'checkmark';
  companyName?: string;
  address?: string;
  includeUnsubscribe?: boolean;
  columns?: Array<{ content: string }>;
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
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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
function mergeBrandKit(brandKit?: Partial<BrandKitStyles>): typeof DEFAULT_BRAND {
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
<tr>
  <td align="${align}" valign="top" ${bgColor ? `bgcolor="${bgColor}"` : ''} style="padding-top: ${pTop}px; padding-right: ${pRight}px; padding-bottom: ${pBottom}px; padding-left: ${pLeft}px; font-family: ${brand.typography.bodyFont}; font-size: ${fontSize}px; line-height: ${brand.typography.lineHeight}; color: ${textColor}; text-align: ${align};${bgColor ? ` background-color: ${bgColor};` : ''}">
    ${text}
  </td>
</tr>`;
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
<tr>
  <td align="${align}" valign="top" ${bgColor ? `bgcolor="${bgColor}"` : ''} style="padding-top: ${pTop}px; padding-right: ${pRight}px; padding-bottom: ${pBottom}px; padding-left: ${pLeft}px;${bgColor ? ` background-color: ${bgColor};` : ''}">
    <${level} style="margin: 0; font-family: ${brand.typography.headingFont}; font-size: ${fontSize}px; font-weight: 700; line-height: 1.25; color: ${textColor}; text-align: ${align};">
      ${text}
    </${level}>
  </td>
</tr>`;
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

  let imgHtml = `<img src="${imageUrl}" width="${maxWidth}" alt="${altText}" style="display: block; width: ${imgWidth}; max-width: 100%; height: auto; border: 0; outline: none; text-decoration: none;${borderRadius ? ` border-radius: ${borderRadius}px;` : ''}" />`;

  if (linkUrl) {
    imgHtml = `<a href="${linkUrl}" target="_blank" style="text-decoration: none;">${imgHtml}</a>`;
  }

  return `
<tr>
  <td align="${align}" valign="top" ${bgColor ? `bgcolor="${bgColor}"` : ''} style="padding-top: ${pTop}px; padding-right: ${pRight}px; padding-bottom: ${pBottom}px; padding-left: ${pLeft}px;${bgColor ? ` background-color: ${bgColor};` : ''} text-align: ${align};">
    ${imgHtml}
  </td>
</tr>`;
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
<tr>
  <td align="${align}" valign="top" ${bgColor ? `bgcolor="${bgColor}"` : ''} style="padding-top: ${pTop}px; padding-right: ${pRight}px; padding-bottom: ${pBottom}px; padding-left: ${pLeft}px;${bgColor ? ` background-color: ${bgColor};` : ''}">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${align}" style="margin: 0 auto;">
      <tr>
        <td align="center" valign="middle" bgcolor="${btnBgColor}" style="border-radius: ${btnRadius}px; background-color: ${btnBgColor};${isOutline ? ` border: ${borderStyle};` : ''}">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${buttonUrl}" style="height:${btnHeight}px;v-text-anchor:middle;width:${btnWidth}px;" arcsize="${Math.round((btnRadius / btnHeight) * 100)}%" ${isOutline ? `stroke="true" strokecolor="${brand.colors.primary}" strokeweight="2px"` : 'stroke="false"'} fillcolor="${btnBgColor}">
            <w:anchorlock/>
            <center style="color:${btnTextColor};font-family:Arial,sans-serif;font-size:${btnFontSize}px;font-weight:bold;">
              ${buttonText}
            </center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <a href="${buttonUrl}" target="_blank" style="display: inline-block; padding-top: ${btnPaddingY}px; padding-right: ${btnPaddingX}px; padding-bottom: ${btnPaddingY}px; padding-left: ${btnPaddingX}px; font-family: Arial, sans-serif; font-size: ${btnFontSize}px; font-weight: 700; color: ${btnTextColor}; text-decoration: none; border-radius: ${btnRadius}px; background-color: ${btnBgColor};${isOutline ? ` border: ${borderStyle};` : ''} mso-hide: all;">
            ${buttonText}
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>
  </td>
</tr>`;
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
<tr>
  <td ${bgColor ? `bgcolor="${bgColor}"` : ''} style="padding-top: ${pTop}px; padding-right: ${pRight}px; padding-bottom: ${pBottom}px; padding-left: ${pLeft}px;${bgColor ? ` background-color: ${bgColor};` : ''}">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td style="border-top-width: 1px; border-top-style: ${dividerStyle}; border-top-color: ${dividerColor}; font-size: 0; line-height: 0; height: 1px;">&nbsp;</td>
      </tr>
    </table>
  </td>
</tr>`;
}

/**
 * Render spacer block
 * Uses explicit height with &nbsp; for Outlook
 */
function renderSpacerBlock(content: BlockContent, styles: BlockStyles): string {
  const height = content.height || styles.paddingTop || 32;

  return `
<tr>
  <td style="height: ${height}px; font-size: 1px; line-height: ${height}px; mso-line-height-rule: exactly;">&nbsp;</td>
</tr>`;
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
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-top: 24px;">
      <tr>
        <td align="center" valign="middle" bgcolor="#ffffff" style="border-radius: 6px; background-color: #ffffff;">
          <a href="${ctaUrl}" target="_blank" style="display: inline-block; padding-top: 12px; padding-right: 32px; padding-bottom: 12px; padding-left: 32px; font-family: Arial, sans-serif; font-size: 16px; font-weight: 700; color: ${brand.colors.primary}; text-decoration: none; border-radius: 6px; background-color: #ffffff;">
            ${escapeHtml(ctaText)}
          </a>
        </td>
      </tr>
    </table>`;
  }

  // If there's a background image, use VML for Outlook
  if (bgImage) {
    return `
<tr>
  <td align="center" valign="middle" bgcolor="${bgColor}" style="background-color: ${bgColor};">
    <!--[if gte mso 9]>
    <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:${heroHeight}px;">
      <v:fill type="frame" src="${bgImage}" color="${bgColor}" />
      <v:textbox inset="0,0,0,0">
    <![endif]-->
    <div style="background-image: url('${bgImage}'); background-color: ${bgColor}; background-size: cover; background-position: center center; padding-top: 60px; padding-right: 24px; padding-bottom: 60px; padding-left: 24px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td align="center" valign="middle">
            <h1 style="margin: 0; font-family: ${brand.typography.headingFont}; font-size: 36px; font-weight: 700; line-height: 1.2; color: ${textColor}; text-align: center;">
              ${title}
            </h1>
            <p style="margin-top: 16px; margin-bottom: 0; font-family: ${brand.typography.bodyFont}; font-size: 18px; line-height: 1.5; color: ${textColor}; opacity: 0.9; text-align: center;">
              ${subtitle}
            </p>
            ${ctaHtml}
          </td>
        </tr>
      </table>
    </div>
    <!--[if gte mso 9]>
      </v:textbox>
    </v:rect>
    <![endif]-->
  </td>
</tr>`;
  }

  // No background image - simple colored hero
  return `
<tr>
  <td align="center" valign="middle" bgcolor="${bgColor}" style="padding-top: 60px; padding-right: 24px; padding-bottom: 60px; padding-left: 24px; background-color: ${bgColor};">
    <h1 style="margin: 0; font-family: ${brand.typography.headingFont}; font-size: 36px; font-weight: 700; line-height: 1.2; color: ${textColor}; text-align: center;">
      ${title}
    </h1>
    <p style="margin-top: 16px; margin-bottom: 0; font-family: ${brand.typography.bodyFont}; font-size: 18px; line-height: 1.5; color: ${textColor}; opacity: 0.9; text-align: center;">
      ${subtitle}
    </p>
    ${ctaHtml}
  </td>
</tr>`;
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
        <!--[if mso]>
        <td width="${colWidth}" valign="top" style="width: ${colWidth}px;">
        <![endif]-->
        <div style="display: inline-block; width: 100%; max-width: ${colWidth}px; vertical-align: top;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding-top: 8px; padding-right: 12px; padding-bottom: 8px; padding-left: ${i === 0 ? 0 : 12}px; font-family: ${brand.typography.bodyFont}; font-size: ${brand.typography.bodySize}px; line-height: ${brand.typography.lineHeight}; color: ${brand.colors.text};">
                ${col.content || ''}
              </td>
            </tr>
          </table>
        </div>
        <!--[if mso]>
        </td>
        <![endif]-->`).join('\n');

  return `
<tr>
  <td ${bgColor ? `bgcolor="${bgColor}"` : ''} style="padding-top: ${pTop}px; padding-right: ${pRight}px; padding-bottom: ${pBottom}px; padding-left: ${pLeft}px;${bgColor ? ` background-color: ${bgColor};` : ''}">
    <!--[if mso]>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr>
    <![endif]-->
    <div style="font-size: 0; text-align: center;">
      ${columnsHtml}
    </div>
    <!--[if mso]>
    </tr>
    </table>
    <![endif]-->
  </td>
</tr>`;
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
      <tr>
        <td width="24" valign="top" style="font-family: ${brand.typography.bodyFont}; font-size: ${brand.typography.bodySize}px; line-height: ${brand.typography.lineHeight}; color: ${brand.colors.primary}; padding-right: 8px; padding-bottom: 8px;">
          ${getMarker(i)}
        </td>
        <td valign="top" style="font-family: ${brand.typography.bodyFont}; font-size: ${brand.typography.bodySize}px; line-height: ${brand.typography.lineHeight}; color: ${textColor}; padding-bottom: 8px;">
          ${escapeHtml(item)}
        </td>
      </tr>`).join('\n');

  return `
<tr>
  <td ${bgColor ? `bgcolor="${bgColor}"` : ''} style="padding-top: ${pTop}px; padding-right: ${pRight}px; padding-bottom: ${pBottom}px; padding-left: ${pLeft}px;${bgColor ? ` background-color: ${bgColor};` : ''}">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      ${itemsHtml}
    </table>
  </td>
</tr>`;
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
  const socialIcons: Record<string, { icon: string; color: string }> = {
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
          <td width="44" style="padding-right: 8px; padding-left: 8px;">
            <a href="${link.url || '#'}" target="_blank" style="text-decoration: none;">
              <img src="${iconData.icon}" width="32" height="32" alt="${platform}" style="display: block; border: 0;" />
            </a>
          </td>`;
  }).join('\n');

  return `
<tr>
  <td align="${align}" ${bgColor ? `bgcolor="${bgColor}"` : ''} style="padding-top: ${pTop}px; padding-right: ${pRight}px; padding-bottom: ${pBottom}px; padding-left: ${pLeft}px;${bgColor ? ` background-color: ${bgColor};` : ''} text-align: ${align};">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${align}">
      <tr>
        ${iconsHtml}
      </tr>
    </table>
  </td>
</tr>`;
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
<tr>
  <td align="center" bgcolor="${bgColor}" style="padding-top: 32px; padding-right: 24px; padding-bottom: 32px; padding-left: 24px; background-color: ${bgColor}; border-top-width: 1px; border-top-style: solid; border-top-color: ${brand.colors.border};">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      <tr>
        <td align="center" style="font-family: ${brand.typography.bodyFont}; font-size: 14px; font-weight: 600; line-height: 1.5; color: ${brand.colors.text}; padding-bottom: 8px;">
          ${companyName}
        </td>
      </tr>
      <tr>
        <td align="center" style="font-family: ${brand.typography.bodyFont}; font-size: 12px; line-height: 1.5; color: ${textColor}; padding-bottom: 16px;">
          ${address}
        </td>
      </tr>
      ${includeUnsubscribe ? `
      <tr>
        <td align="center" style="font-family: ${brand.typography.bodyFont}; font-size: 12px; line-height: 1.5; color: ${textColor};">
          <a href="{{unsubscribe_url}}" style="color: ${brand.colors.link}; text-decoration: underline;">Unsubscribe</a>
          <span style="color: ${textColor}; padding-left: 8px; padding-right: 8px;">|</span>
          <a href="{{preferences_url}}" style="color: ${brand.colors.link}; text-decoration: underline;">Manage Preferences</a>
        </td>
      </tr>` : ''}
    </table>
  </td>
</tr>`;
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
  blocks: Array<{ type?: string; blockType?: string; content: any; styles?: any; isVisible?: boolean; hideOnMobile?: boolean; hideOnDesktop?: boolean }>,
  brandKit?: Partial<BrandKitStyles>,
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

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>Email</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <style>
    table {border-collapse: collapse;}
    td,th {border-collapse: collapse;mso-line-height-rule: exactly;}
    a {text-decoration: none;}
  </style>
  <![endif]-->
  <style type="text/css">
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
  </style>
</head>
<body width="100%" style="margin: 0; padding: 0 !important; mso-line-height-rule: exactly; background-color: ${backgroundColor};">
  <!-- Preview text (hidden) -->
  <div style="display: none; font-size: 1px; color: ${backgroundColor}; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${preview}${'&nbsp;&zwnj;'.repeat(50)}
  </div>

  <!-- Full-width wrapper table -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${backgroundColor};" bgcolor="${backgroundColor}">
    <tr>
      <td align="center" valign="top" style="padding-top: 24px; padding-bottom: 24px;">
        <!--[if mso]>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${width}" align="center">
        <tr>
        <td>
        <![endif]-->

        <!-- Email container -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${width}" class="email-container" style="max-width: ${width}px; margin: 0 auto; background-color: ${brand.colors.background};" bgcolor="${brand.colors.background}">
          ${blocksHtml}
        </table>

        <!--[if mso]>
        </td>
        </tr>
        </table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Generate plain text version from blocks
 */
export function renderPlainText(
  blocks: Array<{ type?: string; blockType?: string; content: any; isVisible?: boolean }>
): string {
  const lines: string[] = [];

  for (const block of blocks.filter((b) => b.isVisible !== false)) {
    const blockType = block.type || block.blockType;
    const content = block.content || {};

    switch (blockType) {
      case 'text':
        if (content.text) {
          lines.push(content.text.replace(/<[^>]+>/g, '').trim());
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
