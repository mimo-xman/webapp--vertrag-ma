// Shared database connection + model registration for workflow scripts.
// Models are imported from the webapp source (single-repo design).

import mongoose from "mongoose";

// Register models (side-effect imports).
import "../src/models/User";
import "../src/models/Company";
import "../src/models/Postulation";
import "../src/models/PostulationDemande";
import "../src/models/MailSender";
import "../src/models/Setting";

let connected = false;

export async function connectDB(): Promise<void> {
  if (connected) return;
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI or MONGODB_URI environment variable is required");
  const dbName = process.env.MONGO_DB_NAME || "vertrag_ma";
  await mongoose.connect(uri, { dbName });
  connected = true;
  console.log(`[DB] Connected to ${dbName}`);
}

export async function disconnectDB(): Promise<void> {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}
