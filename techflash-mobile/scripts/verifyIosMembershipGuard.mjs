import fs from 'node:fs';
import path from 'node:path';

const guardPath = path.resolve(process.cwd(), 'src/release/iosMembershipPurchaseGuard.ts');
const source = fs.readFileSync(guardPath, 'utf8');

const hasDisabledFlag = /IOS_V1_MEMBERSHIP_PURCHASE_ENABLED\s*=\s*false/.test(source);
const hasPlatformGuard = /if\s*\(\s*platformOs\s*!==\s*'ios'\s*\)\s*return\s*true/.test(source);
const hasIosReturnFlag = /return\s+IOS_V1_MEMBERSHIP_PURCHASE_ENABLED/.test(source);

if (!hasDisabledFlag || !hasPlatformGuard || !hasIosReturnFlag) {
  console.error('FAIL: iOS membership purchase guard is missing or changed unexpectedly.');
  process.exit(1);
}

console.log('PASS: iOS membership purchase guard is present and disabled for iOS v1.');
