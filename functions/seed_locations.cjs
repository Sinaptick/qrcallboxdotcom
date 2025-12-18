// Seed script to initialize qr_locations collection
const admin = require('firebase-admin');

// Initialize with default credentials
admin.initializeApp({
  projectId: 'qrwebaccdb'
});

const db = admin.firestore();

const INITIAL_LOCATIONS = [
  { id: "electronics", name: "Electronics", order: 1 },
  { id: "beauty", name: "Beauty & Cosmetics", order: 2 },
  { id: "grocery", name: "Grocery", order: 3 },
  { id: "pharmacy", name: "Pharmacy", order: 4 },
  { id: "automotive", name: "Automotive", order: 5 },
  { id: "sporting", name: "Sporting Goods", order: 6 },
  { id: "toys", name: "Toys", order: 7 },
  { id: "apparel", name: "Apparel", order: 8 },
  { id: "home", name: "Home & Furniture", order: 9 },
  { id: "garden", name: "Lawn & Garden", order: 10 },
  { id: "pets", name: "Pets", order: 11 },
  { id: "baby", name: "Baby", order: 12 },
  { id: "jewelry", name: "Jewelry", order: 13 },
  { id: "optical", name: "Optical", order: 14 },
  { id: "wireless", name: "Wireless/Photo", order: 15 },
  { id: "checkout", name: "Front End/Checkout", order: 16 },
];

async function seedLocations() {
  const batch = db.batch();
  
  for (const loc of INITIAL_LOCATIONS) {
    const ref = db.collection('qr_locations').doc(loc.id);
    batch.set(ref, {
      name: loc.name,
      order: loc.order,
      active: true,
      // Future: allowedJobCodes: [], allowedUserIds: []
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  
  await batch.commit();
  console.log('Seeded', INITIAL_LOCATIONS.length, 'locations');
}

seedLocations().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
