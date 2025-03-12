// Simplified Solana Token Monitor for $TREEHUG using only Jupiter's New Tokens API
const axios = require('axios');
const fs = require('fs');

// Hardcoded configuration
const TARGET_TICKER = 'kenny';
const CHECK_INTERVAL = 60000; // 1 minute in milliseconds
const DB_FILE = 'found_tokens.json';
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1349212319732863006/wEIh1zUOEpBOjbZQ9zNF0cX9ZTmCw4d4bMcJnJGN41T19lUN4ZWUaEZFxwEfnDuZx18I';

// Initialize token storage
let foundTokens = {};
if (fs.existsSync(DB_FILE)) {
  foundTokens = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

// Function to send Discord alert
async function sendDiscordAlert(token) {
  try {
    // Create Discord embed message
    const embed = {
      title: `🚨 New Token Alert: $${token.symbol || token.name}`,
      color: 0x00ff00, // Green color
      fields: [
        {
          name: 'Token Symbol',
          value: `$${token.symbol || 'Unknown'}`,
          inline: true
        },
        {
          name: 'Token Name',
          value: token.name || 'Unknown',
          inline: true
        },
        {
          name: 'Token Address',
          value: token.address || token.mint,
          inline: false
        },
        {
          name: 'Found At',
          value: new Date().toLocaleString(),
          inline: false
        },
        {
          name: 'Explorer Links',
          value: `[View on Solana Explorer](https://explorer.solana.com/address/${token.address || token.mint})\n[View on Solscan](https://solscan.io/token/${token.address || token.mint})`,
          inline: false
        }
      ],
      footer: {
        text: 'Solana Token Monitor'
      },
      timestamp: new Date()
    };

    // Add freeze authority warning if present
    if (token.freeze_authority) {
      embed.fields.push({
        name: '⚠️ Warning',
        value: 'This token has a freeze authority which means the creator can freeze transfers',
        inline: false
      });
    }

    // Send to Discord webhook
    const response = await axios.post(DISCORD_WEBHOOK_URL, {
      content: `🔔 **${TARGET_TICKER.toUpperCase()} TOKEN DETECTED!** 🔔`,
      embeds: [embed],
      username: 'Solana Token Monitor'
    });
    
    if (response.status === 204) {
      console.log('Discord alert sent successfully!');
    } else {
      console.log(`Discord API responded with status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error sending Discord alert:', error.message);
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
        
        // Send Discord alert
        await sendDiscordAlert(token);
      }
    }
  } catch (error) {
    console.error('Error checking Jupiter /new endpoint:', error.message);
  }
}

// Start the monitoring process
console.log(`Starting to monitor for $${TARGET_TICKER} token on Solana using Jupiter API...`);
console.log(`Checking every ${CHECK_INTERVAL / 1000} seconds`);
console.log(`Discord alerts will be sent to the configured webhook`);

// Send a test alert on startup to confirm webhook is working
(async () => {
  try {
    console.log('Sending test Discord alert...');
    await axios.post(DISCORD_WEBHOOK_URL, {
      content: `🔔 **Token Monitor Started** - Watching for ${TARGET_TICKER.toUpperCase()} on Solana using Jupiter Token API`,
      username: 'Solana Token Monitor'
    });
    console.log('Test alert sent! Check your Discord channel.');
    
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
    console.error('Error sending test Discord alert:', error.message);
    console.log('Please verify your Discord webhook URL is correct.');
  }
})();