import { describe } from "mocha";
import { expect } from "chai";
import {
  AccessStatus,
  ComponentStats,
  DriveObject,
  FileType,
} from "../src/trees/treeTypes";
import {
  calculateComponentStats,
  addNestedObjectValues,
  createEmptyComponentStats,
} from "../src/trees/treeTools";
import { ResearchObjectComponentType } from "../src/ResearchObject";

describe("TreeTools", () => {
  describe("addNestedObjectValues", () => {
    it("adds two empty objects", () => {
      const res = addNestedObjectValues(
        createEmptyComponentStats(),
        createEmptyComponentStats()
      );
      expect(res.code.count).to.eq(0);
      expect(res.code.size).to.eq(0);
      expect(res.data.count).to.eq(0);
      expect(res.data.size).to.eq(0);
      expect(res.link.count).to.eq(0);
      expect(res.link.size).to.eq(0);
      expect(res.unknown.count).to.eq(0);
      expect(res.unknown.size).to.eq(0);
    });

    it("adds an empty object to a nonempty object", () => {
      const res = addNestedObjectValues(
        {
          code: {
            count: 1,
            size: 1,
            dirs: 11,
          },
          data: {
            count: 2,
            size: 2,
            dirs: 21,
          },
          link: { count: 3, size: 3, dirs: 31 },
          pdf: {
            count: 4,
            size: 4,
            dirs: 41,
          },
          unknown: { count: 5, size: 5, dirs: 51 },
        },
        createEmptyComponentStats()
      );
      expect(res.code.count).to.eq(1);
      expect(res.code.size).to.eq(1);
      expect(res.code.dirs).to.eq(11);
      expect(res.data.count).to.eq(2);
      expect(res.data.size).to.eq(2);
      expect(res.data.dirs).to.eq(21);
      expect(res.link.count).to.eq(3);
      expect(res.link.size).to.eq(3);
      expect(res.link.dirs).to.eq(31);
      expect(res.pdf.count).to.eq(4);
      expect(res.pdf.size).to.eq(4);
      expect(res.pdf.dirs).to.eq(41);
      expect(res.unknown.count).to.eq(5);
      expect(res.unknown.size).to.eq(5);
      expect(res.unknown.dirs).to.eq(51);
    });
  });
  describe("calculateComponentStats", () => {
    it("calculates empty case correctly", () => {
      const emptyDrive: DriveObject = {
        name: "",
        lastModified: "",
        componentType: ResearchObjectComponentType.DATA_BUCKET,
        accessStatus: AccessStatus.PUBLIC,
        size: 0,
        metadata: {},
        cid: "",
        type: FileType.DIR,
      };
      const res = calculateComponentStats(emptyDrive);
      expect(res?.code).to.be.undefined;
      expect(res?.data).to.be.undefined;
      expect(res?.link).to.be.undefined;
      expect(res?.unknown).to.be.undefined;
      //   expect(res?.video).to.be.undefined;
    });

    it("calculates simple case correctly", () => {
      const simpleDrive: DriveObject = {
        name: "",
        lastModified: "",
        componentType: ResearchObjectComponentType.DATA_BUCKET,
        accessStatus: AccessStatus.PUBLIC,
        size: 0,
        metadata: {},
        cid: "",
        type: FileType.DIR,
        contains: [
          {
            componentType: ResearchObjectComponentType.CODE,
            size: 1,
            cid: "1",
            accessStatus: AccessStatus.PUBLIC,
            name: "a",
            lastModified: "1",
            metadata: {},
            type: FileType.FILE,
          },
        ],
      };
      const res = calculateComponentStats(simpleDrive) as ComponentStats;
      expect(res).to.exist;
      expect(res.code).to.not.be.undefined;
      expect(res.code.size).to.eq(1);
      expect(res.code.count).to.eq(1);
      expect(res.data.size).to.eq(0);
      expect(res.data.count).to.eq(0);
      expect(res.link.size).to.eq(0);
      expect(res.link.count).to.eq(0);
      expect(res.unknown.size).to.eq(0);
      expect(res.unknown.count).to.eq(0);
    });

    it("calculates with every component present in data bucket correctly", () => {
      const simpleDrive: DriveObject = {
        name: "",
        lastModified: "",
        componentType: ResearchObjectComponentType.DATA_BUCKET,
        accessStatus: AccessStatus.PUBLIC,
        size: 0,
        metadata: {},
        cid: "",
        type: FileType.DIR,
        contains: [
          {
            componentType: ResearchObjectComponentType.CODE,
            size: 1,
            cid: "1",
            accessStatus: AccessStatus.PUBLIC,
            name: "a",
            lastModified: "1",
            metadata: {},
            type: FileType.FILE,
          },
          {
            componentType: ResearchObjectComponentType.DATA,
            size: 2,
            cid: "2",
            accessStatus: AccessStatus.PUBLIC,
            name: "b",
            lastModified: "1",
            metadata: {},
            type: FileType.FILE,
          },
          {
            componentType: ResearchObjectComponentType.UNKNOWN,
            size: 3,
            cid: "3",
            accessStatus: AccessStatus.PUBLIC,
            name: "c",
            lastModified: "1",
            metadata: {},
            type: FileType.FILE,
          },
          {
            componentType: ResearchObjectComponentType.LINK,
            size: 0,
            cid: "4",
            accessStatus: AccessStatus.PUBLIC,
            name: "d",
            lastModified: "1",
            metadata: {},
            type: FileType.FILE,
          },
        ],
      };
      const res = calculateComponentStats(simpleDrive) as ComponentStats;
      expect(res).to.exist;

      expect(res.code.size).to.eq(1);
      expect(res.code.count).to.eq(1);

      expect(res.data.size).to.eq(2);
      expect(res.data.count).to.eq(1);

      expect(res.unknown.size).to.eq(3);
      expect(res.unknown.count).to.eq(1);

      expect(res.link.size).to.eq(0);
      expect(res.link.count).to.eq(1);
    });

    it("calculates nesting of single component type correctly", () => {
      const simpleDrive: DriveObject = {
        name: "",
        lastModified: "",
        componentType: ResearchObjectComponentType.DATA_BUCKET,
        accessStatus: AccessStatus.PUBLIC,
        size: 0,
        metadata: {},
        cid: "",
        type: FileType.DIR,
        contains: [
          {
            componentType: ResearchObjectComponentType.CODE,
            size: 20,
            cid: "1",
            accessStatus: AccessStatus.PUBLIC,
            name: "code",
            lastModified: "1",
            metadata: {},
            type: FileType.DIR,
            contains: [
              {
                componentType: ResearchObjectComponentType.CODE,
                size: 10,
                cid: "2",
                accessStatus: AccessStatus.PUBLIC,
                name: "code",
                lastModified: "1",
                metadata: {},
                type: FileType.FILE,
              },
              {
                componentType: ResearchObjectComponentType.CODE,
                size: 10,
                cid: "3",
                accessStatus: AccessStatus.PUBLIC,
                name: "code2",
                lastModified: "1",
                metadata: {},
                type: FileType.FILE,
              },
            ],
          },
        ],
      };
      const res = calculateComponentStats(simpleDrive) as ComponentStats;

      expect(res.code.size).to.eq(20);
      expect(res.code.count).to.eq(2);
      expect(res.code.dirs).to.eq(1);
    });

    it("calculates nesting of single component type and an additional component nested correctly", () => {
      const simpleDrive: DriveObject = {
        name: "",
        lastModified: "",
        componentType: ResearchObjectComponentType.DATA_BUCKET,
        accessStatus: AccessStatus.PUBLIC,
        size: 0,
        metadata: {},
        cid: "",
        type: FileType.DIR,
        contains: [
          {
            componentType: ResearchObjectComponentType.CODE,
            size: 30,
            cid: "1",
            accessStatus: AccessStatus.PUBLIC,
            name: "code",
            lastModified: "1",
            metadata: {},
            type: FileType.DIR,
            contains: [
              {
                componentType: ResearchObjectComponentType.CODE,
                size: 10,
                cid: "2",
                accessStatus: AccessStatus.PUBLIC,
                name: "code",
                lastModified: "1",
                metadata: {},
                type: FileType.FILE,
              },
              {
                componentType: ResearchObjectComponentType.CODE,
                size: 10,
                cid: "3",
                accessStatus: AccessStatus.PUBLIC,
                name: "code2",
                lastModified: "1",
                metadata: {},
                type: FileType.FILE,
              },
              {
                componentType: ResearchObjectComponentType.UNKNOWN,
                size: 10,
                cid: "4",
                accessStatus: AccessStatus.PUBLIC,
                name: "unknown",
                lastModified: "1",
                metadata: {},
                type: FileType.FILE,
              },
            ],
          },
        ],
      };
      const res = calculateComponentStats(simpleDrive) as ComponentStats;

      expect(res.code.size).to.eq(20);
      expect(res.code.count).to.eq(2);
      expect(res.code.dirs).to.eq(1);

      expect(res.unknown.size).to.eq(10);
      expect(res.unknown.count).to.eq(1);
      expect(res.unknown.dirs).to.eq(0);
    });

    it("calculates deep complex nesting of multiple component types", () => {
      const simpleDrive: DriveObject = {
        name: "",
        lastModified: "",
        componentType: ResearchObjectComponentType.DATA_BUCKET,
        accessStatus: AccessStatus.PUBLIC,
        size: 0,
        metadata: {},
        cid: "",
        type: FileType.DIR,
        contains: [
          {
            componentType: ResearchObjectComponentType.CODE,
            size: 30,
            cid: "1",
            accessStatus: AccessStatus.PUBLIC,
            name: "code",
            lastModified: "1",
            metadata: {},
            type: FileType.DIR,
            contains: [
              {
                componentType: ResearchObjectComponentType.CODE,
                size: 10,
                cid: "2",
                accessStatus: AccessStatus.PUBLIC,
                name: "code",
                lastModified: "1",
                metadata: {},
                type: FileType.FILE,
              },
              {
                componentType: ResearchObjectComponentType.CODE,
                size: 10,
                cid: "3",
                accessStatus: AccessStatus.PUBLIC,
                name: "code2",
                lastModified: "1",
                metadata: {},
                type: FileType.FILE,
              },
              {
                componentType: ResearchObjectComponentType.UNKNOWN,
                size: 10,
                cid: "4",
                accessStatus: AccessStatus.PUBLIC,
                name: "unknown",
                lastModified: "1",
                metadata: {},
                type: FileType.FILE,
              },
              {
                componentType: ResearchObjectComponentType.UNKNOWN,
                size: 10,
                cid: "5",
                accessStatus: AccessStatus.PUBLIC,
                name: "unknown-folder",
                lastModified: "1",
                metadata: {},
                type: FileType.DIR,
                contains: [
                  {
                    componentType: ResearchObjectComponentType.CODE,
                    size: 100,
                    cid: "3",
                    accessStatus: AccessStatus.PUBLIC,
                    name: "code3",
                    lastModified: "1",
                    metadata: {},
                    type: FileType.FILE,
                  },
                ],
              },
            ],
          },
        ],
      };
      const res = calculateComponentStats(simpleDrive) as ComponentStats;

      expect(res.code.size).to.eq(120);
      expect(res.code.count).to.eq(3);
      expect(res.code.dirs).to.eq(1);

      expect(res.unknown.size).to.eq(10);
      expect(res.unknown.count).to.eq(1);
      expect(res.unknown.dirs).to.eq(1);
    });
  });

  it("defers to cached component stats if available", () => {
    const simpleDrive: DriveObject = {
      name: "",
      lastModified: "",
      componentType: ResearchObjectComponentType.DATA_BUCKET,
      accessStatus: AccessStatus.PUBLIC,
      size: 0,
      metadata: {},
      cid: "",
      type: FileType.DIR,
      contains: [
        {
          componentType: ResearchObjectComponentType.CODE,
          size: 30,
          cid: "1",
          accessStatus: AccessStatus.PUBLIC,
          name: "code",
          lastModified: "1",
          metadata: {},
          type: FileType.DIR,
          componentStats: {
            code: { count: 1337, size: 1337, dirs: 1337 },
            data: { count: 1337, size: 1337, dirs: 1337 },
            link: { count: 1337, size: 1337, dirs: 1337 },
            pdf: { count: 1337, size: 1337, dirs: 1337 },
            unknown: { count: 1337, size: 1337, dirs: 1337 },
          },
          contains: [
            {
              componentType: ResearchObjectComponentType.CODE,
              size: 10,
              cid: "2",
              accessStatus: AccessStatus.PUBLIC,
              name: "code",
              lastModified: "1",
              metadata: {},
              type: FileType.FILE,
            },
            {
              componentType: ResearchObjectComponentType.CODE,
              size: 10,
              cid: "3",
              accessStatus: AccessStatus.PUBLIC,
              name: "code2",
              lastModified: "1",
              metadata: {},
              type: FileType.FILE,
            },
            {
              componentType: ResearchObjectComponentType.UNKNOWN,
              size: 10,
              cid: "4",
              accessStatus: AccessStatus.PUBLIC,
              name: "unknown",
              lastModified: "1",
              metadata: {},
              type: FileType.FILE,
            },
            {
              componentType: ResearchObjectComponentType.UNKNOWN,
              size: 10,
              cid: "5",
              accessStatus: AccessStatus.PUBLIC,
              name: "unknown-folder",
              lastModified: "1",
              metadata: {},
              type: FileType.DIR,
              contains: [
                {
                  componentType: ResearchObjectComponentType.CODE,
                  size: 100,
                  cid: "3",
                  accessStatus: AccessStatus.PUBLIC,
                  name: "code3",
                  lastModified: "1",
                  metadata: {},
                  type: FileType.FILE,
                },
              ],
            },
          ],
        },
      ],
    };
    const res = calculateComponentStats(simpleDrive) as ComponentStats;

    expect(res.code.size).to.eq(1337);
    expect(res.code.count).to.eq(1337);
    expect(res.code.dirs).to.eq(1338);

    expect(res.unknown.size).to.eq(1337);
    expect(res.unknown.count).to.eq(1337);
    expect(res.unknown.dirs).to.eq(1337);
  });

  it("defers to nested cached component stats if available", () => {
    const simpleDrive: DriveObject = {
      name: "",
      lastModified: "",
      componentType: ResearchObjectComponentType.DATA_BUCKET,
      accessStatus: AccessStatus.PUBLIC,
      size: 0,
      metadata: {},
      cid: "",
      type: FileType.DIR,
      contains: [
        {
          componentType: ResearchObjectComponentType.CODE,
          size: 30,
          cid: "1",
          accessStatus: AccessStatus.PUBLIC,
          name: "code",
          lastModified: "1",
          metadata: {},
          type: FileType.DIR,
          contains: [
            {
              componentType: ResearchObjectComponentType.CODE,
              size: 10,
              cid: "2",
              accessStatus: AccessStatus.PUBLIC,
              name: "code",
              lastModified: "1",
              metadata: {},
              type: FileType.FILE,
            },
            {
              componentType: ResearchObjectComponentType.CODE,
              size: 10,
              cid: "3",
              accessStatus: AccessStatus.PUBLIC,
              name: "code2",
              lastModified: "1",
              metadata: {},
              type: FileType.FILE,
            },
            {
              componentType: ResearchObjectComponentType.UNKNOWN,
              size: 10,
              cid: "4",
              accessStatus: AccessStatus.PUBLIC,
              name: "unknown",
              lastModified: "1",
              metadata: {},
              type: FileType.FILE,
            },
            {
              componentType: ResearchObjectComponentType.UNKNOWN,
              size: 10,
              cid: "5",
              accessStatus: AccessStatus.PUBLIC,
              name: "unknown-folder",
              lastModified: "1",
              metadata: {},
              type: FileType.DIR,
              componentStats: {
                code: {count:50, size:50,dirs:50},
                data: {count:0, size:0,dirs:0},
                link: {count:0, size:0,dirs:0},
                pdf: {count:99, size:99,dirs:99},
                unknown: {count:0, size:0,dirs:0},
              },
              contains: [
                {
                  componentType: ResearchObjectComponentType.CODE,
                  size: 100,
                  cid: "3",
                  accessStatus: AccessStatus.PUBLIC,
                  name: "code3",
                  lastModified: "1",
                  metadata: {},
                  type: FileType.FILE,
                },
              ],
            },
          ],
        },
      ],
    };
    const res = calculateComponentStats(simpleDrive) as ComponentStats;

    expect(res.code.size).to.eq(20+50);
    expect(res.code.count).to.eq(2+50);
    expect(res.code.dirs).to.eq(1+50);

    expect(res.unknown.size).to.eq(10);
    expect(res.unknown.count).to.eq(1);
    expect(res.unknown.dirs).to.eq(1);

    expect(res.pdf.size).to.eq(99);
    expect(res.pdf.count).to.eq(99);
    expect(res.pdf.dirs).to.eq(99);
  });
});
