import express from 'express';

const app = express();
const PORT = process.env.PORT || 7777;

app.get('/health', (req, res) => {
  return res.send('healthy');
});

app.listen(PORT, () => {
  console.log(`[Media Server Isolated]Server is listening on port: ${PORT}`);
});
