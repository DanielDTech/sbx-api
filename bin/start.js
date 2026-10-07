import { createStore } from '../src/store.js';
import { apiKeys } from '../src/auth.js';
import { createServer } from '../src/http/server.js';

const port = Number(process.env.PORT ?? 4600);
const store = createStore(process.env.SBX_DATA_FILE ?? 'data/bookmarks.json');
createServer({ store, keys: apiKeys() }).listen(port, () => console.log(`sbx-api on http://localhost:${port}`));
