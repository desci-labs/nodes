import { test, describe, expect } from "vitest";
import {
  convertCidTo0xHex,
  convert0xHexToCid,
  convertUUIDToHex,
  convertUUIDToDecimal,
} from "../src/shared/util/converting.js";

describe("conversion", () => {
  describe("between UUID and hex", () => {
    const uuid = "pOV6-0ZN8k8Nlb3iJ7BHgbHt4V_xt-H-dUbRQCLKl78";
    const expectedHex =
      "0xa4e57afb464df24f0d95bde227b04781b1ede15ff1b7e1fe7546d14022ca97bf";

    test("works", () => {
      const actualHex = convertUUIDToHex(uuid);
      expect(actualHex).toEqual(expectedHex);
    });
  });

  describe("between UUID and decimal", () => {
    const uuid = "pOV6-0ZN8k8Nlb3iJ7BHgbHt4V_xt-H-dUbRQCLKl78";
    const expectedDecimal =
      "74584763932894785363050678437902601468178104400434333322549483008347345688511";

    test("works", () => {
      const uuid10 = convertUUIDToDecimal(uuid);
      expect(uuid10).toEqual(expectedDecimal);
    });
  });

  describe("between CID and hex", async () => {
    const exampleCid =
      "bafkreihge5qw7sc3mqc4wkf4cgpv6udtvrgipfxwyph7dhlyu6bkkt7tfq";
    const expectedHex =
      "0x0f01551220e627616fc85b6405cb28bc119f5f5073ac4c8796f6c3cff19d78a782a54ff32c";

    test("works one way", () => {
      const cidAsHex = convertCidTo0xHex(exampleCid);
      expect(cidAsHex).toEqual(expectedHex);
    });

    test("works the other way", () => {
      const hexAsCid = convert0xHexToCid(expectedHex);
      expect(hexAsCid).toEqual(exampleCid);
    });
  });
});
