import {
  ResearchObject,
  ResearchObjectV1,
  ResearchObjectV1Author,
  ResearchObjectV1Component,
  ResearchObjectComponentType,
} from '../ResearchObject';
import { BaseTransformer } from './BaseTransformer';

/**
 * Transformer for MyST Markdown format
 *
 * MyST Markdown is an extension of CommonMark with additional features for scientific and technical documentation.
 * It includes frontmatter, directives, roles, and more.
 */
export class MystTransformer implements BaseTransformer {
  /**
   * Import a MyST Markdown string into a ResearchObject
   *
   * @param input MyST Markdown string
   * @returns ResearchObject
   */
  importObject(input: string): ResearchObject {
    if (typeof input !== 'string') {
      throw new Error('MystTransformer.importObject expects a string input');
    }

    // Extract frontmatter and content
    const { frontmatter, content } = this.extractFrontmatter(input);

    // Create a basic ResearchObject
    const researchObject: ResearchObjectV1 = {
      version: 1,
      title: frontmatter.title || '',
      description: frontmatter.description || '',
      components: [],
      authors: this.parseAuthors(frontmatter.authors || []),
      keywords: frontmatter.keywords || [],
      researchFields: frontmatter.tags || [],
      defaultLicense: this.parseLicense(frontmatter.license),
    };

    // Add content as a component
    if (content) {
      const component: ResearchObjectV1Component = {
        id: 'content',
        name: 'Main Content',
        type: ResearchObjectComponentType.CODE,
        payload: {
          path: 'content.md',
          title: researchObject.title,
          description: researchObject.description,
          cid: '', // This would be populated when the content is stored
        },
      };
      researchObject.components.push(component);
    }

    return researchObject;
  }

  /**
   * Export a ResearchObject to MyST Markdown
   *
   * @param input ResearchObject
   * @returns MyST Markdown string
   */
  exportObject(input: ResearchObject): string {
    if (!input || typeof input !== 'object') {
      throw new Error('MystTransformer.exportObject expects a ResearchObject input');
    }

    const researchObject = input as ResearchObjectV1;

    // Extract relevant data
    const title = researchObject.title || '';
    const description = researchObject.description || '';
    const authors = researchObject.authors || [];
    const keywords = researchObject.keywords || [];
    const tags = researchObject.researchFields || [];
    const license = researchObject.defaultLicense || '';

    // Generate frontmatter
    const frontmatter = this.generateFrontmatter({
      title,
      description,
      authors,
      keywords,
      tags,
      license,
    });

    // For now, we'll just return the frontmatter
    // In a real implementation, we would also include the content from components
    return frontmatter;
  }

  /**
   * Extract frontmatter and content from MyST Markdown
   *
   * @param input MyST Markdown string
   * @returns Object containing frontmatter and content
   */
  private extractFrontmatter(input: string): { frontmatter: any; content: string } {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = input.match(frontmatterRegex);

    if (!match) {
      return { frontmatter: {}, content: input };
    }

    const frontmatterYaml = match[1];
    const content = match[2];

    // Parse YAML frontmatter
    const frontmatter: any = {};
    let currentKey = '';
    let currentList: any[] = [];
    let currentListItem: any = {};
    let inList = false;
    let listIndent = 0;
    let inNestedList = false;
    let nestedListIndent = 0;

    const lines = frontmatterYaml.split('\n');
    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) continue;

      const indent = line.search(/\S/);
      const trimmedLine = line.trim();

      // Check if we're starting a new list item
      if (trimmedLine.startsWith('-')) {
        if (indent > listIndent && inList) {
          // This is a nested list item
          if (!inNestedList) {
            inNestedList = true;
            nestedListIndent = indent;
            if (!currentListItem.organizations) {
              currentListItem.organizations = [];
            }
          }
          const nestedItemContent = trimmedLine.slice(1).trim();
          if (nestedItemContent.includes(':')) {
            const [key, value] = this.splitKeyValue(nestedItemContent);
            currentListItem.organizations.push({
              id: this.generateId(),
              name: value,
            });
          } else {
            currentListItem.organizations.push({
              id: this.generateId(),
              name: nestedItemContent,
            });
          }
          continue;
        }

        // If we're not in a list yet, start a new one
        if (!inList) {
          inList = true;
          currentList = [];
          listIndent = indent;
        } else if (indent === listIndent) {
          // Save previous list item if it exists
          if (Object.keys(currentListItem).length > 0) {
            currentList.push({ ...currentListItem });
            currentListItem = {};
          }
          inNestedList = false;
        }

        // Parse the list item
        const itemContent = trimmedLine.slice(1).trim();
        if (itemContent.includes(':')) {
          const [key, value] = this.splitKeyValue(itemContent);
          currentListItem[key] = value;
        } else {
          currentListItem = { name: itemContent };
        }
        continue;
      }

      // Handle nested properties in list items
      if (inList && indent > listIndent && !inNestedList) {
        const [key, value] = this.splitKeyValue(trimmedLine);
        if (key && value) {
          currentListItem[key] = value;
        }
        continue;
      }

      // If we're in a list but this line isn't indented enough, end the list
      if (inList && indent <= listIndent) {
        // Save the last list item if it exists
        if (Object.keys(currentListItem).length > 0) {
          currentList.push({ ...currentListItem });
        }
        frontmatter[currentKey] = [...currentList];
        inList = false;
        inNestedList = false;
        currentList = [];
        currentListItem = {};
      }

      // Parse key-value pairs
      const keyValueMatch = trimmedLine.match(/^([^:]+):\s*(.*)$/);
      if (keyValueMatch) {
        const key = keyValueMatch[1].trim();
        const value = keyValueMatch[2].trim();

        // Handle arrays in square brackets
        if (value.startsWith('[') && value.endsWith(']')) {
          frontmatter[key] = value
            .slice(1, -1)
            .split(',')
            .map((item) => item.trim());
        } else {
          frontmatter[key] = value;
          currentKey = key;
        }
      }
    }

    // Save any remaining list items
    if (inList && Object.keys(currentListItem).length > 0) {
      currentList.push({ ...currentListItem });
      frontmatter[currentKey] = [...currentList];
    }

    return { frontmatter, content };
  }

  /**
   * Split a YAML line into key and value, handling special cases like URLs
   */
  private splitKeyValue(line: string): [string, string] {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      return ['', line];
    }

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Handle URLs that contain colons
    if (value.startsWith('http')) {
      const match = line.match(/^([^:]+):\s*(https?:\/\/.*)$/);
      if (match) {
        return [match[1].trim(), match[2].trim()];
      }
    }

    return [key, value];
  }

  /**
   * Generate a random ID for organizations
   * @returns A random UUID
   */
  private generateId(): string {
    return 'org-' + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Parse authors from frontmatter
   *
   * @param authors Authors from frontmatter
   * @returns ResearchObjectV1Author[]
   */
  private parseAuthors(authors: any[]): ResearchObjectV1Author[] {
    if (!Array.isArray(authors)) {
      return [];
    }

    return authors.map((author) => {
      if (typeof author === 'string') {
        return { name: author, role: 'Author' };
      }

      const parsedAuthor: ResearchObjectV1Author = {
        name: author.name || '',
        role: author.role || 'Author',
      };

      if (author.orcid) {
        // Handle both full URLs and just IDs
        parsedAuthor.orcid = author.orcid.startsWith('http') ? author.orcid : `https://orcid.org/${author.orcid}`;
      }

      if (author.organizations) {
        parsedAuthor.organizations = Array.isArray(author.organizations)
          ? author.organizations.map((org: any) => ({
              id: org.id || this.generateId(),
              name: typeof org === 'string' ? org : org.name || '',
            }))
          : [];
      }

      return parsedAuthor;
    });
  }

  /**
   * Parse license from frontmatter
   *
   * @param license License from frontmatter
   * @returns License string
   */
  private parseLicense(license: any): string {
    if (!license) {
      return '';
    }

    if (typeof license === 'string') {
      return license;
    }

    if (license.content) {
      return license.content;
    }

    return '';
  }

  /**
   * Generate frontmatter for MyST Markdown
   *
   * @param data Data to include in frontmatter
   * @returns Frontmatter string
   */
  private generateFrontmatter(data: {
    title: string;
    description: string;
    authors: ResearchObjectV1Author[];
    keywords: string[];
    tags: string[];
    license: string;
  }): string {
    const { title, description, authors, keywords, tags, license } = data;

    let frontmatter = '---\n';
    frontmatter += `title: ${title}\n`;
    frontmatter += `description: ${description || ''}\n`;
    if (authors && authors.length > 0) {
      frontmatter += 'authors:\n';
      for (const author of authors) {
        frontmatter += `  - name: ${author.name}\n`;
        if (author.orcid) {
          frontmatter += `    orcid: ${author.orcid}\n`;
        }
        if (author.role) {
          frontmatter += `    role: ${author.role}\n`;
        }
        if (author.organizations && author.organizations.length > 0) {
          frontmatter += '    organizations:\n';
          for (const org of author.organizations) {
            frontmatter += `      - name: ${org.name}\n`;
          }
        }
      }
    }
    if (keywords && keywords.length > 0) {
      frontmatter += `keywords: [${keywords.join(', ')}]\n`;
    }
    if (tags && tags.length > 0) {
      frontmatter += `tags: [${tags.join(', ')}]\n`;
    }
    if (license) {
      frontmatter += `license: ${license}\n`;
    }
    frontmatter += '---\n\n';

    return frontmatter;
  }
}
