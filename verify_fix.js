const axios = require('axios');

async function verifyFix() {
    const code = 'VO44QQPN5FWT';
    const email = 'ruatfela4964@gmail.com';
    const url = 'http://localhost:10000/api/validate-code';

    console.log(`🧪 Testing validation for code: ${code}`);

    try {
        const response = await axios.post(url, {
            code: code,
            email: email
        });

        console.log('📡 Response:', JSON.stringify(response.data, null, 2));

        if (response.data.success && response.data.valid) {
            console.log('✅ Verification PASSED: Code is valid!');
        } else {
            console.log('❌ Verification FAILED:', response.data.message);
        }
    } catch (error) {
        console.error('❌ Error during verification:', error.response ? error.response.data : error.message);
        console.log('\n⚠️ Note: Ensure the server is running on port 10000 before running this script.');
    }
}

verifyFix();
