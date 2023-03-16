import { ResearchObject } from "../ResearchObject";
import { BaseTransformer } from "./BaseTransformer";

export class RoCrateTransformer implements BaseTransformer {
  importObject(): ResearchObject {
    return { version: 1 };
  }
  exportObject(obj: ResearchObject) {
    return null;
  }
}
