// Simplified Solana Token Monitor for $TREEHUG using only Jupiter's New Tokens API
const axios = require('axios');
const fs = require('fs');

// Hardcoded configuration
const TARGET_TICKER = 'reba';
const CHECK_INTERVAL = 60000; // 1 minute in milliseconds
const DB_FILE = 'found_tokens.json';
const TELEGRAM_BOT_TOKEN = '7784877051:AAEqpKsot3s0CimoUkWsiO5FvfjSlkdiYRA'; 
const TELEGRAM_CHAT_ID = '@pleasework1231'; // Your public channel username

// Initialize token storage
let foundTokens = {};
if (fs.existsSync(DB_FILE)) {
  foundTokens = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

// Function to send Telegram alert
async function sendTelegramAlert(token) {
  try {
    // Create Telegram message with markdown formatting
    const message = `
🚨 *New Token Alert: $${token.symbol || token.name}* 🚨

*Token Symbol:* $${token.symbol || 'Unknown'}
*Token Name:* ${token.name || 'Unknown'}
*Token Address:* \`${token.address || token.mint}\`
*Found At:* ${new Date().toLocaleString()}

*Explorer Links:*
[View on Solana Explorer](https://explorer.solana.com/address/${token.address || token.mint})
[View on Solscan](https://solscan.io/token/${token.address || token.mint})
`;

    // Add freeze authority warning if present
    const warningMessage = token.freeze_authority ? 
      "\n⚠️ *Warning:* This token has a freeze authority which means the creator can freeze transfers" : "";

    // Send to Telegram
    const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await axios.post(telegramApiUrl, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message + warningMessage,
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    });
    
    if (response.data && response.data.ok) {
      console.log('Telegram alert sent successfully!');
    } else {
      console.log(`Telegram API responded with: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    console.error('Error sending Telegram alert:', error.message);
  }
}

// Function to check Jupiter's /new endpoint for recently created tokens
async function checkJupiterNewTokens() {
  try {
    console.log(`[${new Date().toLocaleTimeString()}] Checking Jupiter's /new endpoint for $${TARGET_TICKER}...`);
    
    // Use the /new endpoint with pagination to get only the most recent 100 tokens
    const response = await axios.get('https://api.jup.ag/tokens/v1/new?limit=100&offset=0');
    
    if (!response.data || !Array.isArray(response.data)) {
      console.log('Invalid response from Jupiter /new endpoint');
      return;
    }
    
    const tokens = response.data;
    console.log(`Found ${tokens.length} new tokens from Jupiter /new endpoint`);
    
    for (const token of tokens) {
      // Normalize the token symbol and name for comparison
      const symbol = (token.symbol || '').toLowerCase();
      const name = (token.name || '').toLowerCase();
      const tokenId = token.mint || token.address;
      
      // Check if this token matches our target by name or symbol and is new
      if ((symbol.includes(TARGET_TICKER.toLowerCase()) || 
           name.includes(TARGET_TICKER.toLowerCase())) && 
          !foundTokens[tokenId]) {
        console.log(`🚨 ALERT: Found new $${token.symbol || token.name} token on Jupiter /new!`);
        console.log(`Token Address: ${tokenId}`);
        console.log(`Token Name: ${token.name || 'Unknown'}`);
        
        // Save to our found tokens
        foundTokens[tokenId] = {
          symbol: token.symbol,
          name: token.name || 'Unknown',
          timestamp: Date.now()
        };
        
        // Save updated token list
        fs.writeFileSync(DB_FILE, JSON.stringify(foundTokens, null, 2));
        
        // Send Telegram alert
        await sendTelegramAlert(token);
      }
    }
  } catch (error) {
    console.error('Error checking Jupiter /new endpoint:', error.message);
  }
}

// Start the monitoring process
console.log(`Starting to monitor for $${TARGET_TICKER} token on Solana using Jupiter API...`);
console.log(`Checking every ${CHECK_INTERVAL / 1000} seconds`);
console.log(`Telegram alerts will be sent to chat ID: ${TELEGRAM_CHAT_ID}`);

// Send a test alert on startup to confirm webhook is working
(async () => {
  try {
    console.log('Sending test Telegram alert...');
    
    const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(telegramApiUrl, {
      chat_id: TELEGRAM_CHAT_ID,
      text: `🔔 *Token Monitor Started* - Watching for ${TARGET_TICKER.toUpperCase()} on Solana using Jupiter Token API`,
      parse_mode: 'Markdown'
    });
    
    console.log('Test alert sent! Check your Telegram chat.');
    
    // Run check immediately
    await checkJupiterNewTokens();
    
    // Then set up interval for regular checking
    const intervalId = setInterval(async () => {
      await checkJupiterNewTokens();
    }, CHECK_INTERVAL);
    
    // Handle script termination
    process.on('SIGINT', () => {
      clearInterval(intervalId);
      console.log('\nToken monitoring stopped');
      process.exit();
    });
  } catch (error) {
    console.error('Error sending test Telegram alert:', error.message);
    console.log('Please verify your Telegram bot token and chat ID are correct.');
  }
})();