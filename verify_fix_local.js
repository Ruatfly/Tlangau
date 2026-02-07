const Database = require('./database');
require('dotenv').config();

async function runTest() {
    console.log('🧪 Starting Access Code Fix Verification...');

    const db = new Database();
    try {
        await db.init();
        console.log('✅ Database initialized');

        const testCode = 'TEST_FIX_' + Math.random().toString(36).substr(2, 5).toUpperCase();
        const testEmail = 'test@example.com';
        const orderId = 'test_order_' + Date.now();

        console.log(`\n1️⃣ Testing createAccessCode with normalization...`);
        // Test 1: Create code without expires_at (should be added automatically)
        await db.createAccessCode({
            code: testCode,
            email: testEmail,
            orderId: orderId,
            used: false
        });

        const fetchedCode = await db.getCodeByCode(testCode);
        console.log('Fetched Code:', JSON.stringify(fetchedCode, null, 2));

        if (fetchedCode.expires_at && fetchedCode.expiresAt && fetchedCode.expires_at === fetchedCode.expiresAt) {
            console.log('✅ PASS: Expiration fields normalized and added');
        } else {
            console.error('❌ FAIL: Expiration fields not normalized correctly');
        }

        console.log(`\n2️⃣ Testing getAllAccessCodes normalization...`);
        const allCodes = await db.getAllAccessCodes();
        const testMatch = allCodes.find(c => c.code === testCode);

        if (testMatch && testMatch.expires_at && testMatch.expiresAt) {
            console.log('✅ PASS: getAllAccessCodes normalized correctly');
        } else {
            console.error('❌ FAIL: getAllAccessCodes normalization failed');
        }

        console.log(`\n3️⃣ Testing fallback logic (Simulated)...`);
        // We'll manually inject a code with missing expires_at to Firebase to test getCodeByCode normalization
        const legacyCode = 'LEGACY_' + Math.random().toString(36).substr(2, 5).toUpperCase();
        await db.db.ref(`access_codes/${legacyCode}`).set({
            code: legacyCode,
            email: testEmail,
            order_id: orderId,
            created_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(), // 31 days ago
            used: false
        });

        const fetchedLegacy = await db.getCodeByCode(legacyCode);
        console.log('Fetched Legacy Code (before fallback):', JSON.stringify(fetchedLegacy, null, 2));

        // Note: database.js getCodeByCode doesn't add the 30-day fallback, it just normalizes existing fields.
        // The 30-day fallback is in server.js validation logic.

        console.log('\n✅ Verification Script Completed');

        // Clean up
        await db.deleteAccessCode(testCode);
        await db.deleteAccessCode(legacyCode);
        console.log('🧹 Cleaned up test data');

    } catch (error) {
        console.error('❌ Verification Error:', error);
    } finally {
        process.exit(0);
    }
}

runTest();
