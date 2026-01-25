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
        // Option 1: Service account JSON from environment variable (Best for Render)
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

        // Option 2: Service account file path from environment or default
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, 'service-account-key.json');

        if (serviceAccountJson) {
          // Parse JSON from environment variable
          let serviceAccount;
          try {
            serviceAccount = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
          } catch (e) {
            console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
            // Fallback to empty object which might fail but handles the parsing error
            serviceAccount = {};
          }

          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://tlangau-123-default-rtdb.asia-southeast1.firebasedatabase.app',
          });
          console.log('✅ Firebase Admin initialized from environment variable');
        } else {
          // Try to load from file
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
            // Don't reject, just let it be null so server can start (but DB calls will fail)
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

  // Helper to sanitize email for use as a key (replace . with ,)
  sanitizeEmail(email) {
    return email.toLowerCase().trim().replace(/\./g, ',');
  }

  // ==================== ORDER METHODS ====================

  async createOrder(orderData) {
    const { orderId } = orderData;
    const order = {
      ...orderData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this.db.ref(`orders/${orderId}`).set(order);
    return orderId; // Return ID/key
  }

  async getOrder(orderId) {
    const snapshot = await this.db.ref(`orders/${orderId}`).once('value');
    return snapshot.val();
  }

  async updateOrder(orderId, updates) {
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };
    await this.db.ref(`orders/${orderId}`).update(updateData);
  }

  async getOrderByPaymentRequestId(paymentRequestId) {
    const snapshot = await this.db.ref('orders')
      .orderByChild('payment_request_id')
      .equalTo(paymentRequestId)
      .limitToFirst(1)
      .once('value');

    const data = snapshot.val();
    if (!data) return null;
    return Object.values(data)[0];
  }

  async getOrderByEmail(email) {
    // Note: RTDB querying string fields might require simpler queries or client-side filtering if index not set
    // For now, we assume volume is low or we index 'email'
    const snapshot = await this.db.ref('orders')
      .orderByChild('email')
      .equalTo(email.toLowerCase().trim())
      // RTDB doesn't robustly support "sort by created desc limit 1" easily with non-numeric keys combined with filtering
      // So we fetch all for this email and sort in memory
      .once('value');

    const data = snapshot.val();
    if (!data) return null;

    const orders = Object.values(data);
    // Sort by created_at descending
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return orders[0];
  }

  // ==================== ACCESS CODE METHODS ====================

  async createAccessCode(codeData) {
    const { code } = codeData;
    const data = {
      ...codeData,
      created_at: new Date().toISOString(),
      used: codeData.used ? true : false // Ensure boolean
    };
    // Store by code for easy lookup: /access_codes/CODE123
    await this.db.ref(`access_codes/${code}`).set(data);
    return code;
  }

  async getCodeByCode(code) {
    const snapshot = await this.db.ref(`access_codes/${code}`).once('value');
    return snapshot.val();
  }

  async getCodeByOrderId(orderId) {
    const snapshot = await this.db.ref('access_codes')
      .orderByChild('orderId') // Note: In createAccessCode we used 'orderId', check consistency with SQL which used 'order_id'
      // The calling code passes 'orderId' in object, so we save it as 'orderId'.
      .equalTo(orderId)
      .limitToFirst(1)
      .once('value');

    const data = snapshot.val();
    if (!data) return null;
    return Object.values(data)[0];
  }

  async getCodeByEmail(email) {
    const snapshot = await this.db.ref('access_codes')
      .orderByChild('email')
      .equalTo(email)
      .once('value');

    const data = snapshot.val();
    if (!data) return null;

    const codes = Object.values(data);
    // Sort by created_at desc
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

    // Check if any results have used=true (though query implies it if we trust the logic)
    const data = snapshot.val();
    if (!data) return false;

    // Safety check
    return Object.values(data).some(c => c.used === true);
  }

  // ==================== ADMIN METHODS ====================

  async getAllOrders() {
    const snapshot = await this.db.ref('orders').once('value');
    const data = snapshot.val();
    if (!data) return [];

    const orders = Object.values(data);
    // Sort desc
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return orders;
  }

  async getAllAccessCodes() {
    const snapshot = await this.db.ref('access_codes').once('value');
    const data = snapshot.val();
    if (!data) return [];

    const codes = Object.values(data);
    codes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return codes;
  }

  async deleteAccessCode(code) {
    await this.db.ref(`access_codes/${code}`).remove();
    return { deleted: true };
  }

  async deleteOrder(orderId) {
    // 1. Find and delete access codes for this order
    const codeSnapshot = await this.db.ref('access_codes')
      .orderByChild('orderId')
      .equalTo(orderId)
      .once('value');

    const codes = codeSnapshot.val();
    if (codes) {
      const updates = {};
      Object.keys(codes).forEach(key => {
        updates[`access_codes/${key}`] = null;
      });
      await this.db.ref().update(updates);
    }

    // 2. Delete order
    await this.db.ref(`orders/${orderId}`).remove();
    return { deleted: true };
  }

  async deleteUserByEmail(email) {
    const emailLower = email.toLowerCase().trim();

    // Find all orders by email
    const ordersSnapshot = await this.db.ref('orders')
      .orderByChild('email')
      .equalTo(emailLower)
      .once('value');

    const ordersData = ordersSnapshot.val();
    if (!ordersData) return { deleted: true, deletedCodes: 0, deletedOrders: 0 };

    const updates = {};
    let deletedOrders = 0;
    const orderIds = [];

    // Queue order deletions
    Object.keys(ordersData).forEach(key => {
      updates[`orders/${key}`] = null;
      orderIds.push(ordersData[key].order_id);
      deletedOrders++;
    });

    // Find all access codes by email (faster than by order ID one by one)
    const codesSnapshot = await this.db.ref('access_codes')
      .orderByChild('email')
      .equalTo(emailLower) // Assuming codes also have the email field
      .once('value');

    const codesData = codesSnapshot.val();
    let deletedCodes = 0;

    if (codesData) {
      Object.keys(codesData).forEach(key => {
        updates[`access_codes/${key}`] = null;
        deletedCodes++;
      });
    }

    // Execute atomic multi-path update
    await this.db.ref().update(updates);

    return { deleted: true, deletedCodes, deletedOrders };
  }

  async getStatistics() {
    // Fetch all needed data (simple approach for low volume)
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

  close() {
    // Firebase Admin SDK doesn't strictly require 'closing' like SQLite, 
    // but we can implement it for compatibility if needed.
    // Usually we leave the connection open.
    return Promise.resolve();
  }
}

module.exports = Database;
