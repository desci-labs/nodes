import { CreativeWork, Dataset, SoftwareSourceCode } from 'schema-dts';
import {
  CommonComponentPayload,
  DataComponentMetadata,
  ResearchObject,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Author,
  ResearchObjectV1Component,
} from '../ResearchObject';
import { RoCrateGraph } from '../RoCrate';
import { BaseTransformer } from './BaseTransformer';
import { isNodeRoot } from '../trees/treeTools';

const cleanupUrlOrCid = (str: string | undefined | null): string | undefined => {
  if (!str) return undefined;
  return str.replace(new RegExp(`^http.*/ipfs/`), '');
};

const DESCI_IPFS_RESOLVER_HTTP = 'https://ipfs.desci.com/ipfs/';

const formatOrcid = (str: string | undefined) => {
  if (!str) {
    return false;
  }
  return `https://orcid.org/${str.replace(new RegExp(`^https://orcid.org/`), '')}`;
};

const LICENSES_TO_URL: { [k: string]: string } = {
  // CC 4.0 licenses
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC-BY': 'https://creativecommons.org/licenses/by/4.0/',
  'CC-BY-SA-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC-BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC-BY-ND-4.0': 'https://creativecommons.org/licenses/by-nd/4.0/',
  'CC-BY-ND': 'https://creativecommons.org/licenses/by-nd/4.0/',
  'CC-BY-NC-4.0': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'CC-BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'CC-BY-NC-SA-4.0': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'CC-BY-NC-SA': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'CC-BY-NC-ND-4.0': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  'CC-BY-NC-ND': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',

  // CC 3.0 licenses
  'CC-BY-3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC-BY-SA-3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'CC-BY-ND-3.0': 'https://creativecommons.org/licenses/by-nd/3.0/',
  'CC-BY-NC-3.0': 'https://creativecommons.org/licenses/by-nc/3.0/',
  'CC-BY-NC-SA-3.0': 'https://creativecommons.org/licenses/by-nc-sa/3.0/',
  'CC-BY-NC-ND-3.0': 'https://creativecommons.org/licenses/by-nc-nd/3.0/',

  // CC 2.0 licenses
  'CC-BY-2.0': 'https://creativecommons.org/licenses/by/2.0/',
  'CC-BY-SA-2.0': 'https://creativecommons.org/licenses/by-sa/2.0/',
  'CC-BY-ND-2.0': 'https://creativecommons.org/licenses/by-nd/2.0/',
  'CC-BY-NC-2.0': 'https://creativecommons.org/licenses/by-nc/2.0/',
  'CC-BY-NC-SA-2.0': 'https://creativecommons.org/licenses/by-nc-sa/2.0/',
  'CC-BY-NC-ND-2.0': 'https://creativecommons.org/licenses/by-nc-nd/2.0/',

  // Space-separated variants
  'CC BY': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
  'CC BY-ND': 'https://creativecommons.org/licenses/by-nd/4.0/',
  'CC BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
  'CC BY-NC-SA': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'CC BY-NC-ND': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'GPL-3.0': 'https://www.gnu.org/licenses/gpl-3.0.en.html',
  'MIT License': 'https://opensource.org/licenses/MIT',
  'Apache License 2.0': 'https://www.apache.org/licenses/LICENSE-2.0',
  'Apache 2.0': 'https://www.apache.org/licenses/LICENSE-2.0',
  'Mozilla Public License 2.0': 'https://www.mozilla.org/en-US/MPL/2.0/',
  'MPL 2.0': 'https://www.mozilla.org/en-US/MPL/2.0/',
  MIT: 'https://opensource.org/licenses/MIT',
  'BSD-3-Clause': 'https://opensource.org/licenses/BSD-3-Clause',
  'BSD-2-Clause': 'https://opensource.org/licenses/BSD-2-Clause',
  'Apache-2.0': 'https://www.apache.org/licenses/LICENSE-2.0',
  'LGPL-3.0': 'https://www.gnu.org/licenses/lgpl-3.0.en.html',
  'LGPL-2.1': 'https://www.gnu.org/licenses/old-licenses/lgpl-2.1.en.html',
  'MPL-2.0': 'https://www.mozilla.org/en-US/MPL/2.0/',
  'CDDL-1.0': 'https://opensource.org/licenses/CDDL-1.0',
  'EPL-2.0': 'https://opensource.org/licenses/EPL-2.0',
  'AGPL-3.0': 'https://www.gnu.org/licenses/agpl-3.0.en.html',
  Unlicense: 'https://unlicense.org/',
};

const licenseToUrl = (license: string) => {
  if (LICENSES_TO_URL[license]) {
    return LICENSES_TO_URL[license];
  }
  return license;
};
/**
 * Optional metadata for FAIR-compliant RO-Crate export
 * These fields enhance the JSON-LD output for better FAIRness scores
 */
export interface RoCrateExportMetadata {
  /** dPID number for persistent identifier */
  dpid?: number;
  /** Publication date as ISO string or Unix timestamp */
  datePublished?: string | number;
  /** Publisher name, defaults to 'DeSci Labs' */
  publisher?: string;
  /** Base URL for dPID resolution */
  dpidBaseUrl?: string;
}

export class RoCrateTransformer implements BaseTransformer {
  nodeObject: ResearchObjectV1 | undefined;
  importObject(obj: any): ResearchObject {
    const crate = obj;
    const mainEntity = crate['@graph'].find((entity: any) => entity['@type'] === 'Dataset');

    const authors = mainEntity.creator?.map((creator: any) => ({
      id: Date.now().toString(),
      name: creator.name,
      orcid: creator['@id'].startsWith('https://orcid.org/') ? creator['@id'] : undefined,
      googleScholar: creator['@id'].startsWith('https://scholar.google.com/') ? creator['@id'] : undefined,
      role: 'Author',
    }));

    const components = crate['@graph']
      .filter((entity: any) => entity['@id'] !== 'ro-crate-metadata.json')
      .map((component: any) => this.mapCrateComponentToResearchObjectComponent(component));

    const researchObject: ResearchObjectV1 = {
      version: 1,
      title: mainEntity.name,
      defaultLicense: mainEntity.license,
      components: components,
      authors: authors,
    };

    if (mainEntity.url && typeof mainEntity.url === 'string') {
      const doiMatch = mainEntity.url.match(/https:\/\/doi\.org\/(.+)\/(.+)/);
      if (doiMatch) {
        researchObject.dpid = {
          prefix: doiMatch[1],
          id: doiMatch[2],
        };
      }
    }

    return researchObject;
  }

  /**
   * Export a ResearchObject to RO-Crate JSON-LD format
   * @param obj The research object to export
   * @param metadata Optional metadata for FAIR compliance (dPID, datePublished, publisher)
   */
  exportObject(obj: ResearchObject, metadata?: RoCrateExportMetadata): any {
    const nodeObject = obj as ResearchObjectV1;
    this.nodeObject = nodeObject;
    const authors = nodeObject.authors?.map(this.mapAuthor);

    // Resolve license URL
    const licenseUrl = licenseToUrl(nodeObject.defaultLicense || 'CC-BY-SA-4.0');

    // Build the root Dataset entity with all available metadata
    // Using explicit schema.org and Dublin Core terms for FAIR I2.1 compliance
    // F-UJI looks for terms from registered vocabularies with namespace URIs
    const rootEntity: Record<string, unknown> = {
      '@id': './',
      '@type': ['Dataset', 'schema:Dataset', 'dcat:Dataset'], // Multiple vocab types for I2.1
      'name': nodeObject.title,
      'schema:name': nodeObject.title, // schema.org
      'http://schema.org/name': nodeObject.title, // Full URI for F-UJI detection
      // Primary license as URL (for RO-Crate compliance)
      'license': licenseUrl,
      'schema:license': licenseUrl,
      'dcterms:license': licenseUrl,
      'http://schema.org/license': licenseUrl, // Full URI
      'http://purl.org/dc/terms/license': licenseUrl, // Full Dublin Core URI
    };

    // Add dPID as persistent identifier (FAIR F1.2)
    const dpidBaseUrl = metadata?.dpidBaseUrl || 'https://dpid.org';
    if (metadata?.dpid !== undefined) {
      const dpidUrl = `${dpidBaseUrl}/${metadata.dpid}`;
      rootEntity['@id'] = dpidUrl; // Use dPID URL as the root identifier
      rootEntity.url = dpidUrl;
      // Add multiple identifier formats for maximum compatibility
      rootEntity.identifier = [
        {
          '@type': 'PropertyValue',
          propertyID: 'dpid',
          value: `${metadata.dpid}`,
          url: dpidUrl,
        },
        dpidUrl, // Simple URL format as fallback
      ];
    } else if (nodeObject.dpid) {
      // Fallback to legacy dpid format if available
      rootEntity.url = `https://${nodeObject.dpid.prefix}.dpid.org/${nodeObject.dpid.id}`;
      rootEntity.identifier = `dpid://${nodeObject.dpid.prefix}/${nodeObject.dpid.id}`;
    }

    // Add datePublished (FAIR F2.1 core metadata)
    if (metadata?.datePublished) {
      const timestamp = typeof metadata.datePublished === 'number' 
        ? metadata.datePublished 
        : parseInt(metadata.datePublished, 10);
      // Convert Unix timestamp to ISO date if it looks like a timestamp
      if (!isNaN(timestamp) && timestamp > 1000000000) {
        const isoDate = new Date(timestamp * 1000).toISOString().split('T')[0];
        rootEntity.datePublished = isoDate;
        rootEntity['schema:datePublished'] = isoDate; // Explicit schema.org
        rootEntity['dcterms:date'] = isoDate; // Dublin Core
      } else if (typeof metadata.datePublished === 'string') {
        rootEntity.datePublished = metadata.datePublished;
        rootEntity['schema:datePublished'] = metadata.datePublished;
        rootEntity['dcterms:date'] = metadata.datePublished;
      }
    }

    // Add publisher (FAIR F2.1 core metadata) with explicit schema.org
    const publisherObj = {
      '@type': ['Organization', 'schema:Organization'],
      'name': metadata?.publisher || 'DeSci Labs',
      'schema:name': metadata?.publisher || 'DeSci Labs',
      'url': 'https://desci.com',
      'schema:url': 'https://desci.com',
    };
    rootEntity.publisher = publisherObj;
    rootEntity['schema:publisher'] = publisherObj;
    rootEntity['dcterms:publisher'] = metadata?.publisher || 'DeSci Labs';

    // Add access rights (FAIR A1.1 - access level)
    // All dPID Research Objects are publicly accessible
    rootEntity.isAccessibleForFree = true;
    rootEntity['schema:isAccessibleForFree'] = true;
    rootEntity.accessMode = 'public';
    rootEntity['dcterms:accessRights'] = 'public';
    rootEntity['http://purl.org/dc/terms/accessRights'] = 'public';

    // Add optional metadata fields for FAIR compliance with explicit schema.org
    // Use description from manifest, or fall back to a generic description
    const descriptionText = nodeObject.description || `Research Object published on DeSci Labs`;
    rootEntity.description = descriptionText;
    rootEntity['schema:description'] = descriptionText;
    rootEntity['dcterms:description'] = descriptionText;
    rootEntity['http://schema.org/description'] = descriptionText; // Full URI
    rootEntity['http://purl.org/dc/terms/description'] = descriptionText;
    if (nodeObject.keywords && nodeObject.keywords.length > 0) {
      const keywordsStr = nodeObject.keywords.join(', ');
      rootEntity.keywords = keywordsStr;
      rootEntity['schema:keywords'] = keywordsStr;
      rootEntity['http://schema.org/keywords'] = keywordsStr; // Full URI
      rootEntity['dcterms:subject'] = nodeObject.keywords;
    }
    if (authors && authors.length > 0) {
      const creatorRefs = authors
        .filter((a) => a['@id'])
        .map((a) => ({
          '@id': a['@id'],
        }));
      rootEntity.creator = creatorRefs;
      rootEntity['schema:creator'] = creatorRefs; // Explicit schema.org
      rootEntity['dcterms:creator'] = authors.filter((a) => a.name).map((a) => a.name); // Dublin Core (names only)
    }

    const crate: any = {
      // Extended @context with vocabulary namespaces for FAIR I2.1 compliance
      // NOTE: F-UJI EXCLUDES schema.org, dcterms, foaf, dcat as "default namespaces"
      // We include PROV-O and Research Object ontology which ARE counted by F-UJI
      '@context': [
        'https://w3id.org/ro/crate/1.1/context',
        {
          // Namespace prefixes (standard ones for compatibility)
          'schema': 'http://schema.org/',
          'dcterms': 'http://purl.org/dc/terms/',
          'dc': 'http://purl.org/dc/elements/1.1/',
          'dcat': 'http://www.w3.org/ns/dcat#',
          'foaf': 'http://xmlns.com/foaf/0.1/',
          // These vocabularies are NOT excluded by F-UJI and will satisfy I2.1:
          'prov': 'http://www.w3.org/ns/prov#',  // W3C Provenance Ontology
          'ro': 'http://purl.org/wf4ever/ro#',   // Research Object Ontology
        },
      ],
      '@graph': [
        {
          '@id': 'ro-crate-metadata.json',
          '@type': 'CreativeWork',
          conformsTo: {
            '@id': 'https://w3id.org/ro/crate/1.1',
          },
          about: {
            '@id': rootEntity['@id'] || './',
          },
        },
        rootEntity,
        // Add license as a separate entity for F-UJI compatibility (R1.1.1)
        {
          '@id': licenseUrl,
          '@type': 'CreativeWork',
          name: nodeObject.defaultLicense || 'CC-BY-SA-4.0',
          url: licenseUrl,
        },
        // Add a prov:Activity entity using PROV-O vocabulary (satisfies I2.1)
        {
          '@id': '#publication-activity',
          '@type': ['prov:Activity', 'http://www.w3.org/ns/prov#Activity'],
          'prov:generated': { '@id': rootEntity['@id'] || './' },
          'prov:wasAssociatedWith': { '@id': 'https://desci.com' },
          'http://www.w3.org/ns/prov#generated': { '@id': rootEntity['@id'] || './' },
        },
        // Add Research Object entity using RO vocabulary (satisfies I2.1)
        {
          '@id': '#research-object',
          '@type': ['ro:ResearchObject', 'http://purl.org/wf4ever/ro#ResearchObject'],
          'ro:rootFolder': { '@id': rootEntity['@id'] || './' },
          'http://purl.org/wf4ever/ro#rootFolder': { '@id': rootEntity['@id'] || './' },
        },
      ].concat(authors || [{}]),
    };

    nodeObject.components.forEach((component) => {
      crate['@graph'].push(this.mapComponent(component));
    });

    return crate;
  }

  private mapAuthor(author: ResearchObjectV1Author): any {
    const id = formatOrcid(author.orcid) || author.googleScholar || Date.now().toString();
    return {
      ...(id ? { '@id': id } : {}),
      '@type': ['Person', 'schema:Person', 'foaf:Person'], // Explicit vocab types for I2.1
      'name': author.name,
      'schema:name': author.name,
      'foaf:name': author.name,
    };
  }

  private mapComponent(component: ResearchObjectV1Component): RoCrateGraph {
    const commonPayload = component.payload as CommonComponentPayload;
    let crateComponent: Omit<RoCrateGraph, '@type'> = {
      '@id': component.id,
      name: component.name,
      ...(commonPayload.licenseType ? { license: licenseToUrl(commonPayload.licenseType) } : {}),
      ...(commonPayload.description ? { description: commonPayload.description } : {}),
      ...(commonPayload.keywords ? { keywords: commonPayload.keywords.join(', ') } : {}),
    };

    if (component.type === ResearchObjectComponentType.PDF) {
      const creativeWork: CreativeWork = {
        ...(crateComponent as CreativeWork),
      };
      creativeWork.encodingFormat = 'application/pdf';
      // Prefer .cid (current format), fall back to .url (deprecated) for backward compatibility
      const pdfCid = cleanupUrlOrCid((component.payload as any).cid || (component.payload as any).url);
      if (pdfCid) {
        (creativeWork as any)['/'] = pdfCid;
        creativeWork.url = `${DESCI_IPFS_RESOLVER_HTTP}${pdfCid}`;
        // Add contentUrl for schema.org compatibility (helps F-UJI find downloadable data)
        (creativeWork as any).contentUrl = `${DESCI_IPFS_RESOLVER_HTTP}${pdfCid}`;
      }
      creativeWork['@type'] = 'CreativeWork';
      crateComponent = creativeWork;
    } else if (component.type === ResearchObjectComponentType.CODE) {
      const softwareSourceCode: SoftwareSourceCode = {
        ...(crateComponent as SoftwareSourceCode),
      };
      softwareSourceCode.encodingFormat = 'text/plain';

      // Prefer .cid (current format), fall back to .url (deprecated) for backward compatibility
      const codeCid = cleanupUrlOrCid((component.payload as any).cid || (component.payload as any).url);
      if (codeCid) {
        (softwareSourceCode as any)['/'] = codeCid;
        softwareSourceCode.url = `${DESCI_IPFS_RESOLVER_HTTP}${codeCid}`;
        // Add contentUrl for schema.org compatibility
        (softwareSourceCode as any).contentUrl = `${DESCI_IPFS_RESOLVER_HTTP}${codeCid}`;
      }
      softwareSourceCode.discussionUrl = component.payload.externalUrl;
      softwareSourceCode['@type'] = 'SoftwareSourceCode';
      crateComponent = softwareSourceCode;
    } else if (
      component.type === ResearchObjectComponentType.DATA ||
      isNodeRoot(component) ||
      component.type === ResearchObjectComponentType.UNKNOWN
    ) {
      const dataset: Dataset = {
        ...(crateComponent as Dataset),
      };
      if (!isNodeRoot(component)) {
        const dataPayload = component.payload as DataComponentMetadata;
        if (dataPayload.ontologyPurl) {
          dataset.schemaVersion = dataPayload.ontologyPurl;
        }
        if (dataPayload.title) {
          dataset.alternateName = dataPayload.title;
        }
        if (dataPayload.cedarLink) {
          dataset.schemaVersion = dataPayload.cedarLink;
        }
      }
      dataset.encodingFormat = 'application/octet-stream';
      // Prefer .cid (current format), fall back to .url (deprecated) for backward compatibility
      const dataCid = cleanupUrlOrCid((component.payload as any).cid || (component.payload as any).url);
      if (dataCid) {
        (dataset as any)['/'] = dataCid;
        dataset.url = `${DESCI_IPFS_RESOLVER_HTTP}${dataCid}`;
        // Add contentUrl for schema.org compatibility (helps F-UJI find downloadable data)
        (dataset as any).contentUrl = `${DESCI_IPFS_RESOLVER_HTTP}${dataCid}`;
      }
      dataset['@type'] = 'Dataset';
      crateComponent = dataset;
    } else if (component.type === ResearchObjectComponentType.LINK) {
      const creativeWork: CreativeWork = {
        ...(crateComponent as CreativeWork),
      };
      creativeWork.url = component.payload.url;
      creativeWork['@type'] = 'WebSite';
      crateComponent = creativeWork;
    }
    // add additional properties for root folder
    if (isNodeRoot(component)) {
      const dataset: Dataset = {
        ...(crateComponent as Dataset),
      };
      dataset['@id'] = './root';
      dataset['hasPart'] = this.nodeObject!.components.filter((d) => d.type === ResearchObjectComponentType.DATA).map(
        (d) => ({ '@id': d.id }),
      );
      crateComponent = dataset;
    }

    return crateComponent as any;
  }

  private mapCrateComponentToResearchObjectComponent(crateComponent: any): ResearchObjectV1Component {
    const nodeComponent: ResearchObjectV1Component = {
      id: crateComponent['@id'] || crateComponent['url'],
      name: crateComponent.name,
      type: ResearchObjectComponentType.UNKNOWN,
      payload: {},
    };

    let encodingFormat = crateComponent.encodingFormat || this.getFileMimeType(crateComponent.url);

    const roType = typeof crateComponent != 'string' && crateComponent['@type'];
    if (!encodingFormat) {
      const typeMap: any = {
        SoftwareSourceCode: 'text/plain',
        Dataset: 'application/octet-stream',
      };
      if (Array.isArray(roType)) {
        Object.keys(typeMap).forEach((key) => {
          if (roType.includes(key)) {
            encodingFormat = typeMap[key];
          }
        });
      } else {
        encodingFormat = typeMap[roType];
      }
    }

    if (encodingFormat === 'application/pdf') {
      nodeComponent.type = ResearchObjectComponentType.PDF;
      (nodeComponent.payload as any)['/'] = crateComponent.url;
      (nodeComponent.payload as any).url = crateComponent.url;
    } else if (encodingFormat === 'text/plain') {
      nodeComponent.type = ResearchObjectComponentType.CODE;
      (nodeComponent.payload as any)['/'] = crateComponent.url;
      (nodeComponent.payload as any).url = crateComponent.url;
    } else if (encodingFormat === 'application/octet-stream') {
      nodeComponent.type = ResearchObjectComponentType.DATA;
      (nodeComponent.payload as any).cid = crateComponent.url;
      (nodeComponent.payload as any)['/'] = crateComponent.url;
    } else {
      nodeComponent.type = ResearchObjectComponentType.UNKNOWN;
    }

    return nodeComponent;
  }

  private getFileMimeType(url: string): string | null {
    const fileExtension = url?.split('.').pop()?.toLowerCase() || '';

    switch (fileExtension) {
      case 'pdf':
        return 'application/pdf';
      case 'txt':
      case 'js':
      case 'py':
      case 'java':
        return 'text/plain';
      case 'bin':
      case 'dat':
        return 'application/octet-stream';
      default:
        return null;
    }
  }
}
