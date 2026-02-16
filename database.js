// Force update for Render deployment - Switching to Firebase
const admin = require('firebase-admin');
const path = require('path');

class Database {
  constructor() {
    this.db = null; // Firebase Realtime Database instance
    this.admin = null; // Firebase Admin instance
  }

  init() {
    return new Promise((resolve, reject) => {
      try {
        // Check if already initialized
        if (admin.apps.length > 0) {
          this.admin = admin;
          this.db = admin.database();
          console.log('✅ Firebase Admin already initialized');
          return resolve();
        }

        // Try to initialize Firebase Admin
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, 'service-account-key.json');

        if (serviceAccountJson) {
          let serviceAccount;
          try {
            serviceAccount = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
          } catch (e) {
            console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
            serviceAccount = {};
          }

          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://tlangau-123-default-rtdb.asia-southeast1.firebasedatabase.app',
          });
          console.log('✅ Firebase Admin initialized from environment variable');
        } else {
          const fs = require('fs');
          if (fs.existsSync(serviceAccountPath)) {
            const serviceAccount = require(serviceAccountPath);
            admin.initializeApp({
              credential: admin.credential.cert(serviceAccount),
              databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://tlangau-123-default-rtdb.asia-southeast1.firebasedatabase.app',
            });
            console.log('✅ Firebase Admin initialized from file');
          } else {
            console.warn('⚠️ Firebase settings not found. Database features will fail.');
          }
        }

        if (admin.apps.length > 0) {
          this.admin = admin;
          this.db = admin.database();
          resolve();
        } else {
          reject(new Error('Firebase Admin could not be initialized'));
        }

      } catch (error) {
        console.error('❌ Firebase Admin initialization failed:', error.message);
        reject(error);
      }
    });
  }

  // ==================== ORDER METHODS ====================

  async createOrder(orderData) {
    // Normalize property names (use order_id specifically)
    const order_id = orderData.order_id || orderData.orderId;
    const order = {
      ...orderData,
      order_id: order_id, // Ensure consistent underscore name
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (order.orderId) delete order.orderId;

    await this.db.ref(`orders/${order_id}`).set(order);
    return order_id;
  }

  async getOrder(order_id) {
    const snapshot = await this.db.ref(`orders/${order_id}`).once('value');
    const order = snapshot.val();
    if (order && !order.order_id && order.orderId) {
      order.order_id = order.orderId;
    }
    return order;
  }

  async updateOrder(order_id, updates) {
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };
    // Normalize in updates too if present
    if (updateData.orderId) {
      updateData.order_id = updateData.orderId;
      delete updateData.orderId;
    }
    await this.db.ref(`orders/${order_id}`).update(updateData);
  }

  async getOrderByPaymentRequestId(paymentRequestId) {
    const snapshot = await this.db.ref('orders')
      .orderByChild('payment_request_id')
      .equalTo(paymentRequestId)
      .limitToFirst(1)
      .once('value');

    const data = snapshot.val();
    if (!data) return null;
    const order = Object.values(data)[0];
    if (order && !order.order_id && order.orderId) {
      order.order_id = order.orderId;
    }
    return order;
  }

  async getOrderByEmail(email) {
    const snapshot = await this.db.ref('orders')
      .orderByChild('email')
      .equalTo(email.toLowerCase().trim())
      .once('value');

    const data = snapshot.val();
    if (!data) return null;

    const orders = Object.values(data);
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const order = orders[0];
    if (order && !order.order_id && order.orderId) {
      order.order_id = order.orderId;
    }
    return order;
  }

  // ==================== ACCESS CODE METHODS ====================

  async createAccessCode(codeData) {
    const { code } = codeData;
    const expires = codeData.expires_at || codeData.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const data = {
      ...codeData,
      order_id: codeData.order_id || codeData.orderId, // Normalize
      created_at: codeData.created_at || new Date().toISOString(),
      expires_at: expires,
      expiresAt: expires, // Duplicate for compatibility
      used: codeData.used ? true : false
    };
    if (data.orderId) delete data.orderId;

    await this.db.ref(`access_codes/${code}`).set(data);
    return code;
  }

  async getCodeByCode(code) {
    const snapshot = await this.db.ref(`access_codes/${code}`).once('value');
    const data = snapshot.val();
    if (data) {
      // Normalize on retrieval
      if (!data.expires_at && data.expiresAt) data.expires_at = data.expiresAt;
      if (!data.expiresAt && data.expires_at) data.expiresAt = data.expires_at;
      if (!data.order_id && data.orderId) data.order_id = data.orderId;
    }
    return data;
  }

  async getCodeByOrderId(order_id) {
    if (!order_id) {
      console.warn('⚠️ getCodeByOrderId called with undefined order_id');
      return null;
    }
    const snapshot = await this.db.ref('access_codes')
      .orderByChild('order_id')
      .equalTo(order_id)
      .limitToFirst(1)
      .once('value');

    const data = snapshot.val();
    if (!data) return null;
    const code = Object.values(data)[0];
    // Normalize
    if (code) {
      if (!code.expires_at && code.expiresAt) code.expires_at = code.expiresAt;
      if (!code.expiresAt && code.expires_at) code.expiresAt = code.expires_at;
    }
    return code;
  }

  async getCodeByEmail(email) {
    const snapshot = await this.db.ref('access_codes')
      .orderByChild('email')
      .equalTo(email)
      .once('value');

    const data = snapshot.val();
    if (!data) return null;

    const codes = Object.values(data).map(c => {
      // Normalize
      if (!c.expires_at && c.expiresAt) c.expires_at = c.expiresAt;
      if (!c.expiresAt && c.expires_at) c.expiresAt = c.expires_at;
      return c;
    });
    codes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return codes[0];
  }

  async markCodeAsUsed(code, email, accountId) {
    await this.db.ref(`access_codes/${code}`).update({
      used: true,
      used_by_email: email,
      used_by_account: accountId,
      used_at: new Date().toISOString()
    });
  }

  async hasAccountUsedCode(accountId) {
    const snapshot = await this.db.ref('access_codes')
      .orderByChild('used_by_account')
      .equalTo(accountId)
      .once('value');

    const data = snapshot.val();
    if (!data) return false;
    return Object.values(data).some(c => c.used === true);
  }

  // ==================== ADMIN METHODS ====================

  async getAllOrders() {
    const snapshot = await this.db.ref('orders').once('value');
    const data = snapshot.val();
    if (!data) return [];

    const orders = Object.values(data).map(o => {
      // Normalize order_id
      if (!o.order_id && o.orderId) o.order_id = o.orderId;
      // Ensure created_at exists for sorting
      if (!o.created_at) o.created_at = o.updated_at || new Date(0).toISOString();
      return o;
    });

    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return orders;
  }

  async getAllAccessCodes() {
    const snapshot = await this.db.ref('access_codes').once('value');
    const data = snapshot.val();
    if (!data) return [];

    const codes = Object.values(data).map(c => {
      // Normalize order_id
      if (!c.order_id && c.orderId) c.order_id = c.orderId;
      // Ensure created_at exists for sorting
      if (!c.created_at) c.created_at = c.updated_at || new Date(0).toISOString();
      // Normalize expiration
      if (!c.expires_at && c.expiresAt) c.expires_at = c.expiresAt;
      if (!c.expiresAt && c.expires_at) c.expiresAt = c.expires_at;
      return c;
    });

    codes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return codes;
  }

  async deleteAccessCode(code) {
    const snapshot = await this.db.ref(`access_codes/${code}`).once('value');
    if (!snapshot.exists()) {
      return { deleted: false };
    }
    await this.db.ref(`access_codes/${code}`).remove();
    return { deleted: true };
  }

  async deleteOrder(order_id) {
    const codeSnapshot = await this.db.ref('access_codes')
      .orderByChild('order_id')
      .equalTo(order_id)
      .once('value');

    const codes = codeSnapshot.val();
    if (codes) {
      const updates = {};
      Object.keys(codes).forEach(key => {
        updates[`access_codes/${key}`] = null;
      });
      await this.db.ref().update(updates);
    }

    const orderSnapshot = await this.db.ref(`orders/${order_id}`).once('value');
    if (!orderSnapshot.exists()) {
      return { deleted: false };
    }

    await this.db.ref(`orders/${order_id}`).remove();
    return { deleted: true };
  }

  async deleteUserByEmail(email) {
    const emailLower = email.toLowerCase().trim();

    const ordersSnapshot = await this.db.ref('orders')
      .orderByChild('email')
      .equalTo(emailLower)
      .once('value');

    const ordersData = ordersSnapshot.val();
    if (!ordersData) return { deleted: true, deletedCodes: 0, deletedOrders: 0 };

    const updates = {};
    let deletedOrders = 0;

    Object.keys(ordersData).forEach(key => {
      updates[`orders/${key}`] = null;
      deletedOrders++;
    });

    const codesSnapshot = await this.db.ref('access_codes')
      .orderByChild('email')
      .equalTo(emailLower)
      .once('value');

    const codesData = codesSnapshot.val();
    let deletedCodes = 0;

    if (codesData) {
      Object.keys(codesData).forEach(key => {
        updates[`access_codes/${key}`] = null;
        deletedCodes++;
      });
    }

    await this.db.ref().update(updates);
    return { deleted: true, deletedCodes, deletedOrders };
  }

  async getStatistics() {
    const [ordersRes, codesRes] = await Promise.all([
      this.getAllOrders(),
      this.getAllAccessCodes()
    ]);

    const stats = {
      totalOrders: ordersRes.length,
      successfulOrders: 0,
      pendingOrders: 0,
      failedOrders: 0,
      totalRevenue: 0,
      uniqueUsers: 0,

      totalCodes: codesRes.length,
      usedCodes: 0,
      unusedCodes: 0
    };

    const uniqueEmails = new Set();

    ordersRes.forEach(o => {
      if (o.status === 'SUCCESS') {
        stats.successfulOrders++;
        stats.totalRevenue += (o.amount || 0) / 100;
      } else if (o.status === 'PENDING') {
        stats.pendingOrders++;
      } else if (o.status === 'FAILED') {
        stats.failedOrders++;
      }
      if (o.email) uniqueEmails.add(o.email.toLowerCase());
    });

    stats.uniqueUsers = uniqueEmails.size;

    codesRes.forEach(c => {
      if (c.used) stats.usedCodes++;
      else stats.unusedCodes++;
    });

    return stats;
  }

  // ==================== POLL METHODS ====================

  async createPoll(pollData) {
    const pollId = pollData.id || `poll_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const poll = {
      id: pollId,
      question: pollData.question,
      options: pollData.options, // [{id:0, text:'...', votes:0}, ...]
      created_by: pollData.created_by,
      created_at: new Date().toISOString(),
      expires_at: pollData.expires_at,
      duration_type: pollData.duration_type, // '24h','1week','custom'
      status: 'active',
      publish_results: false,
      total_votes: 0,
    };
    await this.db.ref(`polls/${pollId}`).set(poll);
    return pollId;
  }

  async getPoll(pollId) {
    const snapshot = await this.db.ref(`polls/${pollId}`).once('value');
    return snapshot.val();
  }

  async getAllPolls() {
    const snapshot = await this.db.ref('polls').once('value');
    const data = snapshot.val();
    if (!data) return [];
    const polls = Object.values(data);
    polls.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return polls;
  }

  async votePoll(pollId, optionId, voterEmail) {
    const voterKey = Buffer.from(voterEmail.toLowerCase().trim())
      .toString('base64')
      .replace(/[.#$/\[\]]/g, '_');

    // Check if already voted
    const voterRef = this.db.ref(`polls/${pollId}/voters/${voterKey}`);
    const voterSnap = await voterRef.once('value');
    if (voterSnap.exists()) {
      return { success: false, message: 'You have already voted on this poll.' };
    }

    // Record voter → option
    await voterRef.set(optionId);

    // Increment option vote count (transaction for atomicity)
    const optionVotesRef = this.db.ref(`polls/${pollId}/options/${optionId}/votes`);
    await optionVotesRef.transaction(current => (current || 0) + 1);

    // Increment total votes
    const totalRef = this.db.ref(`polls/${pollId}/total_votes`);
    await totalRef.transaction(current => (current || 0) + 1);

    return { success: true };
  }

  async getVoterChoice(pollId, voterEmail) {
    const voterKey = Buffer.from(voterEmail.toLowerCase().trim())
      .toString('base64')
      .replace(/[.#$/\[\]]/g, '_');
    const snapshot = await this.db.ref(`polls/${pollId}/voters/${voterKey}`).once('value');
    if (!snapshot.exists()) return null;
    return snapshot.val();
  }

  async updatePoll(pollId, updates) {
    await this.db.ref(`polls/${pollId}`).update({
      ...updates,
      updated_at: new Date().toISOString(),
    });
  }

  async deletePoll(pollId) {
    const snapshot = await this.db.ref(`polls/${pollId}`).once('value');
    if (!snapshot.exists()) return { deleted: false };
    await this.db.ref(`polls/${pollId}`).remove();
    return { deleted: true };
  }

  close() {
    return Promise.resolve();
  }
}

module.exports = Database;
