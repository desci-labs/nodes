import { Request, Response } from 'express';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import xss from 'xss';
import { logger as parentLogger } from '../../logger.js';
import { supabase } from '../../lib/supabase.js';

const logger = parentLogger.child({ module: 'shareImage' });

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

function formatCitationForImage(citation: Citation, index: number) {
  const authors = citation.authors || 'Unknown Author';
  const year = citation.year ? ` (${citation.year})` : '';
  const journal = citation.journal ? ` ${citation.journal}.` : '';

  // Truncate title if too long
  let title = citation.title || 'Untitled';
  if (title.length > 80) {
    title = title.substring(0, 77) + '...';
  }

  const metadata = `${authors}${year}.${journal}`;

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
    LEFT: 150,
    RIGHT: 200,
    TOP: 350,
    BOTTOM: 100,
  },
  QUESTION: {
    FONT_SIZE: 48,
    LINE_HEIGHT: 58,
    MAX_LINES: 6,
    MAX_CHARS_PER_LINE: 60,
    COLOR: '#ffffff',
    FONT_FAMILY: 'DejaVu Sans, Liberation Sans, sans-serif',
  },
  ANSWER: {
    FONT_SIZE: 24,
    LINE_HEIGHT: 36,
    MAX_CHARS_PER_LINE: 100,
    COLOR: '#e8e8e8',
    MIN_LINES_REQUIRED: 2,
    PREVIEW_SENTENCES: 4,
    MAX_PREVIEW_LENGTH: 500,
    FONT_FAMILY: 'DejaVu Sans, Liberation Sans, sans-serif',
  },
  CITATIONS: {
    FONT_SIZE: 14,
    LINE_HEIGHT: 20,
    BLOCK_HEIGHT: 60, // citationLineHeight * 3
    MAX_COUNT: 3,
    RESERVED_SPACE: 200,
    HEADER_COLOR: '#9ca3af',
    NUMBER_COLOR: '#64748b',
    TITLE_COLOR: '#ffffff',
    METADATA_COLOR: '#d1d5db',
    MAX_TITLE_LENGTH: 80,
    FONT_FAMILY: 'DejaVu Sans, Liberation Sans, sans-serif',
  },
  BRANDING: {
    FONT_SIZE: 18,
    COLOR: '#ffffff',
    TEXT: 'DeSci Publish',
    FONT_FAMILY: 'DejaVu Sans, Liberation Sans, sans-serif',
  },
  SPACING: {
    QUESTION_TO_ANSWER: 60,
    ANSWER_TO_CITATIONS: 50,
    CITATIONS_HEADER_OFFSET: 25,
    BRANDING_OFFSET: 60,
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
 * Prepares and cleans answer text for display
 */
function prepareAnswerPreview(answer: string | undefined): string {
  if (!answer || typeof answer !== 'string') {
    return '';
  }

  // Strip HTML tags and citation markers
  const cleanAnswer = answer.replace(/<[^>]*>/g, '').replace(/\[\d+\]/g, '');
  const sentences = cleanAnswer.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const previewText = sentences.slice(0, LAYOUT.ANSWER.PREVIEW_SENTENCES).join('. ');

  if (previewText.length > LAYOUT.ANSWER.MAX_PREVIEW_LENGTH) {
    return previewText.substring(0, LAYOUT.ANSWER.MAX_PREVIEW_LENGTH - 3) + '...';
  } else {
    return previewText + (sentences.length > LAYOUT.ANSWER.PREVIEW_SENTENCES ? '...' : '.');
  }
}

/**
 * Generates SVG elements for the question section
 */
function generateQuestionSvg(text: string): string {
  const questionLines = wrapText(text, LAYOUT.QUESTION.MAX_CHARS_PER_LINE);
  const maxQuestionLines = Math.min(questionLines.length, LAYOUT.QUESTION.MAX_LINES);
  const displayQuestionLines = questionLines.slice(0, maxQuestionLines);

  const questionStartY = LAYOUT.MARGINS.TOP;

  return displayQuestionLines
    .map((line, index) => {
      const y = questionStartY + index * LAYOUT.QUESTION.LINE_HEIGHT;
      const escapedLine = sanitizeSvgText(line);

      return `<text x="${LAYOUT.MARGINS.LEFT}" y="${y}" font-family="${LAYOUT.QUESTION.FONT_FAMILY}" font-size="${LAYOUT.QUESTION.FONT_SIZE}" font-weight="bold" fill="${LAYOUT.QUESTION.COLOR}">${escapedLine}</text>`;
    })
    .join('\n');
}

/**
 * Generates SVG elements for the answer section
 */
function generateAnswerSvg(answerPreview: string, questionLineCount: number): { elements: string; endY: number } {
  if (!answerPreview) {
    return { elements: '', endY: 0 };
  }

  const answerStartY =
    LAYOUT.MARGINS.TOP + questionLineCount * LAYOUT.QUESTION.LINE_HEIGHT + LAYOUT.SPACING.QUESTION_TO_ANSWER;
  const citationsStartY = LAYOUT.CANVAS.HEIGHT - LAYOUT.MARGINS.BOTTOM - LAYOUT.CITATIONS.RESERVED_SPACE;
  const availableAnswerSpace = citationsStartY - answerStartY - LAYOUT.SPACING.ANSWER_TO_CITATIONS;
  const maxPossibleAnswerLines = Math.floor(availableAnswerSpace / LAYOUT.ANSWER.LINE_HEIGHT);

  // Only show answer if we have enough space for at least minimum required lines
  if (maxPossibleAnswerLines < LAYOUT.ANSWER.MIN_LINES_REQUIRED) {
    return { elements: '', endY: answerStartY };
  }

  const answerLines = wrapText(answerPreview, LAYOUT.ANSWER.MAX_CHARS_PER_LINE);
  const maxAnswerLines = Math.min(maxPossibleAnswerLines, answerLines.length);
  const displayAnswerLines = answerLines.slice(0, maxAnswerLines);

  // Add ellipsis to answer if we're cutting it off
  if (answerLines.length > maxAnswerLines) {
    const lastAnswerLine = displayAnswerLines[displayAnswerLines.length - 1];
    displayAnswerLines[displayAnswerLines.length - 1] = lastAnswerLine + '...';
  }

  const elements = displayAnswerLines
    .map((line, index) => {
      const y = answerStartY + index * LAYOUT.ANSWER.LINE_HEIGHT;
      const escapedLine = sanitizeSvgText(line);

      return `<text x="${LAYOUT.MARGINS.LEFT}" y="${y}" font-family="${LAYOUT.ANSWER.FONT_FAMILY}" font-size="${LAYOUT.ANSWER.FONT_SIZE}" font-weight="normal" fill="${LAYOUT.ANSWER.COLOR}">${escapedLine}</text>`;
    })
    .join('\n');

  return {
    elements,
    endY: answerStartY + displayAnswerLines.length * LAYOUT.ANSWER.LINE_HEIGHT,
  };
}

/**
 * Generates SVG elements for the citations section
 */
function generateCitationsSvg(citations: Citation[]): string {
  const citationsStartY = LAYOUT.CANVAS.HEIGHT - LAYOUT.MARGINS.BOTTOM - LAYOUT.CITATIONS.RESERVED_SPACE;
  const maxCitations = Math.min(
    Math.floor(150 / LAYOUT.CITATIONS.BLOCK_HEIGHT),
    citations.length,
    LAYOUT.CITATIONS.MAX_COUNT,
  );

  if (maxCitations === 0) {
    return '';
  }

  // Generate citations header
  const citationsHeader = `<text x="${LAYOUT.MARGINS.LEFT}" y="${
    citationsStartY - LAYOUT.SPACING.CITATIONS_HEADER_OFFSET
  }" font-family="${LAYOUT.CITATIONS.FONT_FAMILY}" font-size="16" font-weight="600" fill="${LAYOUT.CITATIONS.HEADER_COLOR}">References:</text>`;

  // Generate citation elements
  let citationElements = '';
  for (let i = 0; i < maxCitations; i++) {
    const citation = citations[i];
    if (!citation) continue;

    const y = citationsStartY + i * LAYOUT.CITATIONS.BLOCK_HEIGHT;
    const formattedCitation = formatCitationForImage(citation, i + 1);

    const escapedTitle = sanitizeSvgText(formattedCitation.title);
    const escapedMeta = sanitizeSvgText(formattedCitation.metadata);

    citationElements += `
      <!-- Citation ${i + 1} -->
      <text x="${LAYOUT.MARGINS.LEFT}" y="${y}" font-family="${LAYOUT.CITATIONS.FONT_FAMILY}" font-size="12" font-weight="bold" fill="${LAYOUT.CITATIONS.NUMBER_COLOR}">[${formattedCitation.number}]</text>
      <text x="${LAYOUT.MARGINS.LEFT + 25}" y="${y}" font-family="${LAYOUT.CITATIONS.FONT_FAMILY}" font-size="${LAYOUT.CITATIONS.FONT_SIZE}" font-weight="600" fill="${LAYOUT.CITATIONS.TITLE_COLOR}">${escapedTitle}</text>
      <text x="${LAYOUT.MARGINS.LEFT + 25}" y="${y + LAYOUT.CITATIONS.LINE_HEIGHT}" font-family="${LAYOUT.CITATIONS.FONT_FAMILY}" font-size="12" font-weight="normal" fill="${LAYOUT.CITATIONS.METADATA_COLOR}">${escapedMeta}</text>
    `;
  }

  return citationsHeader + '\n' + citationElements;
}

/**
 * Generates the branding SVG element
 */
function generateBrandingSvg(): string {
  return `<text x="${LAYOUT.CANVAS.WIDTH - LAYOUT.MARGINS.RIGHT}" y="${
    LAYOUT.CANVAS.HEIGHT - LAYOUT.MARGINS.BOTTOM + LAYOUT.SPACING.BRANDING_OFFSET
  }" font-family="${LAYOUT.BRANDING.FONT_FAMILY}" font-size="${LAYOUT.BRANDING.FONT_SIZE}" font-weight="bold" fill="${LAYOUT.BRANDING.COLOR}" text-anchor="end">${LAYOUT.BRANDING.TEXT}</text>`;
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
    res.setHeader('Cache-Control', 'public, max-age=21600'); // Cache for 6 hours

    // Prepare data
    const displayText = data.text;
    const answerPreview = prepareAnswerPreview(data.answer);

    // Generate SVG sections
    const questionLines = wrapText(displayText, LAYOUT.QUESTION.MAX_CHARS_PER_LINE);
    const questionLineCount = Math.min(questionLines.length, LAYOUT.QUESTION.MAX_LINES);

    const questionSvg = generateQuestionSvg(displayText);
    const answerResult = generateAnswerSvg(answerPreview, questionLineCount);
    const citationsSvg = generateCitationsSvg(data.citations);
    const brandingSvg = generateBrandingSvg();

    // Compose the complete SVG overlay
    const svgOverlay = `
      <svg width="${LAYOUT.CANVAS.WIDTH}" height="${LAYOUT.CANVAS.HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <!-- Main question text -->
        ${questionSvg}
        
        <!-- Answer preview -->
        ${answerResult.elements}
        
        <!-- Citations -->
        ${citationsSvg}
        
        <!-- Branding -->
        ${brandingSvg}
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
