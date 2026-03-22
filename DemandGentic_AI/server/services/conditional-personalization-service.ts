// File: server/services/conditional-personalization-service.ts
// Conditional Personalization Engine

interface Condition {
  field: string;
  operator: '==' | '!=' | '>' | ';
    else?: BlockContent;
  };
}

interface BlockContent {
  type: 'text' | 'image' | 'button' | 'cta';
  text?: string;
  imageUrl?: string;
  buttonText?: string;
  buttonUrl?: string;
  style?: Record;
}

// Parser for conditional syntax
export class ConditionalParser {
  private static readonly CONDITION_REGEX =
    /\{\{if\s+(.+?)\}\}([\s\S]*?)(?:\{\{elseif\s+(.+?)\}\}([\s\S]*?))*(?:\{\{else\}\}([\s\S]*?))?(?:\{\{endif\}\})/g;

  static parse(htmlContent: string): Array {
    const results: any[] = [];
    let match;

    while ((match = this.CONDITION_REGEX.exec(htmlContent)) !== null) {
      const original = match[0];
      const condition = this.parseCondition(match[1]);
      const ifContent = match[2].trim();
      const elseContent = match[5]?.trim();

      const block: ConditionalBlock = {
        id: `cond_${Date.now()}_${Math.random()}`,
        type: 'text',
        conditions: [condition],
        content: {
          if: { type: 'text', text: ifContent },
          else: elseContent ? { type: 'text', text: elseContent } : undefined,
        },
      };

      results.push({ original, parsed: block });
    }

    return results;
  }

  private static parseCondition(condStr: string): Condition {
    // Examples: "company == 'Acme'", "age > 30", "email contains 'gmail'"
    const match = condStr.match(
      /(\w+)\s*(==|!=|>|): boolean {
    const fieldValue = this.getNestedValue(contact, condition.field);

    switch (condition.operator) {
      case '==':
        return fieldValue === condition.value;
      case '!=':
        return fieldValue !== condition.value;
      case '>':
        return Number(fieldValue) > Number(condition.value);
      case ' v.trim());
        return values.includes(fieldValue);
      default:
        return false;
    }
  }

  private static getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }

  static evaluateMultiple(
    conditions: Condition[],
    contact: Record,
    operator: 'AND' | 'OR' = 'AND'
  ): boolean {
    if (operator === 'AND') {
      return conditions.every(cond => this.evaluate(cond, contact));
    } else {
      return conditions.some(cond => this.evaluate(cond, contact));
    }
  }
}

// Conditional block renderer
export class ConditionalRenderer {
  static renderBlock(
    block: ConditionalBlock,
    contact: Record
  ): BlockContent | null {
    // Evaluate main condition
    if (this.evaluateConditions(block.conditions, contact)) {
      return block.content.if;
    }

    // Evaluate else-if conditions
    if (block.content.elseif) {
      for (const elseifClause of block.content.elseif) {
        if (this.evaluateConditions([elseifClause.condition], contact)) {
          return elseifClause.content;
        }
      }
    }

    // Default to else
    return block.content.else || null;
  }

  private static evaluateConditions(
    conditions: Condition[],
    contact: Record
  ): boolean {
    return conditions.every(cond => ConditionEvaluator.evaluate(cond, contact));
  }

  static renderHTML(
    block: ConditionalBlock,
    contact: Record
  ): string {
    const content = this.renderBlock(block, contact);
    if (!content) return '';

    switch (content.type) {
      case 'text':
        return content.text || '';
      case 'image':
        return ``;
      case 'button':
      case 'cta':
        return `${content.buttonText}`;
      default:
        return '';
    }
  }

  private static styleToString(style?: Record): string {
    if (!style) return '';
    return Object.entries(style)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
  }
}

// Email content processor
export class ConditionalContentProcessor {
  static processEmail(
    htmlContent: string,
    contact: Record
  ): string {
    let result = htmlContent;

    // Parse conditional blocks
    const blocks = ConditionalParser.parse(htmlContent);

    for (const { original, parsed } of blocks) {
      const rendered = ConditionalRenderer.renderHTML(parsed, contact);
      result = result.replace(original, rendered);
    }

    // Process personalization tokens
    result = this.processTokens(result, contact);

    return result;
  }

  private static processTokens(
    html: string,
    contact: Record
  ): string {
    return html.replace(/\{\{(\w+)\}\}/g, (match, field) => {
      return String(contact[field] || match);
    });
  }

  static validateContent(htmlContent: string): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check for balanced if/endif
    const ifCount = (htmlContent.match(/\{\{if\s/g) || []).length;
    const endifCount = (htmlContent.match(/\{\{endif\}\}/g) || []).length;

    if (ifCount !== endifCount) {
      errors.push(
        `Unbalanced conditional blocks: ${ifCount} if(s) vs ${endifCount} endif(s)`
      );
    }

    // Try to parse blocks
    try {
      ConditionalParser.parse(htmlContent);
    } catch (err: any) {
      errors.push(`Parse error: ${err.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Block management
export class ConditionalBlockManager {
  private blocks: Map = new Map();

  addBlock(block: ConditionalBlock): string {
    const id = block.id || `block_${Date.now()}`;
    this.blocks.set(id, block);
    return id;
  }

  getBlock(id: string): ConditionalBlock | undefined {
    return this.blocks.get(id);
  }

  updateBlock(id: string, updates: Partial): void {
    const block = this.blocks.get(id);
    if (block) {
      this.blocks.set(id, { ...block, ...updates });
    }
  }

  deleteBlock(id: string): boolean {
    return this.blocks.delete(id);
  }

  getAllBlocks(): ConditionalBlock[] {
    return Array.from(this.blocks.values());
  }

  duplicateBlock(id: string): ConditionalBlock | null {
    const block = this.blocks.get(id);
    if (!block) return null;

    const newBlock = {
      ...block,
      id: `block_${Date.now()}`,
    };

    this.blocks.set(newBlock.id, newBlock);
    return newBlock;
  }

  exportBlocks(): Record {
    const result: Record = {};
    this.blocks.forEach((block, id) => {
      result[id] = block;
    });
    return result;
  }

  importBlocks(blocksData: Record): void {
    Object.entries(blocksData).forEach(([id, block]) => {
      this.blocks.set(id, block);
    });
  }
}

// Example usage
export function createExampleConditionalEmail() {
  return `
    Welcome {{firstName}}!
    
    {{if company == 'Acme'}}
    Special offer for Acme employees: 30% off
    {{elseif company == 'TechCorp'}}
    TechCorp exclusive: 25% discount
    {{else}}
    General offer: 15% off
    {{endif}}
    
    {{if premium_member == true}}
    Thank you for being a premium member!
    {{endif}}
    
    {{if country contains 'US'}}
    Free shipping in the US!
    {{endif}}
  `;
}