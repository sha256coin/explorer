// S256 Block Explorer Frontend

const API_BASE = window.location.origin;
let currentPage = 1;
const blocksPerPage = 20;
let totalBlocks = 0;
let maxPage = 1;
let isLoadingBlocks = false;

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const icon = document.querySelector(".theme-icon");
  icon.textContent = theme === "dark" ? "☀️" : "🌙";
}

// Hamburger Menu Toggle
function toggleMobileMenu() {
  const hamburger = document.getElementById("hamburger");
  const navMenu = document.getElementById("nav-menu");
  const navControls = document.getElementById("nav-controls");

  hamburger.classList.toggle("active");
  navMenu.classList.toggle("active");
  navControls.classList.toggle("active");
}

// Matrix Terminal Easter Egg
let terminalContentLoaded = false;

async function openMatrixTerminal() {
  const terminal = document.getElementById("matrix-terminal");
  terminal.classList.add("active");

  if (!terminalContentLoaded) {
    await loadCoinSupply();
    terminalContentLoaded = true;
  }
}

function closeMatrixTerminal() {
  const terminal = document.getElementById("matrix-terminal");
  terminal.classList.remove("active");
}

async function loadCoinSupply() {
  const content = document.getElementById("terminal-content");

  try {
    // Show loading message
    content.innerHTML = `
      <div class="terminal-line">Initializing secure connection...</div>
      <div class="terminal-line">Decrypting blockchain parameters...</div>
      <div class="terminal-line">Accessing S256_SUPPLY.dat...</div>
      <div class="terminal-line">Loading...</div>
    `;

    // Fetch the COIN_SUPPLY.txt file
    const response = await fetch('/COIN_SUPPLY.txt');
    const text = await response.text();

    // Clear content and display with typewriter effect
    setTimeout(() => {
      displayTerminalContent(text);
    }, 1000);

  } catch (error) {
    content.innerHTML = `
      <div class="terminal-line">ERROR: Unable to access COIN_SUPPLY.txt</div>
      <div class="terminal-line">Connection failed: ${error.message}</div>
      <div class="terminal-line"><span class="terminal-cursor"></span></div>
    `;
  }
}

function displayTerminalContent(text) {
  const content = document.getElementById("terminal-content");
  const lines = text.split('\n');

  content.innerHTML = `
    <div class="terminal-line">Connection established...</div>
    <div class="terminal-line">Decryption complete.</div>
    <div class="terminal-line">Displaying: COIN_SUPPLY.txt</div>
    <div class="terminal-line">═══════════════════════════════════════════════════════════════════</div>
    <br>
  `;

  // Add lines with staggered fade-in effect
  lines.forEach((line, index) => {
    setTimeout(() => {
      const lineDiv = document.createElement('div');
      lineDiv.className = 'terminal-line';
      lineDiv.textContent = line;
      lineDiv.style.animationDelay = '0s';
      content.appendChild(lineDiv);

      // Auto-scroll to bottom
      content.scrollTop = content.scrollHeight;
    }, index * 20); // 20ms delay between lines for smooth effect
  });

  // Add cursor at the end
  setTimeout(() => {
    const cursorDiv = document.createElement('div');
    cursorDiv.className = 'terminal-line';
    cursorDiv.innerHTML = '<br><span class="terminal-cursor"></span>';
    content.appendChild(cursorDiv);
    content.scrollTop = content.scrollHeight;
  }, lines.length * 20 + 100);
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  loadBlockchainInfo();

  // Hamburger menu
  const hamburger = document.getElementById("hamburger");
  if (hamburger) {
    hamburger.addEventListener("click", toggleMobileMenu);
  }

  // Close mobile menu when clicking a link
  const navLinks = document.querySelectorAll(".nav-link");
  navLinks.forEach(link => {
    link.addEventListener("click", () => {
      const navMenu = document.getElementById("nav-menu");
      const navControls = document.getElementById("nav-controls");
      const hamburger = document.getElementById("hamburger");

      if (navMenu && navMenu.classList.contains("active")) {
        hamburger.classList.remove("active");
        navMenu.classList.remove("active");
        navControls.classList.remove("active");
      }
    });
  });

  // Matrix Terminal Easter Egg
  const piSymbol = document.getElementById("pi-easter-egg");
  const terminalClose = document.getElementById("terminal-close");
  const matrixTerminal = document.getElementById("matrix-terminal");

  if (piSymbol) {
    piSymbol.addEventListener("click", openMatrixTerminal);
  }

  if (terminalClose) {
    terminalClose.addEventListener("click", closeMatrixTerminal);
  }

  if (matrixTerminal) {
    matrixTerminal.addEventListener("click", (e) => {
      if (e.target === matrixTerminal) {
        closeMatrixTerminal();
      }
    });
  }

  // Check URL path for direct block or transaction access
  const path = window.location.pathname;
  // Handle both single and double (or multiple) slashes for buggy pool URLs
  const blockMatch = path.match(/^\/*block\/([a-f0-9]+|\d+)$/i);
  const txMatch = path.match(/^\/*tx\/([a-f0-9]+)$/i);
  const addressMatch = path.match(/^\/*address\/([a-z0-9]+)$/i);

  // Check for search query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const searchQuery = urlParams.get('search');

  if (searchQuery) {
    // Perform search from URL parameter
    document.getElementById('search').value = searchQuery;
    performSearch();
  } else if (blockMatch) {
    // URL is /block/:hash or /block/:height
    const hashOrHeight = blockMatch[1];
    showBlockDetails(hashOrHeight);
  } else if (txMatch) {
    // URL is /tx/:txid
    const txid = txMatch[1];
    showTransactionDetails(txid);
  } else if (addressMatch) {
    // URL is /address/:address
    const address = addressMatch[1];
    showAddressDetails(address);
  } else {
    // Default: load recent blocks
    loadRecentBlocks();
  }

  // Theme toggle
  document
    .getElementById("theme-toggle")
    .addEventListener("click", toggleTheme);

  // Auto-refresh every 30 seconds (only refresh blocks if on page 1)
  setInterval(() => {
    loadBlockchainInfo();
    if (
      !document.getElementById("search-results").style.display ||
      document.getElementById("search-results").style.display === "none"
    ) {
      // Only auto-refresh if we're on page 1
      if (currentPage === 1) {
        loadRecentBlocks(1);
      }
    }
  }, 30000);

  // Search button
  document
    .getElementById("search-btn")
    .addEventListener("click", performSearch);
  document.getElementById("search").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      performSearch();
    }
  });

  // Page jump input - Enter key support
  document.getElementById("page-jump-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      jumpToPage();
    }
  });
});

// Load blockchain info
async function loadBlockchainInfo() {
  try {
    const response = await fetch(`${API_BASE}/api/blockchain-info`);
    const data = await response.json();

    totalBlocks = data.blocks;
    maxPage = Math.max(1, Math.ceil(totalBlocks / blocksPerPage));

    document.getElementById("blockHeight").textContent =
      data.blocks.toLocaleString();
    document.getElementById("difficulty").textContent = formatDifficulty(
      data.difficulty
    );
    document.getElementById("hashrate").textContent = formatHashrate(
      data.networkhashps
    );
    document.getElementById("connections").textContent = data.connections;
  } catch (error) {
    console.error("Error loading blockchain info:", error);
    document.getElementById("blockHeight").textContent = "Error";
    document.getElementById("difficulty").textContent = "Error";
    document.getElementById("hashrate").textContent = "Error";
    document.getElementById("connections").textContent = "Error";
  }
}

// Load recent blocks
async function loadRecentBlocks(page = 1) {
  // Prevent multiple simultaneous requests
  if (isLoadingBlocks) return;

  try {
    isLoadingBlocks = true;
    currentPage = page;
    const response = await fetch(
      `${API_BASE}/api/blocks/recent/${blocksPerPage}?page=${page}`
    );
    const blocks = await response.json();

    const tbody = document.getElementById("blocks-list");
    tbody.innerHTML = "";

    if (blocks.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="loading">No more blocks</td></tr>';
      updatePaginationButtons(false, false);
      return;
    }

    blocks.forEach((block) => {
      const row = document.createElement("tr");
      row.onclick = () => showBlockDetails(block.hash);
      row.innerHTML = `
        <td><strong>${block.height}</strong></td>
        <td><span class="hash" title="${block.hash}">${truncateHash(
        block.hash
      )}</span></td>
        <td>${formatTime(block.time)}</td>
        <td>${block.nTx}</td>
        <td>${formatBytes(block.size)}</td>
      `;
      tbody.appendChild(row);
    });

    // Update page info showing block range
    if (blocks.length > 0) {
      const highestBlock = blocks[0].height;
      const lowestBlock = blocks[blocks.length - 1].height;
      const pageInfoText = `Page ${currentPage} of ${maxPage} (Blocks ${highestBlock} - ${lowestBlock})`;

      // Update both locations
      const pageInfo = document.getElementById('blocks-page-info');
      if (pageInfo) {
        pageInfo.textContent = pageInfoText;
      }

      const pageInfoPagination = document.getElementById('blocks-page-info-pagination');
      if (pageInfoPagination) {
        pageInfoPagination.textContent = pageInfoText;
      }
    }

    // Update pagination controls
    renderPagination();
  } catch (error) {
    console.error("Error loading blocks:", error);
    document.getElementById("blocks-list").innerHTML =
      '<tr><td colspan="5" class="loading">Error loading blocks</td></tr>';
  } finally {
    isLoadingBlocks = false;
  }
}

// Change page
function changePage(direction) {
  const newPage = currentPage + direction;
  if (newPage < 1 || newPage > maxPage) return;
  loadRecentBlocks(newPage);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Go to specific page
function goToPage(page) {
  if (page < 1 || page > maxPage) return;
  loadRecentBlocks(page);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Go to last page
function goToLastPage() {
  goToPage(maxPage);
}

// Jump to page from input
function jumpToPage() {
  const input = document.getElementById("page-jump-input");
  const page = parseInt(input.value);

  if (isNaN(page) || page < 1 || page > maxPage) {
    alert(`Please enter a valid page number between 1 and ${maxPage}`);
    return;
  }

  input.value = "";
  goToPage(page);
}

// Render pagination controls
function renderPagination() {
  const pageNumbersDiv = document.getElementById("page-numbers");
  if (!pageNumbersDiv) return;

  const pages = [];

  // Always show first page
  pages.push(1);

  // Determine which pages to show around current page
  const delta = 2; // Show 2 pages before and after current
  const rangeStart = Math.max(2, currentPage - delta);
  const rangeEnd = Math.min(maxPage - 1, currentPage + delta);

  // Add ellipsis after page 1 if needed
  if (rangeStart > 2) {
    pages.push('...');
  }

  // Add pages around current page
  for (let i = rangeStart; i <= rangeEnd; i++) {
    pages.push(i);
  }

  // Add ellipsis before last page if needed
  if (rangeEnd < maxPage - 1) {
    pages.push('...');
  }

  // Always show last page (if more than 1 page)
  if (maxPage > 1) {
    pages.push(maxPage);
  }

  // Build HTML
  pageNumbersDiv.innerHTML = pages.map(page => {
    if (page === '...') {
      return '<span class="page-ellipsis">...</span>';
    }
    const isActive = page === currentPage;
    return `<button class="btn-page-num${isActive ? ' active' : ''}" onclick="goToPage(${page})">${page}</button>`;
  }).join('');

  // Update button states
  const prevBtn = document.getElementById("prev-page");
  const nextBtn = document.getElementById("next-page");
  const firstBtn = document.getElementById("first-page");
  const lastBtn = document.getElementById("last-page");

  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= maxPage;
  if (firstBtn) firstBtn.disabled = currentPage <= 1;
  if (lastBtn) lastBtn.disabled = currentPage >= maxPage;
}

// Show block details
async function showBlockDetails(hashOrHeight) {
  try {
    const response = await fetch(`${API_BASE}/api/block/${hashOrHeight}`);
    const block = await response.json();

    if (block.error) {
      showError(block.error);
      return;
    }

    // Update URL to /block/:hash for bookmarking/sharing
    const newPath = `/block/${block.hash}`;
    if (window.location.pathname !== newPath) {
      window.history.pushState({ blockHash: block.hash }, '', newPath);
    }

    // Get coinbase message from first transaction
    let coinbaseMessage = "";
    if (block.tx && block.tx.length > 0) {
      const firstTxId = block.tx[0].txid || block.tx[0];
      try {
        const txResponse = await fetch(`${API_BASE}/api/tx/${firstTxId}`);
        const firstTx = await txResponse.json();
        if (firstTx.vin && firstTx.vin[0] && firstTx.vin[0].coinbase) {
          coinbaseMessage = decodeCoinbase(firstTx.vin[0].coinbase);
        }
      } catch (e) {
        console.log("Could not fetch coinbase message");
      }
    }

    const content = document.getElementById("block-content");
    content.innerHTML = `
      <div class="detail-row">
        <div class="detail-label">Height:</div>
        <div class="detail-value">${block.height}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Hash:</div>
        <div class="detail-value">${block.hash}</div>
      </div>
      ${
        coinbaseMessage
          ? `
      <div class="detail-row">
        <div class="detail-label">CoinbaseMsg:</div>
        <div class="detail-value" style="color: var(--primary); font-weight: 600; font-size: 1.1rem;">"${coinbaseMessage}"</div>
      </div>
      `
          : ""
      }
      <div class="detail-row">
        <div class="detail-label">Confirmations:</div>
        <div class="detail-value">${block.confirmations.toLocaleString()}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Timestamp:</div>
        <div class="detail-value">${formatTime(block.time)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Size:</div>
        <div class="detail-value">${formatBytes(block.size)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Weight:</div>
        <div class="detail-value">${block.weight.toLocaleString()}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Difficulty:</div>
        <div class="detail-value">${block.difficulty.toFixed(8)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Nonce:</div>
        <div class="detail-value">${block.nonce}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Bits:</div>
        <div class="detail-value">${block.bits}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Version:</div>
        <div class="detail-value">${block.version}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Merkle Root:</div>
        <div class="detail-value">${block.merkleroot}</div>
      </div>
      ${
        block.previousblockhash
          ? `
      <div class="detail-row">
        <div class="detail-label">Previous Block:</div>
        <div class="detail-value clickable" onclick="showBlockDetails('${
          block.previousblockhash
        }')">${truncateHash(block.previousblockhash)}</div>
      </div>
      `
          : ""
      }
      ${
        block.nextblockhash
          ? `
      <div class="detail-row">
        <div class="detail-label">Next Block:</div>
        <div class="detail-value clickable" onclick="showBlockDetails('${
          block.nextblockhash
        }')">${truncateHash(block.nextblockhash)}</div>
      </div>
      `
          : ""
      }
      <div class="detail-row">
        <div class="detail-label">Transactions (${block.tx.length}):</div>
        <div class="detail-value">
          <div class="tx-list">
            ${block.tx
              .map(
                (tx, index) => `
              <div class="tx-item" onclick="showTransactionModal('${
                tx.txid || tx
              }')">
                ${index + 1}. ${truncateHash(tx.txid || tx)}
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      </div>
    `;

    document.getElementById("blocks-section").style.display = "none";
    document.getElementById("search-results").style.display = "none";
    document.getElementById("tx-details").style.display = "none";
    document.getElementById("block-details").style.display = "block";
    const hashrateSection = document.getElementById("hashrate-chart-section");
    if (hashrateSection) hashrateSection.style.display = "none";
  } catch (error) {
    console.error("Error loading block details:", error);
    showError("Error loading block details");
  }
}

// Show transaction details in dedicated section (for direct links)
async function showTransactionDetails(txid) {
  try {
    const response = await fetch(`${API_BASE}/api/tx/${txid}`);
    const tx = await response.json();

    if (tx.error) {
      showError(tx.error);
      return;
    }

    // Update URL to /tx/:txid for bookmarking/sharing
    const newPath = `/tx/${tx.txid}`;
    if (window.location.pathname !== newPath) {
      window.history.pushState({ txid: tx.txid }, '', newPath);
    }

    const content = document.getElementById("tx-content");
    content.innerHTML = `
      <div class="detail-row">
        <div class="detail-label">Transaction ID:</div>
        <div class="detail-value">${tx.txid}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Block Hash:</div>
        <div class="detail-value clickable" onclick="showBlockDetails('${
          tx.blockhash
        }')">${truncateHash(tx.blockhash)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Block Height:</div>
        <div class="detail-value">${tx.blockheight || 'Pending'}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Confirmations:</div>
        <div class="detail-value">${
          tx.confirmations ? tx.confirmations.toLocaleString() : "Unconfirmed"
        }</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Time:</div>
        <div class="detail-value">${
          tx.time || tx.blocktime
            ? formatTime(tx.time || tx.blocktime)
            : "Pending"
        }</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Size:</div>
        <div class="detail-value">${formatBytes(tx.size)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Virtual Size:</div>
        <div class="detail-value">${formatBytes(tx.vsize)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Version:</div>
        <div class="detail-value">${tx.version}</div>
      </div>
      ${tx.locktime && tx.locktime !== 0 ? `
      <div class="detail-row">
        <div class="detail-label">Lock Time:</div>
        <div class="detail-value">${tx.locktime}</div>
      </div>
      ` : ''}
      <div class="detail-row">
        <div class="detail-label">Inputs (${tx.vin.length}):</div>
        <div class="detail-value">
          ${tx.vin
            .map((input, index) => {
              if (input.coinbase) {
                return `<div class="tx-io-box tx-input-box">
                <div class="tx-io-header">💰 <strong>Input ${index}: Coinbase (Mining Reward)</strong></div>
                <div class="tx-io-detail">${truncateHash(input.coinbase, 32)}</div>
              </div>`;
              }

              // Build input display with available data
              const hasValue = input.prevout && input.prevout.value !== undefined;
              const hasAddress = input.prevout && input.prevout.scriptPubKey && input.prevout.scriptPubKey.address;

              return `<div class="tx-io-box tx-input-box">
              <div class="tx-io-header">📥 <strong>Input ${index}</strong></div>
              ${hasAddress ? `<div class="tx-io-address"><strong>From Address:</strong> ${input.prevout.scriptPubKey.address}</div>` : ''}
              ${hasValue ? `<div class="tx-io-amount"><strong>Amount:</strong> <span class="amount-highlight">${input.prevout.value.toFixed(8)} S256</span></div>` : ''}
              <div class="tx-io-reference">
                <strong>Source:</strong> <span class="detail-value clickable" onclick="showTransactionModal('${input.txid}')">${truncateHash(input.txid)}</span> [Output #${input.vout !== undefined ? input.vout : 'N/A'}]
              </div>
            </div>`;
            })
            .join("")}
        </div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Outputs (${tx.vout.length}):</div>
        <div class="detail-value">
          ${tx.vout
            .map(
              (output, index) => `
            <div class="tx-io-box tx-output-box">
              <div class="tx-io-header">📤 <strong>Output ${index}</strong></div>
              <div class="tx-io-amount"><strong>Amount:</strong> <span class="amount-highlight">${output.value.toFixed(8)} S256</span></div>
              ${
                output.scriptPubKey.address
                  ? `<div class="tx-io-address"><strong>To Address:</strong> ${output.scriptPubKey.address}</div>`
                  : `<div class="tx-io-detail"><strong>Type:</strong> ${output.scriptPubKey.type}</div>`
              }
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    document.getElementById("blocks-section").style.display = "none";
    document.getElementById("search-results").style.display = "none";
    document.getElementById("block-details").style.display = "none";
    document.getElementById("address-details").style.display = "none";
    document.getElementById("tx-details").style.display = "block";
    const hashrateSection = document.getElementById("hashrate-chart-section");
    if (hashrateSection) hashrateSection.style.display = "none";
  } catch (error) {
    console.error("Error loading transaction details:", error);
    showError("Error loading transaction details");
  }
}

// Show transaction details in modal (for clicks within page)
async function showTransactionModal(txid) {
  try {
    const response = await fetch(`${API_BASE}/api/tx/${txid}`);
    const tx = await response.json();

    if (tx.error) {
      showError(tx.error);
      return;
    }

    const content = document.getElementById("tx-modal-body");
    content.innerHTML = `
      <div class="detail-row">
        <div class="detail-label">Transaction ID:</div>
        <div class="detail-value">${tx.txid}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Block Hash:</div>
        <div class="detail-value clickable" onclick="closeTxModal(); showBlockDetails('${
          tx.blockhash
        }')">${truncateHash(tx.blockhash)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Block Height:</div>
        <div class="detail-value">${tx.blockheight || 'Pending'}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Confirmations:</div>
        <div class="detail-value">${
          tx.confirmations ? tx.confirmations.toLocaleString() : "Unconfirmed"
        }</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Time:</div>
        <div class="detail-value">${
          tx.time || tx.blocktime
            ? formatTime(tx.time || tx.blocktime)
            : "Pending"
        }</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Size:</div>
        <div class="detail-value">${formatBytes(tx.size)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Virtual Size:</div>
        <div class="detail-value">${formatBytes(tx.vsize)}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Version:</div>
        <div class="detail-value">${tx.version}</div>
      </div>
      ${tx.locktime && tx.locktime !== 0 ? `
      <div class="detail-row">
        <div class="detail-label">Lock Time:</div>
        <div class="detail-value">${tx.locktime}</div>
      </div>
      ` : ''}
      <div class="detail-row">
        <div class="detail-label">Inputs (${tx.vin.length}):</div>
        <div class="detail-value">
          ${tx.vin
            .map((input, index) => {
              if (input.coinbase) {
                return `<div class="tx-io-box tx-input-box">
                <div class="tx-io-header">💰 <strong>Input ${index}: Coinbase (Mining Reward)</strong></div>
                <div class="tx-io-detail">${truncateHash(input.coinbase, 32)}</div>
              </div>`;
              }

              // Build input display with available data
              const hasValue = input.prevout && input.prevout.value !== undefined;
              const hasAddress = input.prevout && input.prevout.scriptPubKey && input.prevout.scriptPubKey.address;

              return `<div class="tx-io-box tx-input-box">
              <div class="tx-io-header">📥 <strong>Input ${index}</strong></div>
              ${hasAddress ? `<div class="tx-io-address"><strong>From Address:</strong> ${input.prevout.scriptPubKey.address}</div>` : ''}
              ${hasValue ? `<div class="tx-io-amount"><strong>Amount:</strong> <span class="amount-highlight">${input.prevout.value.toFixed(8)} S256</span></div>` : ''}
              <div class="tx-io-reference">
                <strong>Source:</strong> <span class="detail-value clickable" onclick="closeTxModal(); showTransactionDetails('${input.txid}')">${truncateHash(input.txid)}</span> [Output #${input.vout !== undefined ? input.vout : 'N/A'}]
              </div>
            </div>`;
            })
            .join("")}
        </div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Outputs (${tx.vout.length}):</div>
        <div class="detail-value">
          ${tx.vout
            .map(
              (output, index) => `
            <div class="tx-io-box tx-output-box">
              <div class="tx-io-header">📤 <strong>Output ${index}</strong></div>
              <div class="tx-io-amount"><strong>Amount:</strong> <span class="amount-highlight">${output.value.toFixed(8)} S256</span></div>
              ${
                output.scriptPubKey.address
                  ? `<div class="tx-io-address"><strong>To Address:</strong> ${output.scriptPubKey.address}</div>`
                  : `<div class="tx-io-detail"><strong>Type:</strong> ${output.scriptPubKey.type}</div>`
              }
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    // Show modal
    const modal = document.getElementById('tx-modal');
    modal.style.display = 'flex';
    setTimeout(() => {
      modal.classList.add('show');
    }, 10);
  } catch (error) {
    console.error("Error loading transaction details:", error);
    showError("Error loading transaction details");
  }
}

// Close transaction modal
function closeTxModal() {
  const modal = document.getElementById('tx-modal');
  modal.classList.remove('show');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 300);
}

// Show address details
async function showAddressDetails(address) {
  // Validate address format before querying
  if (!validateAddress(address)) {
    showError(
      "Invalid S256 address format. Valid formats: s2... (bech32) or S... (legacy)"
    );
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/address/${address}`);
    const data = await response.json();

    if (data.error) {
      showError(data.error);
      return;
    }

    // Update URL to /address/:address for bookmarking/sharing
    const newPath = `/address/${data.address}`;
    if (window.location.pathname !== newPath) {
      window.history.pushState({ address: data.address }, '', newPath);
    }

    const content = document.getElementById("address-content");
    content.innerHTML = `
      <div class="address-info-card">
        <div class="address-info-header">
          <h3>Address Information</h3>
        </div>
        <div class="address-display">
          <div class="address-hash">${data.address}</div>
          <div class="address-actions">
            <button class="btn-action" onclick="copyAddress('${data.address}')">
              <span>📋</span> Copy
            </button>
            <button class="btn-action" onclick="showQRModal('${data.address}')">
              <span>📱</span> Show QR Code
            </button>
          </div>
        </div>
      </div>

      <div class="address-stats-grid">
        <div class="stat-card">
          <div class="stat-label">Balance</div>
          <div class="stat-value stat-balance">${data.balance.toFixed(8)} S256</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Received</div>
          <div class="stat-value">${data.received.toFixed(8)} S256</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Sent</div>
          <div class="stat-value">${data.sent.toFixed(8)} S256</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Transaction Count</div>
          <div class="stat-value">${data.txCount} transactions</div>
        </div>
      </div>

      <div class="tx-history-section">
        <div class="tx-history-header">
          <h3>Transaction History</h3>
          <div class="tx-header-controls">
            <div class="tx-filter-controls">
              <button class="filter-btn active" onclick="filterTransactions('all', '${data.address}')">All</button>
              <button class="filter-btn" onclick="filterTransactions('recent', '${data.address}')">Recent</button>
            </div>
            <div class="tx-export-controls">
              <button class="export-btn" onclick="exportToCSV('${data.address}')" title="Export to CSV">
                <span>📊</span> CSV
              </button>
              <button class="export-btn" onclick="exportToPDF('${data.address}')" title="Generate PDF Report">
                <span>📄</span> PDF
              </button>
            </div>
          </div>
        </div>
        <div class="tx-history-info" id="tx-history-info"></div>
        <div class="tx-table-container">
          <table class="tx-table">
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Block</th>
                <th>Time</th>
                <th class="amount-col">Amount</th>
              </tr>
            </thead>
            <tbody id="tx-table-body">
            </tbody>
          </table>
        </div>
        <div class="pagination-container" id="pagination-container"></div>
      </div>
    `;

    // Store data for filtering and pagination
    window.currentAddressData = data;
    window.currentPage = 1;
    window.itemsPerPage = 25;
    window.currentFilter = 'all';

    // Count incoming vs outgoing transactions using server-calculated data
    let incomingCount = 0;
    let outgoingCount = 0;
    data.transactions.forEach(tx => {
      if (tx.addressAmount?.direction === 'out') {
        outgoingCount++;
      } else {
        incomingCount++;
      }
    });

    console.log(`✅ Address loaded: ${incomingCount} IN (green), ${outgoingCount} OUT (red) transactions`);

    // Render initial page
    renderTransactionPage(data.address);

    document.getElementById("blocks-section").style.display = "none";
    document.getElementById("search-results").style.display = "none";
    document.getElementById("block-details").style.display = "none";
    document.getElementById("tx-details").style.display = "none";
    document.getElementById("address-details").style.display = "block";
    const hashrateSection = document.getElementById("hashrate-chart-section");
    if (hashrateSection) hashrateSection.style.display = "none";
  } catch (error) {
    console.error("Error loading address details:", error);
    showError("Error loading address details");
  }
}

// Note: Transaction amounts are now calculated server-side in tx.addressAmount

// Copy address to clipboard
function copyAddress(address) {
  navigator.clipboard.writeText(address).then(() => {
    showNotification('Address copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy:', err);
    showNotification('Failed to copy address');
  });
}

// Show QR code modal
function showQRModal(address) {
  const modal = document.getElementById('qr-modal');
  const qrImage = document.getElementById('qr-code-image');
  const addressText = document.getElementById('qr-address-text');

  // Generate QR code URL with larger size for better display
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(address)}`;

  qrImage.src = qrUrl;
  addressText.textContent = address;

  // Store address in modal for later use
  modal.dataset.address = address;

  // Show modal with animation
  modal.style.display = 'flex';
  setTimeout(() => {
    modal.classList.add('show');
  }, 10);
}

// Close QR code modal
function closeQRModal() {
  const modal = document.getElementById('qr-modal');
  modal.classList.remove('show');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 300);
}

// Copy address from modal
function copyAddressFromModal() {
  const modal = document.getElementById('qr-modal');
  const address = modal.dataset.address;
  copyAddress(address);
}

// Download QR code from modal
function downloadQRFromModal() {
  const modal = document.getElementById('qr-modal');
  const address = modal.dataset.address;

  try {
    // Generate QR code URL with high resolution
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=800x800&data=${encodeURIComponent(address)}`;

    // Create a temporary link and trigger download
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `s256-address-${address.substring(0, 10)}.png`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showNotification('QR code download started!');
  } catch (error) {
    console.error('Failed to download QR code:', error);
    showNotification('Failed to download QR code');
  }
}

// Render transaction page with pagination
function renderTransactionPage(address) {
  const data = window.currentAddressData;
  if (!data) return;

  const page = window.currentPage || 1;
  const itemsPerPage = window.itemsPerPage || 25;
  const filter = window.currentFilter || 'all';

  // Get filtered transactions
  let filteredTxs = data.transactions;
  if (filter === 'recent') {
    filteredTxs = data.transactions.slice(0, 100);
  }

  // Calculate pagination
  const totalItems = filteredTxs.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedTxs = filteredTxs.slice(startIndex, endIndex);

  // Update table
  const tbody = document.getElementById('tx-table-body');
  tbody.innerHTML = paginatedTxs
    .map(
      (tx) => {
        // Use server-calculated amounts
        const direction = tx.addressAmount?.direction || 'in';
        const netAmount = tx.addressAmount?.net || 0;

        const amountClass = direction === 'in' ? 'amount-positive' : 'amount-negative';
        const amountDisplay = direction === 'in' ? `+${netAmount.toFixed(8)}` : netAmount.toFixed(8);
        const directionBadge = direction === 'in'
          ? '<span class="tx-badge tx-badge-in">IN</span>'
          : '<span class="tx-badge tx-badge-out">OUT</span>';

        return `
          <tr onclick="showTransactionModal('${tx.txid}')">
            <td class="tx-hash-col">${truncateHash(tx.txid)}</td>
            <td>${tx.blockheight || 'Pending'}</td>
            <td>${(tx.time || tx.blocktime) ? formatTime(tx.time || tx.blocktime) : 'Pending'}</td>
            <td class="amount-col">
              <div class="amount-cell">
                ${directionBadge}
                <span class="amount-value ${amountClass}">${amountDisplay} S256</span>
              </div>
            </td>
          </tr>
        `;
      }
    )
    .join("");

  // Update info text
  document.getElementById('tx-history-info').textContent =
    `Showing ${startIndex + 1} to ${endIndex} of ${totalItems} transactions`;

  // Render pagination controls
  renderTxPagination(totalPages, page, address);
}

// Render pagination controls for transactions
function renderTxPagination(totalPages, currentPage, address) {
  const container = document.getElementById('pagination-container');
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let paginationHTML = '<div class="pagination">';

  // Previous button
  if (currentPage > 1) {
    paginationHTML += `<button class="page-btn" onclick="goToTxPage(${currentPage - 1}, '${address}')">Previous</button>`;
  } else {
    paginationHTML += `<button class="page-btn disabled" disabled>Previous</button>`;
  }

  // Page numbers (show max 7 pages)
  const maxVisible = 7;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  if (startPage > 1) {
    paginationHTML += `<button class="page-btn" onclick="goToTxPage(1, '${address}')">1</button>`;
    if (startPage > 2) {
      paginationHTML += `<span class="page-ellipsis">...</span>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    const activeClass = i === currentPage ? 'active' : '';
    paginationHTML += `<button class="page-btn ${activeClass}" onclick="goToTxPage(${i}, '${address}')">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationHTML += `<span class="page-ellipsis">...</span>`;
    }
    paginationHTML += `<button class="page-btn" onclick="goToTxPage(${totalPages}, '${address}')">${totalPages}</button>`;
  }

  // Next button
  if (currentPage < totalPages) {
    paginationHTML += `<button class="page-btn" onclick="goToTxPage(${currentPage + 1}, '${address}')">Next</button>`;
  } else {
    paginationHTML += `<button class="page-btn disabled" disabled>Next</button>`;
  }

  paginationHTML += '</div>';
  container.innerHTML = paginationHTML;
}

// Go to specific transaction page
function goToTxPage(page, address) {
  window.currentPage = page;
  renderTransactionPage(address);

  // Scroll to top of transaction table
  document.querySelector('.tx-table-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Filter transactions
function filterTransactions(filter, address) {
  // Update button states
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');

  // Update filter and reset to page 1
  window.currentFilter = filter;
  window.currentPage = 1;

  // Re-render with new filter
  renderTransactionPage(address);
}

// Show notification
function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 2000);
}

// Validate S256 address format
function validateAddress(address) {
  // Bech32 address (s2...) - format: s2 + separator '1' + data
  // Bech32 data charset: a-z0-9 (excluding 1, b, i, o in data part)
  // Total length typically 42-90 chars
  const bech32Regex = /^s21[ac-hj-np-z02-9]{38,86}$/;

  // Legacy address (S...) - base58, length ~26-35 chars
  // Base58 charset: a-km-zA-HJ-NP-Z1-9 (excluding 0, O, I, l)
  const legacyRegex = /^S[a-km-zA-HJ-NP-Z1-9]{25,34}$/;

  return bech32Regex.test(address) || legacyRegex.test(address);
}

// Perform search
async function performSearch() {
  const query = document.getElementById("search").value.trim();
  if (!query) return;

  // Check if query looks like an address and validate format
  if (query.startsWith("s2") || query.startsWith("S")) {
    if (!validateAddress(query)) {
      showError(
        "Invalid S256 address format. Valid formats: s2... (bech32) or S... (legacy)"
      );
      return;
    }
  }

  try {
    const response = await fetch(
      `${API_BASE}/api/search/${encodeURIComponent(query)}`
    );
    const result = await response.json();

    if (result.error) {
      showError(result.error);
      return;
    }

    if (result.type === "block") {
      showBlockDetails(result.data.hash);
    } else if (result.type === "transaction") {
      showTransactionDetails(result.data.txid);
    } else if (result.type === "address") {
      showAddressDetails(result.data.address);
    }
  } catch (error) {
    console.error("Search error:", error);
    showError("Error performing search");
  }
}

// Close details and return to blocks list
function closeDetails() {
  console.log("Closing details...");

  // Clear URL path to prevent reloading detail view on refresh
  window.history.pushState({}, '', '/');

  document.getElementById("block-details").style.display = "none";
  document.getElementById("tx-details").style.display = "none";
  document.getElementById("address-details").style.display = "none";
  document.getElementById("search-results").style.display = "none";
  document.getElementById("blocks-section").style.display = "block";
  const hashrateSection = document.getElementById("hashrate-chart-section");
  if (hashrateSection) hashrateSection.style.display = "block";
  loadRecentBlocks();
}

// Make functions globally accessible for onclick handlers
window.closeDetails = closeDetails;
window.showBlockDetails = showBlockDetails;
window.showTransactionDetails = showTransactionDetails;
window.showTransactionModal = showTransactionModal;
window.showAddressDetails = showAddressDetails;
window.changePage = changePage;
window.goToPage = goToPage;
window.goToLastPage = goToLastPage;
window.jumpToPage = jumpToPage;

// Show error message
function showError(message) {
  const searchResults = document.getElementById("search-results");
  const searchContent = document.getElementById("search-content");

  searchContent.innerHTML = `<div class="error-message">${message}</div>`;
  searchResults.style.display = "block";
  document.getElementById("blocks-section").style.display = "block";
}

// Utility functions
function truncateHash(hash, length = 16) {
  if (!hash) return "N/A";
  if (hash.length <= length * 2) return hash;
  return `${hash.substring(0, length)}...${hash.substring(
    hash.length - length
  )}`;
}

function formatTime(timestamp) {
  // Handle undefined, null, or invalid timestamps
  if (!timestamp || isNaN(timestamp)) return "Unknown";

  // Convert Unix timestamp to Date object
  const date = new Date(timestamp * 1000);

  // Format as YYYY-MM-DD HH:MM:SS
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatHashrate(hashrate) {
  hashrate = parseFloat(hashrate);
  if (isNaN(hashrate) || hashrate < 0) return "0 H/s";

  if (hashrate === 0) return "0 H/s";
  if (hashrate < 1000) return `${hashrate.toFixed(2)} H/s`;
  if (hashrate < 1000000) return `${(hashrate / 1000).toFixed(2)} KH/s`;
  if (hashrate < 1000000000) return `${(hashrate / 1000000).toFixed(2)} MH/s`;
  if (hashrate < 1000000000000) return `${(hashrate / 1000000000).toFixed(2)} GH/s`;
  if (hashrate < 1000000000000000) return `${(hashrate / 1000000000000).toFixed(2)} TH/s`;
  return `${(hashrate / 1000000000000000).toFixed(2)} PH/s`;
}

function formatDifficulty(difficulty) {
  if (difficulty < 1000) return difficulty.toFixed(2);
  if (difficulty < 1000000) return `${(difficulty / 1000).toFixed(2)}K`;
  if (difficulty < 1000000000) return `${(difficulty / 1000000).toFixed(2)}M`;
  return `${(difficulty / 1000000000).toFixed(2)}B`;
}

function decodeCoinbase(hexString) {
  try {
    // Coinbase format: [script_length][block_height][timestamp][extra_nonce][text_message]
    // We need to skip the binary data and extract only continuous text strings

    // Convert hex to bytes
    const bytes = [];
    for (let i = 0; i < hexString.length; i += 2) {
      bytes.push(parseInt(hexString.substr(i, 2), 16));
    }

    // Look for continuous runs of printable ASCII (at least 8 chars long)
    let bestString = "";
    let currentString = "";

    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];

      // Check if byte is printable ASCII (space to ~)
      if (byte >= 32 && byte <= 126) {
        currentString += String.fromCharCode(byte);
      } else {
        // Non-printable byte, check if we have a good string
        if (currentString.length >= 8) {
          // Prefer strings that look like messages (contain / or alphanumeric)
          if (currentString.length > bestString.length ||
              (currentString.includes('/') && !bestString.includes('/'))) {
            bestString = currentString;
          }
        }
        currentString = "";
      }
    }

    // Check the last string
    if (currentString.length >= 8) {
      if (currentString.length > bestString.length ||
          (currentString.includes('/') && !bestString.includes('/'))) {
        bestString = currentString;
      }
    }

    return bestString.trim();
  } catch (e) {
    return "";
  }
}

// Export transaction history to CSV
function exportToCSV(address) {
  if (!window.currentAddressData || !window.currentAddressData.transactions) {
    showNotification('No transaction data available to export', 'error');
    return;
  }

  const data = window.currentAddressData;
  const transactions = data.transactions;

  // CSV headers
  let csv = 'Transaction ID,Block Height,Date,Time,Type,Amount (S256),Balance After\n';

  // Add each transaction
  transactions.forEach(tx => {
    const date = new Date(tx.time * 1000);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString();
    const direction = tx.addressAmount?.direction || 'in';
    const txType = direction === 'out' ? 'Sent' : 'Received';
    const netAmount = Math.abs(tx.addressAmount?.net || 0);
    const txid = tx.txid || '';
    const blockHeight = tx.blockheight || 'Unconfirmed';

    // Escape commas in txid
    const escapedTxid = `"${txid}"`;

    csv += `${escapedTxid},${blockHeight},${dateStr},${timeStr},${txType},${netAmount.toFixed(8)},\n`;
  });

  // Create download link
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `S256_${address.substring(0, 12)}_transactions_${Date.now()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showNotification('CSV exported successfully!', 'success');
}

// Export address report to PDF (opens print dialog for PDF save)
function exportToPDF(address) {
  if (!window.currentAddressData) {
    showNotification('No address data available to export', 'error');
    return;
  }

  const data = window.currentAddressData;

  // Create a new window with printable content
  const printWindow = window.open('', '_blank');

  // Generate transaction rows (all transactions for complete tax reporting)
  const transactionsHTML = data.transactions.map(tx => {
    const date = new Date(tx.time * 1000).toLocaleString();
    const direction = tx.addressAmount?.direction || 'in';
    const netAmount = tx.addressAmount?.net || 0;
    const typeClass = direction === 'out' ? 'tx-out' : 'tx-in';
    const amountDisplay = direction === 'in' ? `+${netAmount.toFixed(8)}` : netAmount.toFixed(8);

    return `
      <tr>
        <td style="font-family: monospace; font-size: 9px; word-break: break-all;">${tx.txid}</td>
        <td>${tx.blockheight || 'Pending'}</td>
        <td>${date}</td>
        <td class="${typeClass}">${amountDisplay} S256</td>
      </tr>
    `;
  }).join('');

  const transactionSummary = `<p style="text-align: center; color: #666; margin-top: 20px;">
      Total transactions: ${data.transactions.length}
    </p>`;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>S256 Address Report - ${address}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          color: #333;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 3px solid #a300ff;
          padding-bottom: 20px;
        }
        .logo {
          font-size: 32px;
          font-weight: bold;
          color: #a300ff;
          margin-bottom: 5px;
        }
        .subtitle {
          color: #666;
          font-size: 14px;
        }
        .address-section {
          background: #f5f5f5;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
        }
        .address-hash {
          font-family: monospace;
          font-size: 14px;
          word-break: break-all;
          background: white;
          padding: 10px;
          border-radius: 4px;
          margin: 10px 0;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
          margin-bottom: 30px;
        }
        .stat-card {
          background: #f9f9f9;
          padding: 15px;
          border-radius: 8px;
          text-align: center;
          border-left: 4px solid #a300ff;
        }
        .stat-label {
          font-size: 12px;
          color: #666;
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        .stat-value {
          font-size: 18px;
          font-weight: bold;
          color: #a300ff;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th {
          background: #a300ff;
          color: white;
          padding: 12px;
          text-align: left;
          font-weight: 600;
        }
        td {
          padding: 10px 12px;
          border-bottom: 1px solid #ddd;
        }
        tr:hover {
          background: #f9f9f9;
        }
        .tx-in {
          color: #28a745;
          font-weight: 600;
        }
        .tx-out {
          color: #dc3545;
          font-weight: 600;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 12px;
          color: #999;
          border-top: 1px solid #ddd;
          padding-top: 20px;
        }
        @media print {
          body { margin: 20px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">S256</div>
        <div class="subtitle">Block Explorer - Address Report</div>
      </div>

      <div class="address-section">
        <h3 style="margin-top: 0;">Address</h3>
        <div class="address-hash">${address}</div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Balance</div>
          <div class="stat-value">${data.balance.toFixed(8)} S256</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Received</div>
          <div class="stat-value">${data.received.toFixed(8)} S256</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Sent</div>
          <div class="stat-value">${data.sent.toFixed(8)} S256</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Transactions</div>
          <div class="stat-value">${data.txCount}</div>
        </div>
      </div>

      <h3>Transaction History</h3>
      <table>
        <thead>
          <tr>
            <th>Transaction ID</th>
            <th>Block</th>
            <th>Date & Time</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${transactionsHTML}
        </tbody>
      </table>

      ${transactionSummary}

      <div class="footer">
        <p>Generated on ${new Date().toLocaleString()}</p>
        <p>S256 Block Explorer - explorer.sha256coin.eu</p>
      </div>

      <div class="no-print" style="text-align: center; margin-top: 30px;">
        <button onclick="window.print()" style="padding: 10px 30px; background: #a300ff; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer;">
          Print / Save as PDF
        </button>
        <button onclick="window.close()" style="padding: 10px 30px; background: #666; color: white; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; margin-left: 10px;">
          Close
        </button>
      </div>
    </body>
    </html>
  `);

  printWindow.document.close();

  showNotification('PDF report opened in new window', 'success');
}

// Make export functions globally accessible
window.exportToCSV = exportToCSV;
window.exportToPDF = exportToPDF;
