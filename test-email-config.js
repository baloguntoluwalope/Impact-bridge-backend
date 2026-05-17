#!/usr/bin/env node
/**
 * test-email-config.js
 * 
 * Quick diagnostic script to test email provider connectivity
 * and verify credentials are correct.
 * 
 * Run: node test-email-config.js
 */

require('dotenv').config();
const axios = require('axios');

const tests = {
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  BREVO_FROM_EMAIL: process.env.BREVO_FROM_EMAIL || process.env.EMAIL_FROM,
  BREVO_FROM_NAME: process.env.BREVO_FROM_NAME || 'Impact Bridge',
  TERMII_API_KEY: process.env.TERMII_API_KEY,
  TERMII_BASE_URL: process.env.TERMII_BASE_URL,
};

console.log('\n=== EMAIL CONFIG DIAGNOSTIC ===\n');

// Check if env variables are set
console.log('1️⃣  Environment Variables Check:');
Object.entries(tests).forEach(([key, value]) => {
  const status = value ? '✅' : '❌';
  const display = value 
    ? `${value.substring(0, 20)}${value.length > 20 ? '...' : ''}`
    : 'NOT SET';
  console.log(`   ${status} ${key}: ${display}`);
});

// Test Brevo API connectivity
console.log('\n2️⃣  Testing Brevo API Connectivity...');
(async () => {
  try {
    const brevoClient = axios.create({
      baseURL: 'https://api.brevo.com/v3',
      timeout: 10_000,
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    // Try to hit an endpoint that validates the API key
    const response = await brevoClient.get('/account');
    console.log(`   ✅ Brevo API connection: SUCCESS`);
    console.log(`   ℹ️  Account email: ${response.data.email}`);
    console.log(`   ℹ️  Account plan: ${response.data.plan}`);
  } catch (err) {
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      console.log(`   ❌ Brevo API connection: TIMEOUT`);
      console.log(`      Possible causes:`);
      console.log(`      - Cloud platform firewall blocking api.brevo.com`);
      console.log(`      - Network latency too high`);
      console.log(`      - Brevo API temporarily unavailable`);
    } else if (err.response?.status === 401) {
      console.log(`   ❌ Brevo API authentication: FAILED (401)`);
      console.log(`      Your BREVO_API_KEY is invalid or expired`);
      console.log(`      Error: ${err.response.data.message}`);
    } else {
      console.log(`   ❌ Brevo API error: ${err.message}`);
      if (err.response?.data) {
        console.log(`      Response: ${JSON.stringify(err.response.data)}`);
      }
    }
  }

  // Test Termii connectivity
  console.log('\n3️⃣  Testing Termii API Connectivity...');
  try {
    if (!process.env.TERMII_API_KEY || !process.env.TERMII_BASE_URL) {
      console.log(`   ⚠️  Termii credentials not configured`);
    } else {
      const response = await axios.get(
        `${process.env.TERMII_BASE_URL}/api/verify/balance`,
        {
          params: { api_key: process.env.TERMII_API_KEY },
          timeout: 10_000,
        }
      );
      console.log(`   ✅ Termii API connection: SUCCESS`);
      console.log(`   ℹ️  Balance: ${response.data.balance || 'N/A'}`);
    }
  } catch (err) {
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      console.log(`   ❌ Termii API connection: TIMEOUT`);
    } else if (err.response?.status === 401) {
      console.log(`   ❌ Termii authentication: FAILED`);
      console.log(`      Your TERMII_API_KEY may be invalid`);
    } else {
      console.log(`   ❌ Termii API error: ${err.message}`);
    }
  }

  // Summary and recommendations
  console.log('\n=== RECOMMENDATIONS ===\n');
  if (!process.env.BREVO_API_KEY) {
    console.log('❌ BREVO_API_KEY is missing:');
    console.log('   1. Get your key from https://app.brevo.com/settings/keys/api');
    console.log('   2. Add to .env: BREVO_API_KEY=your_key_here');
  }
  if (!process.env.BREVO_FROM_EMAIL) {
    console.log('❌ BREVO_FROM_EMAIL is missing:');
    console.log('   Add to .env: BREVO_FROM_EMAIL=your@email.com');
  }
  console.log('\n✨ Once you fix the above, restart your worker:');
  console.log('   npm run worker\n');
})();
