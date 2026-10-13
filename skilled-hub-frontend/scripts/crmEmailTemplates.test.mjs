import assert from 'assert';
import {
  DEFAULT_CRM_SALES_PHONE,
  buildDraftForTemplate,
  buildTemplateContext,
  getSalesPhone,
  isValidEmail,
} from '../src/utils/crmEmailTemplates.js';

const admin = {
  first_name: 'Ethan',
  last_name: 'Admin',
  email: 'ethan@techflash.app',
  phone: '(555) 010-9999',
};

function testSalesPhoneDefault() {
  assert.strictEqual(DEFAULT_CRM_SALES_PHONE, '+1-719-339-5617');
  assert.strictEqual(getSalesPhone(), '+1-719-339-5617');
}

function testContextUsesSalesPhoneNotAdminPhone() {
  const context = buildTemplateContext({ name: 'Rodriguez Electric', contact_name: 'Mike Rodriguez' }, admin);
  assert.strictEqual(context.sender_phone, '+1-719-339-5617');
  assert.strictEqual(context.sender_name, 'Ethan Admin');
  assert.strictEqual(context.sender_email, 'ethan@techflash.app');
}

function testSalesFollowUpSignature() {
  const draft = buildDraftForTemplate(
    'sales_call_follow_up',
    { name: 'Rodriguez Electric', contact_name: 'Mike Rodriguez', email: 'mike@example.com' },
    admin
  );
  assert.ok(draft.body.includes('+1-719-339-5617'), 'body should sign with the sales phone');
  assert.ok(!draft.body.includes('(555) 010-9999'), 'body should not include the admin personal phone');
  assert.ok(!draft.body.includes('{{sender_phone}}'), 'sender_phone placeholder should be interpolated');
  assert.strictEqual(draft.to, 'mike@example.com');
}

function testDraftWithoutRecipientHasEmptyTo() {
  const draft = buildDraftForTemplate('sales_call_follow_up', { name: 'No Email Co', contact_name: 'Sam' }, admin);
  assert.strictEqual(draft.to, '');
  assert.strictEqual(isValidEmail(draft.to), false);
}

testSalesPhoneDefault();
testContextUsesSalesPhoneNotAdminPhone();
testSalesFollowUpSignature();
testDraftWithoutRecipientHasEmptyTo();

console.log('crmEmailTemplates tests passed');
