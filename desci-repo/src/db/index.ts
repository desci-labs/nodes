// import * as pg from 'pg';

const pg = await import('pg').then((value) => value.default);
const { Pool } = pg;

console.log('DB', process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://walter:white@host.docker.internal:5433/boilerplate',
  options: '-c search_path=public',
});

// pool.on('error', (err, client) => {
//   console.error('Unexpected error on idle client', err, client);
//   // process.exit(-1);
// });

export const client = await pool.connect();

// console.log('DB CLIENT', client.)

export const findNodeByUuid = async (uuid: string) => {
  try {
    const result = await pool.query('SELECT * FROM "Node" WHERE uuid = $1', [uuid]);
    return result.rows[0];
  } catch (err) {
    console.log('[Error]::findNodeByUuid', err);
    return undefined;
  }
};

export const query = async (query: string, values?: (string | number | object)[]) => {
  try {
    // const client = await pool.connect();
    const result = await pool.query(query, values ? values : undefined);
    // console.log('QUERY RESULT', result.rowCount);
    return result.rows;
  } catch (err) {
    console.error('[QUERY ERROR]::', err);
    return undefined;
  }
};
