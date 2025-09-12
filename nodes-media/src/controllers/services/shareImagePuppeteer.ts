import fs from 'fs';
import path from 'path';

import type { Request, Response } from 'express';
import { marked } from 'marked';
import puppeteer from 'puppeteer';

import { logger as parentLogger } from '../../logger.js';

const logger = parentLogger.child({ module: 'shareImagePuppeteer' });

// Supabase configuration - to be initialized if needed
let supabase: any = null;

// Initialize Supabase if environment variables are set
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  import('@supabase/supabase-js').then(({ createClient }) => {
    supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  }).catch(err => {
    logger.warn({ err }, 'Failed to initialize Supabase client');
  });
}

/**
 * Safely replaces all occurrences of a target string with a replacement string
 * without using dynamic regular expressions, preventing ReDoS vulnerabilities.
 */
function replaceAllSafe(text: string, target: string, replacement: string): string {
  if (!text || !target) return text;

  let result = text;
  let index = 0;

  while ((index = result.indexOf(target, index)) !== -1) {
    result = result.substring(0, index) + replacement + result.substring(index + target.length);
    index += replacement.length;
  }

  return result;
}

/**
 * Custom error to indicate that SVG fallback is needed
 */
class PuppeteerFallbackError extends Error {
  constructor(
    message: string,
    public originalError: Error,
  ) {
    super(message);
    this.name = 'PuppeteerFallbackError';
  }
}

interface Citation {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  doi: string;
  url: string;
  journal?: string;
}

interface ShareImageData {
  text: string;
  answer?: string;
  citations: Citation[];
  refs: number;
}

interface ShareImageQuery {
  text?: string;
  id?: string;
  refs?: string;
  answer?: string;
  citations?: string;
}

/**
 * Capitalizes journal names following title case rules
 */
function capitalizeExceptArticles(text: string): string {
  if (!text) return text;

  const cleanText = text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0]/g, ' ')
    .replace(/[\u2000-\u206F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const articlesAndPrepositions = [
    'a',
    'an',
    'the',
    'of',
    'in',
    'on',
    'at',
    'to',
    'for',
    'and',
    'or',
    'but',
    'with',
    'by',
    'from',
  ];

  let result = cleanText.toLowerCase();
  let isFirstWord = true;

  result = result.replace(/\b\w+\b/g, (match) => {
    if (isFirstWord) {
      isFirstWord = false;
      return match.charAt(0).toUpperCase() + match.slice(1);
    }
    if (!articlesAndPrepositions.includes(match)) {
      return match.charAt(0).toUpperCase() + match.slice(1);
    }
    return match;
  });

  return result;
}

/**
 * Formats citation for display
 */
function formatCitation(citation: Citation, index: number) {
  const authors = citation.authors
    ? citation.authors
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a.length > 0) // Remove empty entries
        .slice(0, 3)
        .join(', ') + (citation.authors.split(',').length > 3 ? ', et al.' : '')
    : 'Unknown Author';

  const year = citation.year ? ` (${citation.year})` : '';
  const journal = citation.journal ? ` ${capitalizeExceptArticles(citation.journal)}.` : '';

  const title = citation.title || 'Untitled';

  const metadata = `${authors}${year}.${journal}`;

  return {
    number: index,
    title,
    metadata,
  };
}

/**
 * Processes answer text and converts complex citations to simple numbered ones
 */
function processAnswerWithCitations(answer: string): { processedAnswer: string; citationMap: Map<string, number> } {
  if (!answer) return { processedAnswer: '', citationMap: new Map() };

  let processedAnswer = answer;
  const citationMap = new Map<string, number>();

  // Find all citation patterns
  const citationPattern = /\[([^\]]+)\]/g;
  const foundCitations = [...answer.matchAll(citationPattern)];

  // Create mapping from complex citations to simple indexes
  foundCitations.forEach((match) => {
    const fullCitation = match[1];
    if (!citationMap.has(fullCitation)) {
      citationMap.set(fullCitation, citationMap.size + 1);
    }
  });

  // Replace complex citations with simple numbered ones using safe string replacement
  citationMap.forEach((index, citation) => {
    const targetPattern = `[${citation}]`;
    const replacement = `<sup class="citation">[${index}]</sup>`;
    processedAnswer = replaceAllSafe(processedAnswer, targetPattern, replacement);
  });

  return { processedAnswer, citationMap };
}

/**
 * Extracts citation identifiers from answer text and filters citations to only referenced ones
 */
function getReferencedCitations(answer: string, citations: Citation[]): any[] {
  if (!answer || !citations.length) return [];

  // Extract all citation patterns from the answer
  const citationPattern = /\[([^\]]+)\]/g;
  const foundCitations = [...answer.matchAll(citationPattern)];

  if (foundCitations.length === 0) return [];

  const referencedCitations: any[] = [];
  const usedNumbers = new Set<number>();

  // For each citation found in the answer
  foundCitations.forEach((match) => {
    const citationText = match[1].trim();

    // Check if it's a simple number (like [1], [2], etc.)
    const numberMatch = citationText.match(/^\d+$/);
    if (numberMatch) {
      const citationIndex = parseInt(numberMatch[0], 10) - 1; // Convert to 0-based index
      if (citationIndex >= 0 && citationIndex < citations.length && !usedNumbers.has(citationIndex)) {
        referencedCitations.push(formatCitation(citations[citationIndex], parseInt(numberMatch[0], 10)));
        usedNumbers.add(citationIndex);
      }
      return;
    }

    // For more complex citations, try to match by content
    let bestMatch: Citation | null = null;
    let bestMatchIndex = -1;

    citations.forEach((citation, index) => {
      if (usedNumbers.has(index)) return; // Skip already used citations

      // Try to match by DOI
      if (citation.doi && citationText.includes(citation.doi)) {
        bestMatch = citation;
        bestMatchIndex = index;
        return;
      }

      // Try to match by title (partial match)
      if (
        citation.title &&
        (citationText.includes(citation.title) ||
          citation.title.includes(citationText) ||
          // Normalized comparison
          citation.title
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .includes(citationText.toLowerCase().replace(/[^\w\s]/g, '')))
      ) {
        bestMatch = citation;
        bestMatchIndex = index;
        return;
      }

      // Try to match by authors
      if (citation.authors && citationText.includes(citation.authors)) {
        bestMatch = citation;
        bestMatchIndex = index;
        return;
      }
    });

    // If we found a match, add it
    if (bestMatch && bestMatchIndex !== -1) {
      referencedCitations.push(formatCitation(bestMatch, referencedCitations.length + 1));
      usedNumbers.add(bestMatchIndex);
    }
  });

  // Limit to 3 citations for display
  return referencedCitations.slice(0, 3);
}

/**
 * Configures marked for proper markdown rendering
 */
function configureMarkdown() {
  // Configure marked for proper HTML rendering
  marked.setOptions({
    breaks: true,
    gfm: true,
  });
}

/**
 * Simple markdown processing that handles basic formatting (without citation processing)
 */
function processSimpleMarkdownToHTML(text: string): string {
  if (!text) return '';

  // Simple markdown replacements for basic formatting
  const html = text
    // Headers
    .replace(/^### (.*$)/gm, '<h3 class="heading-3">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="heading-2">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 class="heading-1">$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong class="answer-bold">$1</strong>')
    .replace(/__(.*?)__/g, '<strong class="answer-bold">$1</strong>')
    // Lists (simple)
    .replace(/^[\s]*[-*]\s+(.*$)/gm, '<li class="answer-list-item">$1</li>')
    // Wrap list items in ul
    .replace(/(<li class="answer-list-item">.*<\/li>)/gs, '<ul class="answer-list">$1</ul>')
    // Paragraphs (split by double newlines)
    .split('\n\n')
    .map((paragraph) => {
      paragraph = paragraph.trim();
      if (!paragraph) return '';
      if (paragraph.includes('<h') || paragraph.includes('<ul') || paragraph.includes('<li')) {
        return paragraph;
      }
      return `<p class="answer-paragraph">${paragraph}</p>`;
    })
    .join('\n');

  return html;
}

/**
 * Simple markdown processing that handles basic formatting (with citation processing)
 */
function processMarkdownToHTML(text: string): string {
  if (!text) return '';

  // First process citations
  const { processedAnswer } = processAnswerWithCitations(text);

  // Then process markdown
  return processSimpleMarkdownToHTML(processedAnswer);
}

/**
 * Loads the background image as base64 for embedding in HTML
 */
function loadBackgroundImageAsBase64(): string {
  const possiblePaths = [
    path.join(process.cwd(), 'public', 'ai-share-blank.png'),
    path.join(__dirname, '..', '..', 'public', 'ai-share-blank.png'),
    path.join(__dirname, '..', '..', '..', 'public', 'ai-share-blank.png'),
    './public/ai-share-blank.png',
    'public/ai-share-blank.png',
  ];

  for (const templatePath of possiblePaths) {
    if (fs.existsSync(templatePath)) {
      const imageBuffer = fs.readFileSync(templatePath);
      return `data:image/png;base64,${imageBuffer.toString('base64')}`;
    }
  }

  // Fallback to gradient if image not found
  return '';
}

/**
 * Generates HTML template for share image
 */
function generateHTML(data: ShareImageData): string {
  configureMarkdown();

  // Extract only the citations that are actually referenced in the answer
  const formattedCitations = getReferencedCitations(data.answer || '', data.citations);

  // Process answer with citations and convert to HTML
  const answerHTML = processMarkdownToHTML(data.answer || '');

  // Determine how many citations to guarantee space for (limit to 3 for display)
  const guaranteedCitations = Math.max(2, Math.min(formattedCitations.length, 3));

  // Load background image
  const backgroundImage = loadBackgroundImageAsBase64();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DeSci Omni Share</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            width: 1536px;
            height: 1024px;
            background-image: url('${backgroundImage}');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            font-family: 'Arial', 'Helvetica', sans-serif;
            color: #ffffff;
            padding: 80px 80px 140px 80px; /* Extra bottom padding to avoid background text */
            display: flex;
            flex-direction: column;
            position: relative;
            overflow: hidden;
        }

        .header {
            display: none;
        }



        .content {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0; /* Enable flex shrinking */
            margin-top: 120px; /* Add top margin since header is hidden */
        }

        .question {
            font-size: 68px;
            font-weight: bold;
            line-height: 1.2;
            margin-bottom: 40px;
            color: #ffffff;
            flex-shrink: 0;
            max-height: 380px;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 4;
            -webkit-box-orient: vertical;
        }

        .answer {
            flex: 1;
            font-size: 32px;
            line-height: 1.5;
            color: #e2e8f0;
            margin-bottom: 40px;
            overflow: hidden;
            position: relative;
            min-height: 0;
        }

        .answer-content {
            height: 100%;
            overflow: hidden;
            position: relative;
            /* Fade out the text itself using a mask */
            -webkit-mask: linear-gradient(to bottom, black 70%, transparent 100%);
            mask: linear-gradient(to bottom, black 70%, transparent 100%);
        }

        /* Markdown styling */
        .answer h1, .answer h2, .answer h3, .answer h4, .answer h5, .answer h6 {
            color: #ffffff;
            margin: 16px 0 12px 0;
            font-weight: 600;
        }

        .answer .heading-1 { font-size: 46px; }
        .answer .heading-2 { font-size: 40px; }
        .answer .heading-3 { font-size: 34px; }
        .answer .heading-4 { font-size: 28px; }
        .answer .heading-5 { font-size: 26px; }
        .answer .heading-6 { font-size: 22px; }

        .answer .answer-paragraph {
            margin-bottom: 16px;
        }

        .answer .answer-bold {
            font-weight: 700;
            color: #ffffff;
        }

        .answer .answer-list {
            margin: 16px 0;
            padding-left: 24px;
        }

        .answer .answer-list-item {
            margin-bottom: 8px;
        }

        .answer .citation {
            color: #64a7ff;
            font-weight: bold;
            font-size: 22px;
            text-decoration: none;
            margin-left: 2px;
        }

        .references {
            flex-shrink: 0;
            max-height: ${guaranteedCitations * 80 + 60}px; /* Dynamic based on guaranteed citations */
        }

        .references-header {
            font-size: 34px;
            font-weight: 600;
            color: #94a3b8;
            margin-bottom: 20px;
        }

        .reference-item {
            margin-bottom: 12px;
            display: flex;
            gap: 12px;
            font-size: 20px;
            width: 100%;
        }

        .reference-number {
            color: #64748b;
            font-weight: bold;
            flex-shrink: 0;
            min-width: 20px;
        }

        .reference-content {
            flex: 1;
            min-width: 0;
            width: 100%;
            max-width: 100%;
        }

        .reference-title {
            color: #ffffff;
            font-weight: 600;
            margin-bottom: 4px;
            line-height: 1.3;
            word-wrap: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
        }

        .reference-meta {
            color: #cbd5e1;
            line-height: 1.3;
        }

        .footer {
            display: none;
        }



        /* Responsive height allocation */
        @media (max-height: 1024px) {
            .answer {
                flex: 1;
                min-height: 200px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">omni<span style="font-size: 40px; color: #94a3b8;">(n.)</span></div>
        <div class="tagline">
            AI-powered research assistant<br>
            drawing from real papers, not opinions.
        </div>
    </div>

    <div class="content">
        <div class="question">${data.text}</div>
        
        <div class="answer">
            <div class="answer-content">
                ${answerHTML}
            </div>
        </div>

        ${
          formattedCitations.length > 0
            ? `
        <div class="references">
            <div class="references-header">Academic References</div>
            ${formattedCitations
              .map(
                (citation) => `
                <div class="reference-item">
                    <div class="reference-number">[${citation.number}]</div>
                    <div class="reference-content">
                        <div class="reference-title">${citation.title}</div>
                        <div class="reference-meta">${citation.metadata}</div>
                    </div>
                </div>
            `,
              )
              .join('')}
        </div>
        `
            : ''
        }
    </div>

    <div class="footer">
        <div class="try-it">Try it omni.desci.com</div>
        <div class="desci-labs">
            <svg class="desci-logo" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
                <path d="M2 17L12 22L22 17"/>
                <path d="M2 12L12 17L22 12"/>
            </svg>
            DeSci Labs
        </div>
    </div>
</body>
</html>
  `;
}

/**
 * Main export function for Puppeteer-based share image generation
 */
export const generateShareImagePuppeteer = async (req: Request<any, any, any, ShareImageQuery>, res: Response) => {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { text, id, refs, answer, citations } = req.query;

    logger.info({ query: req.query }, 'Generating share image with Puppeteer');

    // Check if Chrome is available, if not, immediately fall back to SVG
    const chromeAvailable = await checkChromeAvailability();
    if (!chromeAvailable) {
      logger.info('Chrome not available, using SVG fallback approach');
      return await useSvgFallback(req, res);
    }

    // If we have an ID, fetch data from Supabase
    if (id && typeof id === 'string') {
      if (!supabase) {
        return res.status(500).json({ error: 'Database not configured' });
      }

      try {
        const { data, error } = await supabase.from('search_logs').select('*').eq('id', id).single();

        if (error || !data) {
          logger.error({ error, id }, 'Search result not found');
          return res.status(404).json({ error: 'Search result not found' });
        }

        const searchData = {
          query: data.query,
          response_data: data.response_data,
        };

        try {
          return await generateImageFromData(res, {
            text: searchData.query,
            answer: searchData.response_data.answer,
            citations: searchData.response_data.citations || [],
            refs: searchData.response_data.citations?.length || 0,
          });
        } catch (imageError) {
          if (imageError instanceof PuppeteerFallbackError) {
            logger.info('Puppeteer failed for database query, falling back to SVG approach');
            return await useSvgFallback(req, res);
          }
          throw imageError;
        }
      } catch (error) {
        logger.error({ error }, 'Error fetching search data');
        return res.status(500).json({ error: 'Failed to fetch search data' });
      }
    }

    // Fallback to URL parameters
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text parameter is required' });
    }

    const referenceCount = refs ? parseInt(refs as string) : 0;
    let citationsData: Citation[] = [];

    if (citations && typeof citations === 'string') {
      try {
        citationsData = JSON.parse(citations) as Citation[];
      } catch (e) {
        logger.warn('Could not parse citations data');
      }
    }

    try {
      return await generateImageFromData(res, {
        text: text as string,
        answer: answer as string,
        citations: citationsData,
        refs: referenceCount,
      });
    } catch (imageError) {
      if (imageError instanceof PuppeteerFallbackError) {
        logger.info('Puppeteer failed for URL parameters, falling back to SVG approach');
        return await useSvgFallback(req, res);
      }
      throw imageError;
    }
  } catch (error) {
    logger.error({ error }, 'Error in generateShareImagePuppeteer controller');
    return res.status(500).json({
      error: 'Failed to generate image',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Checks if Chrome/Chromium is available for Puppeteer
 */
async function checkChromeAvailability(): Promise<boolean> {
  try {
    // Check environment variable first
    if (process.env.FORCE_SVG_FALLBACK === 'true') {
      return false;
    }

    // Check if Chrome/Chromium executable exists
    const { execSync } = await import('child_process');

    const possiblePaths = [
      '/usr/bin/chromium', // Debian/Ubuntu Chromium
      '/usr/bin/chromium-browser', // Alternative Chromium path
      '/usr/bin/google-chrome-stable', // Google Chrome (if available)
      '/usr/bin/google-chrome', // Alternative Chrome path
    ];

    for (const path of possiblePaths) {
      try {
        execSync(`test -f ${path}`, { stdio: 'ignore' });
        logger.info(`Found browser at: ${path}`);
        return true;
      } catch {
        // Continue checking other paths
      }
    }

    logger.warn('No Chrome/Chromium executable found, will use SVG fallback');
    return false;
  } catch (error) {
    logger.warn({ error }, 'Error checking browser availability, will use SVG fallback');
    return false;
  }
}

/**
 * Handles fallback to the original SVG approach
 */
async function useSvgFallback(req: Request<any, any, any, ShareImageQuery>, res: Response) {
  try {
    const { generateShareImage } = await import('./shareImage.js');
    return await generateShareImage(req, res);
  } catch (error) {
    logger.error({ error }, 'SVG fallback also failed');
    return res.status(500).json({
      error: 'Both Puppeteer and SVG fallback failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Generates image from data using Puppeteer
 */
async function generateImageFromData(res: Response, data: ShareImageData) {
  let browser: puppeteer.Browser | null = null;

  try {
    // Set response headers for PNG image
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=21600'); // Cache for 6 hours

    // Generate HTML content
    const htmlContent = generateHTML(data);

    logger.info('Attempting to launch Puppeteer browser...');

    // Launch browser with Docker-optimized settings
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--memory-pressure-off',
        '--max_old_space_size=4096',
      ],
      // Try to use system Chrome if available, fallback to bundled
      executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
    });

    logger.info('Browser launched successfully');

    const page = await browser.newPage();

    // Set viewport to match our design
    await page.setViewport({
      width: 1536,
      height: 1024,
      deviceScaleFactor: 1,
    });

    logger.info('Setting page content...');

    // Set content and wait for rendering
    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    logger.info('Taking screenshot...');

    // Take screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
    });

    // Send the PNG image
    res.send(screenshot);

    logger.info('Successfully generated share image with Puppeteer');
  } catch (error) {
    logger.error(
      {
        error:
          error instanceof Error
            ? {
                message: error.message,
                stack: error.stack,
                name: error.name,
              }
            : error,
      },
      'Error generating share image with Puppeteer',
    );

    // If Puppeteer fails, throw a specific error to indicate fallback is needed
    // The controller level will handle the SVG fallback since it has access to the request object
    throw new PuppeteerFallbackError(
      'Puppeteer failed, SVG fallback needed at controller level',
      error instanceof Error ? error : new Error('Unknown Puppeteer error'),
    );
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        logger.warn({ closeError }, 'Error closing browser');
      }
    }
  }
}