import { join, resolve } from 'path';

import { Request, Response } from 'express';
import latex from 'node-latex';

const upload = function (req: Request, res: Response) {
  const options = {
    inputs: [resolve(join(__dirname, '/'))],
    cmd: 'xelatex',
    passes: 2,
  };

  res.setHeader('Content-Type', 'application/pdf');

  const buf = new Buffer(req.body.foo.toString('utf8'), 'base64');
  const text = buf.toString();

  const pdf = latex(text, options);

  pdf.pipe(res);
  pdf.on('error', (err) => {
    console.log(err.message);
    res.removeHeader('Content-Type');
    res.status(400).send(JSON.stringify({ error: err.message }));
  });
  pdf.on('finish', () => {
    /** */
  });
};

export default upload;
