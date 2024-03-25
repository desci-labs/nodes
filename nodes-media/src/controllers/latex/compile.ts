import fs from 'fs';
import { join } from 'path';

import type { Request, Response } from 'express';
import temp from 'temp';

import parser from './log-parser.js';
import compileTex from './tex-compiler.js';
const compile = function (req: Request, res: Response) {
  try {
    const buf = new Buffer(req.body.foo.toString('utf8'), 'base64');
    const uid = 'tempfile';
    const name = uid + '.tex';

    const data = [];
    const path = temp.mkdirSync('compile');

    fs.writeFileSync(path + '/' + name, buf.toString('utf8'));

    compileTex(path + '/' + name, 'pdflatex')
      .catch((error) => {
        console.error(`tex compilation failed: ${JSON.stringify(error)}`);
      })
      .then(function (results) {
        const start = async () => {
          const stream = fs.readFileSync(path + '/' + uid + '.log', {
            encoding: 'utf8',
          });

          const result = parser().parse(stream, { ignoreDuplicates: true });

          if (result.errors.length > 0) {
            result.errors.forEach(function (item, index) {
              data.push({
                row: --item.line,
                text: item.message,
                type: item.level,
              });
            });
          }
        };

        start().then(function (results) {
          console.log(data);
          removeDir(path);
          res.setHeader('Content-Type', 'application/json');
          res.status(200).send(JSON.stringify(data));
        });
      });
  } catch (err) {
    console.log(err);
    res.status(500).send(JSON.stringify(err));
  }
};
const removeDir = function (dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const list = fs.readdirSync(dirPath);
  for (let i = 0; i < list.length; i++) {
    const filename = join(dirPath, list[i]);
    const stat = fs.statSync(filename);
    console.log('removing: ' + filename);
    if (filename == '.' || filename == '..') {
      // do nothing for current and parent dir
    } else if (stat.isDirectory()) {
      removeDir(filename);
    } else {
      fs.unlinkSync(filename);
    }
  }
  console.log('removing: ' + dirPath);
  fs.rmdirSync(dirPath);
};
export default compile;
