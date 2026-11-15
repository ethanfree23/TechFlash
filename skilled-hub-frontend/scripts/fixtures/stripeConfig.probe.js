/**
 * Build-time probe entry: Vite inlines import.meta.env.* from process.env.
 * Exposes only prefixes / booleans — never log full publishable keys.
 */
import {
  allowsLiveStripePublishableKey,
  getStripePublishableKey,
  resolveStripeDeployEnv,
  validateApiForStripeDeploy,
} from '../../src/stripeConfig.js';

const key = getStripePublishableKey();
const deploy = resolveStripeDeployEnv();

export const probe = {
  deploy,
  allowsLive: allowsLiveStripePublishableKey(),
  apiOk: validateApiForStripeDeploy(import.meta.env, deploy).ok,
  keyPrefix: key ? key.slice(0, 8) : '',
  keyIsLive: key.startsWith('pk_live_'),
  keyIsTest: key.startsWith('pk_test_'),
  keyEmpty: key.length === 0,
};
