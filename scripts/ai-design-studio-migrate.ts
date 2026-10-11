import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { StudioDesign } from '../backend/api/src/ai-design-studio/persistence.js';
import {StudioGeneration} from '../backend/api/src/ai-design-studio/generation.js';
dotenv.config({path:'.env'});
async function main() { if (!process.env['MONGODB_URL']) throw new Error('MONGODB_URL is required');try { await mongoose.connect(process.env['MONGODB_URL']);await StudioDesign.createCollection();await StudioDesign.createIndexes();await StudioGeneration.createCollection();await StudioGeneration.createIndexes();console.log('AI Design Studio collection and ownership indexes are ready. Existing collections are untouched.'); } finally { await mongoose.disconnect(); } }
main().catch(error=>{console.error(error instanceof Error ? error.message : 'Migration failed');process.exitCode=1;});
