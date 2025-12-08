const admin = require('firebase-admin');
const serviceAccount = require('./qrwebaccdb-firebase-adminsdk-qd32o-1c4c07fd94.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function calculateMonthlyScores() {
  // Get start of current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  console.log(`\n📊 Calculating scores from ${startOfMonth.toLocaleDateString()} to now...\n`);

  // Query all scans from this month
  const scansSnapshot = await db.collection('scans')
    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startOfMonth))
    .get();

  console.log(`Found ${scansSnapshot.size} total scans this month\n`);

  const userStats = {};

  scansSnapshot.forEach(doc => {
    const data = doc.data();
    const scanTime = data.timestamp?.toDate();

    // Process responses array (notification actions)
    const responses = data.responses || [];
    responses.forEach(response => {
      const userName = response.userName;
      const action = response.action;
      const responseTimestamp = response.timestamp?.toDate();

      if (!userName || !responseTimestamp) return;

      // Filter by business hours (6 AM - 11 PM)
      const hour = responseTimestamp.getHours();
      if (hour < 6 || hour > 22) return;

      if (!userStats[userName]) {
        userStats[userName] = {
          assists: 0,
          ignores: 0,
          timeouts: 0,
          responseTimes: []
        };
      }

      if (action === 'assist') {
        userStats[userName].assists++;

        const responseTimeMs = response.responseTime || (responseTimestamp.getTime() - scanTime.getTime());
        userStats[userName].responseTimes.push(responseTimeMs);
      } else if (action === 'ignore') {
        if (response.source === 'timeout') {
          userStats[userName].timeouts++;
        } else {
          userStats[userName].ignores++;
        }
      }
    });
  });

  // Calculate weighted scores
  Object.keys(userStats).forEach(userName => {
    const stats = userStats[userName];
    let score = 0;

    // Base assist points
    score += stats.assists * 100;

    // Speed bonuses
    stats.responseTimes.forEach(timeMs => {
      const timeSec = timeMs / 1000;
      if (timeSec < 30) score += 25;
      else if (timeSec < 60) score += 15;
      else if (timeSec < 120) score += 10;
      else if (timeSec < 180) score += 5;
      else if (timeSec < 300) score += 0;
      else score -= 10;
    });

    // Penalties
    score -= stats.ignores * 5;
    score -= stats.timeouts * 50;

    stats.score = score;

    // Calculate average response time
    if (stats.responseTimes.length > 0) {
      const avgMs = stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length;
      stats.avgResponseTime = (avgMs / 1000).toFixed(1) + 's';
    } else {
      stats.avgResponseTime = 'N/A';
    }
  });

  // Find shane smith and Juan Montalvo (case insensitive)
  const shaneKey = Object.keys(userStats).find(k => k.toLowerCase().includes('shane') && k.toLowerCase().includes('smith'));
  const juanKey = Object.keys(userStats).find(k => k.toLowerCase().includes('juan') && k.toLowerCase().includes('montalvo'));

  console.log('='.repeat(60));
  console.log('MONTHLY LEADERBOARD SCORES');
  console.log('='.repeat(60));

  if (shaneKey) {
    const s = userStats[shaneKey];
    console.log(`\n👤 ${shaneKey}:`);
    console.log(`   Score: ${s.score} pts`);
    console.log(`   Assists: ${s.assists}`);
    console.log(`   Ignores: ${s.ignores}`);
    console.log(`   Timeouts: ${s.timeouts}`);
    console.log(`   Avg Response: ${s.avgResponseTime}`);
  } else {
    console.log('\n👤 Shane Smith: NOT FOUND in this month\'s data');
  }

  if (juanKey) {
    const j = userStats[juanKey];
    console.log(`\n👤 ${juanKey}:`);
    console.log(`   Score: ${j.score} pts`);
    console.log(`   Assists: ${j.assists}`);
    console.log(`   Ignores: ${j.ignores}`);
    console.log(`   Timeouts: ${j.timeouts}`);
    console.log(`   Avg Response: ${j.avgResponseTime}`);
  } else {
    console.log('\n👤 Juan Montalvo: NOT FOUND in this month\'s data');
  }

  // Show top 10
  console.log('\n' + '='.repeat(60));
  console.log('TOP 10 THIS MONTH (ALL STORES)');
  console.log('='.repeat(60));

  const sorted = Object.entries(userStats)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  sorted.forEach((user, i) => {
    console.log(`\n${i + 1}. ${user.name}`);
    console.log(`   Score: ${user.score} | Assists: ${user.assists} | Avg: ${user.avgResponseTime}`);
  });

  console.log('\n');

  process.exit(0);
}

calculateMonthlyScores().catch(console.error);
