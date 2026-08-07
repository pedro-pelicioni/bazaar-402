import { withBazaar } from '@x402/extensions/bazaar';
import { HTTPFacilitatorClient } from '@x402/core/http';

const fac = new HTTPFacilitatorClient({ url: 'https://sextants.dev' });
const client = withBazaar(fac);

const search = await client.extensions.bazaar.search({ query: 'weather', limit: 2 });
console.log('SEARCH keys =', Object.keys(search));
console.log('search.resources =', search.resources);
try {
  for (const r of search.resources) console.log('  ->', r.resource);
} catch (e) { console.log('ITERATION ERROR:', e.constructor.name + ': ' + e.message); }

const list = await client.extensions.bazaar.listResources({ limit: 1 });
console.log('LIST keys =', Object.keys(list));
const item = list.items?.[0];
console.log('typeof item.resource =', typeof item?.resource);
console.log('item.accepts =', item?.accepts);
console.log('item.lastUpdated =', item?.lastUpdated);
console.log('item.x402Version =', item?.x402Version);
console.log('item.extensions =', JSON.stringify(item?.extensions));
console.log('item.serviceName =', item?.serviceName, '| item.description =', item?.description);
