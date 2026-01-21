# S256 Block Explorer

A modern, high-performance block explorer for the S256 (SHA256 Coin) blockchain with MongoDB backend.

<p align="center">
  <img src="public/s256_brand.png" alt="S256 Block Explorer" width="128">
</p>

<p align="center">
  <strong>Block Explorer for SHA256coin (S256)</strong><br>
  Built with Node.js and Express
</p>

<p align="center">
  <a href="https://sha256coin.eu">Website</a> •
  <a href="https://explorer.sha256coin.eu">Explorer</a>
</p>

## Features

- Real-time blockchain statistics
- Fast MongoDB-backed database
- Browse recent blocks with pagination
- View detailed block information
- View transaction details
- Search by block height, block hash, transaction ID, or address
- Address balance tracking
- Network statistics history
- Auto-syncing with blockchain
- Responsive design matching S256 website theme

## Architecture

- **Frontend**: Modern HTML/CSS/JS interface
- **API**: Express.js REST API
- **Database**: MongoDB for fast queries
- **Sync Service**: Background process that syncs blocks from S256 daemon

## Prerequisites

- Node.js (v16 or higher)
- MongoDB (v6 or higher)
- npm or yarn
- Running S256 daemon with RPC enabled

## S256 Daemon Configuration

Before running the explorer, make sure your S256 daemon is configured for RPC access.

1. Create or edit `~/.sha256coin/sha256coin.conf` (or your custom data directory):

```conf
# RPC Configuration
server=1
txindex=1
rpcuser=your_rpc_username
rpcpassword=your_secure_rpc_password
rpcport=25332
rpcallowip=127.0.0.1

# Optional: Enable transaction indexing for full explorer functionality
txindex=1
```

2. If you add `txindex=1` to an existing node, you'll need to reindex:

```bash
./bitcoind -reindex
```

## Installation

### 1. Install MongoDB

**Ubuntu/Debian:**
```bash
# Import MongoDB public key
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Add repository (Ubuntu 22.04 - for other versions see MongoDB docs)
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Install MongoDB
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start and enable service
sudo systemctl start mongod
sudo systemctl enable mongod
```

**macOS:**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Or use MongoDB Atlas** (free cloud MongoDB): https://www.mongodb.com/cloud/atlas

### 2. Install Node.js dependencies

```bash
cd explorer
npm install
```

### 3. Configure the explorer

Create `.env` file:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# S256 RPC
RPC_USER=your_rpc_username
RPC_PASSWORD=your_secure_rpc_password
RPC_HOST=127.0.0.1
RPC_PORT=25332

# MongoDB
MONGODB_URI=mongodb://localhost:27017/s256explorer

# Server
PORT=3000
```

## Running the Explorer

The explorer consists of two services that need to run simultaneously:

### Option 1: Manual (Development)

**Terminal 1 - Start the sync service:**
```bash
npm run sync
```

**Terminal 2 - Start the API server:**
```bash
npm start
```

The explorer will be available at: `http://localhost:3000`

### Option 2: PM2 (Production)

Using PM2 process manager (recommended for production):

```bash
# Install PM2 globally
npm install -g pm2

# Start both services
npm run pm2:start

# View logs
pm2 logs

# Stop services
npm run pm2:stop

# Restart services
npm run pm2:restart
```

### Option 3: Simple Version (No MongoDB)

If you don't want to use MongoDB, you can run the simple version:

```bash
npm run start:simple
```

This version queries RPC directly (slower, not recommended for production).

## Usage

1. **View Blockchain Stats**: The top section shows real-time blockchain information
2. **Recent Blocks**: Scroll down to see the latest 20 blocks
3. **Search**: Use the search bar to find blocks (by height or hash) or transactions (by txid)
4. **Block Details**: Click any block to view detailed information
5. **Transaction Details**: Click any transaction to view inputs and outputs

## API Endpoints

The explorer provides a REST API:

- `GET /api/blockchain-info` - Get blockchain statistics
- `GET /api/blocks/recent/:count` - Get recent blocks (default: 10)
- `GET /api/block/:hashOrHeight` - Get block by hash or height
- `GET /api/tx/:txid` - Get transaction by ID
- `GET /api/search/:query` - Search for block or transaction
- `GET /api/mempool` - Get mempool information

## Troubleshooting

### Connection Refused

If you get "Connection refused" errors:

1. Make sure the S256 daemon is running:
   ```bash
   ./bitcoin/build/bin/bitcoin-cli getblockchaininfo
   ```

2. Check RPC credentials match between `s256.conf` and `.env`

3. Verify RPC port (default: 25332)

### Missing Transactions

If transactions don't show up:

1. Enable `txindex=1` in `sha256coin.conf`
2. Restart daemon with `-reindex` flag

### Port Already in Use

If port 3000 is already in use, change the `PORT` in `.env`:

```env
PORT=3001
```

## Deployment

For production deployment:

1. Use a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start server.js --name s256-explorer
   pm2 save
   pm2 startup
   ```

2. Set up nginx reverse proxy for HTTPS

3. Configure firewall to allow traffic on the explorer port

## License

MIT License - See LICENSE file for details

## Support

For issues and questions, please open an issue on the project GitHub repository.
