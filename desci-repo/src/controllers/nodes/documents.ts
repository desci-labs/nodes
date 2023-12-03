import { Request, Response } from 'express';
import server from '../../server.js';

const getNodeDocument = async function (req: Request, res: Response) {
  console.log('REQ', req.params, req.query);
  try {
    const repo = server.repo;
    console.log('REPO', repo.networkSubsystem.peerId);
    res.status(200).send({ documentId: repo.networkSubsystem.peerId });
  } catch (err) {
    console.log(err);
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};

const createNodeDocument = async function (req: Request, res: Response) {
  console.log('REQ', req.params, req.query);
  try {
    const repo = server.repo;
    console.log('REPO', repo);
    res.status(200).send({ ok: true, documentId: '' });
  } catch (err) {
    console.log(err);
    res.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};

export { createNodeDocument, getNodeDocument };
