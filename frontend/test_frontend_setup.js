#!/usr/bin/env node

/**
 * Automated test to verify Checkpoint 9: Frontend Scaffolded
 * 
 * This script verifies:
 * 1. All required files exist
 * 2. Dependencies are correctly installed
 * 3. Configuration files are valid
 */

import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let passCount = 0;
let failCount = 0;

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

function test(description, assertion) {
  try {
    const result = assertion();
    if (result) {
      log(`✅ ${description}`, GREEN);
      passCount++;
      return true;
    } else {
      log(`❌ ${description}`, RED);
      failCount++;
      return false;
    }
  } catch (error) {
    log(`❌ ${description}: ${error.message}`, RED);
    failCount++;
    return false;
  }
}

function fileExists(filePath) {
  return existsSync(join(__dirname, filePath));
}

function readJSON(filePath) {
  const content = readFileSync(join(__dirname, filePath), 'utf-8');
  return JSON.parse(content);
}

function fileContains(filePath, searchString) {
  const content = readFileSync(join(__dirname, filePath), 'utf-8');
  return content.includes(searchString);
}

log('\n🚀 Running Checkpoint 9 Verification Tests\n', BLUE);

// Test 1: Essential files exist
log('📁 Testing File Structure...', YELLOW);
test('package.json exists', () => fileExists('package.json'));
test('package-lock.json exists', () => fileExists('package-lock.json'));
test('tsconfig.json exists', () => fileExists('tsconfig.json'));
test('vite.config.ts exists', () => fileExists('vite.config.ts'));
test('index.html exists', () => fileExists('index.html'));
test('src/main.tsx exists', () => fileExists('src/main.tsx'));
test('src/App.tsx exists', () => fileExists('src/App.tsx'));
test('src/App.css exists', () => fileExists('src/App.css'));
test('node_modules directory exists', () => fileExists('node_modules'));

// Test 2: Dependencies
log('\n📦 Testing Dependencies...', YELLOW);
const pkg = readJSON('package.json');

test('Project name is "frontend"', () => pkg.name === 'frontend');
test('Project type is "module"', () => pkg.type === 'module');
test('react dependency installed', () => 
  pkg.dependencies.react && pkg.dependencies.react.startsWith('^19'));
test('react-dom dependency installed', () => 
  pkg.dependencies['react-dom'] && pkg.dependencies['react-dom'].startsWith('^19'));
test('@livekit/components-react installed', () => 
  pkg.dependencies['@livekit/components-react'] !== undefined);
test('livekit-client installed', () => 
  pkg.dependencies['livekit-client'] !== undefined);
test('vite dev dependency installed', () => 
  pkg.devDependencies.vite !== undefined);
test('typescript dev dependency installed', () => 
  pkg.devDependencies.typescript !== undefined);

// Test 3: Scripts
log('\n📜 Testing Scripts...', YELLOW);
test('dev script defined', () => pkg.scripts.dev === 'vite');
test('build script defined', () => pkg.scripts.build !== undefined);
test('preview script defined', () => pkg.scripts.preview === 'vite preview');

// Test 4: App.tsx content
log('\n⚛️  Testing App Component...', YELLOW);
test('App.tsx imports useState', () => fileContains('src/App.tsx', 'useState'));
test('App.tsx imports App.css', () => fileContains('src/App.tsx', './App.css'));
test('App.tsx contains "Project Interview Coach"', () => 
  fileContains('src/App.tsx', 'Project Interview Coach'));
test('App.tsx contains "Start Interview" button', () => 
  fileContains('src/App.tsx', 'Start Interview'));
test('App.tsx has isConnected state', () => 
  fileContains('src/App.tsx', 'isConnected'));
test('App.tsx exports default App', () => 
  fileContains('src/App.tsx', 'export default App'));

// Test 5: App.css styling
log('\n🎨 Testing Styles...', YELLOW);
test('App.css has .app class', () => fileContains('src/App.css', '.app'));
test('App.css has .start-screen class', () => 
  fileContains('src/App.css', '.start-screen'));
test('App.css has .start-button class', () => 
  fileContains('src/App.css', '.start-button'));
test('App.css has gradient styling', () => 
  fileContains('src/App.css', 'gradient'));

// Test 6: TypeScript configuration
log('\n🔧 Testing TypeScript Config...', YELLOW);
const tsconfig = readJSON('tsconfig.json');
test('TypeScript config is valid', () => 
  tsconfig.compilerOptions !== undefined || tsconfig.references !== undefined);

// Test 7: Vite configuration
log('\n⚡ Testing Vite Config...', YELLOW);
test('Vite config exists and is readable', () => {
  const content = readFileSync(join(__dirname, 'vite.config.ts'), 'utf-8');
  return content.includes('vite') || content.includes('defineConfig');
});

// Summary
log('\n' + '='.repeat(50), BLUE);
log('📊 Test Summary', BLUE);
log('='.repeat(50), BLUE);
log(`Total Tests: ${passCount + failCount}`);
log(`Passed: ${passCount}`, GREEN);
log(`Failed: ${failCount}`, failCount > 0 ? RED : GREEN);
log(`Success Rate: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`, 
  failCount === 0 ? GREEN : YELLOW);

if (failCount === 0) {
  log('\n✨ All tests passed! Checkpoint 9 is complete!', GREEN);
  process.exit(0);
} else {
  log('\n⚠️  Some tests failed. Please review the errors above.', RED);
  process.exit(1);
}

