const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  txid: {
    type: String,
    required: true,
    unique: true
  },
  hash: String,
  version: Number,
  size: Number,
  vsize: Number,
  weight: Number,
  locktime: Number,
  blockhash: String,
  blockheight: {
    type: Number,
    index: true
  },
  confirmations: Number,
  time: {
    type: Number,
    index: true
  },
  blocktime: Number,
  vin: [{
    txid: String,
    vout: Number,
    scriptSig: mongoose.Schema.Types.Mixed,
    txinwitness: [String],
    sequence: Number,
    coinbase: String,
    prevout: mongoose.Schema.Types.Mixed
  }],
  vout: [{
    value: Number,
    n: Number,
    scriptPubKey: mongoose.Schema.Types.Mixed
  }],
  hex: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries (txid already indexed via unique: true)
transactionSchema.index({ blockhash: 1 });
transactionSchema.index({ blockheight: -1 });
transactionSchema.index({ time: -1 });
transactionSchema.index({ 'vout.scriptPubKey.address': 1 });
transactionSchema.index({ 'vin.prevout.scriptPubKey.address': 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
