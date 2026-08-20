import assert from 'assert';
import {
  jobAmountCaption,
  payBasisLabel,
  isGuaranteedPay,
  parseLoadedCommissionPercent,
} from '../src/utils/companyPlatformFee.js';

assert.equal(payBasisLabel('actual_hours_worked'), 'Actual Hours Worked');
assert.equal(payBasisLabel('guaranteed_job_pay'), 'Guaranteed Job Pay');
assert.equal(payBasisLabel(undefined), 'Actual Hours Worked');
assert.equal(isGuaranteedPay('guaranteed_job_pay'), true);
assert.equal(isGuaranteedPay('actual_hours_worked'), false);
assert.equal(jobAmountCaption('guaranteed_job_pay'), 'Guaranteed job pay');
assert.equal(jobAmountCaption('actual_hours_worked'), 'Estimated job amount');

assert.equal(parseLoadedCommissionPercent(undefined), null);
assert.equal(parseLoadedCommissionPercent(null), null);
assert.equal(parseLoadedCommissionPercent(''), null);
assert.equal(parseLoadedCommissionPercent('not-a-number'), null);
assert.equal(parseLoadedCommissionPercent(0), 0);
assert.equal(parseLoadedCommissionPercent('10'), 10);
assert.equal(parseLoadedCommissionPercent(10), 10);
assert.equal(parseLoadedCommissionPercent(7.5), 7.5);

console.log('payBasis.test.mjs ok');
