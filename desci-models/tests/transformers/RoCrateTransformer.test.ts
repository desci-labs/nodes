import { describe } from "mocha";
import { expect } from "chai";
import { RoCrateTransformer } from "../../src/transformers/RoCrateTransformer";
import ResearchObjectTi from "../../src/ResearchObject-ti";
import { RoCrate, RoCrateGraph } from "../../src/RoCrate";
import { createCheckers } from "ts-interface-checker";
import exampleNode from "../example-data/exampleNode.json";
import exampleRoCrate from "../example-data/exampleRoCrate.json";
import exampleNodeWithAuthors from "../example-data/exampleNodeWithAuthors.json";
import expectedJsonLd from "../example-data/exampleNodeToRoCrate.json";
import exampleRoCrateWithWorkflow from "../example-data/roCrateWithWorkflow.json";
import {
  CodeComponent,
  DataComponent,
  PdfComponent,
  ResearchObjectV1,
} from "../../src/ResearchObject";

import { CreativeWork } from "schema-dts";
const context = "https://www.researchobject.org/ro-crate/1.1/context.jsonld";
const checkers = createCheckers(ResearchObjectTi);

const transformer = new RoCrateTransformer();

describe("RoCrateTransformer", () => {
  it("Imports a simple valid RO-Crate object", () => {
    const roCrate = exampleRoCrate;

    const researchObject = transformer.importObject(roCrate);
    checkers.ResearchObjectV1.check(researchObject);
  });

  // skipping due to lossy conversion, need to update spec to capture encoding
  it("Exports a simple valid ResearchObject to RO-Crate format", async () => {
    const researchObject = exampleNode;

    const roCrate = transformer.exportObject(researchObject);
    // Validate the output as JSON-LD

    // res = await compact(roCrate["@graph"], roCrate["@context"]);
    expect(roCrate).to.deep.equal(expectedJsonLd);
  });

  it("Properly imports PDF components", () => {
    const roCrate = exampleRoCrate;

    const researchObject = transformer.importObject(
      roCrate
    ) as ResearchObjectV1;
    const pdfComponent = researchObject.components.find(
      (component) => component.type === "pdf"
    ) as PdfComponent;

    expect(pdfComponent).to.not.be.undefined;
    expect(pdfComponent.payload.url).to.equal(
      "https://example.com/example.pdf"
    );
  });

  it("Properly imports code components", () => {
    const roCrate = exampleRoCrateWithWorkflow;

    const researchObject = transformer.importObject(
      roCrate
    ) as ResearchObjectV1;

    const codeComponent = researchObject.components.find(
      (component) => component.type === "code"
    ) as CodeComponent;

    expect(codeComponent).to.not.be.undefined;
    expect(codeComponent.payload.url).to.equal(
      "http://example.com/workflows/alignment"
    );
  });

  it("Properly imports data components", () => {
    const roCrate = exampleRoCrate;

    const researchObject = transformer.importObject(
      roCrate
    ) as ResearchObjectV1;
    const dataComponent = researchObject.components.find(
      (component) => component.type === "data"
    ) as DataComponent;

    expect(dataComponent).to.not.be.undefined;
    expect(dataComponent.payload.cid).to.equal(
      "https://doi.org/10.5281/zenodo.1234567"
    );
  });

  it("Properly exports PDF components", () => {
    const researchObject = exampleNode;

    const roCrate = transformer.exportObject(researchObject) as RoCrate;
    const pdfComponent = roCrate["@graph"].find(
      (item: RoCrateGraph) =>
        typeof item !== "string" &&
        item["@type"] &&
        item["@type"] === "CreativeWork" &&
        (item as CreativeWork).encodingFormat === "application/pdf"
    ) as CreativeWork;

    expect(pdfComponent).to.not.be.undefined;
    expect(pdfComponent.url).to.equal(
      "https://ipfs.io/ipfs/bafybeic3ach4ibambafznjsa3p446ghds3hp7742fkisldroe4wt6q5bsy"
    );
    expect((pdfComponent as any)["/"]).to.equal(
      "bafybeic3ach4ibambafznjsa3p446ghds3hp7742fkisldroe4wt6q5bsy"
    );
  });

  it("Properly exports code components", () => {
    const researchObject = exampleNode;

    const roCrate = transformer.exportObject(researchObject);

    const codeComponent = roCrate["@graph"].find(
      (item: RoCrateGraph) =>
        typeof item !== "string" &&
        item["@type"] === "SoftwareSourceCode" &&
        item.encodingFormat === "text/plain"
    );

    expect(codeComponent).to.not.be.undefined;
    expect(codeComponent["/"]).to.equal(
      "bafybeibzxn2il4q7att4bf3lvrcc2peovcdokv3jsbzne5v6ad5tr6mi6i"
    );
    expect(codeComponent.url).to.equal(
      "https://ipfs.io/ipfs/bafybeibzxn2il4q7att4bf3lvrcc2peovcdokv3jsbzne5v6ad5tr6mi6i"
    );
  });

  it("Properly exports data components", () => {
    const researchObject = exampleNode;
    const roCrate = transformer.exportObject(researchObject);
    const dataComponent = roCrate["@graph"].find(
      (item: RoCrateGraph) =>
        typeof item !== "string" &&
        item["@type"] === "Dataset" &&
        item.encodingFormat === "application/octet-stream"
    );

    expect(dataComponent).to.not.be.undefined;
    expect(dataComponent.url).to.equal(
      "https://ipfs.io/ipfs/bafybeigzwjr6xkcdy4b7rrtzbbpwq3isx3zaesfopnpr3bqld3uddc5k3m"
    );
    expect(dataComponent["/"]).to.equal(
      "bafybeigzwjr6xkcdy4b7rrtzbbpwq3isx3zaesfopnpr3bqld3uddc5k3m"
    );
  });

  it("Properly exports authors", () => {
    const researchObject = exampleNodeWithAuthors;
    const roCrate = transformer.exportObject(researchObject);
    // console.log("RO", roCrate);
    const authors = roCrate["@graph"].filter(
      (item: RoCrateGraph) =>
        typeof item !== "string" && item["@type"] === "Person"
    );

    expect(authors).to.not.be.undefined;
    expect(authors.length).to.equal(17);
  });
  it("Adds orcid.org prefix to author ids", () => {
    const researchObject = exampleNodeWithAuthors;
    const roCrate = transformer.exportObject(researchObject);
    // console.log("RO", roCrate);
    console.log("EXPORTED RO-CRATE", JSON.stringify(roCrate));
    const authors = roCrate["@graph"].filter(
      (item: RoCrateGraph) =>
        typeof item !== "string" && item["@type"] === "Person"
    );

    expect(authors).to.not.be.undefined;
    expect(authors[0]["@id"]).to.equal(
      `https://orcid.org/${researchObject.authors[0].orcid}`
    );
  });
});
