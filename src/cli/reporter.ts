import chalk from 'chalk';
import type { SvgData, AnalysisResult } from '../core/types';
import { formatBytes, generateIdentifier } from '../core/utils';

/**
 * Generates a chalk-styled identifier string for CLI terminal output.
 * Wraps the plain-text identifier in parens with gray chalk coloring.
 * Returns empty string when no attributes are present.
 */
function generateIdentifierStringStyled(attrs: Parameters<typeof generateIdentifier>[0]): string {
  const plain = generateIdentifier(attrs);
  return plain ? ` (${chalk.gray(plain)})` : '';
}

/**
 * Prints individual SVG analysis
 */
export function printIndividualAnalysis(
  svgs: SvgData[],
  result: AnalysisResult,
  sortBySavings: boolean,
  showDuplicates: boolean
): void {
  let displayOrder = Array.from({ length: svgs.length }, (_, i) => i);

  if (sortBySavings) {
    displayOrder.sort((a, b) => {
      const savingsA = result.svgStats[a].originalSize - result.svgStats[a].optimizedSize;
      const savingsB = result.svgStats[b].originalSize - result.svgStats[b].optimizedSize;
      const percentA =
        result.svgStats[a].originalSize > 0
          ? (savingsA / result.svgStats[a].originalSize) * 100
          : 0;
      const percentB =
        result.svgStats[b].originalSize > 0
          ? (savingsB / result.svgStats[b].originalSize) * 100
          : 0;

      if (Math.abs(percentA - percentB) > 0.1) {
        return percentB - percentA;
      }
      return savingsB - savingsA;
    });

    console.log('\n' + chalk.blue.bold('📋 INDIVIDUAL SVG ANALYSIS (Sorted by Optimization Potential)'));
  } else {
    console.log('\n' + chalk.blue.bold('📋 INDIVIDUAL SVG ANALYSIS'));
  }
  console.log('─'.repeat(50));

  const identifierStrings = svgs.map(svg => generateIdentifierStringStyled(svg.attributes));

  displayOrder.forEach(originalIdx => {
    const identifierStr = identifierStrings[originalIdx];
    const originalSize = result.svgStats[originalIdx].originalSize;
    const optimizedSize = result.svgStats[originalIdx].optimizedSize;
    const savings = originalSize - optimizedSize;
    const savingsPercent = originalSize > 0 ? ((savings / originalSize) * 100).toFixed(1) : '0';
    const isDuplicate = result.svgStats[originalIdx].isDuplicate;

    let statusColor = chalk.green;
    let statusIcon = '✅';

    if (parseFloat(savingsPercent) >= 20) {
      statusColor = chalk.red;
      statusIcon = '🔴';
    } else if (parseFloat(savingsPercent) >= 10) {
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
}

/**
 * Prints duplicate analysis
 */
export function printDuplicateAnalysis(svgs: SvgData[], result: AnalysisResult): void {
  if (Object.keys(result.duplicates).length === 0) {
    return;
  }

  console.log(chalk.red.bold('⚠️  DUPLICATE SVGs DETECTED'));
  console.log('─'.repeat(50));

  let totalDuplicateSavings = 0;
  let totalDuplicateOptimizedSavings = 0;
  let duplicateGroupCount = 0;

  for (const [, indices] of Object.entries(result.duplicates)) {
    duplicateGroupCount++;

    const duplicateClasses = indices.map(idx => {
      const svgClass = svgs[idx].attributes.class;
      return svgClass ? `"${svgClass}"` : 'no class';
    });

    const uniqueClasses = [...new Set(duplicateClasses)];
    const groupIdentifier =
      uniqueClasses.length === 1 ? uniqueClasses[0] : uniqueClasses.join(', ');

    const duplicatesToRemove = indices.slice(1);
    const originalSavingsFromDuplicates = duplicatesToRemove.reduce(
      (sum, idx) => sum + result.svgStats[idx].originalSize,
      0
    );
    const optimizedSavingsFromDuplicates = duplicatesToRemove.reduce(
      (sum, idx) => sum + result.svgStats[idx].optimizedSize,
      0
    );

    totalDuplicateSavings += originalSavingsFromDuplicates;
    totalDuplicateOptimizedSavings += optimizedSavingsFromDuplicates;

    console.log(`${chalk.red('●')} ${chalk.bold(`Group ${duplicateGroupCount}:`)} ${groupIdentifier}`);
    console.log(`   Found at indices: [${chalk.yellow(indices.join(', '))}]`);
    console.log(
      `   Occurrences: ${chalk.cyan(indices.length)} (${chalk.red(duplicatesToRemove.length)} duplicates)`
    );
    console.log(`   Potential savings: ${chalk.green(formatBytes(optimizedSavingsFromDuplicates))}`);
    console.log('');
  }

  console.log(chalk.yellow.bold('💡 DUPLICATE REMOVAL SUMMARY'));
  console.log('─'.repeat(35));
  console.log(`${chalk.cyan('Duplicate groups found:')} ${duplicateGroupCount}`);
  console.log(
    `${chalk.cyan('Total duplicates to remove:')} ${Object.values(result.duplicates).reduce(
      (sum, indices) => sum + (indices.length - 1),
      0
    )}`
  );
  console.log('');

  console.log(chalk.white.bold('📈 DEDUPLICATION SCENARIOS:'));
  console.log(
    `${chalk.gray('Original total size (baseline):')} ${formatBytes(result.totalOriginalSize)}`
  );
  console.log('');

  const sizeAfterDeduplicationOnly = result.totalOriginalSize - totalDuplicateSavings;
  const sizeAfterOptimizationAndDeduplication =
    result.totalOptimizedSize - totalDuplicateOptimizedSavings;

  console.log(`${chalk.blue('Scenario 1 - Deduplication only (no optimization):')}`);
  console.log(`   Total size after deduplication: ${formatBytes(sizeAfterDeduplicationOnly)}`);
  console.log(`   Savings from deduplication: ${formatBytes(totalDuplicateSavings)}`);
  console.log('');

  console.log(`${chalk.blue('Scenario 2 - Deduplication + optimization:')}`);
  console.log(
    `   Total size after both optimizations: ${formatBytes(sizeAfterOptimizationAndDeduplication)}`
  );
  console.log(`   Savings from deduplication: ${formatBytes(totalDuplicateOptimizedSavings)}`);
  console.log('');

  const totalSavings = result.totalOriginalSize - result.totalOptimizedSize;
  const combinedSavings = totalSavings + totalDuplicateOptimizedSavings;
  const finalOptimizedSize = result.totalOptimizedSize - totalDuplicateOptimizedSavings;
  const combinedSavingsPercent = ((combinedSavings / result.totalOriginalSize) * 100).toFixed(1);

  console.log(chalk.green.bold('🎯 MAXIMUM SAVINGS POTENTIAL:'));
  console.log(
    `${chalk.green('Combined savings (optimization + deduplication):')} ${formatBytes(combinedSavings)} (${combinedSavingsPercent}%)`
  );
  console.log(
    `${chalk.green('Final optimized & deduplicated size:')} ${formatBytes(finalOptimizedSize)}`
  );
  console.log('');
}

/**
 * Prints summary statistics
 */
export function printSummary(
  result: AnalysisResult,
  svgCount: number,
  executionTime: number
): void {
  console.log(chalk.blue.bold('📊 ANALYSIS RESULTS'));
  console.log('─'.repeat(50));
  console.log(chalk.cyan(`Total SVGs found: ${svgCount}`));
  console.log(chalk.cyan(`Total original size: ${formatBytes(result.totalOriginalSize)}`));
  console.log(chalk.cyan(`Total optimized size: ${formatBytes(result.totalOptimizedSize)}`));

  const totalSavings = result.totalOriginalSize - result.totalOptimizedSize;
  const totalSavingsPercent = ((totalSavings / result.totalOriginalSize) * 100).toFixed(1);

  if (totalSavings > 0) {
    console.log(
      chalk.green(`Total potential savings: ${formatBytes(totalSavings)} (${totalSavingsPercent}%)`)
    );
  }

  console.log(chalk.gray(`\nExecution time: ${executionTime}ms`));
}
