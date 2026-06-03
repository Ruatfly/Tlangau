const crypto = require('crypto');
const { SignJWT, decodeJwt } = require('jose');

function appleApiHost() {
  const env = String(process.env.APPLE_IAP_ENV || 'production').toLowerCase();
  return env === 'sandbox'
    ? 'https://api.storekit-sandbox.itunes.apple.com'
    : 'https://api.storekit.itunes.apple.com';
}

function applePrivateKeyPem() {
  const raw = process.env.APPLE_IAP_PRIVATE_KEY || '';
  if (!raw) throw new Error('APPLE_IAP_PRIVATE_KEY is not configured.');
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

function isAppleIapConfigured() {
  return Boolean(
    process.env.APPLE_IAP_ISSUER_ID &&
      process.env.APPLE_IAP_KEY_ID &&
      process.env.APPLE_IAP_PRIVATE_KEY
  );
}

async function createAppStoreApiJwt() {
  const issuerId = process.env.APPLE_IAP_ISSUER_ID;
  const keyId = process.env.APPLE_IAP_KEY_ID;
  const privateKey = crypto.createPrivateKey(applePrivateKeyPem());

  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
    .setIssuer(issuerId)
    .setAudience('appstoreconnect-v1')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

async function fetchTransaction(transactionId) {
  const token = await createAppStoreApiJwt();
  const url = `${appleApiHost()}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`App Store transaction lookup failed (${res.status}): ${text}`);
  }

  return res.json();
}

function decodeAppleSignedPayload(signedPayload) {
  if (!signedPayload) return null;
  try {
    return decodeJwt(signedPayload);
  } catch {
    return null;
  }
}

/**
 * Validates an App Store transaction with Apple's Server API.
 */
async function verifyAppleTransaction({ transactionId, productId, bundleId }) {
  if (!isAppleIapConfigured()) {
    throw new Error('Apple IAP verification is not configured on the server.');
  }

  const expectedBundle =
    bundleId || process.env.APPLE_BUNDLE_ID || 'com.ruatfela.tlangau.tlangau';

  const payload = await fetchTransaction(transactionId);
  const tx = decodeAppleSignedPayload(payload.signedTransactionInfo);
  if (!tx) {
    throw new Error('Could not decode App Store transaction payload.');
  }

  const txProductId = String(tx.productId || '').trim();
  const txBundleId = String(tx.bundleId || '').trim();

  if (txProductId && txProductId !== productId) {
    throw new Error('Transaction product does not match requested product.');
  }
  if (txBundleId && txBundleId !== expectedBundle) {
    throw new Error('Transaction bundle id does not match this app.');
  }

  return {
    transactionId: String(tx.transactionId || transactionId),
    productId: txProductId || productId,
    bundleId: txBundleId || expectedBundle,
  };
}

module.exports = {
  verifyAppleTransaction,
  isAppleIapConfigured,
};
