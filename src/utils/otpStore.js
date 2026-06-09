class OTPStore {
  constructor() {
    this.store = new Map();
  }

  set(transactionId, data) {
    this.store.set(transactionId, {
      ...data,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      attempts: 0,
      verified: false,
    });
  }

  get(transactionId) {
    return this.store.get(transactionId);
  }

  delete(transactionId) {
    this.store.delete(transactionId);
  }

  incrementAttempts(transactionId) {
    const session = this.store.get(transactionId);
    if (session) {
      session.attempts++;
      return session.attempts;
    }
    return null;
  }

  markVerified(transactionId) {
    const session = this.store.get(transactionId);
    if (session) {
      session.verified = true;
      return true;
    }
    return false;
  }
}

module.exports = new OTPStore();
