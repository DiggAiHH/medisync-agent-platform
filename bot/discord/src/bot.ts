import { Client, Collection, GatewayIntentBits, Events } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
const envPath = process.env.NODE_ENV === 'production' 
  ? path.resolve(__dirname, '../.env')
  : path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

import { Command, ExtendedClient } from './types';
import { agentCommand } from './commands/agentCommand';
import { MessageHandler } from './handlers/messageHandler';
import { sessionManager } from './utils/sessionManager';
import { rateLimiter } from './utils/rateLimiter';

// Validate required environment variables
const requiredEnvVars = ['DISCORD_TOKEN'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('[Bot] Missing required environment variables:', missingVars.join(', '));
  console.error('[Bot] Please check your .env file');
  process.exit(1);
}

// Create Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages
  ]
}) as ExtendedClient;

// Initialize commands collection
client.commands = new Collection<string, Command>();

// Register commands
client.commands.set(agentCommand.data.name, agentCommand);
console.log(`[Bot] Registered ${client.commands.size} command(s): ${Array.from(client.commands.keys()).join(', ')}`);

// Initialize message handler
const messageHandler = new MessageHandler(client);

/**
 * Ready Event Handler
 * Called when the bot successfully logs in
 */
client.once(Events.ClientReady, (readyClient) => {
  console.log(`[Bot] Logged in as ${readyClient.user?.tag} (${readyClient.user?.id})`);
  console.log(`[Bot] Ready to serve ${readyClient.guilds.cache.size} guild(s)`);

  // Connect to WebSocket for agent responses
  messageHandler.connect();

  // Start periodic cleanup tasks
  setInterval(() => {
    sessionManager.cleanup();
    rateLimiter.cleanup();
  }, 5 * 60 * 1000); // Every 5 minutes
});

/**
 * Interaction Create Event Handler
 * Handles slash commands
 */
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.warn(`[Bot] Command not found: ${interaction.commandName}`);
    return;
  }

  console.log(`[Bot] Executing command: ${interaction.commandName} by ${interaction.user.tag}`);

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[Bot] Error executing command ${interaction.commandName}:`, error);

    const errorMessage = 'Ein Fehler ist bei der Ausführung des Befehls aufgetreten.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
});

/**
 * Error Event Handler
 */
client.on(Events.Error, (error) => {
  console.error('[Bot] Discord client error:', error);
});

/**
 * Warn Event Handler
 */
client.on(Events.Warn, (warning) => {
  console.warn('[Bot] Discord client warning:', warning);
});

/**
 * Guild Create Event Handler
 * Called when the bot joins a new guild
 */
client.on(Events.GuildCreate, (guild) => {
  console.log(`[Bot] Joined new guild: ${guild.name} (${guild.id})`);
});

/**
 * Guild Delete Event Handler
 * Called when the bot is removed from a guild
 */
client.on(Events.GuildDelete, (guild) => {
  console.log(`[Bot] Left guild: ${guild.name} (${guild.id})`);
});

/**
 * Graceful shutdown handling
 */
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

function gracefulShutdown(signal: string): void {
  console.log(`[Bot] Received ${signal}, shutting down gracefully...`);

  // Disconnect WebSocket
  messageHandler.disconnect();

  // Destroy Discord client
  client.destroy();

  console.log('[Bot] Shutdown complete');
  process.exit(0);
}

/**
 * Unhandled error handlers
 */
process.on('unhandledRejection', (error) => {
  console.error('[Bot] Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('[Bot] Uncaught exception:', error);
  // Keep the bot running but log the error
});

// Login to Discord
console.log('[Bot] Starting up...');
client.login(process.env.DISCORD_TOKEN);
