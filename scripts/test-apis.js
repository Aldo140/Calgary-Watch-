import https from 'https';

const TIMEOUT_MS = 10000;

function fetchAPI(name, url) {
  return new Promise((resolve) => {
    const start = Date.now();
    let isSettled = false;

    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (isSettled) return;
        isSettled = true;
        const ms = Date.now() - start;
        let success = true;
        let count = 0;
        let errorMessage = '';

        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const parsed = JSON.parse(data);
            count = Array.isArray(parsed) ? parsed.length : 1;
          } else {
            success = false;
            errorMessage = `HTTP ${res.statusCode}`;
          }
        } catch (e) {
          success = false;
          errorMessage = 'JSON Parse Error';
        }

        resolve({ name, success, ms, count, errorMessage });
      });
    });

    req.on('error', (e) => {
      if (isSettled) return;
      isSettled = true;
      resolve({ name, success: false, ms: Date.now() - start, count: 0, errorMessage: e.message });
    });

    req.setTimeout(TIMEOUT_MS, () => {
      if (isSettled) return;
      isSettled = true;
      req.destroy();
      resolve({ name, success: false, ms: TIMEOUT_MS, count: 0, errorMessage: 'Timeout' });
    });
  });
}

async function runTests() {
  console.log('Testing Calgary Open Data APIs...\n');
  const endpoints = [
    { name: 'City of Calgary Traffic Incidents', url: 'https://data.calgary.ca/resource/35ra-9556.json?$limit=5' },
    { name: 'Calgary 311 Service Requests (Recent)', url: 'https://data.calgary.ca/resource/iahh-g8bj.json?$limit=5&$order=updated_date%20DESC' }
  ];

  const results = await Promise.all(endpoints.map(ep => fetchAPI(ep.name, ep.url)));

  console.table(results);

  const allSuccess = results.every(r => r.success);
  console.log(`\nOverall Status: ${allSuccess ? '✅ ALL SYSTEMS OPERATIONAL' : '❌ API ERRORS DETECTED'}`);
}

runTests();
