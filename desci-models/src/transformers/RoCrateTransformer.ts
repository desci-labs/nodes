import { CreativeWork, Dataset, SoftwareSourceCode } from 'schema-dts';
import {
  CommonComponentPayload,
  DataComponentMetadata,
  DataComponentPayload,
  PdfComponent,
  PdfComponentPayload,
  ResearchObject,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Author,
  ResearchObjectV1Component,
} from '../ResearchObject';
import { RoCrateGraph } from '../RoCrate';
import { BaseTransformer } from './BaseTransformer';
import { isNodeRoot, isResearchObjectComponentTypeMap } from '../trees/treeTools';

const IPFS_RESOLVER_HTTP = 'https://ipfs.io/ipfs/';
const cleanupUrlOrCid = (str: string) => {
  return str?.replace(new RegExp(`^${IPFS_RESOLVER_HTTP}`), '');
};

const formatOrcid = (str: string | undefined) => {
  if (!str) {
    return false;
  }
  return `https://orcid.org/${str.replace(new RegExp(`^https://orcid.org/`), '')}`;
};

const LICENSES_TO_URL: { [k: string]: string } = {
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
export class RoCrateTransformer implements BaseTransformer {
  nodeObject: ResearchObjectV1 | undefined;
  importObject(obj: any): ResearchObject {
    const crate = obj;
    const mainEntity = crate['@graph'].find((entity: any) => entity['@type'] === 'Dataset');

    const authors = mainEntity.creator?.map((creator: any) => ({
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

  exportObject(obj: ResearchObject): any {
    const nodeObject = obj as ResearchObjectV1;
    this.nodeObject = nodeObject;
    const authors = nodeObject.authors?.map(this.mapAuthor);
    const crate: any = {
      '@context': 'https://w3id.org/ro/crate/1.1/context',
      '@graph': [
        {
          '@id': 'ro-crate-metadata.json',
          '@type': 'CreativeWork',
          conformsTo: {
            '@id': 'https://w3id.org/ro/crate/1.1',
          },
          about: {
            '@id': './',
          },
        },
        {
          '@id': './',
          '@type': 'CreativeWork',
          name: nodeObject.title,
          license: licenseToUrl(nodeObject.defaultLicense || 'CC-BY-SA-4.0'),
          url: nodeObject.dpid ? `https://${nodeObject.dpid.prefix}.dpid.org/${nodeObject.dpid.id}` : undefined,
          creator: authors
            ?.filter((a) => a['@id'])
            .map((a) => ({
              // don't expand all author info, stored elsewhere
              '@id': a['@id'],
            })),
        },
      ].concat(authors || [{}]),
    };

    nodeObject.components.forEach((component) => {
      crate['@graph'].push(this.mapComponent(component));
    });

    return crate;
  }

  private mapAuthor(author: ResearchObjectV1Author): any {
    const id = formatOrcid(author.orcid) || author.googleScholar;
    return {
      ...(id ? { '@id': id } : {}),
      '@type': 'Person',
      name: author.name,
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
      (creativeWork as any)['/'] = cleanupUrlOrCid((component.payload as any).url);
      creativeWork.url = `https://ipfs.io/ipfs/${cleanupUrlOrCid((component.payload as any).url)}`;
      creativeWork['@type'] = 'CreativeWork';
      crateComponent = creativeWork;
    } else if (component.type === ResearchObjectComponentType.CODE) {
      const softwareSourceCode: SoftwareSourceCode = {
        ...(crateComponent as SoftwareSourceCode),
      };
      softwareSourceCode.encodingFormat = 'text/plain';

      (softwareSourceCode as any)['/'] = cleanupUrlOrCid(component.payload.url);
      softwareSourceCode.url = `https://ipfs.io/ipfs/${cleanupUrlOrCid(component.payload.url)}`;
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
      (dataset as any)['/'] = cleanupUrlOrCid((component.payload as any).url || (component.payload as any).cid);
      dataset.url = `https://ipfs.io/ipfs/${cleanupUrlOrCid(
        (component.payload as any).url || (component.payload as any).cid,
      )}`;
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
