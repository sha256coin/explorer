const mongoose = require('mongoose');

const statsSchema = new mongoose.Schema({
  blocks: Number,
  difficulty: Number,
  chainwork: String,
  connections: Number,
  networkhashps: Number,
  mempoolsize: Number,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Keep stats for the last 30 days
statsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('Stats', statsSchema);
