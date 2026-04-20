#!/usr/bin/env bun

import chalk from 'chalk';
import { fetchHtml } from '../core/fetcher';
import { extractInlineSvgs } from '../core/parser';
import { analyzeSvgs } from '../core/analyzer';
import { printIndividualAnalysis, printDuplicateAnalysis, printSummary } from './reporter';
import type { CliOptions } from '../core/types';

console.log(chalk.blue.bold('🔍 SVG Opti Detector script started.\n'));

/**
 * Parses command line arguments
 */
function parseCliArguments(): CliOptions | null {
  const args = process.argv.slice(2);
  const url = args.find(arg => !arg.startsWith('--'));

  if (!url) {
    console.error(chalk.red('Usage: bun run svg-opti-detector <url or file path> [options]'));
    console.error(chalk.gray('Options:'));
    console.error(chalk.gray('  --duplicates, -d        Show duplicate SVG analysis'));
    console.error(
      chalk.gray('  --sort-by-savings, -s   Sort SVGs by optimization potential (highest savings first)')
    );
    return null;
  }

  return {
    url,
    showDuplicates: args.includes('--duplicates') || args.includes('-d'),
    sortBySavings: args.includes('--sort-by-savings') || args.includes('-s')
  };
}

/**
 * Main application logic
 */
async function main(): Promise<void> {
  const startTime = Date.now();
  const options = parseCliArguments();

  if (!options) {
    process.exit(1);
  }

  try {
    const html = await fetchHtml(options.url, filePath => {
      console.log(chalk.green('Reading local file:'), filePath);
    });
    const svgs = extractInlineSvgs(html);
    console.log(chalk.cyan(`Found ${svgs.length} SVG(s) to analyze...\n`));

    if (svgs.length === 0) {
      console.log(chalk.yellow('No inline SVGs found.'));
      return;
    }

    const result = await analyzeSvgs(svgs, percent => {
      process.stdout.write(`\rProcessing SVGs... ${percent}%`);
    });

    if (svgs.length > 20) {
      process.stdout.write('\n');
    }

    printIndividualAnalysis(svgs, result, options.sortBySavings, options.showDuplicates);

    if (options.showDuplicates) {
      printDuplicateAnalysis(svgs, result);
    }

    const executionTime = Date.now() - startTime;
    printSummary(result, svgs.length, executionTime);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(chalk.red('Error:'), errorMessage);
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
