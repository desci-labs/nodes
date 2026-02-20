import { ResearchObject } from '../ResearchObject';
interface ImportFunc {
  (input: any): ResearchObject;
}
interface ExportFunc {
  (input: ResearchObject, metadata?: any): any;
}
export interface BaseTransformer {
  importObject: ImportFunc;
  exportObject: ExportFunc;
}
