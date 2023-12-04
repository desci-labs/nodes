import { Request, Response } from 'express';
import server from '../../server.js';
import { ResearchObjectDocument } from '../../types.js';
import { ResearchObjectComponentType, ResearchObjectV1 } from '@desci-labs/desci-models';
import prisma from '../../client.js';

const researchObject: ResearchObjectV1 = {
  title: '',
  version: 'desci-nodes-0.2.0',
  components: [
    {
      id: 'root',
      name: 'root',
      type: ResearchObjectComponentType.DATA_BUCKET,
      payload: {
        cid: 'bafybeicrsddlvfbbo5s3upvjbtb5flc73iupxfy2kf3rv43kkbvegbqbwq',
        path: 'root',
      },
    },
  ],
  authors: [],
  researchFields: [],
  defaultLicense: 'CC BY',
};

const getNodeDocument = async function (req: Request, res: Response) {
  try {
    const repo = server.repo;
    console.log('REQ', req.params, repo.networkSubsystem.peerId);
    const node = await prisma.node.findMany();
    // const node = await prisma.node.findFirst({
    //   where: { uuid: req.params.uuid.endsWith('.') ? req.params.uuid : `${req.params.uuid}.` },
    // });
    console.log('NODE FOUND', node);
    res.status(200).send({ documentId: '2ZNaMBfKDHRQU6aXC9KNt5zXggmB' });
  } catch (err) {
    console.log(err);
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};

const createNodeDocument = async function (req: Request, res: Response) {
  console.log('REQ', req.params, req.query);
  try {
    const repo = server.repo;
    console.log('REPO', repo.networkSubsystem.peerId);
    console.log(req.body, req.params, req.query);
    const uuid = req?.params.uuid;
    const handle = repo.create<ResearchObjectDocument>();
    console.log('[AUTOMERGE]::[HANDLE NEW]', { uuid }, handle.url, handle.documentId);
    handle.change((d) => {
      d.manifest = researchObject;
      d.uuid = uuid;
    });
    this.nodeUuidToDocIcMap.set(uuid, handle.documentId);
    handle.docSync();

    const document = await handle.doc();
    console.log('[AUTOMERGE]::[HANDLE NEW CHANGED]', handle.url, handle.isReady(), document);
    console.log('REPO', repo);

    res.status(200).send({ ok: true, documentId: '' });
  } catch (err) {
    console.log(err);
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};

export { createNodeDocument, getNodeDocument };
