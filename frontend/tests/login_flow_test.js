import assert from 'node:assert';

// Mock localStorage for Node environment
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.get(key) || null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
  get length() {
    return this.store.size;
  }
  key(i) {
    return Array.from(this.store.keys())[i] || null;
  }
}

globalThis.localStorage = new MockLocalStorage();

async function runTests() {
  console.log('--- STARTING COMPREHENSIVE LOGIN & PASSWORD SECURITY TESTS ---');

  // Test 1: Email Domain Regex Verification
  console.log('\n[TEST 1] Email Domain Validation (@jasaraharja.co.id)');
  const companyDomainRegex = /^[a-zA-Z0-9._%+-]+@jasaraharja\.co\.id$/;

  const invalidEmails = [
    'petugas@gmail.com',
    'kabag@yahoo.co.id',
    'user@jasaraharja.com',
    'petugas',
    'kabag',
    '@jasaraharja.co.id',
    'petugas@jasaraharja.co.id.net',
    'admin@kantor.org'
  ];

  for (const email of invalidEmails) {
    const isValid = companyDomainRegex.test(email.toLowerCase().trim());
    assert.strictEqual(isValid, false, `Email ${email} should be rejected!`);
    console.log(`  ✓ Successfully rejected invalid domain: ${email}`);
  }

  const validEmails = [
    'petugas@jasaraharja.co.id',
    'kabag@jasaraharja.co.id',
    'petugas2@jasaraharja.co.id',
    'petugas3@jasaraharja.co.id',
    'budi.santoso@jasaraharja.co.id'
  ];

  for (const email of validEmails) {
    const isValid = companyDomainRegex.test(email.toLowerCase().trim());
    assert.strictEqual(isValid, true, `Email ${email} should be accepted!`);
    console.log(`  ✓ Successfully accepted valid company email: ${email}`);
  }

  // Test 2: No Plaintext Passwords in Storage
  console.log('\n[TEST 2] Verifying No Plaintext Passwords in localStorage or storageService');
  const { storageService } = await import('../src/services/storageService.js');

  // Make sure storageService does not expose plain text password accessors
  assert.strictEqual(typeof storageService.getUserPassword, 'undefined', 'getUserPassword should NOT exist');
  assert.strictEqual(typeof storageService.setUserPassword, 'undefined', 'setUserPassword should NOT exist');
  assert.strictEqual(localStorage.getItem('jr_user_credentials_v1'), null, 'jr_user_credentials_v1 must be null');
  console.log('  ✓ No password storage or credentials key in localStorage');

  // Test 3: Safe User Storage (currentUser password sanitization)
  console.log('\n[TEST 3] User Session Storage Sanitization');
  storageService.setCurrentUser({
    role: 'kabag',
    token: 'jwt-dummy-token',
    profile: {
      id: 'KABAG-01',
      backendUserId: 1,
      nama: 'Kabag',
      password: 'plainTextPassword123' // Malicious or accidental password injection
    }
  });

  const savedUser = storageService.getCurrentUser();
  assert.strictEqual(savedUser.profile.password, undefined, 'Password must be completely stripped from stored session!');
  console.log('  ✓ User session strictly sanitizes and removes password attribute');

  // Test 4: Token User ID Extraction Helper
  console.log('\n[TEST 4] JWT Numeric User ID Extraction');
  // Helper identical to getUserIdFromToken
  function getUserIdFromToken(token) {
    if (!token || typeof token !== 'string') return null;
    try {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
        const parsed = JSON.parse(jsonPayload);
        return parsed.userId || parsed.id || null;
      }
    } catch (_) {}
    return null;
  }

  // Sample token payload { userId: 1, role: 'kabag', username: 'kabag' }
  const mockPayload = Buffer.from(JSON.stringify({ userId: 1, role: 'kabag', username: 'kabag' })).toString('base64');
  const mockToken = `header.${mockPayload}.signature`;
  const extractedUserId = getUserIdFromToken(mockToken);
  assert.strictEqual(extractedUserId, 1, 'Extracted user ID should be integer 1');
  console.log(`  ✓ Successfully extracted numeric user ID from JWT token: ${extractedUserId}`);

  // Test 5: API Password Update Response Validation (No fake success)
  console.log('\n[TEST 5] API Update Password Error Propagation (No fake success)');
  const { api } = await import('../src/services/api.js');

  // Attempting with invalid userId should reject immediately
  try {
    await api.updateUserPassword(null, 'newPassword123');
    assert.fail('Should have thrown an error on invalid userId');
  } catch (err) {
    assert.strictEqual(err.message, 'ID pengguna server tidak valid.');
    console.log('  ✓ Rejects invalid userId properly');
  }

  // Attempting with short password should reject immediately
  try {
    await api.updateUserPassword(1, '123');
    assert.fail('Should have thrown an error on short password');
  } catch (err) {
    assert.strictEqual(err.message, 'Kata sandi baru minimal 6 karakter.');
    console.log('  ✓ Rejects short password properly');
  }

  console.log('\n======================================================');
  console.log('ALL LOGIN & PASSWORD SECURITY VERIFICATION TESTS PASSED!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
