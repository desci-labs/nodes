import { describe } from "mocha";
import { expect } from "chai";
import ResearchObjectTi from "../src/ResearchObject-ti";
import { createCheckers } from "ts-interface-checker";
const checkers = createCheckers(ResearchObjectTi);

describe("ResearchObject", () => {
  it("Has a simple valid base form", () => {
    const obj = { version: 1, components: [], authors: [] };
    checkers.ResearchObjectV1.check(obj);
  });

  it("Fails without required fields", () => {
    const obj = {};
    expect(() => checkers.ResearchObjectV1.check(obj)).to
      .throw(`value.version is missing
value.version is missing
value.components is missing`);
  });

  it("Supports external links with IPLD payload", () => {
    const obj = {
      version: 1,
      components: [
        {
          name: "",
          id: "",
          type: "link",
          payload: {
            url: "https://google.com",
            archives: [{ accessDate: 213, url: { "/": "cid" } }],
          },
        },
      ],
      authors: [],
    };
    checkers.ResearchObjectV1.check(obj);
  });

  it("Supports version string", () => {
    const obj = {
      version: "desci-nodes-0.1.0",
      components: [],
      authors: [],
    };
    checkers.ResearchObjectV1.check(obj);
  });
});
