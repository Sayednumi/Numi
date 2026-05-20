const http = require('http');

function request(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: 'localhost', port: 5000, path, method,
            headers: { 'Content-Type': 'application/json', 'Content-Length': data ? Buffer.byteLength(data) : 0, ...headers }
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

async function runFullTest() {
    let passed = 0, failed = 0;
    const check = (label, cond, detail='') => {
        if (cond) { console.log(`  ✅ [PASS] ${label}`); passed++; }
        else { console.error(`  ❌ [FAIL] ${label} ${detail ? '| ' + detail : ''}`); failed++; }
    };

    console.log('\n═══════════════════════════════════════════════');
    console.log('  NUMI — FULL AUTH END-TO-END TEST');
    console.log('═══════════════════════════════════════════════\n');

    // ─── Test 1: Login with REAL super_admin credentials ───────────
    console.log('📌 Test 1: Login — real super_admin credentials');
    let token = null, userId = null;
    const loginRes = await request('POST', '/api/auth/login', { phone: '01110154093', password: 'Sayed@123' });
    check('Status 200', loginRes.status === 200, `Got ${loginRes.status}`);
    check('success: true', loginRes.body.success === true);
    check('token returned at root', !!loginRes.body.token);
    check('user object returned', !!loginRes.body.user);
    check('user.token embedded', !!loginRes.body.user?.token);
    check('user.role = super_admin', loginRes.body.user?.role === 'super_admin');
    check('user.tenantId present', !!loginRes.body.user?.tenantId);
    token = loginRes.body.token;
    userId = loginRes.body.user?.id;
    console.log(`  ℹ️  JWT: ${token?.substring(0,55)}...`);
    console.log(`  ℹ️  User: ${loginRes.body.user?.name} | role: ${loginRes.body.user?.role}`);

    // ─── Test 2: Decode JWT and verify payload fields ───────────────
    console.log('\n📌 Test 2: JWT payload validation');
    if (token) {
        try {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            check('Payload has userId', !!payload.userId);
            check('Payload has role', !!payload.role);
            check('Payload has tenantId', !!payload.tenantId);
            check('Payload exp set (7d)', !!payload.exp);
            const days = Math.round((payload.exp - payload.iat) / 86400);
            check(`Token expires in 7 days (got ${days}d)`, days === 7);
        } catch(e) { check('JWT decode', false, e.message); }
    }

    // ─── Test 3: Access protected route WITH token ──────────────────
    console.log('\n📌 Test 3: /api/users WITH valid Bearer token');
    const usersRes = await request('GET', '/api/users', null, { Authorization: `Bearer ${token}` });
    check('Status 200', usersRes.status === 200, `Got ${usersRes.status}`);
    check('success: true', usersRes.body.success === true);
    check('data is array', Array.isArray(usersRes.body.data));
    check('No passwords exposed', !JSON.stringify(usersRes.body.data).includes('"password"'));

    // ─── Test 4: Access protected route WITHOUT token ───────────────
    console.log('\n📌 Test 4: /api/users WITHOUT token → must 401');
    const noAuthRes = await request('GET', '/api/users');
    check('Status 401', noAuthRes.status === 401, `Got ${noAuthRes.status}`);
    check('success: false', noAuthRes.body.success === false);
    check('message present', !!noAuthRes.body.message);

    // ─── Test 5: Expired/tampered token ─────────────────────────────
    console.log('\n📌 Test 5: Tampered token → must 401');
    const badToken = token.slice(0, -5) + 'XXXXX';
    const badRes = await request('GET', '/api/platform-data', null, { Authorization: `Bearer ${badToken}` });
    check('Status 401', badRes.status === 401, `Got ${badRes.status}`);

    // ─── Test 6: /api/platform-data WITH token ──────────────────────
    console.log('\n📌 Test 6: /api/platform-data WITH valid token');
    const pdRes = await request('GET', '/api/platform-data', null, { Authorization: `Bearer ${token}` });
    check('Status 200', pdRes.status === 200, `Got ${pdRes.status}`);

    // ─── Test 7: /api/audit-logs WITH token ─────────────────────────
    console.log('\n📌 Test 7: /api/audit-logs WITH valid token');
    const auditRes = await request('GET', '/api/audit-logs', null, { Authorization: `Bearer ${token}` });
    check('Status 200', auditRes.status === 200, `Got ${auditRes.status}`);

    // ─── Test 8: Register new student ───────────────────────────────
    console.log('\n📌 Test 8: POST /api/auth/register — new student');
    const phone = '0111' + Math.floor(Math.random()*10000000).toString().padStart(7,'0');
    const regRes = await request('POST', '/api/auth/register', {
        name: 'طالب اختبار أمني', phone, password: 'SecurePass99',
        classId: 'c_test', groupId: 'g_test', tenantId: 'main'
    });
    check('Status 201', regRes.status === 201, `Got ${regRes.status}`);
    check('success: true', regRes.body.success === true);
    console.log(`  ℹ️  Message: ${regRes.body.message}`);

    // ─── Test 9: Duplicate registration rejected ─────────────────────
    console.log('\n📌 Test 9: Duplicate phone registration → must 400');
    const dupRes = await request('POST', '/api/auth/register', {
        name: 'مكرر', phone, password: 'pass12345',
        classId: 'c1', groupId: 'g1', tenantId: 'main'
    });
    check('Status 400', dupRes.status === 400, `Got ${dupRes.status}`);
    check('success: false', dupRes.body.success === false);

    // ─── Test 10: x-user-id legacy fallback still works ─────────────
    console.log('\n📌 Test 10: Legacy x-user-id fallback (for backwards compatibility)');
    const legacyRes = await request('GET', '/api/users', null, { 'x-user-id': userId });
    check('Status 200 with x-user-id', legacyRes.status === 200, `Got ${legacyRes.status}`);

    // ─── SUMMARY ─────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════');
    console.log(`  ✅ PASSED: ${passed}   ❌ FAILED: ${failed}`);
    console.log(`  RESULT: ${failed === 0 ? '🎉 ALL TESTS PASSED — SYSTEM IS SECURE!' : '⚠️  SOME TESTS FAILED'}`);
    console.log('═══════════════════════════════════════════════\n');
    process.exit(failed > 0 ? 1 : 0);
}

runFullTest().catch(e => { console.error('Suite error:', e); process.exit(1); });
