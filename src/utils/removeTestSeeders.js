const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require("../config/db");
const User = require("../models/User");
const LoanApplication = require("../models/LoanApplication");
const Notification = require("../models/Notification");

async function removeTestSeeders() {
  await connectDB();
  console.log("Connected to MongoDB...");

  // Delete test seeded accounts
  const testEmails = [
    "hdfc.credila@loanhub.in",
    "tata.capital@loanhub.in",
    "aditya.birla@loanhub.in",
    "kotak.credit@loanhub.in",
    "incred.finance@loanhub.in",
    "apex.health@company.in",
    "zenith.logistics@company.in",
    "horizon.tech@company.in",
  ];

  const testUsers = await User.find({ email: { $in: testEmails } });
  const testUserIds = testUsers.map((u) => u._id);

  // Clean up any test applications or notifications linked to them
  await LoanApplication.deleteMany({
    $or: [{ borrowerId: { $in: testUserIds } }, { lenderId: { $in: testUserIds } }],
  });
  await Notification.deleteMany({ userId: { $in: testUserIds } });

  const del = await User.deleteMany({ email: { $in: testEmails } });
  console.log(`✓ Deleted ${del.deletedCount} test seeded accounts.`);

  const remainingLenders = await User.find({ roleId: 1 }).select("userName email companyName");
  console.log("Real Lenders currently in DB:", remainingLenders.length);
  remainingLenders.forEach((l) => console.log(`- ${l.userName} (${l.email})`));

  process.exit(0);
}

removeTestSeeders().catch((err) => {
  console.error(err);
  process.exit(1);
});
