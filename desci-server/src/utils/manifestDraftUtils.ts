import { PdfComponentPayload, ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';

export const cleanManifestForSaving = (manifest: ResearchObjectV1) => {
  manifest.components = manifest.components.map((c) => {
    if (c.type == ResearchObjectComponentType.PDF) {
      (c.payload as PdfComponentPayload).annotations?.forEach((a) => {
        delete a.__client;
      });
    }
    return c;
  });
};

export const createManifest = (data: any) => {
  return Buffer.from(JSON.stringify(data));
};
