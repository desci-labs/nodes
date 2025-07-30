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

    // Create a comprehensive ResearchObject with all available frontmatter fields
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

    // Extract dpid from DOI if available
    if (frontmatter.doi && typeof frontmatter.doi === 'string') {
      const dpidMatch = frontmatter.doi.match(/10\.62329\/(\w+)\.(\d+)/);
      if (dpidMatch) {
        researchObject.dpid = {
          prefix: dpidMatch[1],
          id: dpidMatch[2],
        };
      }
    }

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
          content: content,
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

    // Generate frontmatter with comprehensive MyST fields
    const frontmatter = this.generateComprehensiveFrontmatter(researchObject);

    // Include content from components
    let content = '';
    if (researchObject.components && researchObject.components.length > 0) {
      const mainComponent = researchObject.components.find((c) => c.id === 'content');
      if (mainComponent && mainComponent.payload) {
        content = mainComponent.payload.content || '';
      }
    }

    return frontmatter + content;
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
          // Handle arrays in square brackets even within list items
          if (value.startsWith('[') && value.endsWith(']')) {
            currentListItem[key] = value
              .slice(1, -1)
              .split(',')
              .map((item) => item.trim());
          } else {
            currentListItem[key] = value;
          }
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
        parsedAuthor.orcid = author.orcid.startsWith('http') ? author.orcid : `https://orcid.org/${author.orcid}`;
      }

      // Handle both organizations and affiliations fields
      const orgs = author.organizations || author.affiliations || [];
      if (Array.isArray(orgs) && orgs.length > 0) {
        parsedAuthor.organizations = orgs.map((org: any) => ({
          id: this.generateId(),
          name: typeof org === 'string' ? org : org.name || '',
        }));
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
    if (title) frontmatter += `title: ${title}\n`;
    if (description) frontmatter += `description: ${description}\n`;
    if (license) frontmatter += `license: ${license}\n`;

    if (keywords && keywords.length > 0) {
      frontmatter += `keywords: [${keywords.join(', ')}]\n`;
    }

    if (tags && tags.length > 0) {
      frontmatter += `tags: [${tags.join(', ')}]\n`;
    }

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
          frontmatter += '    affiliations:\n';
          for (const org of author.organizations) {
            frontmatter += `      - ${org.name}\n`;
          }
        }
      }
    }

    frontmatter += '---\n\n';
    return frontmatter;
  }

  /**
   * Generate comprehensive frontmatter for MyST Markdown with proper YAML escaping
   *
   * @param researchObject The ResearchObject to generate frontmatter for
   * @returns Frontmatter string
   */
  private generateComprehensiveFrontmatter(researchObject: ResearchObjectV1): string {
    const frontmatterData: any = {};

    // Core fields
    if (researchObject.title) frontmatterData.title = researchObject.title;
    if (researchObject.description) frontmatterData.description = researchObject.description;
    if (researchObject.defaultLicense) frontmatterData.license = researchObject.defaultLicense;

    // Keywords and tags
    if (researchObject.keywords && researchObject.keywords.length > 0) {
      frontmatterData.keywords = researchObject.keywords;
    }
    if (researchObject.researchFields && researchObject.researchFields.length > 0) {
      frontmatterData.tags = researchObject.researchFields;
    }

    // Authors with comprehensive fields
    if (researchObject.authors && researchObject.authors.length > 0) {
      frontmatterData.authors = researchObject.authors.map((author) => {
        const authorData: any = { name: author.name };

        if (author.orcid) authorData.orcid = author.orcid;
        if (author.role) {
          // Use 'role' (singular) for backward compatibility with tests
          if (Array.isArray(author.role)) {
            authorData.role = author.role[0]; // Use first role for backward compatibility
          } else {
            authorData.role = author.role;
          }
        }
        if (author.organizations && author.organizations.length > 0) {
          authorData.affiliations = author.organizations.map((org) => org.name);
        }

        return authorData;
      });
    }

    // Extended MyST frontmatter fields that could be derived from ResearchObject
    if (researchObject.dpid) {
      frontmatterData.doi = `10.62329/${researchObject.dpid.prefix}.${researchObject.dpid.id}`;
      frontmatterData.github = `https://github.com/desci-labs/nodes`;
    }

    // Date field (use current date if not available)
    frontmatterData.date = new Date().toISOString().split('T')[0];

    // Additional MyST frontmatter fields
    frontmatterData.subject = 'Research Article';
    frontmatterData.open_access = true; // DeSci nodes are open access by default

    // Component-based fields - generate simple downloads list for better roundtrip compatibility
    const codeComponents = researchObject.components?.filter((c) => c.type === ResearchObjectComponentType.CODE);
    const dataComponents = researchObject.components?.filter((c) => c.type === ResearchObjectComponentType.DATA);

    // Generate downloads based on components (simplified for better parsing compatibility)
    const downloads = [];
    if (dataComponents && dataComponents.length > 0) {
      downloads.push({
        title: 'Research Data',
        file: 'data.zip',
      });
    }
    if (codeComponents && codeComponents.length > 0) {
      downloads.push({
        title: 'Source Code',
        file: 'code.zip',
      });
    }
    if (downloads.length > 0) {
      frontmatterData.downloads = downloads;
    }

    // Generate YAML string with proper escaping
    return this.generateYamlFrontmatter(frontmatterData);
  }

  /**
   * Generate YAML frontmatter string with proper escaping to avoid MyST lint issues
   *
   * @param data Frontmatter data object
   * @returns YAML frontmatter string
   */
  private generateYamlFrontmatter(data: any): string {
    let yaml = '---\n';

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) continue;

      yaml += this.generateYamlValue(key, value, 0);
    }

    yaml += '---\n\n';
    return yaml;
  }

  /**
   * Generate YAML value recursively with proper indentation
   */
  private generateYamlValue(key: string, value: any, indent: number): string {
    const indentStr = '  '.repeat(indent);
    let yaml = '';

    if (Array.isArray(value)) {
      if (value.length === 0) return '';

      // Handle arrays of objects (like authors, exports, downloads)
      if (typeof value[0] === 'object') {
        yaml += `${indentStr}${key}:\n`;
        for (const item of value) {
          const entries = Object.entries(item);
          if (entries.length === 1) {
            yaml += `${indentStr}  - ${this.escapeYamlValue(entries[0][1])}\n`;
          } else {
            // Put the first property on the same line as the dash
            yaml += `${indentStr}  - ${entries[0][0]}: ${this.escapeYamlValue(entries[0][1])}\n`;
            // Put the rest on subsequent lines
            for (let i = 1; i < entries.length; i++) {
              const [subKey, subValue] = entries[i];
              yaml += this.generateYamlValue(subKey, subValue, indent + 2);
            }
          }
        }
              } else {
          // Handle simple arrays - use multi-line format for affiliations for better MyST compatibility
          if (key === 'affiliations') {
            yaml += `${indentStr}${key}:\n`;
            for (const item of value) {
              yaml += `${indentStr}  - ${this.escapeYamlValue(item)}\n`;
            }
          } else {
            yaml += `${indentStr}${key}: [${value.map((v) => this.escapeYamlValue(v)).join(', ')}]\n`;
          }
        }
    } else if (typeof value === 'object' && value !== null) {
      // Handle nested objects (like venue, numbering, social)
      yaml += `${indentStr}${key}:\n`;
      for (const [subKey, subValue] of Object.entries(value)) {
        yaml += this.generateYamlValue(subKey, subValue, indent + 1);
      }
    } else {
      // Handle simple values
      yaml += `${indentStr}${key}: ${this.escapeYamlValue(value)}\n`;
    }

    return yaml;
  }

  /**
   * Escape YAML values to prevent MyST lint issues with hyphens and special characters
   *
   * @param value Value to escape
   * @returns Escaped value
   */
  private escapeYamlValue(value: any): string {
    if (typeof value !== 'string') {
      return String(value);
    }

    // Don't quote URLs or common license strings - they're safe and expected to be unquoted
    if (value.startsWith('http') || value.startsWith('CC-') || value.startsWith('MIT') || value.startsWith('GPL')) {
      return value;
    }

    // Check if the value needs quoting (contains special YAML characters)
    // Remove hyphen from the regex since it's commonly used in normal text and causes issues
    const needsQuoting =
      /[:\[\]{}|>*&!%@`#]/.test(value) ||
      value.startsWith(' ') ||
      value.endsWith(' ') ||
      value.includes('\n') ||
      /^(true|false|null|~)$/i.test(value) ||
      /^\d+$/.test(value) ||
      /^\d+\.\d+$/.test(value);

    if (needsQuoting) {
      // Escape double quotes and wrap in quotes
      return `"${value.replace(/"/g, '\\"')}"`;
    }

    return value;
  }

  /**
   * Generate file tree structure for MyST downloads and exports
   * This supports recursive API calls to build comprehensive MyST documents
   *
   * @param researchObject ResearchObject to analyze
   * @returns File tree structure for MyST
   */
  public generateFileTreeStructure(researchObject: ResearchObjectV1): any {
    const fileTree: any = {
      files: [],
      directories: [],
      downloads: [],
      exports: [],
    };

    if (researchObject.components) {
      for (const component of researchObject.components) {
        const componentInfo = this.analyzeComponent(component);

        if (componentInfo.type === 'file') {
          fileTree.files.push({
            id: component.id,
            name: component.name,
            path: componentInfo.path,
            type: componentInfo.fileType,
            size: componentInfo.size,
            description: componentInfo.description,
            downloadUrl: componentInfo.downloadUrl,
          });
        } else if (componentInfo.type === 'directory') {
          fileTree.directories.push({
            id: component.id,
            name: component.name,
            path: componentInfo.path,
            contents: componentInfo.contents || [],
            description: componentInfo.description,
          });
        }

        // Add to downloads if it's a data or code component
        if (
          component.type === ResearchObjectComponentType.DATA ||
          component.type === ResearchObjectComponentType.CODE
        ) {
          fileTree.downloads.push({
            id: component.id,
            title: component.name,
            file: componentInfo.path,
            static: true,
            description: componentInfo.description,
          });
        }

        // Add to exports if it's a PDF or document
        if (component.type === ResearchObjectComponentType.PDF) {
          fileTree.exports.push({
            id: component.id,
            format: 'pdf',
            template: 'article',
            output: componentInfo.path,
            title: component.name,
          });
        }
      }
    }

    return fileTree;
  }

  /**
   * Analyze a component to extract file/directory information
   *
   * @param component ResearchObject component to analyze
   * @returns Component analysis result
   */
  private analyzeComponent(component: ResearchObjectV1Component): any {
    const payload = component.payload || {};

    const result: any = {
      type: 'file',
      path: payload.path || `${component.id}.unknown`,
      description: payload.description || component.name,
      size: payload.size || 0,
      downloadUrl: payload.url || payload.cid || '',
    };

    // Determine file type based on component type and payload
    switch (component.type) {
      case ResearchObjectComponentType.PDF:
        result.fileType = 'pdf';
        result.path = payload.path || `${component.id}.pdf`;
        break;
      case ResearchObjectComponentType.CODE:
        result.fileType = 'code';
        result.path = payload.path || `${component.id}.zip`;
        // Check if it's a directory structure
        if (payload.contents || payload.tree) {
          result.type = 'directory';
          result.contents = payload.contents || payload.tree;
        }
        break;
      case ResearchObjectComponentType.DATA:
        result.fileType = 'data';
        result.path = payload.path || `${component.id}.zip`;
        // Check if it's a directory structure
        if (payload.contents || payload.tree) {
          result.type = 'directory';
          result.contents = payload.contents || payload.tree;
        }
        break;
      default:
        result.fileType = 'unknown';
    }

    return result;
  }

  /**
   * Expand MyST frontmatter with file tree information
   * This method can be used to add comprehensive file listings to MyST documents
   *
   * @param researchObject ResearchObject to process
   * @param includeFileTree Whether to include detailed file tree
   * @returns Enhanced frontmatter object
   */
  public generateEnhancedFrontmatter(researchObject: ResearchObjectV1, includeFileTree: boolean = false): any {
    const frontmatterData = this.generateBasicFrontmatterData(researchObject);

    if (includeFileTree) {
      const fileTree = this.generateFileTreeStructure(researchObject);

      // Add file-based downloads
      if (fileTree.downloads.length > 0) {
        frontmatterData.downloads = fileTree.downloads;
      }

      // Add file-based exports
      if (fileTree.exports.length > 0) {
        frontmatterData.exports = fileTree.exports;
      }

      // Add parts for different file types
      frontmatterData.parts = {};
      if (fileTree.files.length > 0) {
        frontmatterData.parts.data_availability = `Research data and code are available in ${fileTree.files.length} files.`;
      }
    }

    return frontmatterData;
  }

  /**
   * Extract basic frontmatter data from ResearchObject
   * Separated for reuse by enhanced frontmatter generation
   */
  private generateBasicFrontmatterData(researchObject: ResearchObjectV1): any {
    const frontmatterData: any = {};

    // Core fields
    if (researchObject.title) frontmatterData.title = researchObject.title;
    if (researchObject.description) frontmatterData.description = researchObject.description;
    if (researchObject.defaultLicense) frontmatterData.license = researchObject.defaultLicense;

    // Keywords and tags
    if (researchObject.keywords && researchObject.keywords.length > 0) {
      frontmatterData.keywords = researchObject.keywords;
    }
    if (researchObject.researchFields && researchObject.researchFields.length > 0) {
      frontmatterData.tags = researchObject.researchFields;
    }

    // Authors - maintain backward compatibility with test expectations
    if (researchObject.authors && researchObject.authors.length > 0) {
      frontmatterData.authors = researchObject.authors.map((author) => {
        const authorData: any = { name: author.name };

        if (author.orcid) authorData.orcid = author.orcid;
        if (author.role) {
          // Use 'role' (singular) for backward compatibility
          if (Array.isArray(author.role)) {
            authorData.role = author.role[0]; // Use first role for backward compatibility
          } else {
            authorData.role = author.role;
          }
        }
        if (author.organizations && author.organizations.length > 0) {
          authorData.affiliations = author.organizations.map((org) => org.name);
        }

        return authorData;
      });
    }

    // DPID-based fields
    if (researchObject.dpid) {
      frontmatterData.doi = `10.62329/${researchObject.dpid.prefix}.${researchObject.dpid.id}`;
      frontmatterData.github = `https://github.com/desci-labs/nodes`;
    }

    frontmatterData.date = new Date().toISOString().split('T')[0];
    frontmatterData.subject = 'Research Article';
    frontmatterData.open_access = true;

    return frontmatterData;
  }
}
