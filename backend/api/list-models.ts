import { BedrockClient, ListInferenceProfilesCommand, ListFoundationModelsCommand } from '@aws-sdk/client-bedrock';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function listModels() {
  const client = new BedrockClient({
    region: process.env.AWS_BEDROCK_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
    }
  });

  try {
    console.log("Listing Inference Profiles...");
    const profileCommand = new ListInferenceProfilesCommand({});
    const profiles = await client.send(profileCommand);
    const dsProfiles = profiles.inferenceProfileSummaries?.filter(p => p.inferenceProfileId?.toLowerCase().includes('deepseek')) || [];
    console.log("DeepSeek Inference Profiles:", dsProfiles.map(p => p.inferenceProfileId));

    console.log("\nListing Foundation Models...");
    const fmCommand = new ListFoundationModelsCommand({ byProvider: 'DeepSeek' });
    const fms = await client.send(fmCommand);
    console.log("DeepSeek Foundation Models:", fms.modelSummaries?.map(m => m.modelId));
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

listModels();
