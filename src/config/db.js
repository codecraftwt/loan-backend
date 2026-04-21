

require("dotenv").config();
const dns = require("dns");

// ✅ Set custom DNS servers (Cloudflare + Google)
// dns.setServers(["1.1.1.1", "8.8.8.8"]);
const mongoose = require("mongoose");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGOURL);
    console.log("MongoDB Connected");
    
    // Drop old index on Plan model if it exists
    const Plan = require("../models/Plan");
    await Plan.dropOldNameIndex();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
