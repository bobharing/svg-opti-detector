import { load } from 'cheerio';
import type { SvgData } from './types';

/**
 * Extracts inline SVGs from HTML
 * @param html - HTML content
 * @returns Array of SVG data
 */
export function extractInlineSvgs(html: string): SvgData[] {
  const $ = load(html, {
    xmlMode: false,
    decodeEntities: false,
    lowerCaseAttributeNames: false
  });

  const svgs: SvgData[] = [];
  const svgElements = $('svg');

  for (let i = 0; i < svgElements.length; i++) {
    const el = svgElements[i];
    const $el = $(el);
    const svgHtml = $.html(el);

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
