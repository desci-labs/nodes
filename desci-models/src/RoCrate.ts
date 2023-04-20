import { ComputerLanguage } from "schema-dts";
import {
  CreativeWork,
  SoftwareSourceCode,
  Thing,
  Person,
  Organization,
  Dataset,
} from "schema-dts";

interface RoCrateFormalParameter {
  "@type": "FormalParameter";
  "@id": string;
  name: string;
  valueRequired?: boolean;
  format?: string;
  conformsTo?: Thing;
  additionalType?: Thing;
  encodingFormat?: Thing;
}

interface RoCrateWorkflow {
  "@type": "Workflow";
  conformsTo: string;
  creator: Person;
  dateCreated: string;
  license: string;
  input: RoCrateFormalParameter[];
  output: RoCrateFormalParameter[];
  sdPublisher: Person;
  version: string;
}

export type RoCrateGraph =
  | RoCrateFormalParameter
  | Person
  | RoCrateWorkflow
  | Organization
  | ComputerLanguage
  | CreativeWork
  | SoftwareSourceCode
  | Dataset;

export interface RoCrate {
  "@context": string;
  "@graph": RoCrateGraph[];
}
