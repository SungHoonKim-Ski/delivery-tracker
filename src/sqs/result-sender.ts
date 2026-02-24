import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { TrackingResult } from '../types.js';

const sqsClient = new SQSClient({});

export async function sendResult(result: TrackingResult): Promise<void> {
  const queueUrl = process.env.RESULT_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('[SQS] RESULT_QUEUE_URL environment variable is not set');
  }

  try {
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(result),
      })
    );
    console.log(`[SQS] Sent result for ${result.displayCode}: status=${result.status}`);
  } catch (err) {
    console.error(`[SQS] Failed to send result for ${result.displayCode}:`, err);
    throw err;
  }
}
