import {
  CommonComponentPayload,
  DataComponentMetadata,
  ResearchObjectComponentSubtypes,
  ResearchObjectComponentType,
} from "../ResearchObject";

export interface DriveObject {
  uid?: string;
  name: string;
  lastModified: string;
  componentType: ResearchObjectComponentType | DriveNonComponentTypes;
  componentSubtype?: ResearchObjectComponentSubtypes;
  componentId?: string | undefined;
  accessStatus: AccessStatus;
  size: number;
  metadata: DriveMetadata;
  cid: string;
  type: FileType;
  contains?: Array<DriveObject> | null;
  componentStats?: ComponentStats;
  parent?: DriveObject | FileDir | null;
  path?: string;
  starred?: boolean;
  external?: boolean;
}

export const NODE_KEEP_FILE = ".nodeKeep";

export type ComponentTypesForStats =
  | ResearchObjectComponentType.CODE
  | ResearchObjectComponentType.DATA
  | ResearchObjectComponentType.PDF
  | ResearchObjectComponentType.UNKNOWN
  | ResearchObjectComponentType.LINK;

export type ComponentStats = {
  [key in ComponentTypesForStats]: {
    count: number;
    size: number;
    dirs: number;
  };
};

export type DriveMetadata = CommonComponentPayload & DataComponentMetadata;

export enum FileType {
  DIR = "dir",
  FILE = "file",
}

export enum DriveNonComponentTypes {
  MANIFEST = "manifest",
  UNKNOWN = "unknown",
}

export interface IpfsPinnedResult {
  path: string;
  cid: string;
  size: number;
}

export interface RecursiveLsResult extends IpfsPinnedResult {
  name: string;
  contains?: RecursiveLsResult[];
  type: "dir" | "file";
  parent?: RecursiveLsResult;
  external?: boolean;
}

export interface FileDir extends RecursiveLsResult {
  date?: string;
  published?: boolean;
}

export type DrivePath = string;

export interface VirtualDriveArgs {
  name: string;
  componentType?: ResearchObjectComponentType | DriveNonComponentTypes;
  componentSubtype?: ResearchObjectComponentSubtypes;
  componentId?: string;
  size?: number;
  contains?: Array<DriveObject>;
  lastModified?: string;
  accessStatus?: AccessStatus;
  metadata?: DriveMetadata;
  cid?: string;
  parent?: DriveObject | FileDir | null;
  path?: string;
  uid?: string;
  starred?: boolean;
  type?: FileType;
}

export enum AccessStatus {
  PUBLIC = "Public",
  PRIVATE = "Private",
  PARTIAL = "Partial",
  EXTERNAL = "External",
  UPLOADING = "Uploading",
  FAILED = "Failed",
}
