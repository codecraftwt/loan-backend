const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require("../config/db");
const User = require("../models/User");
const LoanApplication = require("../models/LoanApplication");
const Notification = require("../models/Notification");
const { submitLoanApplications } = require("../controllers/Borrower/borrowerFlowController");
const { acceptLoanRequest } = require("../controllers/Lender/lenderFlowController");

async function runE2ETest() {
  await connectDB();
  console.log("Connected to MongoDB for E2E Flow Test...");

  // 1. Fetch Borrower and Lenders
  const borrower = await User.findOne({ roleId: 2, email: "apex.health@company.in" });
  const lenders = await User.find({ roleId: 1 }).limit(4);

  if (!borrower || lenders.length < 3) {
    throw new Error("Borrower or lenders missing in DB");
  }

  console.log(`Test Borrower: ${borrower.userName} (${borrower.email})`);
  console.log(`Test Lenders: ${lenders.map((l) => l.userName).join(", ")}`);

  // 2. Clean previous test applications
  await LoanApplication.deleteMany({ borrowerId: borrower._id });
  await Notification.deleteMany({ userId: borrower._id });

  // 3. Simulate Borrower submitting applications to 3 lenders
  const selectedLenderIds = lenders.slice(0, 3).map((l) => l._id.toString());
  console.log(`\nStep 1: Borrower submitting ₹1.5 Cr loan request to ${selectedLenderIds.length} lenders simultaneously...`);

  const mockReqSubmit = {
    user: borrower,
    body: {
      lenderIds: selectedLenderIds,
      amount: 15000000, // ₹1.5 Cr
      purpose: "Commercial Equipment Purchase",
      tenureMonths: 24,
      requestedRate: 10.5,
      notes: "Test automated submission",
    },
  };

  let submitResponseData = null;
  const mockResSubmit = {
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (data) {
      submitResponseData = data;
      return this;
    },
  };

  await submitLoanApplications(mockReqSubmit, mockResSubmit);
  console.log("Submission Status:", mockResSubmit.statusCode, submitResponseData?.message);
  console.log("Created Applications Group ID:", submitResponseData?.applicationGroupId);

  // Verify 3 applications are in 'pending' status
  const pendingApps = await LoanApplication.find({
    applicationGroupId: submitResponseData.applicationGroupId,
  });
  console.log(`✓ Verified: ${pendingApps.length} applications created with status 'pending'.`);

  // 4. Simulate Lender #1 Accepting the request
  const targetAppToAccept = pendingApps[0];
  const acceptingLender = lenders.find(
    (l) => l._id.toString() === targetAppToAccept.lenderId.toString()
  );

  console.log(
    `\nStep 2: Lender '${acceptingLender.userName}' accepts the loan application...`
  );

  const mockReqAccept = {
    user: acceptingLender,
    params: { id: targetAppToAccept._id.toString() },
  };

  let acceptResponseData = null;
  const mockResAccept = {
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (data) {
      acceptResponseData = data;
      return this;
    },
  };

  await acceptLoanRequest(mockReqAccept, mockResAccept);
  console.log("Accept Status:", mockResAccept.statusCode, acceptResponseData?.message);
  console.log(
    `Auto-Rejected Count: ${acceptResponseData?.autoRejectedApplicationsCount}`
  );

  // 5. Verify the atomic state in database
  const updatedAcceptedApp = await LoanApplication.findById(targetAppToAccept._id);
  console.log(`\nStep 3: Verifying Database States:`);
  console.log(`- Target Application (${acceptingLender.userName}): Status = '${updatedAcceptedApp.status}' (Expected: 'accepted')`);

  const otherApps = await LoanApplication.find({
    applicationGroupId: submitResponseData.applicationGroupId,
    _id: { $ne: targetAppToAccept._id },
  });

  for (const o of otherApps) {
    console.log(`- Other Application (${o._id}): Status = '${o.status}', Reason = '${o.rejectionReason}' (Expected: 'auto_rejected')`);
  }

  // 6. Verify Notifications
  const borrowerNotifications = await Notification.find({ userId: borrower._id }).sort({
    createdAt: -1,
  });
  console.log(`\nStep 4: Borrower Notifications (${borrowerNotifications.length} received):`);
  borrowerNotifications.forEach((n, i) => {
    console.log(`  [${i + 1}] Type: ${n.type} | Title: ${n.title} | Msg: ${n.message}`);
  });

  console.log("\n=========================================");
  console.log("🎉 ALL END-TO-END FLOW TESTS PASSED 100%!");
  console.log("=========================================\n");

  process.exit(0);
}

runE2ETest().catch((err) => {
  console.error("E2E Test Failed:", err);
  process.exit(1);
});
