import { Request, Response, NextFunction } from 'express';
import grpc from 'grpc';
// import * as Mirror from 'desci-nodes-mirror/mirror/v1/mirror_grpc_pb';
// import { EnqueueRequest, RemoteFile } from 'desci-nodes-mirror/mirror/v1/mirror_pb';

export const test = async (req: Request, res: Response, next: NextFunction) => {
  // const client = new Mirror.MirrorServiceClient('0.0.0.0:8080', grpc.credentials.createInsecure());
  // const request = new EnqueueRequest();
  // const f = new RemoteFile();
  // f.setUrl('https://arxiv.org/pdf/2203.03614.pdf');
  // request.addFiles(f);
  // const handle = (result: any, b: any) => {
  //   console.log('RESULT');
  //   console.log(result);
  //   res.send({ ok: 1, result, b });
  // };
  // try {
  //   console.log("ENQUEUE");
  //   client.enqueue(request, null, handle);
  // } catch (err) {
  //   console.error("go error");
  //   res.status(500);
  // }
};
