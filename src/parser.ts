import { load } from 'cheerio';
import type { SvgData } from './types';

/**
 * Extracts inline SVGs from HTML
 * @param html - HTML content
 * @returns Array of SVG data
 */
export function extractInlineSvgs(html: string): SvgData[] {
  const $ = load(html, {
    // Performance optimization: Disable unnecessary parsing features
    xmlMode: false,
    decodeEntities: false,
    lowerCaseAttributeNames: false
  });
  
  const svgs: SvgData[] = [];
  const svgElements = $('svg');
  
  // Performance optimization: Use faster iteration
  for (let i = 0; i < svgElements.length; i++) {
    const el = svgElements[i];
    const $el = $(el);
    const svgHtml = $.html(el);
    
    // Extract identifying attributes
    const attributes = {
      class: $el.attr('class') || null,
      id: $el.attr('id') || null,
      width: $el.attr('width') || null,
      height: $el.attr('height') || null,
      viewBox: $el.attr('viewBox') || null
    };
    
    svgs.push({
      html: svgHtml,
      attributes: attributes
    });
  }
  
  return svgs;
}
