import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import * as dotenv from 'dotenv';
import * as path from 'path';

import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testBedrock() {
  console.log("Access Key:", process.env.AWS_ACCESS_KEY_ID?.substring(0, 5) + "...");
  console.log("Region:", process.env.AWS_BEDROCK_REGION);
  console.log("Model:", process.env.AWS_BEDROCK_MODEL);

  const client = new BedrockRuntimeClient({
    region: process.env.AWS_BEDROCK_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
    }
  });

  try {
    const baseModel = process.env.AWS_BEDROCK_MODEL || 'deepseek.v3.2';
    const criModel = baseModel.startsWith('us.') ? baseModel : `us.${baseModel}`;
    
    console.log(`Trying standard model ID: ${baseModel}`);
    try {
      const command1 = new ConverseCommand({
        modelId: 'us.deepseek.r1-v1:0',
        messages: [{ role: 'user', content: [{ text: 'ping' }] }],
        inferenceConfig: { maxTokens: 8192 }
      });
      await client.send(command1);
      console.log("✅ us.deepseek.r1-v1:0 works with 8192 maxTokens!");
    } catch (e: any) {
      console.log(`❌ Standard failed: ${e.message}`);
    }

    console.log(`\nTrying CRI model ID: ${criModel}`);
    try {
      const command2 = new ConverseCommand({
        modelId: criModel,
        messages: [{ role: 'user', content: [{ text: 'ping' }] }],
        inferenceConfig: { maxTokens: 10 }
      });
      await client.send(command2);
      console.log("✅ CRI model ID works!");
    } catch (e: any) {
      console.log(`❌ CRI failed: ${e.message}`);
    }
    
  } catch (err: any) {
    console.error("Error connecting to Bedrock:");
    console.error("Message:", err.message);
    console.error("Status code:", err.$metadata?.httpStatusCode);
    console.error("Full error:", err);
  }
}

testBedrock();
