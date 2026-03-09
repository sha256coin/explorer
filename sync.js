require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Block = require('./models/Block');
const Transaction = require('./models/Transaction');
const Stats = require('./models/Stats');

// S256 RPC configuration
const RPC_USER = process.env.RPC_USER || 'user';
const RPC_PASSWORD = process.env.RPC_PASSWORD || 'password';
const RPC_HOST = process.env.RPC_HOST || '127.0.0.1';
const RPC_PORT = process.env.RPC_PORT || '25332';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/s256explorer';

const RPC_URL = `http://${RPC_USER}:${RPC_PASSWORD}@${RPC_HOST}:${RPC_PORT}`;

let isSyncing = false;
let currentHeight = -1;

// RPC helper function
async function rpcCall(method, params = []) {
  try {
    const response = await axios.post(RPC_URL, {
      jsonrpc: '1.0',
      id: 'sync',
      method: method,
      params: params
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    return response.data.result;
  } catch (error) {
    console.error(`RPC Error (${method}):`, error.message);
    throw error;
  }
}

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

// Fetch prevout data for transaction inputs
async function fetchPrevouts(vin) {
  const vinWithPrevout = [];

  for (const input of vin) {
    if (input.coinbase) {
      // Coinbase transaction has no prevout
      vinWithPrevout.push(input);
      continue;
    }

    try {
      // Look up the previous transaction to get the output being spent
      const prevTx = await rpcCall('getrawtransaction', [input.txid, true]);
      const prevOutput = prevTx.vout[input.vout];

      vinWithPrevout.push({
        ...input,
        prevout: prevOutput
      });
    } catch (error) {
      console.error(`Failed to fetch prevout for ${input.txid}:${input.vout}:`, error.message);
      vinWithPrevout.push(input);
    }
  }

  return vinWithPrevout;
}

// Sync a single block
async function syncBlock(height) {
  try {
    // Get block from RPC
    const blockHash = await rpcCall('getblockhash', [height]);
    const blockData = await rpcCall('getblock', [blockHash, 2]);

    // Check if this block hash already exists and is NOT an orphan
    const existingBlock = await Block.findOne({ hash: blockHash, isOrphan: false });
    if (existingBlock && existingBlock.height === height) {
      // console.log(`⏭️  Block ${height} already synced (${blockHash})`);
      return;
    }

    console.log(`🔄 Syncing block ${height} (${blockHash})...`);

    // Process transactions
    const txids = [];
    for (const tx of blockData.tx) {
      const txData = typeof tx === 'string' ? await rpcCall('getrawtransaction', [tx, true]) : tx;

      // Fetch prevout data for inputs (to track sent amounts)
      if (txData.vin && txData.vin.length > 0) {
        txData.vin = await fetchPrevouts(txData.vin);
      }

      // Save transaction
      await Transaction.findOneAndUpdate(
        { txid: txData.txid },
        {
          ...txData,
          blockheight: height,
          blockhash: blockHash,
          isOrphan: false // Ensure it's not marked as orphan if we're re-syncing
        },
        { upsert: true, new: true }
      );

      txids.push(txData.txid);
    }

    // Save block
    await Block.findOneAndUpdate(
      { hash: blockHash },
      {
        ...blockData,
        tx: txids,
        isOrphan: false
      },
      { upsert: true, new: true }
    );

    console.log(`✅ Synced block ${height} (${txids.length} transactions)`);
  } catch (error) {
    console.error(`❌ Error syncing block ${height}:`, error.message);
    throw error;
  }
}

// Check for chain reorg and handle rollback
async function checkForReorg() {
  try {
    // Get highest synced block from DB
    const lastBlock = await Block.findOne({ isOrphan: false }).sort({ height: -1 });
    if (!lastBlock) return -1;

    let height = lastBlock.height;
    let reorgDetected = false;

    // Check backwards from current height
    while (height >= 0) {
      const dbBlock = await Block.findOne({ height, isOrphan: false });
      if (!dbBlock) {
        height--;
        continue;
      }

      const rpcHash = await rpcCall('getblockhash', [height]);

      if (dbBlock.hash === rpcHash) {
        // Found the common ancestor
        if (reorgDetected) {
          console.log(`🔗 Fork point found at height ${height}. Continuing sync from ${height + 1}.`);
        }
        break;
      } else {
        // Mismatch! This block is now an orphan
        reorgDetected = true;
        console.log(`⚠️  Reorg detected at height ${height}! DB hash: ${dbBlock.hash}, RPC hash: ${rpcHash}`);
        
        // Mark block and its transactions as orphans
        await Block.updateOne({ hash: dbBlock.hash }, { isOrphan: true, confirmations: -1 });
        await Transaction.updateMany({ blockhash: dbBlock.hash }, { isOrphan: true, confirmations: -1 });
        
        height--;
      }

      // Safety limit: don't rollback more than 100 blocks at a time
      if (lastBlock.height - height > 100) {
        console.warn('⚠️  Deep reorg detected (>100 blocks). Manual intervention might be needed.');
        break;
      }
    }

    return height;
  } catch (error) {
    console.error('❌ Reorg check error:', error.message);
    return -1;
  }
}

// Initial sync (catch up with blockchain)
async function initialSync() {
  try {
    console.log('🔄 Starting initial sync...');

    // 1. Check for reorg first
    await checkForReorg();

    // 2. Get current blockchain height
    const blockchainInfo = await rpcCall('getblockchaininfo');
    const chainHeight = blockchainInfo.blocks;

    // 3. Get highest synced block
    const lastBlock = await Block.findOne({ isOrphan: false }).sort({ height: -1 });
    const startHeight = lastBlock ? lastBlock.height + 1 : 0;

    console.log(`📊 Chain height: ${chainHeight}`);
    console.log(`📊 Last synced: ${lastBlock ? lastBlock.height : 'none'}`);
    console.log(`📊 Blocks to sync: ${chainHeight - startHeight + 1}`);

    // Sync missing blocks
    for (let height = startHeight; height <= chainHeight; height++) {
      await syncBlock(height);

      // Progress update every 10 blocks
      if (height % 10 === 0) {
        const progress = ((height - startHeight) / (chainHeight - startHeight + 1) * 100).toFixed(2);
        console.log(`📈 Progress: ${progress}% (${height}/${chainHeight})`);
      }
    }

    currentHeight = chainHeight;
    console.log('✅ Initial sync complete!');
  } catch (error) {
    console.error('❌ Initial sync error:', error);
    throw error;
  }
}

// Monitor for new blocks
async function monitorNewBlocks() {
  if (isSyncing) return;

  try {
    isSyncing = true;

    // 1. Check for reorg before proceeding
    const forkPoint = await checkForReorg();
    
    // 2. Get current blockchain height
    const blockchainInfo = await rpcCall('getblockchaininfo');
    const chainHeight = blockchainInfo.blocks;

    // 3. Determine where to start syncing
    // If we had a reorg, start from forkPoint + 1
    // Otherwise, start from highest synced block + 1
    const lastBlock = await Block.findOne({ isOrphan: false }).sort({ height: -1 });
    let startSyncHeight = lastBlock ? lastBlock.height + 1 : 0;

    // Sync new blocks
    if (chainHeight >= startSyncHeight) {
      console.log(`🔔 Syncing blocks: ${startSyncHeight} to ${chainHeight}`);

      for (let height = startSyncHeight; height <= chainHeight; height++) {
        await syncBlock(height);
      }

      currentHeight = chainHeight;
    }

    // Update stats
    const networkInfo = await rpcCall('getnetworkinfo');
    const miningInfo = await rpcCall('getmininginfo');
    const mempoolInfo = await rpcCall('getmempoolinfo');

    await Stats.create({
      blocks: blockchainInfo.blocks,
      difficulty: blockchainInfo.difficulty,
      chainwork: blockchainInfo.chainwork,
      connections: networkInfo.connections,
      networkhashps: miningInfo.networkhashps,
      mempoolsize: mempoolInfo.size
    });

  } catch (error) {
    console.error('❌ Monitor error:', error.message);
  } finally {
    isSyncing = false;
  }
}

// Update confirmations for recent blocks
async function updateConfirmations() {
  try {
    const recentBlocks = await Block.find().sort({ height: -1 }).limit(100);

    for (const block of recentBlocks) {
      const blockData = await rpcCall('getblock', [block.hash, 1]);

      if (blockData.confirmations !== block.confirmations) {
        await Block.updateOne(
          { hash: block.hash },
          {
            confirmations: blockData.confirmations,
            nextblockhash: blockData.nextblockhash
          }
        );

        await Transaction.updateMany(
          { blockhash: block.hash },
          { confirmations: blockData.confirmations }
        );
      }
    }
  } catch (error) {
    console.error('❌ Update confirmations error:', error.message);
  }
}

// Main sync process
async function startSync() {
  try {
    await connectDB();

    console.log('🚀 S256 Block Sync Service Started');
    console.log(`📡 Connected to RPC: ${RPC_HOST}:${RPC_PORT}`);

    // Initial sync
    await initialSync();

    // Monitor for new blocks every 30 seconds
    console.log('👀 Monitoring for new blocks...');
    setInterval(monitorNewBlocks, 30000);

    // Update confirmations every 5 minutes
    setInterval(updateConfirmations, 300000);

  } catch (error) {
    console.error('❌ Sync service error:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.log('\n⏹️  Shutting down sync service...');
  await mongoose.connection.close();
  process.exit(0);
});

// Start the sync service
startSync();
