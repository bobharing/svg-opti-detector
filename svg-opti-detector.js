#!/usr/bin/env bun

import { load } from 'cheerio';
import { optimize } from 'svgo';
import chalk from 'chalk';

// Performance optimization: Pre-configure SVGO with common optimizations
const svgoConfig = {
  multipass: true,
  plugins: [
    'preset-default',
    'removeDimensions',
    'removeComments',
    'removeMetadata',
    'removeEditorsNSData'
  ]
};

console.log(chalk.blue.bold('🔍 SVG Opti Detector script started.\n'));

/**
 * Fetches HTML from a URL or local file path
 * @param {string} input - URL or file path
 * @returns {Promise<string>} HTML content
 */
async function fetchHtml(input) {
  // Improved detection: treat anything not starting with http:// or https:// as a file
  if (/^https?:\/\//i.test(input)) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text();
  } else {
    // Support file:// and direct file paths
    let filePath = input;
    if (filePath.startsWith('file://')) {
      filePath = filePath.replace('file://', '');
    }
    // Use Bun's native path resolution
    filePath = Bun.resolveSync(filePath, process.cwd());
    console.log(chalk.green('Reading local file:'), filePath);
    return await Bun.file(filePath).text();
  }
}

/**
 * @typedef {Object} SvgAttributes
 * @property {string|null} class
 * @property {string|null} id
 * @property {string|null} width
 * @property {string|null} height
 * @property {string|null} viewBox
 */

/**
 * @typedef {Object} SvgData
 * @property {string} html
 * @property {SvgAttributes} attributes
 */

/**
 * Extracts inline SVGs from HTML
 * @param {string} html - HTML content
 * @returns {SvgData[]} Array of SVG data
 */
function extractInlineSvgs(html) {
  const $ = load(html, {
    // Performance optimization: Disable unnecessary parsing features
    xmlMode: false,
    decodeEntities: false,
    lowerCaseAttributeNames: false
  });
  
  const svgs = [];
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

// Performance optimization: Use Bun's faster hashing
/**
 * Generates a hash for an SVG, ignoring class attributes
 * @param {string} svg - SVG HTML string
 * @returns {string} MD5 hash
 */
function hashSvg(svg) {
  // Normalize SVG content by removing class attributes for duplicate detection
  // This allows identical SVGs with different classes to be detected as duplicates
  const normalizedSvg = svg.replace(/\s+class="[^"]*"/g, '').replace(/\s+class='[^']*'/g, '');
  const hasher = new Bun.CryptoHasher('md5');
  hasher.update(normalizedSvg);
  return hasher.digest('hex');
}

// Performance optimization: Process SVGs in parallel with controlled concurrency
/**
 * @typedef {Object} SvgProcessResult
 * @property {number} index
 * @property {number} originalSize
 * @property {number} optimizedSize
 * @property {string} hash
 * @property {boolean} isDuplicate
 */

/**
 * Process a batch of SVGs in parallel
 * @param {SvgData[]} svgBatch - Batch of SVGs to process
 * @param {number} startIndex - Starting index for this batch
 * @returns {Promise<SvgProcessResult[]>} Processing results
 */
async function processSvgBatch(svgBatch, startIndex) {
  const encoder = new TextEncoder();
  return await Promise.all(
    svgBatch.map(async (svg, batchIndex) => {
      const index = startIndex + batchIndex;
      const originalSize = encoder.encode(svg.html).length;
      
      try {
        const optimized = optimize(svg.html, svgoConfig);
        const optimizedSize = encoder.encode(optimized.data).length;
        const hash = hashSvg(svg.html);
        
        return {
          index,
          originalSize,
          optimizedSize,
          hash,
          isDuplicate: false
        };
      } catch (error) {
        // Fallback if optimization fails
        console.warn(`Warning: Failed to optimize SVG #${index}: ${error.message}`);
        return {
          index,
          originalSize,
          optimizedSize: originalSize,
          hash: hashSvg(svg.html),
          isDuplicate: false
        };
      }
    })
  );
}

/**
 * @typedef {Object} AnalysisResult
 * @property {number} totalOriginalSize
 * @property {number} totalOptimizedSize
 * @property {SvgProcessResult[]} svgStats
 * @property {Object.<string, number[]>} duplicates
 */

/**
 * Analyzes a collection of SVGs for optimization and duplicates
 * @param {SvgData[]} svgs - Array of SVG data
 * @returns {Promise<AnalysisResult>} Analysis results
 */
async function analyzeSvgs(svgs) {
  let totalOriginalSize = 0;
  let totalOptimizedSize = 0;
  const svgStats = [];
  const hashMap = new Map(); // Performance optimization: Use Map instead of object
  const duplicates = {};
  
  // Performance optimization: Process SVGs in batches of 50 (Bun handles concurrency better than Node)
  const batchSize = 50;
  const batches = [];
  
  for (let i = 0; i < svgs.length; i += batchSize) {
    batches.push(svgs.slice(i, i + batchSize));
  }
  
  // Process batches sequentially to avoid overwhelming the system
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const startIndex = batchIndex * batchSize;
    
    const batchResults = await processSvgBatch(batch, startIndex);
    
    // Process results and detect duplicates
    batchResults.forEach(result => {
      totalOriginalSize += result.originalSize;
      totalOptimizedSize += result.optimizedSize;
      
      // Early duplicate detection
      if (hashMap.has(result.hash)) {
        result.isDuplicate = true;
        if (!duplicates[result.hash]) {
          duplicates[result.hash] = [hashMap.get(result.hash)];
        }
        duplicates[result.hash].push(result.index);
      } else {
        hashMap.set(result.hash, result.index);
      }
      
      svgStats.push(result);
    });
    
    // Progress indicator for large datasets
    if (svgs.length > 20) {
      const progress = Math.round(((batchIndex + 1) / batches.length) * 100);
      process.stdout.write(`\rProcessing SVGs... ${progress}%`);
    }
  }
  
  if (svgs.length > 20) {
    process.stdout.write('\n');
  }
  
  return {
    totalOriginalSize,
    totalOptimizedSize,
    svgStats,
    duplicates
  };
}

// Performance optimization: Cache attribute string generation
/**
 * Generates an identifier string from SVG attributes
 * @param {SvgAttributes} attrs - SVG attributes
 * @returns {string} Formatted identifier string
 */
function generateIdentifierString(attrs) {
  const identifiers = [];
  
  if (attrs.class) identifiers.push(`class="${attrs.class}"`);
  if (attrs.id) identifiers.push(`id="${attrs.id}"`);
  if (attrs.width) identifiers.push(`width="${attrs.width}"`);
  if (attrs.height) identifiers.push(`height="${attrs.height}"`);
  if (attrs.viewBox) identifiers.push(`viewBox="${attrs.viewBox}"`);
  
  return identifiers.length > 0 ? ` (${chalk.gray(identifiers.join(', '))})` : '';
}

// Helper function to format bytes with appropriate units
/**
 * Formats byte count into human-readable string
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string (e.g., "1.50 KB (1536 bytes)")
 */
function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB (${bytes} bytes)`;
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB (${bytes} bytes)`;
  }
  return `${bytes} bytes`;
}

async function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const url = args.find(arg => !arg.startsWith('--'));
  const showDuplicates = args.includes('--duplicates') || args.includes('-d');
  const sortBySavings = args.includes('--sort-by-savings') || args.includes('-s');
  
  if (!url) {
    console.error(chalk.red('Usage: node svg-opti-detector.js <url or file path> [options]'));
    console.error(chalk.gray('Options:'));
    console.error(chalk.gray('  --duplicates, -d        Show duplicate SVG analysis'));
    console.error(chalk.gray('  --sort-by-savings, -s   Sort SVGs by optimization potential (highest savings first)'));
    process.exit(1);
  }
  
  try {
    const html = await fetchHtml(url);
    const svgs = extractInlineSvgs(html);
    console.log(chalk.cyan(`Found ${svgs.length} SVG(s) to analyze...\n`));
    
    if (svgs.length === 0) {
      console.log(chalk.yellow('No inline SVGs found.'));
      return;
    }
    
    const result = await analyzeSvgs(svgs);
    
    // Create sorted indices if sorting is requested
    let displayOrder = Array.from({length: svgs.length}, (_, i) => i);
    
    if (sortBySavings) {
      displayOrder.sort((a, b) => {
        const savingsA = result.svgStats[a].originalSize - result.svgStats[a].optimizedSize;
        const savingsB = result.svgStats[b].originalSize - result.svgStats[b].optimizedSize;
        const percentA = result.svgStats[a].originalSize > 0 ? (savingsA / result.svgStats[a].originalSize) * 100 : 0;
        const percentB = result.svgStats[b].originalSize > 0 ? (savingsB / result.svgStats[b].originalSize) * 100 : 0;
        
        // Sort by percentage savings first, then by absolute savings
        if (Math.abs(percentA - percentB) > 0.1) {
          return percentB - percentA; // Higher percentage first
        }
        return savingsB - savingsA; // Higher absolute savings first
      });
      
      console.log('\n' + chalk.blue.bold('📋 INDIVIDUAL SVG ANALYSIS (Sorted by Optimization Potential)'));
    } else {
      console.log('\n' + chalk.blue.bold('📋 INDIVIDUAL SVG ANALYSIS'));
    }
    console.log('─'.repeat(50));
    
    // Performance optimization: Pre-calculate all identifier strings
    const identifierStrings = svgs.map(svg => generateIdentifierString(svg.attributes));
    
    displayOrder.forEach((originalIdx) => {
      const identifierStr = identifierStrings[originalIdx];
      const originalSize = result.svgStats[originalIdx].originalSize;
      const optimizedSize = result.svgStats[originalIdx].optimizedSize;
      const savings = originalSize - optimizedSize;
      const savingsPercent = originalSize > 0 ? ((savings / originalSize) * 100).toFixed(1) : 0;
      const isDuplicate = result.svgStats[originalIdx].isDuplicate;
      
      // Color coding based on optimization potential
      let statusColor = chalk.green;
      let statusIcon = '✅';
      
      if (savingsPercent >= 20) {
        statusColor = chalk.red;
        statusIcon = '🔴';
      } else if (savingsPercent >= 10) {
        statusColor = chalk.yellow;
        statusIcon = '🟡';
      }
      
      const duplicateStr = showDuplicates && isDuplicate ? chalk.red(' [DUPLICATE]') : '';
      const originalIndexStr = sortBySavings ? chalk.gray(` [Original #${originalIdx}]`) : '';
      
      console.log(`${statusIcon} SVG #${originalIdx}${identifierStr}${duplicateStr}${originalIndexStr}`);
      console.log(`   Original: ${formatBytes(originalSize)} | Optimized: ${formatBytes(optimizedSize)}`);
      console.log(`   ${statusColor(`Savings: ${formatBytes(savings)}`)}`);
      console.log('');
    });
    
    if (showDuplicates && Object.keys(result.duplicates).length > 0) {
      console.log(chalk.red.bold('⚠️  DUPLICATE SVGs DETECTED'));
      console.log('─'.repeat(50));
      
      let totalDuplicateSavings = 0;
      let totalDuplicateOptimizedSavings = 0;
      let duplicateGroupCount = 0;
      
      for (const [, indices] of Object.entries(result.duplicates)) {
        duplicateGroupCount++;
        
        // Get classes for the duplicate group
        const duplicateClasses = indices.map(idx => {
          const svgClass = svgs[idx].attributes.class;
          return svgClass ? `"${svgClass}"` : 'no class';
        });
        
        // Use the first class as the group identifier, or show unique classes
        const uniqueClasses = [...new Set(duplicateClasses)];
        const groupIdentifier = uniqueClasses.length === 1 
          ? uniqueClasses[0] 
          : uniqueClasses.join(', ');
        
        // Calculate savings from removing duplicates (keep first occurrence, remove others)
        const duplicatesToRemove = indices.slice(1);
        const originalSavingsFromDuplicates = duplicatesToRemove.reduce((sum, idx) => 
          sum + result.svgStats[idx].originalSize, 0);
        const optimizedSavingsFromDuplicates = duplicatesToRemove.reduce((sum, idx) => 
          sum + result.svgStats[idx].optimizedSize, 0);
        
        totalDuplicateSavings += originalSavingsFromDuplicates;
        totalDuplicateOptimizedSavings += optimizedSavingsFromDuplicates;
        
        // Show duplicate group info
        console.log(`${chalk.red('●')} ${chalk.bold(`Group ${duplicateGroupCount}:`)} ${groupIdentifier}`);
        console.log(`   Found at indices: [${chalk.yellow(indices.join(', '))}]`);
        console.log(`   Occurrences: ${chalk.cyan(indices.length)} (${chalk.red(duplicatesToRemove.length)} duplicates)`);
        console.log(`   Potential savings: ${chalk.green(formatBytes(optimizedSavingsFromDuplicates))}`);
        console.log('');
      }
      
      console.log(chalk.yellow.bold('💡 DUPLICATE REMOVAL SUMMARY'));
      console.log('─'.repeat(35));
      console.log(`${chalk.cyan('Duplicate groups found:')} ${duplicateGroupCount}`);
      console.log(`${chalk.cyan('Total duplicates to remove:')} ${Object.values(result.duplicates).reduce((sum, indices) => sum + (indices.length - 1), 0)}`);
      console.log('');
      
      // Show both scenarios clearly
      console.log(chalk.white.bold('📈 DEDUPLICATION SCENARIOS:'));
      console.log(`${chalk.gray('Original total size (baseline):')} ${formatBytes(result.totalOriginalSize)}`);
      console.log('');
      
      // Calculate sizes after deduplication for both scenarios
      const sizeAfterDeduplicationOnly = result.totalOriginalSize - totalDuplicateSavings;
      const sizeAfterOptimizationAndDeduplication = result.totalOptimizedSize - totalDuplicateOptimizedSavings;
      
      console.log(`${chalk.blue('Scenario 1 - Deduplication only (no optimization):')}`);
      console.log(`   Total size after deduplication: ${formatBytes(sizeAfterDeduplicationOnly)}`);
      console.log(`   Savings from deduplication: ${formatBytes(totalDuplicateSavings)}`);
      console.log('');
      
      console.log(`${chalk.blue('Scenario 2 - Deduplication + optimization:')}`);
      console.log(`   Total size after both optimizations: ${formatBytes(sizeAfterOptimizationAndDeduplication)}`);
      console.log(`   Savings from deduplication: ${formatBytes(totalDuplicateOptimizedSavings)}`);
      console.log('');
      
      // Calculate combined savings (optimization + duplicate removal)
      const totalSavings = result.totalOriginalSize - result.totalOptimizedSize;
      const combinedSavings = totalSavings + totalDuplicateOptimizedSavings;
      const finalOptimizedSize = result.totalOptimizedSize - totalDuplicateOptimizedSavings;
      const combinedSavingsPercent = ((combinedSavings / result.totalOriginalSize) * 100).toFixed(1);
      
      console.log(chalk.green.bold('🎯 MAXIMUM SAVINGS POTENTIAL:'));
      console.log(`${chalk.green('Combined savings (optimization + deduplication):')} ${formatBytes(combinedSavings)} (${combinedSavingsPercent}%)`);
      console.log(`${chalk.green('Final optimized & deduplicated size:')} ${formatBytes(finalOptimizedSize)}`);
      console.log('');
    }
    
    console.log(chalk.blue.bold('📊 ANALYSIS RESULTS'));
    console.log('─'.repeat(50));
    console.log(chalk.cyan(`Total SVGs found: ${svgs.length}`));
    console.log(chalk.cyan(`Total original size: ${formatBytes(result.totalOriginalSize)}`));
    console.log(chalk.cyan(`Total optimized size: ${formatBytes(result.totalOptimizedSize)}`));
    
    const totalSavings = result.totalOriginalSize - result.totalOptimizedSize;
    const totalSavingsPercent = ((totalSavings / result.totalOriginalSize) * 100).toFixed(1);
    
    if (totalSavings > 0) {
      console.log(chalk.green(`Total potential savings: ${formatBytes(totalSavings)} (${totalSavingsPercent}%)`));
    }
    
    // Performance timing
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    console.log(chalk.gray(`\nExecution time: ${executionTime}ms`));
    
  } catch (err) {
    console.error(chalk.red('Error:'), err.message);
  }
}

// Export functions for testing
export {
  fetchHtml,
  extractInlineSvgs,
  hashSvg,
  processSvgBatch,
  analyzeSvgs,
  generateIdentifierString,
  formatBytes,
  main
};

// Only run main if this file is executed directly
// Bun-specific main module detection
if (import.meta.main) {
  main().catch(console.error);
}
