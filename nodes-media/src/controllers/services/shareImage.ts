import type { Request, Response } from 'express';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import xss from 'xss';
import { logger as parentLogger } from '../../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = parentLogger.child({ module: 'shareImage' });

// Supabase configuration - to be initialized if needed
let supabase: any = null;

// Initialize Supabase synchronously if environment variables are set
async function initSupabase() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
      logger.info('Supabase client initialized successfully');
    } catch (err) {
      logger.warn({ err }, 'Failed to initialize Supabase client');
    }
  }
}

// Initialize immediately
initSupabase();

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
 * Capitalizes journal names following title case rules, keeping articles and prepositions lowercase
 * Based on the formatting used in desci-mobile
 */
function capitalizeExceptArticles(text: string): string {
  if (!text) return text;

  // Clean up the text by removing weird unicode and normalizing spaces
  const cleanText = text
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
    .replace(/[\u00A0]/g, ' ') // Replace non-breaking spaces with regular spaces
    .replace(/[\u2000-\u206F]/g, ' ') // Replace various unicode spaces
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();

  // Articles and common prepositions/conjunctions to keep lowercase
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

  // Simple approach: replace word boundaries
  let result = cleanText.toLowerCase();
  let isFirstWord = true;

  // Replace each word
  result = result.replace(/\b\w+\b/g, (match) => {
    if (isFirstWord) {
      isFirstWord = false;
      return match.charAt(0).toUpperCase() + match.slice(1);
    }

    // If not an article/preposition, capitalize it
    if (!articlesAndPrepositions.includes(match)) {
      return match.charAt(0).toUpperCase() + match.slice(1);
    }

    return match;
  });

  return result;
}

function formatCitationForImage(citation: Citation, index: number) {
  const authors = citation.authors || 'Unknown Author';
  const year = citation.year ? ` (${citation.year})` : '';
  // Format journal name consistently with desci-mobile and nodes-web-v2
  const journal = citation.journal ? ` ${capitalizeExceptArticles(citation.journal)}.` : '';

  // Truncate title if too long
  let title = citation.title || 'Untitled';
  if (title.length > 80) {
    title = title.substring(0, 77) + '...';
  }

  // Add DOI URL if available
  const doiUrl = citation.doi
    ? (citation.doi.startsWith('http') ? ` ${citation.doi}` : ` https://doi.org/${citation.doi}`)
    : (citation.url ? ` ${citation.url}` : '');
  const metadata = `${authors}${year}.${journal}${doiUrl}`;

  return {
    number: index,
    title,
    metadata,
  };
}

export const generateShareImage = async (req: Request<any, any, any, ShareImageQuery>, res: Response) => {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { text, id, refs, answer, citations } = req.query;

    logger.info({ query: req.query }, 'Generating share image');

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

        // Use data from database
        const searchData = {
          query: data.query,
          response_data: data.response_data,
        };

        return await generateShareImageFromData(res, {
          text: searchData.query,
          answer: searchData.response_data.answer,
          citations: searchData.response_data.citations || [],
          refs: searchData.response_data.citations?.length || 0,
        });
      } catch (error) {
        logger.error({ error }, 'Error fetching search data');
        return res.status(500).json({ error: 'Failed to fetch search data' });
      }
    }

    // Fallback to URL parameters (for /answer page)
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

    return await generateShareImageFromData(res, {
      text: text as string,
      answer: answer as string,
      citations: citationsData,
      refs: referenceCount,
    });
  } catch (error) {
    logger.error({ error }, 'Error in generateShareImage controller');
    return res.status(500).json({
      error: 'Failed to generate image',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Layout configuration constants
const LAYOUT = {
  CANVAS: {
    WIDTH: 1536,
    HEIGHT: 1024,
  },
  MARGINS: {
    LEFT: 70,
    RIGHT: 80, // Reduced for better content space
    TOP: 260,
    BOTTOM: 60,
  },
  QUESTION: {
    FONT_SIZE: 48,
    LINE_HEIGHT: 56,
    MAX_LINES: 4,
    MAX_CHARS_PER_LINE: 55, // Adjusted for better balance
    COLOR: '#ffffff',
    FONT_FAMILY: 'DejaVu Sans, Liberation Sans, Arial, Helvetica, sans-serif',
  },
  ANSWER: {
    FONT_SIZE: 22,
    LINE_HEIGHT: 32, // Slightly increased for better readability
    MAX_CHARS_PER_LINE: 130, // Optimized for available width
    COLOR: '#e8e8e8',
    CITATION_COLOR: '#64a7ff',
    CITATION_SIZE: 16,
    CITATION_PADDING: 4, // Space before citation superscripts
    MIN_LINES_GUARANTEED: 3, // Minimum answer lines to show
    FONT_FAMILY: 'DejaVu Sans, Liberation Sans, Arial, Helvetica, sans-serif',
    // Markdown styling
    BOLD_WEIGHT: 'bold',
    LIST_INDENT: 15,
    PARAGRAPH_SPACING: 8,
  },
  CITATIONS: {
    FONT_SIZE: 12,
    LINE_HEIGHT: 16,
    BLOCK_HEIGHT: 40, // Height per citation block including spacing
    MIN_GUARANTEED: 2, // Always guarantee space for at least 2 citations
    MAX_COUNT: 2,
    HEADER_HEIGHT: 25, // Height for "References:" header
    HEADER_COLOR: '#9ca3af',
    NUMBER_COLOR: '#64748b',
    TITLE_COLOR: '#ffffff',
    METADATA_COLOR: '#d1d5db',
    FONT_FAMILY: 'DejaVu Sans, Liberation Sans, Arial, Helvetica, sans-serif',
  },
  SPACING: {
    QUESTION_TO_ANSWER: 35,
    ANSWER_TO_CITATIONS: 30,
    FADE_HEIGHT: 20, // Height of fade-out gradient
  },
  FADE: {
    ENABLED: true,
    HEIGHT: 25, // Fade gradient height
    COLOR_START: 'rgba(232, 232, 232, 1)', // Matches answer color
    COLOR_END: 'rgba(232, 232, 232, 0)', // Transparent
  },
};

/**
 * Sanitizes text for safe use in SVG text elements using XSS protection
 * Configured to allow only text content, no HTML tags or dangerous content
 */
function sanitizeSvgText(text: string): string {
  // Configure XSS options for SVG text - strip all HTML tags and dangerous content
  const options = {
    whiteList: {}, // No HTML tags allowed
    stripIgnoreTag: true, // Strip tags that aren't in whitelist
    stripIgnoreTagBody: ['script'], // Remove script tag content entirely
    allowCommentTag: false, // No HTML comments
    css: false, // No CSS
    onIgnoreTag: () => '', // Remove any unrecognized tags
    onIgnoreTagAttr: () => '', // Remove any unrecognized attributes
  };

  // Sanitize the text and then ensure proper XML escaping for SVG
  const sanitized = xss(text, options);

  // Additional escaping for XML/SVG context
  return sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Wraps text to fit within specified character limit per line
 */
function wrapText(text: string, maxCharsPerLine: number = 60): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    // Handle very long words that exceed max length on their own
    if (word.length > maxCharsPerLine) {
      // If we have content on current line, push it first
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      // Truncate long word and add ellipsis
      lines.push(word.substring(0, maxCharsPerLine - 3) + '...');
      continue;
    }

    const testLine = currentLine + (currentLine ? ' ' : '') + word;

    if (testLine.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Dynamically calculates layout ensuring minimum references are always shown
 */
function calculateDynamicLayout(
  questionLineCount: number,
  citationCount: number,
): {
  maxAnswerLines: number;
  answerStartY: number;
  citationStartY: number;
  fadeNeeded: boolean;
} {
  const totalHeight = LAYOUT.CANVAS.HEIGHT - LAYOUT.MARGINS.TOP - LAYOUT.MARGINS.BOTTOM;
  const questionHeight = questionLineCount * LAYOUT.QUESTION.LINE_HEIGHT;

  // Guarantee space for minimum citations (even if we don't have that many)
  const guaranteedCitations = Math.max(
    LAYOUT.CITATIONS.MIN_GUARANTEED,
    Math.min(citationCount, LAYOUT.CITATIONS.MAX_COUNT),
  );
  const citationSpaceNeeded =
    guaranteedCitations > 0 ? LAYOUT.CITATIONS.HEADER_HEIGHT + guaranteedCitations * LAYOUT.CITATIONS.BLOCK_HEIGHT : 0;

  const spacingHeight =
    LAYOUT.SPACING.QUESTION_TO_ANSWER + (guaranteedCitations > 0 ? LAYOUT.SPACING.ANSWER_TO_CITATIONS : 0);

  // Calculate available space for answer
  const availableAnswerHeight = totalHeight - questionHeight - citationSpaceNeeded - spacingHeight;

  // Calculate positions
  const answerStartY = LAYOUT.MARGINS.TOP + questionHeight + LAYOUT.SPACING.QUESTION_TO_ANSWER;
  const citationStartY = LAYOUT.CANVAS.HEIGHT - LAYOUT.MARGINS.BOTTOM - citationSpaceNeeded;

  // Calculate max answer lines and determine if fade is needed
  const maxPossibleLines = Math.floor(availableAnswerHeight / LAYOUT.ANSWER.LINE_HEIGHT);
  const maxAnswerLines = Math.max(LAYOUT.ANSWER.MIN_LINES_GUARANTEED, maxPossibleLines);

  // Check if we need fade effect (answer might overflow)
  const fadeNeeded =
    maxPossibleLines > LAYOUT.ANSWER.MIN_LINES_GUARANTEED &&
    availableAnswerHeight < maxAnswerLines * LAYOUT.ANSWER.LINE_HEIGHT;

  return {
    maxAnswerLines,
    answerStartY: answerStartY,
    citationStartY,
    fadeNeeded,
  };
}

/**
 * Processes markdown elements in text and returns structured content
 */
interface MarkdownElement {
  type: 'text' | 'bold' | 'list' | 'paragraph';
  content: string;
  indent?: number;
}

function parseBasicMarkdown(text: string): MarkdownElement[] {
  const elements: MarkdownElement[] = [];

  // Split by lines first to handle lists and paragraphs
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines but preserve spacing
    if (!trimmedLine) {
      // Add spacing only if it's between content
      if (elements.length > 0 && i < lines.length - 1 && lines[i + 1]?.trim()) {
        elements.push({
          type: 'spacing',
          content: '',
        });
      }
      continue;
    }

    // Handle numbered list items (1. 2. 3. etc.)
    if (trimmedLine.match(/^\d+\.\s+/)) {
      const content = trimmedLine.replace(/^\d+\.\s+/, '');
      const number = trimmedLine.match(/^(\d+)\./)?.[1] || '1';
      elements.push({
        type: 'numbered-list',
        content: processInlineMarkdown(content),
        indent: LAYOUT.ANSWER.LIST_INDENT,
        number,
      });
    }
    // Handle bullet list items
    else if (trimmedLine.match(/^[-*]\s+/)) {
      const content = trimmedLine.replace(/^[-*]\s+/, '');
      elements.push({
        type: 'list',
        content: processInlineMarkdown(content),
        indent: LAYOUT.ANSWER.LIST_INDENT,
      });
    } else {
      // Regular paragraph - process inline markdown
      elements.push({
        type: 'paragraph',
        content: processInlineMarkdown(trimmedLine),
      });
    }
  }

  return elements;
}

function processInlineMarkdown(text: string): string {
  // Convert **bold** to special markers we can handle in SVG
  return text.replace(/\*\*(.*?)\*\*/g, '{{BOLD:$1}}').replace(/__(.*?)__/g, '{{BOLD:$1}}');
}

/**
 * Prepares and cleans answer text with markdown support and dynamic sizing
 */
function prepareAnswerPreview(
  answer: string | undefined,
  questionLineCount: number,
  citationCount: number,
): { content: MarkdownElement[]; wasContentTruncated: boolean } {
  if (!answer || typeof answer !== 'string') {
    return { content: [], wasContentTruncated: false };
  }

  // Get dynamic layout calculation
  const layout = calculateDynamicLayout(questionLineCount, citationCount);

  // Convert complex citations to simple index numbers first
  let cleanAnswer = answer.replace(/<[^>]*>/g, ''); // Remove HTML tags

  // Find all citation patterns and create mapping to simple indexes
  const citationPattern = /\[([^\]]+)\]/g;
  const foundCitations = [...cleanAnswer.matchAll(citationPattern)];
  const citationMap = new Map<string, number>();

  // Create mapping from complex citations to simple indexes
  foundCitations.forEach((match) => {
    const fullCitation = match[1];
    if (!citationMap.has(fullCitation)) {
      citationMap.set(fullCitation, citationMap.size + 1);
    }
  });

  // Replace complex citations with styled citation markers
  citationMap.forEach((index, citation) => {
    const complexPattern = new RegExp(`\\[${citation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`, 'g');
    cleanAnswer = cleanAnswer.replace(complexPattern, ` {{CITE:${index}}}`);
  });

  // Basic cleanup while preserving structure for markdown
  cleanAnswer = cleanAnswer
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Parse markdown elements
  const markdownElements = parseBasicMarkdown(cleanAnswer);

  // Calculate how much content we can fit
  const estimatedCharLimit = layout.maxAnswerLines * LAYOUT.ANSWER.MAX_CHARS_PER_LINE;

  // Truncate content to fit available space
  let totalCharCount = 0;
  const fittingElements: MarkdownElement[] = [];
  let wasContentTruncated = false;

  for (const element of markdownElements) {
    const elementCharCount = element.content.length + (element.indent || 0);

    if (totalCharCount + elementCharCount > estimatedCharLimit) {
      wasContentTruncated = true;

      // Try to fit partial content
      const remainingChars = estimatedCharLimit - totalCharCount;
      if (remainingChars > 50) {
        // Only if we have reasonable space left
        const truncatedContent = element.content.substring(0, remainingChars - 3) + '...';
        fittingElements.push({
          ...element,
          content: truncatedContent,
        });
      }
      break;
    }

    fittingElements.push(element);
    totalCharCount += elementCharCount;
  }

  return { content: fittingElements, wasContentTruncated };
}

/**
 * Generates SVG elements for the question section
 */
function generateQuestionSvg(text: string): { elements: string; lineCount: number } {
  const questionLines = wrapText(text, LAYOUT.QUESTION.MAX_CHARS_PER_LINE);
  const maxQuestionLines = Math.min(questionLines.length, LAYOUT.QUESTION.MAX_LINES);
  const displayQuestionLines = questionLines.slice(0, maxQuestionLines);

  // Add ellipsis if question is truncated
  if (questionLines.length > maxQuestionLines && displayQuestionLines.length > 0) {
    const lastLine = displayQuestionLines[displayQuestionLines.length - 1];
    // Ensure ellipsis fits within character limit
    if (lastLine.length <= LAYOUT.QUESTION.MAX_CHARS_PER_LINE - 3) {
      displayQuestionLines[displayQuestionLines.length - 1] = lastLine + '...';
    } else {
      displayQuestionLines[displayQuestionLines.length - 1] =
        lastLine.substring(0, LAYOUT.QUESTION.MAX_CHARS_PER_LINE - 3) + '...';
    }
  }

  const questionStartY = LAYOUT.MARGINS.TOP;

  const elements = displayQuestionLines
    .map((line, index) => {
      const y = questionStartY + index * LAYOUT.QUESTION.LINE_HEIGHT;
      const escapedLine = sanitizeSvgText(line);

      return `<text x="${LAYOUT.MARGINS.LEFT}" y="${y}" font-family="${LAYOUT.QUESTION.FONT_FAMILY}" font-size="${LAYOUT.QUESTION.FONT_SIZE}" font-weight="bold" fill="${LAYOUT.QUESTION.COLOR}">${escapedLine}</text>`;
    })
    .join('\n');

  return {
    elements,
    lineCount: displayQuestionLines.length,
  };
}

/**
 * Generates a line with properly styled citation superscripts and markdown support
 */
function generateLineWithMarkdownAndCitations(
  element: MarkdownElement,
  x: number,
  y: number,
  baseIndent: number = 0,
): string {
  const totalIndent = x + baseIndent + (element.indent || 0);
  const content = element.content;

  // Handle different element types
  let fontWeight = 'normal';
  let prefix = '';

  if (element.type === 'list') {
    prefix = '• '; // Unicode bullet
  }

  // If no citations or bold in this line, generate simple text
  if (!content.includes('{{CITE:') && !content.includes('{{BOLD:')) {
    const escapedContent = sanitizeSvgText(prefix + content);
    return `<text x="${totalIndent}" y="${y}" font-family="${LAYOUT.ANSWER.FONT_FAMILY}" font-size="${LAYOUT.ANSWER.FONT_SIZE}" font-weight="${fontWeight}" fill="${LAYOUT.ANSWER.COLOR}">${escapedContent}</text>`;
  }

  // Process mixed content with bold and citations
  const segments = content.split(/({{CITE:\d+}}|{{BOLD:.*?}})/);
  let tspanContent = '';

  // Add prefix for list items
  if (prefix) {
    tspanContent += `<tspan>${sanitizeSvgText(prefix)}</tspan>`;
  }

  segments.forEach((segment) => {
    if (segment.match(/{{CITE:(\d+)}}/)) {
      // Citation - add padding before and render as superscript
      const citationNumber = segment.match(/{{CITE:(\d+)}}/)?.[1] || '1';
      tspanContent += `<tspan dx="${LAYOUT.ANSWER.CITATION_PADDING}" font-size="${LAYOUT.ANSWER.CITATION_SIZE}" font-weight="bold" fill="${LAYOUT.ANSWER.CITATION_COLOR}" baseline-shift="super">[${citationNumber}]</tspan>`;
    } else if (segment.match(/{{BOLD:(.*?)}}/)) {
      // Bold text
      const boldText = segment.match(/{{BOLD:(.*?)}}/)?.[1] || '';
      const escapedBold = sanitizeSvgText(boldText);
      tspanContent += `<tspan font-weight="${LAYOUT.ANSWER.BOLD_WEIGHT}">${escapedBold}</tspan>`;
    } else if (segment.trim()) {
      // Regular text
      const escapedSegment = sanitizeSvgText(segment);
      tspanContent += `<tspan>${escapedSegment}</tspan>`;
    }
  });

  return `<text x="${totalIndent}" y="${y}" font-family="${LAYOUT.ANSWER.FONT_FAMILY}" font-size="${LAYOUT.ANSWER.FONT_SIZE}" font-weight="${fontWeight}" fill="${LAYOUT.ANSWER.COLOR}">${tspanContent}</text>`;
}

/**
 * Generates SVG elements for the answer section with markdown support and fade-out
 */
function generateAnswerSvg(
  answerData: { content: MarkdownElement[]; wasContentTruncated: boolean },
  layout: ReturnType<typeof calculateDynamicLayout>,
): { elements: string; endY: number } {
  if (!answerData.content.length) {
    return { elements: '', endY: layout.answerStartY };
  }

  let currentY = layout.answerStartY;
  let svgElements: string[] = [];

  // Convert markdown elements to text lines for wrapping
  const allLines: { text: string; element: MarkdownElement }[] = [];

  for (const element of answerData.content) {
    const wrappedLines = wrapText(element.content, LAYOUT.ANSWER.MAX_CHARS_PER_LINE);
    wrappedLines.forEach((line) => {
      allLines.push({ text: line, element });
    });

    // Add spacing between paragraphs
    if (element.type === 'paragraph' && element !== answerData.content[answerData.content.length - 1]) {
      allLines.push({ text: '', element: { type: 'text', content: '' } }); // Empty line for spacing
    }
  }

  // Render lines up to our limit
  const maxLines = Math.min(allLines.length, layout.maxAnswerLines);

  for (let i = 0; i < maxLines; i++) {
    const { text, element } = allLines[i];

    if (text.trim()) {
      // Only render non-empty lines
      const lineElement = generateLineWithMarkdownAndCitations(
        { ...element, content: text },
        LAYOUT.MARGINS.LEFT,
        currentY,
      );
      svgElements.push(lineElement);
    }

    currentY += LAYOUT.ANSWER.LINE_HEIGHT;
  }

  // Add fade-out effect if content was truncated or doesn't fit perfectly
  if ((answerData.wasContentTruncated || allLines.length > maxLines) && LAYOUT.FADE.ENABLED) {
    const fadeStartY = currentY - LAYOUT.FADE.HEIGHT;
    const fadeGradient = `
      <defs>
        <linearGradient id="fadeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${LAYOUT.FADE.COLOR_START.replace('rgba(232, 232, 232, 1)', '#e8e8e8')};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${LAYOUT.FADE.COLOR_START.replace('rgba(232, 232, 232, 1)', '#e8e8e8')};stop-opacity:0" />
        </linearGradient>
      </defs>
      <rect x="${LAYOUT.MARGINS.LEFT}" y="${fadeStartY}" width="${LAYOUT.CANVAS.WIDTH - LAYOUT.MARGINS.LEFT - LAYOUT.MARGINS.RIGHT}" height="${LAYOUT.FADE.HEIGHT}" fill="url(#fadeGradient)" />
    `;
    svgElements.push(fadeGradient);
  }

  return {
    elements: svgElements.join('\n'),
    endY: currentY,
  };
}

/**
 * Generates SVG elements for the citations section with dynamic positioning
 */
function generateCitationsSvg(citations: Citation[], layout: ReturnType<typeof calculateDynamicLayout>): string {
  if (!citations || citations.length === 0) {
    return '';
  }

  const maxCitations = Math.min(citations.length, LAYOUT.CITATIONS.MAX_COUNT);
  if (maxCitations === 0) {
    return '';
  }

  let svgElements: string[] = [];

  // Generate citations header
  const headerY = layout.citationStartY - LAYOUT.CITATIONS.HEADER_HEIGHT + 15; // Adjust for text baseline
  svgElements.push(
    `<text x="${LAYOUT.MARGINS.LEFT}" y="${headerY}" font-family="${LAYOUT.CITATIONS.FONT_FAMILY}" font-size="16" font-weight="600" fill="${LAYOUT.CITATIONS.HEADER_COLOR}">References:</text>`,
  );

  // Generate citation elements
  for (let i = 0; i < maxCitations; i++) {
    const citation = citations[i];
    if (!citation) continue;

    const citationY = layout.citationStartY + i * LAYOUT.CITATIONS.BLOCK_HEIGHT;
    const formattedCitation = formatCitationForImage(citation, i + 1);

    const escapedTitle = sanitizeSvgText(formattedCitation.title);
    const escapedMeta = sanitizeSvgText(formattedCitation.metadata);

    svgElements.push(`
      <!-- Citation ${i + 1} -->
      <text x="${LAYOUT.MARGINS.LEFT}" y="${citationY}" font-family="${LAYOUT.CITATIONS.FONT_FAMILY}" font-size="12" font-weight="bold" fill="${LAYOUT.CITATIONS.NUMBER_COLOR}">[${formattedCitation.number}]</text>
      <text x="${LAYOUT.MARGINS.LEFT + 25}" y="${citationY}" font-family="${LAYOUT.CITATIONS.FONT_FAMILY}" font-size="${LAYOUT.CITATIONS.FONT_SIZE}" font-weight="600" fill="${LAYOUT.CITATIONS.TITLE_COLOR}">${escapedTitle}</text>
      <text x="${LAYOUT.MARGINS.LEFT + 25}" y="${citationY + LAYOUT.CITATIONS.LINE_HEIGHT}" font-family="${LAYOUT.CITATIONS.FONT_FAMILY}" font-size="12" font-weight="normal" fill="${LAYOUT.CITATIONS.METADATA_COLOR}">${escapedMeta}</text>
    `);
  }

  return svgElements.join('\n');
}

/**
 * Loads the base image template or creates a fallback
 */
async function loadBaseImage(): Promise<sharp.Sharp> {
  // Try multiple possible paths for the template
  const possiblePaths = [
    path.join(process.cwd(), 'public', 'ai-share-blank.png'),
    path.join(__dirname, '..', '..', 'public', 'ai-share-blank.png'),
    path.join(__dirname, '..', '..', '..', 'public', 'ai-share-blank.png'),
    './public/ai-share-blank.png',
    'public/ai-share-blank.png',
  ];

  for (const templatePath of possiblePaths) {
    if (fs.existsSync(templatePath)) {
      logger.info(`Using template image: ${templatePath}`);
      return sharp(templatePath);
    }
  }

  // Log all attempted paths for debugging
  logger.warn(
    {
      cwd: process.cwd(),
      dirname: __dirname,
      attemptedPaths: possiblePaths,
    },
    'Template image not found, using fallback',
  );

  // Create a fallback image with natural dimensions
  return sharp({
    create: {
      width: LAYOUT.CANVAS.WIDTH,
      height: LAYOUT.CANVAS.HEIGHT,
      channels: 4,
      background: { r: 30, g: 64, b: 175, alpha: 1 },
    },
  });
}

async function generateShareImageFromData(res: Response, data: ShareImageData) {
  try {
    // Set response headers for PNG image
    res.setHeader('Content-Type', 'image/png');
    // Set cache headers based on environment
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev' || !process.env.NODE_ENV;
    res.setHeader('Cache-Control', isDevelopment
      ? 'no-cache, no-store, must-revalidate' // Disable cache for development
      : 'public, max-age=21600' // Cache for 6 hours in production
    );

    // Prepare data
    const displayText = data.text;

    // Generate question first to get line count for dynamic layout calculation
    const questionResult = generateQuestionSvg(displayText);
    const citationCount = data.citations.length;

    // Calculate dynamic layout based on question lines and citation count
    const layout = calculateDynamicLayout(questionResult.lineCount, citationCount);

    // Prepare answer with markdown support and dynamic sizing
    const answerData = prepareAnswerPreview(data.answer, questionResult.lineCount, citationCount);

    // Generate remaining SVG sections with dynamic layout
    const answerResult = generateAnswerSvg(answerData, layout);
    const citationsSvg = generateCitationsSvg(data.citations, layout);

    // Compose the complete SVG overlay
    const svgOverlay = `
      <svg width="${LAYOUT.CANVAS.WIDTH}" height="${LAYOUT.CANVAS.HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <!-- Main question text -->
        ${questionResult.elements}
        
        <!-- Answer preview with markdown support -->
        ${answerResult.elements}
        
        <!-- Citations with guaranteed minimum space -->
        ${citationsSvg}
      </svg>
    `;

    // Load base image and composite with SVG overlay
    const baseImage = await loadBaseImage();
    const result = await baseImage
      .composite([
        {
          input: Buffer.from(svgOverlay),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    // Send the PNG image
    res.send(result);
  } catch (error) {
    logger.error({ error }, 'Error generating share image');
    res.status(500).json({
      error: 'Failed to generate image',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}