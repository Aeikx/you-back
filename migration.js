const fs = require('fs');
const admin = require('firebase-admin');

// Firebase Admin SDK 초기화
const serviceAccount = require('./cj-escape-room-firebase-adminsdk-fbsvc-8c9c1d97d2.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 데이터 마이그레이션 함수
async function migrateData() {
  console.log('Starting data migration...');

  // 1. users.json -> users 컬렉션
  try {
    const usersData = JSON.parse(fs.readFileSync('./DB/users.json', 'utf8'));
    const usersCollection = db.collection('users');
    const batch = db.batch();

    usersData.forEach(user => {
      // userId를 문서 ID로 사용
      const docRef = usersCollection.doc(user.userId);
      batch.set(docRef, user);
    });

    await batch.commit();
    console.log(`Successfully migrated ${usersData.length} users.`);
  } catch (error) {
    console.error('Error migrating users.json:', error);
  }

  // 2. users_clear.json -> users_clear 컬렉션
  try {
    const usersClearData = JSON.parse(fs.readFileSync('./DB/users_clear.json', 'utf8'));
    const usersClearCollection = db.collection('users_clear');
    const batch = db.batch();

    usersClearData.forEach(clearData => {
      // userId를 문서 ID로 사용
      const docRef = usersClearCollection.doc(clearData.userId);
      batch.set(docRef, clearData);
    });

    await batch.commit();
    console.log(`Successfully migrated ${usersClearData.length} user clear statuses.`);
  } catch (error) {
    console.error('Error migrating users_clear.json:', error);
  }

  // 3. hall_of_fame.json -> hall_of_fame 컬렉션
  try {
    const hallOfFameData = JSON.parse(fs.readFileSync('./DB/hall_of_fame.json', 'utf8'));
    const hallOfFameCollection = db.collection('hall_of_fame');
    const batch = db.batch();

    hallOfFameData.forEach(rank => {
        // 자동 생성 ID 사용
        const docRef = hallOfFameCollection.doc();
        batch.set(docRef, rank);
    });
    
    await batch.commit();
    console.log(`Successfully migrated ${hallOfFameData.length} hall of fame entries.`);
  } catch (error) {
    console.error('Error migrating hall_of_fame.json:', error);
  }

  console.log('Data migration finished.');
}

migrateData();
