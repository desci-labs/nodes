import { describe } from "mocha";
import { expect } from "chai";
import {
  AccessStatus,
  ContainsComponents,
  DriveMetadata,
  DriveObject,
  DrivePath,
  FileDir,
  FileType,
  NODE_KEEP_FILE,
  RecursiveLsResult,
  VirtualDriveArgs,
} from "../src/trees/treeTypes";
import { aggregateContainedComponents } from "../src/trees/treeTools";
import { ResearchObjectComponentType } from "../src/ResearchObject";

describe("TreeTools", () => {
  describe("aggregateContainedComponents", () => {
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
      const res = aggregateContainedComponents(emptyDrive);
      expect(res?.code).to.be.undefined;
      expect(res?.data).to.be.undefined;
      expect(res?.link).to.be.undefined;
      expect(res?.unknown).to.be.undefined;
      expect(res?.video).to.be.undefined;
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
            name:"a",
            lastModified: "1",
            metadata: {},
            type:FileType.FILE
          },
        ],
      };
      const res = aggregateContainedComponents(simpleDrive);
      expect(res?.code).to.not.be.undefined;
      expect(res?.code?.size).to.eq(1)
      expect(res?.code?.count).to.eq(1)
      expect(res?.data).to.be.undefined;
      expect(res?.link).to.be.undefined;
      expect(res?.unknown).to.be.undefined;
      expect(res?.video).to.be.undefined;
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
              name:"a",
              lastModified: "1",
              metadata: {},
              type:FileType.FILE
            },
            {
                componentType: ResearchObjectComponentType.DATA,
                size: 2,
                cid: "2",
                accessStatus: AccessStatus.PUBLIC,
                name:"b",
                lastModified: "1",
                metadata: {},
                type:FileType.FILE
              },
              {
                componentType: ResearchObjectComponentType.UNKNOWN,
                size: 3,
                cid: "3",
                accessStatus: AccessStatus.PUBLIC,
                name:"c",
                lastModified: "1",
                metadata: {},
                type:FileType.FILE
              },
              {
                componentType: ResearchObjectComponentType.LINK,
                size: 0,
                cid: "4",
                accessStatus: AccessStatus.PUBLIC,
                name:"d",
                lastModified: "1",
                metadata: {},
                type:FileType.FILE
              },
          ],
        };
        const res = aggregateContainedComponents(simpleDrive);
        expect(res?.code).to.not.be.undefined;
        expect(res?.code?.size).to.eq(1)
        expect(res?.code?.count).to.eq(1)

        expect(res?.data).to.not.be.undefined;
        expect(res?.data?.size).to.eq(2)
        expect(res?.data?.count).to.eq(1)

        expect(res?.unknown).to.not.be.undefined;
        expect(res?.unknown?.size).to.eq(3)
        expect(res?.unknown?.count).to.eq(1)

        expect(res?.link).to.not.be.undefined;
        expect(res?.link?.size).to.eq(0)
        expect(res?.link?.count).to.eq(1)
      });
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
          name:"code",
          lastModified: "1",
          metadata: {},
          type:FileType.DIR,
          contains:[
            {
                componentType: ResearchObjectComponentType.CODE,
                size: 10,
                cid: "2",
                accessStatus: AccessStatus.PUBLIC,
                name:"code",
                lastModified: "1",
                metadata: {},
                type:FileType.FILE
              },
              {
                componentType: ResearchObjectComponentType.CODE,
                size: 10,
                cid: "3",
                accessStatus: AccessStatus.PUBLIC,
                name:"code2",
                lastModified: "1",
                metadata: {},
                type:FileType.FILE
              },
          ]
        },
        
      ],
    };
    const res = aggregateContainedComponents(simpleDrive);
    expect(res?.code).to.not.be.undefined;
    expect(res?.code?.size).to.eq(20)
    expect(res?.code?.count).to.eq(2)

  });

});
