// dm-bot.js
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const TARGET_USER_ID = process.env.TARGET_USER_ID;
const BASE_DELAY_MS = Math.max(50, parseInt(process.env.BASE_DELAY_MS || '2000', 10));
const MAX_COUNT = parseInt(process.env.MAX_COUNT || '0', 10);
const MESSAGE_TEXT = process.env.MESSAGE_TEXT || `Test DM at ${new Date().toISOString()}`;

if (!TOKEN || !TARGET_USER_ID) {
  console.error('Missing DISCORD_TOKEN or TARGET_USER_ID in .env');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages], partials: ['CHANNEL'] });

let running = true;
let sentCount = 0;
let consecutiveErrors = 0;

function stop() {
  if (!running) return;
  running = false;
  console.log('\nStopping... will finish current iteration and exit.');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Target user ID: ${TARGET_USER_ID}`);
  console.log(`Base delay: ${BASE_DELAY_MS} ms. Press Ctrl+C to stop.\n`);

  // Try to fetch the user to ensure the ID is valid
  let user;
  try {
    user = await client.users.fetch(TARGET_USER_ID);
    console.log(`Fetched user: ${user.tag}`);
  } catch (err) {
    console.error('Failed to fetch target user:', err && err.message ? err.message : err);
    await client.destroy();
    process.exit(1);
  }

  while (running) {
    if (MAX_COUNT > 0 && sentCount >= MAX_COUNT) {
      console.log(`Reached MAX_COUNT (${MAX_COUNT}). Exiting loop.`);
      break;
    }

    try {
      // Attempt to open DM channel and send
      const dm = await user.createDM();
      const msg = await dm.send(`${MESSAGE_TEXT} (#${sentCount + 1})`);
      sentCount += 1;
      consecutiveErrors = 0;
      console.log(`✅ Sent DM #${sentCount} — id: ${msg.id}`);
    } catch (err) {
      consecutiveErrors += 1;
      const name = err.name || 'Error';
      const msgText = (err && err.message) ? err.message : String(err);
      console.error(`❌ DM failed (attempt ${consecutiveErrors}): ${name} — ${msgText}`);

      // If error indicates cannot DM (permissions) or blocked, stop to avoid looping uselessly
      if (msgText.includes('Cannot send messages to this user') || msgText.includes('Cannot send messages to this user') || msgText.includes('Cannot send messages to this recipient')) {
        console.error('The bot cannot DM that user (likely DMs disabled or user blocked the bot). Exiting.');
        break;
      }
    }

    if (!running) break;

    // Backoff multiplier: 2^(consecutiveErrors-1), capped at 16
    let multiplier = (consecutiveErrors > 0) ? Math.min(2 ** (consecutiveErrors - 1), 16) : 1;
    let wait = Math.round(BASE_DELAY_MS * multiplier);
    // jitter +/-10%
    const jitter = Math.round(wait * 0.1 * (Math.random() - 0.5));
    wait = Math.max(50, wait + jitter);

    console.log(`Waiting ${wait} ms before next DM (backoff x${multiplier}).`);
    let waited = 0;
    const step = 500;
    while (waited < wait && running) {
      await sleep(Math.min(step, wait - waited));
      waited += step;
    }
  }

  console.log(`\nStopped. Sent ${sentCount} DMs total.`);
  await client.destroy();
  process.exit(0);
});

client.login(TOKEN).catch(err => {
  console.error('Login failed:', err && err.message ? err.message : err);
  process.exit(1);
});
