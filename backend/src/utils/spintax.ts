/**
 * Parse and resolve spintax: {{RANDOM | option1 | option2 | option3}}
 * Also handles merge tags: {{firstName|fallback}}
 */

export function parseSpintax(text: string): string {
  // Handle RANDOM spintax: {{RANDOM | opt1 | opt2 | opt3}}
  const spintaxRegex = /\{\{RANDOM\s*\|(.*?)\}\}/gi;
  let result = text.replace(spintaxRegex, (match, options) => {
    const opts = options.split('|').map((o: string) => o.trim()).filter(Boolean);
    if (opts.length === 0) return '';
    return opts[Math.floor(Math.random() * opts.length)];
  });

  // Handle simple spintax: {opt1|opt2|opt3}
  const simpleSpintaxRegex = /\{([^{}]*?\|[^{}]*?)\}/g;
  result = result.replace(simpleSpintaxRegex, (match, options) => {
    const opts = options.split('|').map((o: string) => o.trim()).filter(Boolean);
    if (opts.length === 0) return '';
    return opts[Math.floor(Math.random() * opts.length)];
  });

  return result;
}

/**
 * Replace merge tags with lead data
 * Supports: {{variableName}} and {{variableName|fallback}}
 */
export function replaceMergeTags(
  text: string,
  data: Record<string, string | null | undefined>
): string {
  return text.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}/g, (match, key, fallback) => {
    // Skip RANDOM (handled by spintax)
    if (key === 'RANDOM') return match;

    const value = data[key] || data[key.toLowerCase()];
    if (value && value.trim()) return value;
    if (fallback !== undefined) return fallback;
    return '';
  });
}

/**
 * Process email content: first resolve merge tags, then spintax
 */
export function processEmailContent(
  text: string,
  leadData: Record<string, string | null | undefined>
): string {
  let result = replaceMergeTags(text, leadData);
  result = parseSpintax(result);
  return result;
}

/**
 * Generate preview of spintax (returns all possible variants)
 */
export function getSpintaxVariants(text: string, maxVariants: number = 5): string[] {
  const variants: string[] = [];
  for (let i = 0; i < maxVariants; i++) {
    variants.push(parseSpintax(text));
  }
  return [...new Set(variants)];
}
