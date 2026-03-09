const mongoose = require('mongoose');

const blockSchema = new mongoose.Schema({
  hash: {
    type: String,
    required: true,
    unique: true
  },
  height: {
    type: Number,
    required: true,
    index: true
  },
  isOrphan: {
    type: Boolean,
    default: false,
    index: true
  },
  version: Number,
  merkleroot: String,
  time: Number,
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

// Index for efficient queries (hash and height already indexed via unique: true)
blockSchema.index({ time: -1 });

module.exports = mongoose.model('Block', blockSchema);
