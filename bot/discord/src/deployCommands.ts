import { REST, Routes, RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { agentCommand } from './commands/agentCommand';

// Validate required environment variables
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token) {
  console.error('[Deploy] Missing DISCORD_TOKEN environment variable');
  process.exit(1);
}

if (!clientId) {
  console.error('[Deploy] Missing DISCORD_CLIENT_ID environment variable');
  console.error('[Deploy] You can find your Client ID in the Discord Developer Portal');
  process.exit(1);
}

// Collect all commands
const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  agentCommand.data
];

console.log(`[Deploy] Preparing to deploy ${commands.length} command(s)...`);

// Create REST instance
const rest = new REST({ version: '10' }).setToken(token);

/**
 * Deploy commands to Discord
 */
async function deployCommands(): Promise<void> {
  try {
    console.log('[Deploy] Started refreshing application (/) commands...');

    const guildId = process.env.DISCORD_GUILD_ID;

    let data: unknown;

    if (guildId) {
      // Deploy to specific guild (faster for testing, updates immediately)
      console.log(`[Deploy] Deploying to guild: ${guildId}`);
      data = await rest.put(
        Routes.applicationGuildCommands(clientId!, guildId),
        { body: commands }
      );
    } else {
      // Deploy globally (can take up to 1 hour to propagate)
      console.log('[Deploy] Deploying globally (this may take up to 1 hour to propagate)');
      data = await rest.put(
        Routes.applicationCommands(clientId!),
        { body: commands }
      );
    }

    console.log(`[Deploy] Successfully deployed ${(data as { length: number }).length} command(s)!`);
    
    // List deployed commands
    console.log('[Deploy] Deployed commands:');
    commands.forEach(cmd => {
      console.log(`  - /${cmd.name}: ${cmd.description}`);
    });

  } catch (error) {
    console.error('[Deploy] Error deploying commands:', error);
    process.exit(1);
  }
}

// Run deployment
deployCommands();
