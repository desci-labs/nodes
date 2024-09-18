const pg = await import('pg').then((value) => value.default);
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: '-c search_path=public',
});

pool.on('error', (err, client) => {
  // This is fine, client is booted out of the pool already when this happens
  console.warn('[db::pool] Unexpected error on idle client', err, client);
});

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
