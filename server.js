require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// S256 RPC configuration
const RPC_USER = process.env.RPC_USER || 'user';
const RPC_PASSWORD = process.env.RPC_PASSWORD || 'password';
const RPC_HOST = process.env.RPC_HOST || '127.0.0.1';
const RPC_PORT = process.env.RPC_PORT || '25332';

const RPC_URL = `http://${RPC_USER}:${RPC_PASSWORD}@${RPC_HOST}:${RPC_PORT}`;

// Trust proxy
app.set('trust proxy', true);

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Block sensitive files
app.use((req, res, next) => {
  const blocked = ['.env', 'package.json', 'server.js', '.git', 'node_modules'];
  if (blocked.some(f => req.path.toLowerCase().includes(f))) {
    return res.status(403).send('Access denied');
  }
  next();
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname), { dotfiles: 'deny' }));

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
      }
    });
    return response.data.result;
  } catch (error) {
    console.error(`RPC Error (${method}):`, error.message);
    if (error.response) {
      throw new Error(error.response.data.error.message);
    }
    throw error;
  }
}

// API Routes

// Get blockchain info
app.get('/api/blockchain-info', async (req, res) => {
  try {
    const info = await rpcCall('getblockchaininfo');
    const networkInfo = await rpcCall('getnetworkinfo');
    const miningInfo = await rpcCall('getmininginfo');

    res.json({
      blocks: info.blocks,
      difficulty: info.difficulty,
      chainwork: info.chainwork,
      connections: networkInfo.connections,
      networkhashps: miningInfo.networkhashps
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recent blocks
app.get('/api/blocks/recent/:count?', async (req, res) => {
  try {
    const count = parseInt(req.params.count) || 10;
    const blockchainInfo = await rpcCall('getblockchaininfo');
    const currentHeight = blockchainInfo.blocks;

    const blocks = [];
    for (let i = 0; i < count && (currentHeight - i) >= 0; i++) {
      const height = currentHeight - i;
      const blockHash = await rpcCall('getblockhash', [height]);
      const block = await rpcCall('getblock', [blockHash, 2]);

      blocks.push({
        height: block.height,
        hash: block.hash,
        time: block.time,
        nTx: block.nTx,
        size: block.size,
        difficulty: block.difficulty,
        confirmations: block.confirmations
      });
    }

    res.json(blocks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get block by hash or height
app.get('/api/block/:hashOrHeight', async (req, res) => {
  try {
    let blockHash;
    const input = req.params.hashOrHeight;

    // Check if input is a number (height) or hash
    if (/^\d+$/.test(input)) {
      blockHash = await rpcCall('getblockhash', [parseInt(input)]);
    } else {
      blockHash = input;
    }

    const block = await rpcCall('getblock', [blockHash, 2]);
    res.json(block);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get transaction by txid
app.get('/api/tx/:txid', async (req, res) => {
  try {
    const txid = req.params.txid;
    const tx = await rpcCall('getrawtransaction', [txid, true]);
    res.json(tx);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search (block height, block hash, or txid)
app.get('/api/search/:query', async (req, res) => {
  try {
    const query = req.params.query.trim();

    // Try as block height
    if (/^\d+$/.test(query)) {
      const height = parseInt(query);
      const blockHash = await rpcCall('getblockhash', [height]);
      const block = await rpcCall('getblock', [blockHash, 2]);
      return res.json({ type: 'block', data: block });
    }

    // Try as block hash
    try {
      const block = await rpcCall('getblock', [query, 2]);
      return res.json({ type: 'block', data: block });
    } catch (e) {
      // Not a block hash, try transaction
    }

    // Try as transaction
    try {
      const tx = await rpcCall('getrawtransaction', [query, true]);
      return res.json({ type: 'transaction', data: tx });
    } catch (e) {
      // Not a transaction
    }

    res.status(404).json({ error: 'No results found for the given query' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get mempool info
app.get('/api/mempool', async (req, res) => {
  try {
    const mempoolInfo = await rpcCall('getmempoolinfo');
    res.json(mempoolInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// MiningPoolStats Compatible API Endpoints
// ========================================

// Get current block count
app.get('/api/getblockcount', async (req, res) => {
  try {
    const blockCount = await rpcCall('getblockcount');
    res.send(blockCount.toString());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current difficulty
app.get('/api/getdifficulty', async (req, res) => {
  try {
    const difficulty = await rpcCall('getdifficulty');
    res.send(difficulty.toString());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get network hashrate
app.get('/api/getnetworkhashps', async (req, res) => {
  try {
    const hashps = await rpcCall('getnetworkhashps');
    res.send(hashps.toString());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get general info (comprehensive endpoint)
app.get('/api/getinfo', async (req, res) => {
  try {
    const [blockchainInfo, networkInfo, miningInfo] = await Promise.all([
      rpcCall('getblockchaininfo'),
      rpcCall('getnetworkinfo'),
      rpcCall('getmininginfo')
    ]);

    res.json({
      blocks: blockchainInfo.blocks,
      difficulty: blockchainInfo.difficulty,
      networkhashps: miningInfo.networkhashps,
      connections: networkInfo.connections,
      version: networkInfo.version,
      subversion: networkInfo.subversion,
      protocolversion: networkInfo.protocolversion,
      chainwork: blockchainInfo.chainwork,
      chain: blockchainInfo.chain
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get coin supply info
app.get('/api/supply', async (req, res) => {
  try {
    const blockchainInfo = await rpcCall('getblockchaininfo');
    const blockCount = blockchainInfo.blocks;

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

// Get network peers
app.get('/api/peers', async (req, res) => {
  try {
    const peerInfo = await rpcCall('getpeerinfo');
    res.json({
      peers: peerInfo,
      count: peerInfo.length
    });
  } catch (error) {
    console.error('Error getting peer info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`S256 Block Explorer running on http://localhost:${PORT}`);
  console.log(`Connecting to S256 RPC at ${RPC_HOST}:${RPC_PORT}`);
});
