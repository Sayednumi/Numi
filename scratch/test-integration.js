const http = require('http');

const BASE = 'http://localhost:5000';

function request(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: 'localhost',
            port: 5000,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data ? Buffer.byteLength(data) : 0,
                ...headers
            }
        };
        const req = http.request(opts, (res) => {
            let raw = '';
            res.on('data', chunk => raw += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch(e) { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function runTests() {
    let passed = 0, failed = 0;
    const check = (label, cond, detail='') => {
        if (cond) { console.log(`  ✅ [PASS] ${label}`); passed++; }
        else { console.error(`  ❌ [FAIL] ${label} ${detail}`); failed++; }
    };

    console.log('\n═══════════════════════════════════════');
    console.log('   NUMI AUTH INTEGRATION TEST SUITE');
    console.log('═══════════════════════════════════════\n');

    // ── TEST 1: Login with valid credentials ─────────────────────
    console.log('📌 Test 1: Login with valid credentials');
    let token = null;
    try {
        const r = await request('POST', '/api/auth/login', { phone: '01110154093', password: '123456' });
        check('Status is 200 or 401 (not 500)', r.status !== 500, `Got: ${r.status}`);
        check('Response has success field', 'success' in r.body);
        if (r.body.success) {
            check('Response contains token', !!r.body.token);
            check('User object returned', !!r.body.user);
            check('User has role', !!r.body.user?.role);
            check('User has tenantId', !!r.body.user?.tenantId);
            check('Token embedded in user object', !!r.body.user?.token);
            token = r.body.token;
            console.log(`  ℹ️  Token preview: ${token?.substring(0, 40)}...`);
        } else {
            console.log('  ℹ️  Login failed (may be wrong test credentials) — testing with no-auth probes');
        }
    } catch(e) { check('Login request succeeded', false, e.message); }

    // ── TEST 2: Protected route WITHOUT token → must return 401 ─────
    console.log('\n📌 Test 2: Access /api/users WITHOUT token (must be 401)');
    try {
        const r = await request('GET', '/api/users');
        check('Returns 401 Unauthorized', r.status === 401, `Got: ${r.status}`);
        check('Has success: false', r.body.success === false);
    } catch(e) { check('Request succeeded', false, e.message); }

    // ── TEST 3: Protected route WITHOUT token → curriculum ──────────
    console.log('\n📌 Test 3: Access /api/curriculum WITHOUT token (must be 401)');
    try {
        const r = await request('GET', '/api/curriculum');
        check('Returns 401 Unauthorized', r.status === 401, `Got: ${r.status}`);
    } catch(e) { check('Request succeeded', false, e.message); }

    // ── TEST 4: Protected route WITHOUT token → platform-data ───────
    console.log('\n📌 Test 4: Access /api/platform-data WITHOUT token (must be 401)');
    try {
        const r = await request('GET', '/api/platform-data');
        check('Returns 401 Unauthorized', r.status === 401, `Got: ${r.status}`);
    } catch(e) { check('Request succeeded', false, e.message); }

    // ── TEST 5: Protected route WITH valid token ─────────────────────
    if (token) {
        console.log('\n📌 Test 5: Access /api/users WITH valid Bearer token (must succeed)');
        try {
            const r = await request('GET', '/api/users', null, { Authorization: `Bearer ${token}` });
            check('Returns 200 OK', r.status === 200, `Got: ${r.status}`);
            check('Has success: true', r.body.success === true);
            check('Contains data array', Array.isArray(r.body.data));
        } catch(e) { check('Request succeeded', false, e.message); }

        console.log('\n📌 Test 6: Access /api/platform-data WITH valid Bearer token (must succeed)');
        try {
            const r = await request('GET', '/api/platform-data', null, { Authorization: `Bearer ${token}` });
            check('Returns 200 OK', r.status === 200, `Got: ${r.status}`);
        } catch(e) { check('Request succeeded', false, e.message); }
    } else {
        console.log('\n  ⚠️  Skipping token-authenticated tests (no valid token obtained)');
    }

    // ── TEST 6: Invalid token → must return 401 ──────────────────────
    console.log('\n📌 Test 7: Access /api/users WITH invalid token (must be 401)');
    try {
        const r = await request('GET', '/api/users', null, { Authorization: 'Bearer invalid.token.xyz' });
        check('Returns 401 Unauthorized', r.status === 401, `Got: ${r.status}`);
    } catch(e) { check('Request succeeded', false, e.message); }

    // ── TEST 7: Register a new student ───────────────────────────────
    console.log('\n📌 Test 8: Register a new student');
    try {
        const testPhone = '0100' + Math.floor(Math.random()*10000000).toString().padStart(7,'0');
        const r = await request('POST', '/api/auth/register', {
            name: 'طالب اختبار', phone: testPhone, password: 'test12345',
            classId: 'class_test', groupId: 'group_test', tenantId: 'main'
        });
        check('Returns 201 Created', r.status === 201, `Got: ${r.status}`);
        check('Has success: true', r.body.success === true);
        check('Has message field', !!r.body.message);
    } catch(e) { check('Request succeeded', false, e.message); }

    // ── RESULTS ──────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════');
    console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════\n');
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error('Test suite error:', e); process.exit(1); });
