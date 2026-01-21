const mongoose = require('mongoose');

const blockSchema = new mongoose.Schema({
  hash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  height: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  version: Number,
  merkleroot: String,
  time: {
    type: Number,
    index: true
  },
  mediantime: Number,
  nonce: Number,
  bits: String,
  difficulty: Number,
  chainwork: String,
  nTx: Number,
  previousblockhash: {
    type: String,
    index: true
  },
  nextblockhash: {
    type: String,
    index: true
  },
  size: Number,
  strippedsize: Number,
  weight: Number,
  confirmations: Number,
  tx: [{
    type: String,
    ref: 'Transaction'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
blockSchema.index({ height: -1 });
blockSchema.index({ time: -1 });
blockSchema.index({ hash: 1 });

module.exports = mongoose.model('Block', blockSchema);
