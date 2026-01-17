const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.dbPath = path.join(__dirname, 'access_codes.db');
    this.db = null;
  }

  init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
          return;
        }
        console.log('✅ Connected to SQLite database');
        this.createTables().then(resolve).catch(reject);
      });
    });
  }

  createTables() {
    return new Promise((resolve, reject) => {
      // Run queries sequentially to ensure tables are created before indexes
      const runQuery = (query) => {
        return new Promise((resolveQuery, rejectQuery) => {
          this.db.run(query, (err) => {
            if (err) {
              rejectQuery(err);
            } else {
              resolveQuery();
            }
          });
        });
      };

      // Create tables first
      runQuery(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL,
        payment_id TEXT,
        payment_request_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`)
        .then(() => {
          return       runQuery(`CREATE TABLE IF NOT EXISTS access_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        order_id TEXT NOT NULL,
        payment_id TEXT NOT NULL,
        used BOOLEAN DEFAULT 0,
        used_by_email TEXT,
        used_at DATETIME,
        used_by_account TEXT,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(order_id)
      )`);
        })
        .then(() => {
          // Create indexes after tables are created
          return runQuery(`CREATE INDEX IF NOT EXISTS idx_code ON access_codes(code)`);
        })
        .then(() => {
          return runQuery(`CREATE INDEX IF NOT EXISTS idx_email ON access_codes(email)`);
        })
        .then(() => {
          return runQuery(`CREATE INDEX IF NOT EXISTS idx_order_id ON orders(order_id)`);
        })
        .then(() => {
          console.log('✅ Database tables and indexes created');
          resolve();
        })
        .catch((err) => {
          console.error('Error creating database:', err);
          reject(err);
        });
    });
  }

  // Order methods
  createOrder(orderData) {
    return new Promise((resolve, reject) => {
      const { orderId, email, amount, status, paymentId, paymentRequestId } = orderData;
      this.db.run(
        `INSERT INTO orders (order_id, email, amount, status, payment_id, payment_request_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, email, amount, status, paymentId || null, paymentRequestId || null],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  getOrder(orderId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM orders WHERE order_id = ?`,
        [orderId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  updateOrder(orderId, updates) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];

      Object.keys(updates).forEach((key) => {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      });

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(orderId);

      this.db.run(
        `UPDATE orders SET ${fields.join(', ')} WHERE order_id = ?`,
        values,
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  // Access code methods
  createAccessCode(codeData) {
    return new Promise((resolve, reject) => {
      const { code, email, orderId, paymentId, used, expiresAt } = codeData;
      // Set expiry to 1 month from now if not provided
      const expiryDate = expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      this.db.run(
        `INSERT INTO access_codes (code, email, order_id, payment_id, used, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [code, email, orderId, paymentId, used ? 1 : 0, expiryDate],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  getCodeByCode(code) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM access_codes WHERE code = ?`,
        [code],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  getCodeByEmail(email) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM access_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1`,
        [email],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  markCodeAsUsed(code, email, accountId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE access_codes SET used = 1, used_by_email = ?, used_by_account = ?, used_at = CURRENT_TIMESTAMP WHERE code = ?`,
        [email, accountId || email, code],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  // Check if account has already used a code
  hasAccountUsedCode(accountId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM access_codes WHERE used_by_account = ? AND used = 1 LIMIT 1`,
        [accountId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(!!row);
          }
        }
      );
    });
  }

  // Get order by email (most recent pending order)
  getOrderByEmail(email) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM orders WHERE email = ? ORDER BY created_at DESC LIMIT 1`,
        [email],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  // Get code by order ID
  getCodeByOrderId(orderId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM access_codes WHERE order_id = ? LIMIT 1`,
        [orderId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  // Get order by payment request ID
  getOrderByPaymentRequestId(paymentRequestId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM orders WHERE payment_request_id = ? LIMIT 1`,
        [paymentRequestId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            console.log('Database connection closed');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = Database;
