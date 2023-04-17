import { CreativeWork, Dataset, SoftwareSourceCode } from "schema-dts";
import {
  ResearchObject,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Author,
  ResearchObjectV1Component,
} from "../ResearchObject";
import { RoCrateGraph } from "../RoCrate";
import { BaseTransformer } from "./BaseTransformer";

export class RoCrateTransformer implements BaseTransformer {
  importObject(obj: any): ResearchObject {
    const crate = obj;
    const mainEntity = crate["@graph"].find(
      (entity: any) => entity["@type"] === "Dataset"
    );

    const authors = mainEntity.creator?.map((creator: any) => ({
      name: creator.name,
      orcid: creator["@id"].startsWith("https://orcid.org/")
        ? creator["@id"]
        : undefined,
      googleScholar: creator["@id"].startsWith("https://scholar.google.com/")
        ? creator["@id"]
        : undefined,
      role: "Author",
    }));

    const components = crate["@graph"]
      .filter((entity: any) => entity["@id"] !== "ro-crate-metadata.jsonld")
      .map((component: any) =>
        this.mapCrateComponentToResearchObjectComponent(component)
      );

    const researchObject: ResearchObjectV1 = {
      version: 1,
      title: mainEntity.name,
      defaultLicense: mainEntity.license,
      components: components,
      authors: authors,
    };

    if (mainEntity.url && typeof mainEntity.url === "string") {
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
    const crate: any = {
      "@context": "https://w3id.org/ro/crate/1.1/context",
      "@graph": [
        {
          "@id": "ro-crate-metadata.jsonld",
          "@type": "CreativeWork",
          conformsTo: {
            "@id": "https://w3id.org/ro/crate/1.1",
          },
          about: {
            "@id": "./",
          },
        },
        {
          "@id": "./",
          "@type": "Thing",
          name: nodeObject.title,
          license: nodeObject.defaultLicense,
          url: nodeObject.dpid
            ? `https://doi.org/${nodeObject.dpid.prefix}/${nodeObject.dpid.id}`
            : undefined,
          creator: nodeObject.authors?.map(this.mapAuthor),
        },
      ],
    };

    nodeObject.components.forEach((component) => {
      crate["@graph"].push(this.mapComponent(component));
    });

    return crate;
  }

  private mapAuthor(author: ResearchObjectV1Author): any {
    return {
      "@id": author.orcid || author.googleScholar,
      "@type": "Person",
      name: author.name,
    };
  }

  private mapComponent(component: ResearchObjectV1Component): RoCrateGraph {
    let crateComponent: Omit<RoCrateGraph, "@type"> = {
      "@id": component.id,
      name: component.name,
    };

    if (component.type === ResearchObjectComponentType.PDF) {
      const creativeWork: CreativeWork = {
        ...(crateComponent as CreativeWork),
      };
      creativeWork.encodingFormat = "application/pdf";
      creativeWork.url = (component.payload as any).url;
      creativeWork["@type"] = "CreativeWork";
      crateComponent = creativeWork;
    } else if (component.type === ResearchObjectComponentType.CODE) {
      const softwareSourceCode: SoftwareSourceCode = {
        ...(crateComponent as SoftwareSourceCode),
      };
      softwareSourceCode.encodingFormat = "text/plain";
      softwareSourceCode.url = (component.payload as any).url;
      softwareSourceCode["@type"] = "SoftwareSourceCode";
      crateComponent = softwareSourceCode;
    } else if (component.type === ResearchObjectComponentType.DATA) {
      const dataset: Dataset = {
        ...(crateComponent as Dataset),
      };
      dataset.encodingFormat = "application/octet-stream";
      dataset.url = (component.payload as any).cid;
      dataset["@type"] = "Dataset";
      crateComponent = dataset;
    }

    return crateComponent as any;
  }

  private mapCrateComponentToResearchObjectComponent(
    crateComponent: any
  ): ResearchObjectV1Component {
    const nodeComponent: ResearchObjectV1Component = {
      id: crateComponent["@id"] || crateComponent["url"],
      name: crateComponent.name,
      type: ResearchObjectComponentType.UNKNOWN,
      payload: {},
    };

    let encodingFormat =
      crateComponent.encodingFormat || this.getFileMimeType(crateComponent.url);

    const roType = typeof crateComponent != "string" && crateComponent["@type"];
    if (!encodingFormat) {
      const typeMap: any = {
        SoftwareSourceCode: "text/plain",
        Dataset: "application/octet-stream",
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

    if (encodingFormat === "application/pdf") {
      nodeComponent.type = ResearchObjectComponentType.PDF;
      (nodeComponent.payload as any).url = crateComponent.url;
    } else if (encodingFormat === "text/plain") {
      nodeComponent.type = ResearchObjectComponentType.CODE;
      (nodeComponent.payload as any).url = crateComponent.url;
    } else if (encodingFormat === "application/octet-stream") {
      nodeComponent.type = ResearchObjectComponentType.DATA;
      (nodeComponent.payload as any).cid = crateComponent.url;
    } else {
      nodeComponent.type = ResearchObjectComponentType.UNKNOWN;
    }

    return nodeComponent;
  }

  private getFileMimeType(url: string): string | null {
    const fileExtension = url?.split(".").pop()?.toLowerCase() || "";

    switch (fileExtension) {
      case "pdf":
        return "application/pdf";
      case "txt":
      case "js":
      case "py":
      case "java":
        return "text/plain";
      case "bin":
      case "dat":
        return "application/octet-stream";
      default:
        return null;
    }
  }
}
