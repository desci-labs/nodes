// write a script to fix a dpid passed as an arg

import { fixDpid } from '../services/fixDpid.js';

const dpid = process.argv[2];
fixDpid(dpid);
