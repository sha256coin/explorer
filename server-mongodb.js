const express = require('express');
const cors = require('cors');
const axios = require('axios');
const mongoose = require('mongoose');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const geoip = require('geoip-lite');
const Block = require('./models/Block');
const Transaction = require('./models/Transaction');
const Stats = require('./models/Stats');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/s256explorer';

// S256 RPC configuration
const RPC_USER = process.env.RPC_USER || 'user';
const RPC_PASSWORD = process.env.RPC_PASSWORD || 'password';
const RPC_HOST = process.env.RPC_HOST || '127.0.0.1';
const RPC_PORT = process.env.RPC_PORT || '25332';
const RPC_URL = `http://${RPC_USER}:${RPC_PASSWORD}@${RPC_HOST}:${RPC_PORT}`;

// RPC helper function
async function rpcCall(method, params = []) {
  try {
    const response = await axios.post(RPC_URL, {
      jsonrpc: '1.0',
      id: 'explorer',
      method: method,
      params: params
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    return response.data.result;
  } catch (error) {
    console.error(`RPC Error (${method}):`, error.message);
    throw error;
  }
}

// Trust proxy - fixes rate limiter when behind nginx/cloudflare
app.set('trust proxy', true);

// Security Middleware
// Note: For development, using relaxed CSP. Tighten for production.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs (increased for browsing)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: {trustProxy: false}, // Disable proxy validation warning
});

const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Limit searches to 20 per minute
  message: 'Too many search requests, please slow down.',
  validate: {trustProxy: false}, // Disable proxy validation warning
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Block access to sensitive files
app.use((req, res, next) => {
  const blockedFiles = ['.env', 'package.json', 'package-lock.json', '.git',
                        'node_modules', 'sync.js', 'server-mongodb.js',
                        'ecosystem.config.js', 'models'];

  const requestedPath = req.path.toLowerCase();
  const isBlocked = blockedFiles.some(file =>
    requestedPath.includes(file.toLowerCase())
  );

  if (isBlocked) {
    return res.status(403).send('Access denied');
  }
  next();
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Only serve specific static files (HTML, CSS, JS for frontend)
app.use(express.static(path.join(__dirname), {
  dotfiles: 'deny', // Block all dotfiles (.env, .git, etc.)
  index: ['index.html']
}));

// Connect to MongoDB
mongoose.connect(MONGODB_URI).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// API Routes

// Get blockchain info
app.get('/api/blockchain-info', async (req, res) => {
  try {
    // Get latest stats
    const latestStats = await Stats.findOne().sort({ timestamp: -1 });

    if (!latestStats) {
      return res.status(503).json({ error: 'Sync service not running or no data available' });
    }

    res.json({
      blocks: latestStats.blocks,
      difficulty: latestStats.difficulty,
      chainwork: latestStats.chainwork,
      connections: latestStats.connections,
      networkhashps: latestStats.networkhashps
    });
  } catch (error) {
    console.error('Error getting blockchain info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recent blocks
app.get('/api/blocks/recent/:count?', async (req, res) => {
  try {
    const count = parseInt(req.params.count) || 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * count;

    const blocks = await Block.find()
      .sort({ height: -1 })
      .skip(skip)
      .limit(count)
      .select('height hash time nTx size difficulty confirmations')
      .lean();

    // Calculate confirmations dynamically for each block
    const latestStats = await Stats.findOne().sort({ timestamp: -1 });
    if (latestStats) {
      blocks.forEach(block => {
        block.confirmations = latestStats.blocks - block.height + 1;
      });
    }

    res.json(blocks);
  } catch (error) {
    console.error('Error getting recent blocks:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recent transactions
app.get('/api/transactions/recent/:count?', async (req, res) => {
  try {
    const count = parseInt(req.params.count) || 20;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * count;

    const transactions = await Transaction.find()
      .sort({ blockheight: -1, _id: -1 })
      .skip(skip)
      .limit(count)
      .select('txid blockhash blockheight time blocktime size vsize vin vout')
      .lean();

    // Calculate confirmations and get block times
    const latestStats = await Stats.findOne().sort({ timestamp: -1 });
    const currentHeight = latestStats ? latestStats.blocks : 0;

    // Get block times for transactions missing time field
    const blockHeights = [...new Set(transactions.map(tx => tx.blockheight).filter(h => h !== undefined))];
    const blocks = await Block.find({ height: { $in: blockHeights } }).select('height time').lean();
    const blockTimeMap = new Map(blocks.map(b => [b.height, b.time]));

    // Enrich transactions
    const enrichedTxs = transactions.map(tx => {
      const enriched = { ...tx };

      // Add confirmations
      if (currentHeight && tx.blockheight !== undefined) {
        enriched.confirmations = currentHeight - tx.blockheight + 1;
      }

      // Add block time if missing
      if (!tx.time && !tx.blocktime && tx.blockheight) {
        enriched.time = blockTimeMap.get(tx.blockheight);
      }

      // Calculate total output value
      enriched.totalOutput = tx.vout ? tx.vout.reduce((sum, out) => sum + (out.value || 0), 0) : 0;

      // Check if coinbase
      enriched.isCoinbase = tx.vin && tx.vin.length > 0 && tx.vin[0].coinbase;

      return enriched;
    });

    res.json(enrichedTxs);
  } catch (error) {
    console.error('Error getting recent transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get block by hash or height
app.get('/api/block/:hashOrHeight', async (req, res) => {
  try {
    const input = req.params.hashOrHeight;
    let block;

    // Check if input is a number (height) or hash
    if (/^\d+$/.test(input)) {
      block = await Block.findOne({ height: parseInt(input) }).lean();
    } else {
      block = await Block.findOne({ hash: input }).lean();
    }

    if (!block) {
      return res.status(404).json({ error: 'Block not found' });
    }

    // Calculate confirmations dynamically
    const latestStats = await Stats.findOne().sort({ timestamp: -1 });
    if (latestStats) {
      block.confirmations = latestStats.blocks - block.height + 1;
    }

    // Populate transaction details if requested
    if (req.query.verbose === 'true') {
      const transactions = await Transaction.find({
        txid: { $in: block.tx }
      }).lean();

      // Enrich transactions with block time if missing
      const enrichedTransactions = transactions.map(tx => {
        if (tx.time || tx.blocktime) {
          return tx;
        }
        return {
          ...tx,
          time: block.time,
          blocktime: block.time
        };
      });

      block.tx = enrichedTransactions;
    }

    res.json(block);
  } catch (error) {
    console.error('Error getting block:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get transaction by txid
app.get('/api/tx/:txid', async (req, res) => {
  try {
    const txid = req.params.txid;
    const tx = await Transaction.findOne({ txid }).lean();

    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Calculate confirmations dynamically
    const latestStats = await Stats.findOne().sort({ timestamp: -1 });
    if (latestStats && tx.blockheight !== undefined) {
      tx.confirmations = latestStats.blocks - tx.blockheight + 1;
    }

    // Get block time if available
    if (tx.blockhash) {
      const block = await Block.findOne({ hash: tx.blockhash }).select('time').lean();
      if (block) {
        tx.blocktime = block.time;
      }
    }

    // Populate prevout data for each input (address and value)
    if (tx.vin && tx.vin.length > 0) {
      for (let i = 0; i < tx.vin.length; i++) {
        const input = tx.vin[i];

        // Skip coinbase inputs
        if (input.coinbase) {
          continue;
        }

        // Fetch the previous transaction
        if (input.txid && input.vout !== undefined) {
          try {
            const prevTx = await Transaction.findOne({ txid: input.txid })
              .select('vout')
              .lean();

            if (prevTx && prevTx.vout && prevTx.vout[input.vout]) {
              // Add the prevout data (the output being spent)
              tx.vin[i].prevout = {
                value: prevTx.vout[input.vout].value,
                scriptPubKey: prevTx.vout[input.vout].scriptPubKey
              };
            }
          } catch (err) {
            console.error(`Error fetching prevout for input ${i}:`, err);
            // Continue without prevout data for this input
          }
        }
      }
    }

    res.json(tx);
  } catch (error) {
    console.error('Error getting transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get mempool (unconfirmed transactions)
app.get('/api/mempool', async (req, res) => {
  try {
    // Get raw mempool with verbose details
    const mempoolRaw = await rpcCall('getrawmempool', [true]);

    if (!mempoolRaw || typeof mempoolRaw !== 'object') {
      return res.json({ transactions: [], count: 0, totalSize: 0, totalFees: 0 });
    }

    // Convert object to array with txid
    const mempoolArray = Object.entries(mempoolRaw).map(([txid, data]) => ({
      txid,
      ...data
    }));

    // Sort by fee rate (highest first)
    mempoolArray.sort((a, b) => (b.fees?.base || 0) - (a.fees?.base || 0));

    // Calculate statistics
    const stats = {
      count: mempoolArray.length,
      totalSize: mempoolArray.reduce((sum, tx) => sum + (tx.size || 0), 0),
      totalFees: mempoolArray.reduce((sum, tx) => sum + (tx.fees?.base || 0), 0),
      totalVSize: mempoolArray.reduce((sum, tx) => sum + (tx.vsize || 0), 0)
    };

    res.json({
      transactions: mempoolArray,
      stats
    });
  } catch (error) {
    console.error('Error getting mempool:', error);
    res.status(500).json({ error: error.message, transactions: [], stats: { count: 0, totalSize: 0, totalFees: 0 } });
  }
});

// Get transactions by block hash or height
app.get('/api/block/:hashOrHeight/transactions', async (req, res) => {
  try {
    const input = req.params.hashOrHeight;
    let block;

    if (/^\d+$/.test(input)) {
      block = await Block.findOne({ height: parseInt(input) }).lean();
    } else {
      block = await Block.findOne({ hash: input }).lean();
    }

    if (!block) {
      return res.status(404).json({ error: 'Block not found' });
    }

    const transactions = await Transaction.find({
      txid: { $in: block.tx }
    }).lean();

    res.json(transactions);
  } catch (error) {
    console.error('Error getting block transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search (block height, block hash, or txid) - with extra rate limiting
app.get('/api/search/:query', searchLimiter, async (req, res) => {
  try {
    const query = req.params.query.trim();

    // Try as block height
    if (/^\d+$/.test(query)) {
      const block = await Block.findOne({ height: parseInt(query) }).lean();
      if (block) {
        return res.json({ type: 'block', data: block });
      }
    }

    // Try as block hash
    const block = await Block.findOne({ hash: query }).lean();
    if (block) {
      return res.json({ type: 'block', data: block });
    }

    // Try as transaction
    const tx = await Transaction.findOne({ txid: query }).lean();
    if (tx) {
      return res.json({ type: 'transaction', data: tx });
    }

    // Try as address (find transactions)
    const txsByAddress = await Transaction.find({
      $or: [
        { 'vout.scriptPubKey.address': query },
        { 'vin.prevout.scriptPubKey.address': query }
      ]
    }).limit(50).sort({ blockheight: -1 }).lean();

    if (txsByAddress.length > 0) {
      return res.json({ type: 'address', data: { address: query, transactions: txsByAddress } });
    }

    res.status(404).json({ error: 'No results found for the given query' });
  } catch (error) {
    console.error('Error searching:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get mempool info
app.get('/api/mempool', async (req, res) => {
  try {
    const latestStats = await Stats.findOne().sort({ timestamp: -1 });

    if (!latestStats) {
      return res.status(503).json({ error: 'No data available' });
    }

    res.json({
      size: latestStats.mempoolsize || 0
    });
  } catch (error) {
    console.error('Error getting mempool:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get address info (balance and transactions)
app.get('/api/address/:address', async (req, res) => {
  try {
    const address = req.params.address;

    // Step 1: Find all transactions where address received coins (in outputs)
    const receivingTxs = await Transaction.find({
      'vout.scriptPubKey.address': address
    }).select('txid vout').lean();

    // Build a set of output references that belong to this address
    const addressOutputs = new Set();
    receivingTxs.forEach(tx => {
      tx.vout.forEach((output, index) => {
        if (output.scriptPubKey && output.scriptPubKey.address === address) {
          addressOutputs.add(`${tx.txid}:${index}`);
        }
      });
    });

    // Step 2: Find transactions that spend from this address
    // (transactions that have inputs referencing our address's outputs)
    const spendingTxIds = new Set();
    if (addressOutputs.size > 0) {
      // Get list of unique txids that have outputs belonging to this address
      const receivingTxIds = Array.from(new Set(receivingTxs.map(tx => tx.txid)));

      // Find all transactions that have inputs spending these outputs
      const allTxsWithInputs = await Transaction.find({
        'vin.txid': { $in: receivingTxIds }
      }).select('txid vin').lean();

      console.log(`Address ${address}: Found ${allTxsWithInputs.length} transactions with inputs referencing ${receivingTxIds.length} receiving txs, checking ${addressOutputs.size} address outputs`);

      let matchedInputs = 0;
      allTxsWithInputs.forEach(tx => {
        tx.vin.forEach(input => {
          if (!input.coinbase && input.txid && input.vout !== undefined) {
            const outputRef = `${input.txid}:${input.vout}`;
            if (addressOutputs.has(outputRef)) {
              spendingTxIds.add(tx.txid);
              matchedInputs++;
            }
          }
        });
      });

      console.log(`Address ${address}: Matched ${matchedInputs} inputs spending address outputs, found ${spendingTxIds.size} spending transactions`);
    }

    // Step 3: Get full transaction details for all involved transactions
    const allTxIds = new Set([
      ...receivingTxs.map(tx => tx.txid),
      ...Array.from(spendingTxIds)
    ]);

    const transactions = await Transaction.find({
      txid: { $in: Array.from(allTxIds) }
    }).sort({ blockheight: -1 }).lean();

    console.log(`Address ${address}: Found ${receivingTxs.length} receiving txs, ${spendingTxIds.size} spending txs, ${transactions.length} total`);

    // Get current block height for coinbase maturity check
    const latestBlock = await Block.findOne().sort({ height: -1 });
    const currentHeight = latestBlock ? latestBlock.height : 0;
    const COINBASE_MATURITY = 200; // S256 coin maturity requirement

    // Get block times for transactions missing time field
    const blockHeights = [...new Set(transactions.map(tx => tx.blockheight).filter(h => h !== undefined))];
    const blocks = await Block.find({ height: { $in: blockHeights } }).select('height time').lean();
    const blockTimeMap = new Map(blocks.map(b => [b.height, b.time]));

    // Calculate balance using UTXO method for consistency with holders page
    const utxos = new Map(); // Map of txid:vout -> {value, txid, vout}

    // Get all transactions to build complete UTXO set for this address
    const allTxs = await Transaction.find({}).lean();

    // First pass: Find all outputs to this address (excluding immature coinbase)
    for (const tx of allTxs) {
      // Check if it's a coinbase transaction
      const isCoinbase = tx.vin && tx.vin.length > 0 && tx.vin[0].coinbase;

      // Calculate confirmations (only if we have blockheight)
      const confirmations = tx.blockheight !== undefined ? currentHeight - tx.blockheight + 1 : 0;

      // Skip immature coinbase outputs (need MORE than maturity confirmations)
      if (isCoinbase && confirmations <= COINBASE_MATURITY) {
        continue;
      }

      for (const vout of tx.vout) {
        if (vout.scriptPubKey.address === address) {
          const utxoKey = `${tx.txid}:${vout.n}`;
          utxos.set(utxoKey, {
            value: vout.value,
            txid: tx.txid,
            vout: vout.n
          });
        }
      }
    }

    // Second pass: Remove spent outputs by checking all transaction inputs
    for (const tx of allTxs) {
      for (const vin of tx.vin) {
        if (!vin.coinbase && vin.txid && vin.vout !== undefined) {
          const utxoKey = `${vin.txid}:${vin.vout}`;
          // Check if this input spends any UTXO belonging to this address
          if (utxos.has(utxoKey)) {
            utxos.delete(utxoKey);
          }
        }
      }
    }

    // Calculate balance from unspent outputs only
    let balance = 0;
    for (const utxo of utxos.values()) {
      balance += utxo.value;
    }

    // Collect all unique input txids that need prevout lookup
    const inputTxids = new Set();
    transactions.forEach(tx => {
      if (tx.vin) {
        tx.vin.forEach(input => {
          if (!input.coinbase && !input.prevout && input.txid) {
            inputTxids.add(input.txid);
          }
        });
      }
    });

    // Batch fetch all needed previous transactions
    const prevTxMap = new Map();
    if (inputTxids.size > 0) {
      const prevTxs = await Transaction.find({
        txid: { $in: Array.from(inputTxids) }
      }).select('txid vout').lean();

      prevTxs.forEach(tx => {
        prevTxMap.set(tx.txid, tx);
      });
    }

    // Enrich transactions with block time, prevout data, and calculate amounts for this address
    const enrichedTransactions = transactions.map(tx => {
      // Add block time if missing
      let enrichedTx = { ...tx };
      if (!tx.time && !tx.blocktime) {
        const blockTime = blockTimeMap.get(tx.blockheight);
        enrichedTx.time = blockTime;
        enrichedTx.blocktime = blockTime;
      }

      // Calculate amounts for this specific address
      let receivedAmount = 0;
      let sentAmount = 0;

      // Sum outputs to this address (received)
      if (enrichedTx.vout) {
        enrichedTx.vout.forEach(output => {
          if (output.scriptPubKey && output.scriptPubKey.address === address) {
            receivedAmount += parseFloat(output.value);
          }
        });
      }

      // Sum inputs from this address (sent)
      if (enrichedTx.vin && enrichedTx.vin.length > 0) {
        enrichedTx.vin.forEach(input => {
          // Skip coinbase inputs
          if (input.coinbase) {
            return;
          }

          // First check if prevout is already stored in the transaction (from sync)
          if (input.prevout && input.prevout.scriptPubKey) {
            if (input.prevout.scriptPubKey.address === address) {
              sentAmount += parseFloat(input.prevout.value);
            }
            return;
          }

          // Fall back to looking up the previous transaction output
          if (input.txid && input.vout !== undefined) {
            const prevTx = prevTxMap.get(input.txid);
            if (prevTx && prevTx.vout && prevTx.vout[input.vout]) {
              const prevOut = prevTx.vout[input.vout];

              // Check if this input came from our address
              if (prevOut.scriptPubKey && prevOut.scriptPubKey.address === address) {
                sentAmount += parseFloat(prevOut.value);
              }
            }
          }
        });
      }

      // Calculate net amount and direction
      const netAmount = sentAmount > 0 ? -(sentAmount - receivedAmount) : receivedAmount;
      const direction = sentAmount > 0 ? 'out' : 'in';

      // Add calculated data to transaction
      enrichedTx.addressAmount = {
        received: receivedAmount,
        sent: sentAmount,
        net: netAmount,
        direction: direction
      };

      return enrichedTx;
    });

    const outgoingCount = enrichedTransactions.filter(tx => tx.addressAmount.direction === 'out').length;
    console.log(`Address ${address}: enriched ${transactions.length} transactions, ${outgoingCount} outgoing, fetched ${prevTxMap.size} previous txs`);

    // Calculate received and sent from NET transaction amounts (matches what users see in transaction list)
    // Important: Exclude immature coinbase transactions (need > 200 confirmations)
    let received = 0;
    let sent = 0;

    enrichedTransactions.forEach(tx => {
      if (tx.addressAmount) {
        // Check if this is a coinbase transaction
        const isCoinbase = tx.vin && tx.vin.length > 0 && tx.vin[0].coinbase;

        // Calculate confirmations
        const confirmations = tx.blockheight !== undefined ? currentHeight - tx.blockheight + 1 : 0;

        // Skip immature coinbase transactions
        if (isCoinbase && confirmations <= COINBASE_MATURITY) {
          return;
        }

        const netAmount = tx.addressAmount.net;
        if (netAmount > 0) {
          // Positive net = received
          received += netAmount;
        } else if (netAmount < 0) {
          // Negative net = sent
          sent += Math.abs(netAmount);
        }
      }
    });

    res.json({
      address,
      balance,
      received,
      sent,
      txCount: transactions.length,
      transactions: enrichedTransactions
    });
  } catch (error) {
    console.error('Error getting address info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get network stats history
app.get('/api/stats/history', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const stats = await Stats.find({
      timestamp: { $gte: since }
    }).sort({ timestamp: 1 }).lean();

    res.json(stats);
  } catch (error) {
    console.error('Error getting stats history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get chart data for various metrics
app.get('/api/charts/:metric', async (req, res) => {
  try {
    const metric = req.params.metric;
    const days = parseInt(req.query.days) || 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let data = [];

    switch (metric) {
      case 'hashrate':
        // Get hashrate from stats, one sample per hour
        const hashrateStats = await Stats.find({
          timestamp: { $gte: since }
        }).sort({ timestamp: 1 }).lean();

        // Group by hour to reduce data points
        const hashrateByHour = {};
        hashrateStats.forEach(stat => {
          const hour = new Date(stat.timestamp).setMinutes(0, 0, 0);
          if (!hashrateByHour[hour] || stat.timestamp > hashrateByHour[hour].timestamp) {
            hashrateByHour[hour] = stat;
          }
        });

        data = Object.values(hashrateByHour).map(stat => ({
          timestamp: stat.timestamp,
          value: stat.networkhashps || 0
        }));
        break;

      case 'difficulty':
        // Get difficulty from stats
        const difficultyStats = await Stats.find({
          timestamp: { $gte: since }
        }).sort({ timestamp: 1 }).lean();

        const difficultyByHour = {};
        difficultyStats.forEach(stat => {
          const hour = new Date(stat.timestamp).setMinutes(0, 0, 0);
          if (!difficultyByHour[hour] || stat.timestamp > difficultyByHour[hour].timestamp) {
            difficultyByHour[hour] = stat;
          }
        });

        data = Object.values(difficultyByHour).map(stat => ({
          timestamp: stat.timestamp,
          value: stat.difficulty || 0
        }));
        break;

      case 'transactions':
        // Get transaction count per day from blocks
        const txBlocks = await Block.find({
          time: { $gte: Math.floor(since.getTime() / 1000) }
        }).select('time nTx').sort({ time: 1 }).lean();

        // Group by day
        const txByDay = {};
        txBlocks.forEach(block => {
          const day = new Date(block.time * 1000).setHours(0, 0, 0, 0);
          if (!txByDay[day]) {
            txByDay[day] = { timestamp: new Date(day), count: 0 };
          }
          txByDay[day].count += block.nTx || 0;
        });

        data = Object.values(txByDay).map(day => ({
          timestamp: day.timestamp,
          value: day.count
        }));
        break;

      case 'blocksize':
        // Get average block size per day
        const sizeBlocks = await Block.find({
          time: { $gte: Math.floor(since.getTime() / 1000) }
        }).select('time size').sort({ time: 1 }).lean();

        // Group by day and calculate average
        const sizeByDay = {};
        sizeBlocks.forEach(block => {
          const day = new Date(block.time * 1000).setHours(0, 0, 0, 0);
          if (!sizeByDay[day]) {
            sizeByDay[day] = { timestamp: new Date(day), total: 0, count: 0 };
          }
          sizeByDay[day].total += block.size || 0;
          sizeByDay[day].count += 1;
        });

        data = Object.values(sizeByDay).map(day => ({
          timestamp: day.timestamp,
          value: day.count > 0 ? day.total / day.count : 0
        }));
        break;

      case 'blocks':
        // Get blocks mined per day
        const blocks = await Block.find({
          time: { $gte: Math.floor(since.getTime() / 1000) }
        }).select('time').sort({ time: 1 }).lean();

        const blocksByDay = {};
        blocks.forEach(block => {
          const day = new Date(block.time * 1000).setHours(0, 0, 0, 0);
          if (!blocksByDay[day]) {
            blocksByDay[day] = { timestamp: new Date(day), count: 0 };
          }
          blocksByDay[day].count += 1;
        });

        data = Object.values(blocksByDay).map(day => ({
          timestamp: day.timestamp,
          value: day.count
        }));
        break;

      default:
        return res.status(400).json({ error: 'Invalid metric. Use: hashrate, difficulty, transactions, blocksize, or blocks' });
    }

    res.json({ metric, days, data });
  } catch (error) {
    console.error('Error getting chart data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const latestBlock = await Block.findOne().sort({ height: -1 });
    const latestStats = await Stats.findOne().sort({ timestamp: -1 });

    const blockAge = latestBlock ? (Date.now() / 1000 - latestBlock.time) : null;
    const statsAge = latestStats ? (Date.now() - latestStats.timestamp.getTime()) / 1000 : null;

    res.json({
      status: 'ok',
      database: 'connected',
      latestBlock: latestBlock ? latestBlock.height : null,
      blockAge: blockAge ? `${Math.floor(blockAge / 60)} minutes` : null,
      statsAge: statsAge ? `${Math.floor(statsAge)} seconds` : null,
      syncing: statsAge > 120 ? 'warning: stats older than 2 minutes' : 'ok'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// ========================================
// MiningPoolStats Compatible API Endpoints
// ========================================

// Get current block count
app.get('/api/getblockcount', async (req, res) => {
  try {
    const latestStats = await Stats.findOne().sort({ timestamp: -1 });
    if (!latestStats) {
      return res.status(503).send('0');
    }
    res.send(latestStats.blocks.toString());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current difficulty
app.get('/api/getdifficulty', async (req, res) => {
  try {
    const latestStats = await Stats.findOne().sort({ timestamp: -1 });
    if (!latestStats) {
      return res.status(503).send('0');
    }
    res.send(latestStats.difficulty.toString());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get network hashrate
app.get('/api/getnetworkhashps', async (req, res) => {
  try {
    const latestStats = await Stats.findOne().sort({ timestamp: -1 });
    if (!latestStats) {
      return res.status(503).send('0');
    }
    res.send(latestStats.networkhashps.toString());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get general info (comprehensive endpoint)
app.get('/api/getinfo', async (req, res) => {
  try {
    const latestStats = await Stats.findOne().sort({ timestamp: -1 });
    if (!latestStats) {
      return res.status(503).json({ error: 'No data available' });
    }

    res.json({
      blocks: latestStats.blocks,
      difficulty: latestStats.difficulty,
      networkhashps: latestStats.networkhashps,
      connections: latestStats.connections,
      chainwork: latestStats.chainwork,
      chain: 'main'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get coin supply info
app.get('/api/supply', async (req, res) => {
  try {
    const latestStats = await Stats.findOne().sort({ timestamp: -1 });
    if (!latestStats) {
      return res.status(503).json({ error: 'No data available' });
    }

    const blockCount = latestStats.blocks;

    // S256 parameters
    const initialReward = 100; // 100 S256 per block
    const halvingInterval = 420000;

    // Calculate circulating supply
    let circulatingSupply = 0;
    let currentBlock = 0;
    let currentReward = initialReward;

    while (currentBlock < blockCount) {
      const nextHalving = Math.min(currentBlock + halvingInterval, blockCount);
      const blocksInThisEra = nextHalving - currentBlock;
      circulatingSupply += blocksInThisEra * currentReward;
      currentBlock = nextHalving;
      currentReward /= 2;
    }

    res.json({
      circulating: circulatingSupply,
      total: 84000000,
      maxSupply: 84000000,
      blocks: blockCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get top holders (rich list)
app.get('/api/holders', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;

    // Get current block height for coinbase maturity check
    const latestBlock = await Block.findOne().sort({ height: -1 });
    const currentHeight = latestBlock ? latestBlock.height : 0;
    const COINBASE_MATURITY = 200; // S256 coin maturity requirement

    // Get all transactions to calculate balances using UTXO method
    const transactions = await Transaction.find({}).lean();

    // Build UTXO set
    const utxos = {}; // Map of txid:vout -> {address, value}
    const txCounts = {}; // Map of address -> unique txid set

    // First pass: Create all outputs (excluding immature coinbase)
    for (const tx of transactions) {
      // Check if it's a coinbase transaction
      const isCoinbase = tx.vin && tx.vin.length > 0 && tx.vin[0].coinbase;

      // Calculate confirmations (only if we have blockheight)
      const confirmations = tx.blockheight !== undefined ? currentHeight - tx.blockheight + 1 : 0;

      // Skip immature coinbase outputs (need MORE than maturity confirmations)
      if (isCoinbase && confirmations <= COINBASE_MATURITY) {
        continue;
      }

      for (const vout of tx.vout) {
        if (vout.scriptPubKey && vout.scriptPubKey.address) {
          const utxoKey = `${tx.txid}:${vout.n}`;
          utxos[utxoKey] = {
            address: vout.scriptPubKey.address,
            value: vout.value
          };

          // Track unique transactions per address
          if (!txCounts[vout.scriptPubKey.address]) {
            txCounts[vout.scriptPubKey.address] = new Set();
          }
          txCounts[vout.scriptPubKey.address].add(tx.txid);
        }
      }
    }

    // Second pass: Mark spent outputs
    for (const tx of transactions) {
      for (const vin of tx.vin) {
        if (!vin.coinbase && vin.txid && vin.vout !== undefined) {
          const utxoKey = `${vin.txid}:${vin.vout}`;
          // Remove spent UTXO
          delete utxos[utxoKey];
        }
      }
    }

    // Calculate balances from unspent outputs only
    const balances = {};
    for (const utxo of Object.values(utxos)) {
      balances[utxo.address] = (balances[utxo.address] || 0) + utxo.value;
    }

    // Convert to array and sort by balance
    const holders = Object.entries(balances)
      .map(([address, balance]) => ({
        address,
        balance,
        txCount: txCounts[address] ? txCounts[address].size : 0
      }))
      .filter(h => h.balance > 0) // Only addresses with positive balance
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit);

    // Calculate total supply and percentages
    const latestStats = await Stats.findOne().sort({ timestamp: -1 });
    const blockCount = latestStats ? latestStats.blocks : 0;

    // S256 supply calculation
    const initialReward = 100;
    const halvingInterval = 420000;
    let circulatingSupply = 0;
    let currentBlock = 0;
    let currentReward = initialReward;

    while (currentBlock < blockCount) {
      const nextHalving = Math.min(currentBlock + halvingInterval, blockCount);
      const blocksInThisEra = nextHalving - currentBlock;
      circulatingSupply += blocksInThisEra * currentReward;
      currentBlock = nextHalving;
      currentReward /= 2;
    }

    // Add rank and percentage
    const holdersWithStats = holders.map((holder, index) => ({
      rank: index + 1,
      ...holder,
      percentage: circulatingSupply > 0 ? (holder.balance / circulatingSupply) * 100 : 0
    }));

    res.json({
      holders: holdersWithStats,
      totalHolders: Object.keys(balances).filter(addr => balances[addr] > 0).length,
      circulatingSupply,
      topHoldersBalance: holders.reduce((sum, h) => sum + h.balance, 0)
    });
  } catch (error) {
    console.error('Error getting holders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get network peers
app.get('/api/peers', async (req, res) => {
  try {
    const peerInfo = await rpcCall('getpeerinfo');

    // Add country information to each peer
    const peersWithGeo = peerInfo.map(peer => {
      // Extract IP from "ip:port" format (handle both IPv4 and IPv6)
      let ip = null;
      if (peer.addr) {
        if (peer.addr.startsWith('[')) {
          // IPv6: extract between [ and ]
          const endBracket = peer.addr.indexOf(']');
          if (endBracket !== -1) {
            ip = peer.addr.substring(1, endBracket);
          }
        } else {
          // IPv4: split on first colon
          ip = peer.addr.split(':')[0];
        }
      }

      // Look up geolocation
      let country = null;
      let countryCode = null;
      let lat = null;
      let lon = null;

      if (ip) {
        const geo = geoip.lookup(ip);
        if (geo) {
          countryCode = geo.country;
          country = geo.country;
          if (geo.ll && geo.ll.length === 2) {
            lat = geo.ll[0];
            lon = geo.ll[1];
          }
        }
      }

      return {
        ...peer,
        country,
        countryCode,
        lat,
        lon,
        ip
      };
    });

    res.json({
      peers: peersWithGeo,
      count: peersWithGeo.length
    });
  } catch (error) {
    console.error('Error getting peer info:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// WALLET API ENDPOINTS (for S256 Wallet mobile app compatibility)
// =============================================================================

// Get address transactions with pagination
// Used by wallet to fetch transaction history
app.get('/ext/getaddresstxs/:address/:start/:limit', async (req, res) => {
  try {
    const { address, start, limit } = req.params;
    const startIndex = parseInt(start) || 0;
    const limitCount = Math.min(parseInt(limit) || 50, 100); // Max 100 per request

    // Query transactions where address is in vout OR vin
    const transactions = await Transaction.find({
      $or: [
        { 'vout.scriptPubKey.address': address },
        { 'vin.prevout.scriptPubKey.address': address }
      ]
    })
      .sort({ blockheight: -1 }) // Most recent first
      .skip(startIndex)
      .limit(limitCount)
      .lean();

    // Get block timestamps for transactions that don't have time field
    const blockHeights = [...new Set(transactions.map(tx => tx.blockheight).filter(h => h !== undefined))];
    const blocks = await Block.find({ height: { $in: blockHeights } }).lean();
    const blockTimeMap = new Map(blocks.map(b => [b.height, b.time]));

    // Format transactions for wallet app with sent/received/balance
    // Note: Balance is calculated cumulatively from transaction history
    let runningBalance = 0;

    const formattedTxs = transactions.reverse().map((tx) => {
      // Calculate received: sum of vout amounts where address matches
      const received = (tx.vout || [])
        .filter(vout => vout.scriptPubKey?.address === address)
        .reduce((sum, vout) => sum + (vout.value || 0), 0);

      // Calculate sent: sum of vin amounts where prevout address matches
      const sent = (tx.vin || [])
        .filter(vin => vin.prevout?.scriptPubKey?.address === address)
        .reduce((sum, vin) => sum + (vin.prevout?.value || 0), 0);

      // Update running balance (received - sent for this tx)
      runningBalance += (received - sent);

      // Get timestamp from tx.time, tx.blocktime, or block.time
      const timestamp = tx.time || tx.blocktime || (tx.blockheight !== undefined ? blockTimeMap.get(tx.blockheight) : null) || 0;

      return {
        txid: tx.txid,
        timestamp: timestamp,
        sent: sent,
        received: received,
        balance: runningBalance
      };
    }).reverse(); // Reverse back to most recent first

    res.json(formattedTxs);
  } catch (error) {
    console.error('Error getting address transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get transaction by txid
// Used by wallet to show transaction details
app.get('/ext/gettx/:txid', async (req, res) => {
  try {
    const { txid } = req.params;

    // Find transaction in MongoDB
    const transaction = await Transaction.findOne({ txid }).lean();

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Calculate total output value (in satoshis)
    const totalOutput = (transaction.vout || []).reduce((sum, vout) => {
      return sum + (vout.value || 0);
    }, 0);

    // Format vin with amount and addresses
    // Fetch prevout data from database if not present
    const formattedVin = await Promise.all((transaction.vin || []).map(async (vin) => {
      if (vin.coinbase) {
        return {
          coinbase: vin.coinbase,
          amount: 0,
          addresses: 'Coinbase (Newly Generated Coins)'
        };
      }

      // Check if prevout data is already in the vin
      if (vin.prevout?.value !== undefined) {
        return {
          txid: vin.txid,
          vout: vin.vout,
          amount: Math.round(vin.prevout.value * 100000000),
          addresses: vin.prevout.scriptPubKey?.address || 'Unknown'
        };
      }

      // Fetch prevout data from database
      try {
        const prevTx = await Transaction.findOne({ txid: vin.txid }).lean();
        if (prevTx && prevTx.vout && prevTx.vout[vin.vout]) {
          const prevOutput = prevTx.vout[vin.vout];
          return {
            txid: vin.txid,
            vout: vin.vout,
            amount: Math.round((prevOutput.value || 0) * 100000000),
            addresses: prevOutput.scriptPubKey?.address || 'Unknown'
          };
        }
      } catch (err) {
        console.error(`Error fetching prevout for ${vin.txid}:${vin.vout}`, err);
      }

      // Fallback if prevout not found
      return {
        txid: vin.txid,
        vout: vin.vout,
        amount: 0,
        addresses: 'Unknown'
      };
    }));

    // Format vout with amount and addresses
    const formattedVout = (transaction.vout || []).map(vout => ({
      n: vout.n,
      amount: Math.round((vout.value || 0) * 100000000), // Convert to satoshis
      addresses: vout.scriptPubKey?.address || 'Unknown'
    }));

    // Format transaction data for wallet modal
    const formattedTx = {
      txid: transaction.txid,
      total: Math.round(totalOutput * 100000000), // Convert to satoshis
      vin: formattedVin,
      vout: formattedVout,
      blockhash: transaction.blockhash,
      blockheight: transaction.blockheight,
      confirmations: transaction.confirmations,
      time: transaction.time || transaction.blocktime
    };

    // Wrap in 'tx' object as expected by wallet modal
    res.json({ tx: formattedTx });
  } catch (error) {
    console.error('Error getting transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// END WALLET API ENDPOINTS
// =============================================================================

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle favicon (prevent 404)
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No content
});

// Catch-all route: serve index.html for any non-API route
// This enables client-side routing for URLs like /block/:hash
app.get('*', (req, res) => {
  // Don't catch API routes (they're already handled above)
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 S256 Block Explorer API running on http://localhost:${PORT}`);
  console.log(`📊 Connected to MongoDB: ${MONGODB_URI}`);
  console.log(`\n💡 Make sure the sync service is running: npm run sync`);
});
