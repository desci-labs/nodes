import {
  ResearchObject,
  ResearchObjectV1,
  ResearchObjectV1Author,
  ResearchObjectV1Component,
  ResearchObjectComponentType,
} from '../ResearchObject';
import { BaseTransformer } from './BaseTransformer';
import * as yaml from 'js-yaml';

/**
 * Transformer for MyST Markdown format
 *
 * MyST Markdown is an extension of CommonMark with additional features for scientific and technical documentation.
 * It includes frontmatter, directives, roles, and more.
 *
 * GitHub URL Configuration:
 * The transformer automatically extracts GitHub URLs from research objects in the following priority order:
 * 1. Component external URLs that contain 'github.com'
 * 2. Component GitHub URLs (payload.githubUrl)
 * 3. Component discussion URLs that contain 'github.com'
 * 4. Author GitHub profiles
 * 5. Environment variable DESCI_GITHUB_URL (full URL)
 * 6. Environment variable DESCI_GITHUB_REPO (org/repo format, e.g., 'desci-labs/nodes')
 * 7. Default fallback: 'https://github.com/desci-labs/nodes'
 */
export class MystTransformer implements BaseTransformer {
  private static readonly DEFAULT_GITHUB_ORG = 'desci-labs/nodes';

  /**
   * Extract GitHub URL from research object components or use environment variable/default
   */
  private getGitHubUrl(researchObject: ResearchObjectV1): string | undefined {
    // First, check if any components have GitHub URLs
    if (researchObject.components) {
      for (const component of researchObject.components) {
        if (component.payload) {
          // Check for external URL in component payload
          if (component.payload.externalUrl && typeof component.payload.externalUrl === 'string') {
            if (component.payload.externalUrl.includes('github.com')) {
              return component.payload.externalUrl;
            }
          }

          // Check for GitHub URL in component payload
          if (component.payload.githubUrl && typeof component.payload.githubUrl === 'string') {
            return component.payload.githubUrl;
          }

          // Check for discussion URL (often GitHub)
          if (component.payload.discussionUrl && typeof component.payload.discussionUrl === 'string') {
            if (component.payload.discussionUrl.includes('github.com')) {
              return component.payload.discussionUrl;
            }
          }
        }
      }
    }

    // Check for authors with GitHub profiles
    if (researchObject.authors) {
      for (const author of researchObject.authors) {
        if (author.github && typeof author.github === 'string') {
          // If it's a full URL, use it; if it's just a username, construct the URL
          if (author.github.startsWith('http')) {
            return author.github;
          } else {
            return `https://github.com/${author.github}`;
          }
        }
      }
    }

    // Use environment variable if available
    const envGithubUrl = process.env.DESCI_GITHUB_URL;
    if (envGithubUrl) {
      return envGithubUrl;
    }

    // Use environment variable for organization/repo if available
    const envGithubRepo = process.env.DESCI_GITHUB_REPO;
    if (envGithubRepo) {
      return `https://github.com/${envGithubRepo}`;
    }

    // Default fallback
    return `https://github.com/${MystTransformer.DEFAULT_GITHUB_ORG}`;
  }

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

    // Preserve date from frontmatter if available (convert Date objects to strings)
    if (frontmatter.date) {
      if (frontmatter.date instanceof Date) {
        researchObject.date = frontmatter.date.toISOString().split('T')[0];
      } else {
        researchObject.date = String(frontmatter.date);
      }
    }

    // Parse references from bibliography
    if (frontmatter.bibliography && Array.isArray(frontmatter.bibliography)) {
      researchObject.references = frontmatter.bibliography.map((ref: string) => {
        // Convert bibliography entries back to reference format
        if (ref.includes('doi.org/') || ref.startsWith('10.')) {
          const doi = ref.replace('https://doi.org/', '').replace('http://doi.org/', '');
          return {
            type: 'doi' as const,
            id: doi,
            title: '', // Title would need to be resolved separately
          };
        }
        return {
          type: 'doi' as const,
          id: ref,
          title: '',
        };
      });
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
    // First try to parse with --- delimiters (for backward compatibility)
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = input.match(frontmatterRegex);

    if (match) {
      const frontmatterYaml = match[1];
      const content = match[2];

      // Parse YAML frontmatter using js-yaml library
      try {
        const frontmatter = yaml.load(frontmatterYaml) as any;
        return { frontmatter: frontmatter || {}, content };
      } catch (error) {
        // If YAML parsing fails, return empty frontmatter and log the error
        console.warn('Failed to parse YAML frontmatter:', error);
        return { frontmatter: {}, content };
      }
    }

    // If no delimiters found, try to split YAML frontmatter from content
    // Look for the first line that starts with '#' (markdown heading) or doesn't contain ':'
    const lines = input.split('\n');
    let yamlEndIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#') || (line !== '' && !line.includes(':') && !line.startsWith('-'))) {
        yamlEndIndex = i;
        break;
      }
    }

    if (yamlEndIndex > 0) {
      // We found a split point - separate YAML from content
      const yamlPart = lines.slice(0, yamlEndIndex).join('\n');
      const contentPart = lines.slice(yamlEndIndex).join('\n');

      try {
        const frontmatter = yaml.load(yamlPart) as any;
        if (typeof frontmatter === 'object' && frontmatter !== null && !Array.isArray(frontmatter)) {
          return { frontmatter: frontmatter, content: contentPart };
        }
      } catch (error) {
        // If YAML parsing fails, treat entire input as content
      }
    } else if (input.includes(':') && !input.startsWith('#')) {
      // Try to parse entire input as YAML (pure frontmatter case)
      try {
        const frontmatter = yaml.load(input) as any;
        if (typeof frontmatter === 'object' && frontmatter !== null && !Array.isArray(frontmatter)) {
          return { frontmatter: frontmatter, content: '' };
        }
      } catch (error) {
        // If YAML parsing fails, fall through to treat as content
      }
    }

    // Treat as plain content
    return { frontmatter: {}, content: input };
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

      if (author.email) {
        parsedAuthor.email = author.email;
      }

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

        if (author.email) authorData.email = author.email;
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
    }

    // Add GitHub URL (dynamic based on research object)
    const githubUrl = this.getGitHubUrl(researchObject);
    if (githubUrl) {
      frontmatterData.github = githubUrl;
    }

    // Date field (preserve existing date or use current date if not available)
    frontmatterData.date = researchObject.date || new Date().toISOString().split('T')[0];

    // References - convert to MyST bibliography format
    if (researchObject.references && researchObject.references.length > 0) {
      frontmatterData.bibliography = researchObject.references.map((ref) => {
        // Convert reference to standard citation format
        if (ref.type === 'doi') {
          return ref.id.startsWith('10.') ? `https://doi.org/${ref.id}` : ref.id;
        }
        return ref.id;
      });
    }

    // Additional MyST frontmatter fields
    frontmatterData.subject = 'Research Article';
    frontmatterData.open_access = true; // DeSci nodes are open access by default

    // Add insight journal specific fields (using flat structure for better parsing compatibility)
    frontmatterData.venue_title = 'Insight Journal';
    frontmatterData.venue_url = 'https://insight-journal.org';

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
   * Generate YAML frontmatter string using js-yaml library
   *
   * @param data Frontmatter data object
   * @returns YAML frontmatter string
   */
  private generateYamlFrontmatter(data: any): string {
    // Filter out undefined/null values
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined && value !== null),
    );

    // Use js-yaml to generate clean YAML output
    const yamlOutput = yaml.dump(cleanData, {
      indent: 2,
      lineWidth: -1, // No line wrapping
      noRefs: true, // No references/anchors
      quotingType: '"', // Use double quotes when needed
      forceQuotes: false, // Only quote when necessary
    });

    return yamlOutput;
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
      starred: component.starred || false,
    };

    // Add subtype information if available
    if ((component as any).subtype) {
      result.subtype = (component as any).subtype;
    }

    // Determine file type based on component type and payload
    switch (component.type) {
      case ResearchObjectComponentType.PDF:
        result.fileType = 'pdf';
        result.path = payload.path || `${component.id}.pdf`;
        // For PDFs, include subtype in the description if available
        if (result.subtype) {
          result.description += ` (${result.subtype})`;
        }
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

        if (author.email) authorData.email = author.email;
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

    // References - convert to MyST bibliography format
    if (researchObject.references && researchObject.references.length > 0) {
      frontmatterData.bibliography = researchObject.references.map((ref) => {
        // Convert reference to standard citation format
        if (ref.type === 'doi') {
          return ref.id.startsWith('10.') ? `https://doi.org/${ref.id}` : ref.id;
        }
        return ref.id;
      });
    }

    // DPID-based fields
    if (researchObject.dpid) {
      frontmatterData.doi = `10.62329/${researchObject.dpid.prefix}.${researchObject.dpid.id}`;
    }

    // Add GitHub URL (dynamic based on research object)
    const githubUrl = this.getGitHubUrl(researchObject);
    if (githubUrl) {
      frontmatterData.github = githubUrl;
    }

    frontmatterData.date = researchObject.date || new Date().toISOString().split('T')[0];
    frontmatterData.subject = 'Research Article';
    frontmatterData.open_access = true;

    // Add insight journal specific fields
    frontmatterData.venue = {
      title: 'Insight Journal',
      url: 'https://insight-journal.org',
    };

    return frontmatterData;
  }
}
