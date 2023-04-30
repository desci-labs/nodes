import { describe } from "mocha";
import { expect } from "chai";

import exampleNode from "../example-data/exampleNode.json";
import { RdfTransformer } from "../../src/transformers/RdfTransformer";

describe("RdfTransformer", () => {
  it("should convert a ResearchObject to RDF", async () => {
    const transformer = new RdfTransformer();
    const researchObject = exampleNode;

    const rdfOutput = await transformer.exportObject(researchObject);

    console.log("RDF Output", rdfOutput);

    // Replace the following line with checks specific to your expected RDF output
    expect(rdfOutput).to.be.a("string");
  });
});
