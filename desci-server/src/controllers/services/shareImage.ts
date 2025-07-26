import { Request, Response } from 'express';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
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

async function generateShareImageFromData(res: Response, data: ShareImageData) {
  try {
    // Set response headers for PNG image
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

    // Prepare the search query text (show full question)
    const displayText = data.text;

    // Prepare answer preview text (more comprehensive)
    let answerPreview = '';
    if (data.answer && typeof data.answer === 'string') {
      // Strip HTML tags and citation markers
      const cleanAnswer = data.answer.replace(/<[^>]*>/g, '').replace(/\[\d+\]/g, '');
      const sentences = cleanAnswer.split(/[.!?]+/).filter((s) => s.trim().length > 0);
      const previewText = sentences.slice(0, 4).join('. '); // Show up to 4 sentences

      if (previewText.length > 500) {
        answerPreview = previewText.substring(0, 497) + '...';
      } else {
        answerPreview = previewText + (sentences.length > 4 ? '...' : '.');
      }
    }

    // Word wrapping function
    const wrapText = (text: string, maxCharsPerLine = 60) => {
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
    };

    // Use natural template dimensions (1536x1024) instead of forcing 1200x630
    const canvasWidth = 1536;
    const canvasHeight = 1024;

    // Layout configuration - more right padding for question
    const leftMargin = 150;
    const rightMargin = 200; // Increased from 120 to 200 for more right padding
    const topMargin = 350;
    const bottomMargin = 100;
    const availableWidth = canvasWidth - leftMargin - rightMargin;
    const availableHeight = canvasHeight - topMargin - bottomMargin;

    // Question text - prioritize showing full question, allow more lines
    const questionLines = wrapText(displayText, 60); // Reduced from 65 due to more right padding
    const maxQuestionLines = Math.min(questionLines.length, 6); // Allow up to 6 lines for full question
    const displayQuestionLines = questionLines.slice(0, maxQuestionLines);

    // Question section - larger and more prominent
    const questionStartY = topMargin;
    const questionFontSize = 48;
    const questionLineHeight = 58;

    const questionElements = displayQuestionLines
      .map((line, index) => {
        const y = questionStartY + index * questionLineHeight;
        const escapedLine = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

        return `<text x="${leftMargin}" y="${y}" font-family="Arial, sans-serif" font-size="${questionFontSize}" font-weight="bold" fill="#ffffff">${escapedLine}</text>`;
      })
      .join('\n');

    // Calculate remaining space after question and citations
    const answerStartY = questionStartY + displayQuestionLines.length * questionLineHeight + 60;
    const citationsStartY = canvasHeight - bottomMargin - 200; // Reserve space for citations at bottom
    const availableAnswerSpace = citationsStartY - answerStartY - 50; // 50px buffer
    const answerLineHeight = 36; // Increased from 28 to 36 for better line spacing
    const maxPossibleAnswerLines = Math.floor(availableAnswerSpace / answerLineHeight);

    // Only show answer if we have enough space for at least 2 lines
    let answerElements = '';
    if (maxPossibleAnswerLines >= 2 && answerPreview) {
      const answerLines = wrapText(answerPreview, 100); // Reduced from 110 due to more right padding
      const maxAnswerLines = Math.min(maxPossibleAnswerLines, answerLines.length); // Use all available space, removed arbitrary 4-line limit
      const displayAnswerLines = answerLines.slice(0, maxAnswerLines);

      // Add ellipsis to answer if we're cutting it off
      if (answerLines.length > maxAnswerLines) {
        const lastAnswerLine = displayAnswerLines[displayAnswerLines.length - 1];
        displayAnswerLines[displayAnswerLines.length - 1] = lastAnswerLine + '...';
      }

      const answerFontSize = 24;

      answerElements = displayAnswerLines
        .map((line, index) => {
          const y = answerStartY + index * answerLineHeight;
          const escapedLine = line
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

          return `<text x="${leftMargin}" y="${y}" font-family="Arial, sans-serif" font-size="${answerFontSize}" font-weight="normal" fill="#e8e8e8">${escapedLine}</text>`;
        })
        .join('\n');
    }

    // Citations section - fixed at bottom
    const citationFontSize = 14;
    const citationLineHeight = 20;
    const citationBlockHeight = citationLineHeight * 3;
    const maxCitations = Math.min(Math.floor(150 / citationBlockHeight), data.citations.length, 3); // Fixed space for citations

    let citationElements = '';
    if (maxCitations > 0) {
      for (let i = 0; i < maxCitations; i++) {
        const citation = data.citations[i];
        if (!citation) continue;

        const y = citationsStartY + i * citationBlockHeight;

        // Use utility function to format citation
        const formattedCitation = formatCitationForImage(citation, i + 1);

        // Escape text
        const escapedTitle = formattedCitation.title
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

        const escapedMeta = formattedCitation.metadata
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

        citationElements += `
                    <!-- Citation ${i + 1} -->
                    <text x="${leftMargin}" y="${y}" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#64748b">[${
                      formattedCitation.number
                    }]</text>
                    <text x="${
                      leftMargin + 25
                    }" y="${y}" font-family="Arial, sans-serif" font-size="${citationFontSize}" font-weight="600" fill="#ffffff">${escapedTitle}</text>
                    <text x="${leftMargin + 25}" y="${
                      y + citationLineHeight
                    }" font-family="Arial, sans-serif" font-size="12" font-weight="normal" fill="#d1d5db">${escapedMeta}</text>
                `;
      }
    }

    // Add a subtle header for citations if we have any
    let citationsHeader = '';
    if (maxCitations > 0) {
      citationsHeader = `<text x="${leftMargin}" y="${
        citationsStartY - 25
      }" font-family="Arial, sans-serif" font-size="16" font-weight="600" fill="#9ca3af">References:</text>`;
    }

    // Branding at bottom right only
    const svgOverlay = `
            <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
                <!-- Main question text - prioritized and shown in full -->
                ${questionElements}
                
                <!-- Answer preview (only if enough space) -->
                ${answerElements}
                
                <!-- Citations header -->
                ${citationsHeader}
                
                <!-- Detailed citations -->
                ${citationElements}
                
                <!-- Branding at bottom right -->
                <text x="${canvasWidth - rightMargin}" y="${
                  canvasHeight - bottomMargin + 60
                }" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#ffffff" text-anchor="end">DeSci Publish</text>
            </svg>
        `;

    // Load the base template image or create fallback
    let baseImage: sharp.Sharp;

    // Try to find the template image in the desci-server public directory
    const templatePath = path.join(process.cwd(), 'public', 'ai-share-blank.png');

    if (fs.existsSync(templatePath)) {
      // Use the existing template at its natural size (1536x1024)
      baseImage = sharp(templatePath);
    } else {
      // Create a fallback image with natural dimensions
      baseImage = sharp({
        create: {
          width: canvasWidth,
          height: canvasHeight,
          channels: 4,
          background: { r: 30, g: 64, b: 175, alpha: 1 },
        },
      });
    }

    // Overlay the text SVG on the base image
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
