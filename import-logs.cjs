const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');

// Path to your service account key JSON
const serviceAccount = require('./serviceAccountKey.json'); // Download from Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const BATCH_SIZE = 400; // Firestore batch limit is 500

async function importLogs(csvFile) {
  const logs = [];
  fs.createReadStream(csvFile)
    .pipe(csv({ separator: '\t' })) // <-- Use tab as delimiter
    .on('data', (row) => {
      // Skip rows with missing required fields
      if (!row.Store || !row.Area || !row.Timestamp || !row.IP) return;
      logs.push({
        store: String(row.Store),
        area: row.Area,
        ts: new Date(row.Timestamp),
        ip: row.IP
      });
    })
    .on('end', async () => {
      let batch = db.batch();
      let count = 0;
      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        const ref = db.collection('logs').doc();
        batch.set(ref, log);
        count++;
        if (count % BATCH_SIZE === 0 || i === logs.length - 1) {
          await batch.commit();
          batch = db.batch();
        }
      }
      console.log(`Imported ${logs.length} logs.`);
    });
}

importLogs('your-logs.csv'); // Replace with your CSV filename