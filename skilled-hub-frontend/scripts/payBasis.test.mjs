import assert from 'assert';
import { jobAmountCaption, payBasisLabel, isGuaranteedPay } from '../src/utils/companyPlatformFee.js';

assert.equal(payBasisLabel('actual_hours_worked'), 'Actual Hours Worked');
assert.equal(payBasisLabel('guaranteed_job_pay'), 'Guaranteed Job Pay');
assert.equal(payBasisLabel(undefined), 'Actual Hours Worked');
assert.equal(isGuaranteedPay('guaranteed_job_pay'), true);
assert.equal(isGuaranteedPay('actual_hours_worked'), false);
assert.equal(jobAmountCaption('guaranteed_job_pay'), 'Guaranteed job pay');
assert.equal(jobAmountCaption('actual_hours_worked'), 'Estimated job amount');

console.log('payBasis.test.mjs ok');
