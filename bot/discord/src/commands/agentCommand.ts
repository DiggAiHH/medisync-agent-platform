import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { submitJob } from '../utils/apiClient';
import { sessionManager } from '../utils/sessionManager';
import { rateLimiter } from '../utils/rateLimiter';
import { Command } from '../types';

/**
 * /agent Slash Command
 * Sends a prompt to the MediSync Agent Platform and returns the result
 */
export const agentCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('agent')
    .setDescription('Sende eine Anfrage an den MediSync Agenten')
    .addStringOption(option =>
      option
        .setName('prompt')
        .setDescription('Deine Anfrage an den Agenten')
        .setRequired(true)
        .setMaxLength(4000)
    )
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const prompt = interaction.options.getString('prompt', true);

    try {
      // Check rate limit
      const waitTime = rateLimiter.canProceed(userId);
      if (waitTime > 0) {
        await interaction.reply({
          content: `⏳ Bitte warte ${Math.ceil(waitTime / 1000)} Sekunden, bevor du eine neue Anfrage sendest.`,
          ephemeral: true
        });
        return;
      }

      // Record this request
      rateLimiter.recordUsage(userId);

      // Defer the reply as ephemeral (only visible to the user)
      await interaction.deferReply({ ephemeral: true });

      // Create a new session for this interaction
      // Store interaction token to allow editing the ephemeral message later via Webhook
      const session = sessionManager.createSession(
        userId,
        interaction.channelId,
        interaction.id,
        interaction.token
      );

      // Submit job to the API
      const jobResponse = await submitJob({
        prompt,
        userId,
        sessionId: session.sessionId
      });

      // Store jobId in session for WebSocket correlation
      sessionManager.setJobId(session.sessionId, jobResponse.jobId);

      // Update the ephemeral message with processing status
      await interaction.editReply({
        content: [
          '🔄 **Processing...**',
          '',
          `**Prompt:** ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`,
          `**Job ID:** \`${jobResponse.jobId}\``,
          '',
          'Der Agent arbeitet an deiner Anfrage. Diese Nachricht wird automatisch aktualisiert, sobald das Ergebnis verfügbar ist.'
        ].join('\n')
      });

    } catch (error) {
      console.error('[AgentCommand] Error:', error);

      let errorMessage = 'Ein unerwarteter Fehler ist aufgetreten.';

      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorMessage = '⏱️ Die Anfrage hat zu lange gedauert. Bitte versuche es später erneut.';
        } else if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
          errorMessage = '🔌 Verbindung zur MediSync API fehlgeschlagen. Ist der Server erreichbar?';
        } else {
          errorMessage = `❌ Fehler: ${error.message}`;
        }
      }

      // If we've already deferred, use editReply
      if (interaction.deferred) {
        await interaction.editReply({
          content: errorMessage
        });
      } else {
        await interaction.reply({
          content: errorMessage,
          ephemeral: true
        });
      }
    }
  }
};
