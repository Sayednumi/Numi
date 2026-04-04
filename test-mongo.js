require('dotenv').config();
const { MongoClient } = require('mongodb');

// Use env if available, else use a default for testing
const uri = process.env.MONGO_URI || "mongodb+srv://sayedhamdi775_db_user:CnpCRd9rZdr99qDi@cluster0.nywdlqu.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri, { 
    serverSelectionTimeoutMS: 10000,
    tlsAllowInvalidCertificates: true
});
async function run() {
  try {
    console.log("Connecting (allowing invalid certs)...");
    await client.connect();
    console.log("Connected successfully!");
    const databases = await client.db().admin().listDatabases();
    console.log("Databases:", databases.databases.map(db => db.name));
  } catch (e) {
    console.error("Connection failed:", e.message);
  } finally {
    await client.close();
  }
}
run();
