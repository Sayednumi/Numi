require('dotenv').config({ path: '../.env' });
const { generateToken, verifyToken } = require('../config/jwt');

const fakeUser = { _id: 'test123', id: 'test123', role: 'admin', tenantId: 'main' };
const token = generateToken(fakeUser);
console.log('JWT Generated OK:', token.substring(0, 60) + '...');

const decoded = verifyToken(token);
console.log('Decoded Payload:', JSON.stringify(decoded, null, 2));

if (decoded && decoded.userId && decoded.role && decoded.tenantId) {
    console.log('\n[PASS] JWT utility works correctly!');
    console.log('[PASS] Payload contains userId:', decoded.userId);
    console.log('[PASS] Payload contains role:', decoded.role);
    console.log('[PASS] Payload contains tenantId:', decoded.tenantId);
} else {
    console.error('[FAIL] JWT payload is missing required fields!');
    process.exit(1);
}

// Test invalid token
const invalid = verifyToken('invalid.token.here');
if (invalid === null) {
    console.log('[PASS] Invalid token correctly returns null');
} else {
    console.error('[FAIL] Invalid token should return null');
    process.exit(1);
}

console.log('\n All JWT tests passed!');
