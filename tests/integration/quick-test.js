/**
 * Quick Integration Test
 * Tests basic functionality without external dependencies
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const TESTS = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, fn) {
  try {
    fn();
    TESTS.passed++;
    TESTS.tests.push({ name, status: 'PASS' });
    console.log(`✅ ${name}`);
  } catch (err) {
    TESTS.failed++;
    TESTS.tests.push({ name, status: 'FAIL', error: err.message });
    console.log(`❌ ${name}: ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('🧪 MediSync Quick Integration Test\n');

// Test 1: Project Structure
test('Project structure exists', () => {
  assert(fs.existsSync('backend'), 'backend directory missing');
  assert(fs.existsSync('bot/discord'), 'bot directory missing');
  assert(fs.existsSync('dashboard'), 'dashboard directory missing');
});

// Test 2: Backend Build
test('Backend compiled successfully', () => {
  assert(fs.existsSync('backend/dist/server.js'), 'Backend build missing');
});

// Test 3: Bot Build  
test('Bot compiled successfully', () => {
  assert(fs.existsSync('bot/discord/dist/bot.js'), 'Bot build missing');
});

// Test 4: Dashboard Build
test('Dashboard built successfully', () => {
  assert(fs.existsSync('dashboard/dist/index.html'), 'Dashboard build missing');
});

// Test 5: Documentation
test('Documentation exists', () => {
  assert(fs.existsSync('README.md'), 'README missing');
  assert(fs.existsSync('docs/API.md'), 'API docs missing');
});

// Test 6: Configuration
test('Configuration files exist', () => {
  assert(fs.existsSync('package.json'), 'Root package.json missing');
  assert(fs.existsSync('docker-compose.yml'), 'Docker compose missing');
});

// Test 7: Security
test('Security files exist', () => {
  assert(fs.existsSync('SECURITY.md'), 'Security docs missing');
  assert(fs.existsSync('.gitignore'), 'Gitignore missing');
});

// Summary
console.log('\n📊 Test Summary');
console.log(`Total: ${TESTS.passed + TESTS.failed}`);
console.log(`Passed: ${TESTS.passed} ✅`);
console.log(`Failed: ${TESTS.failed} ❌`);
console.log(`Success Rate: ${Math.round((TESTS.passed / (TESTS.passed + TESTS.failed)) * 100)}%`);

process.exit(TESTS.failed > 0 ? 1 : 0);
