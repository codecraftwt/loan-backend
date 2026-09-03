// Load .env first, before any other code that reads process.env
require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const express = require("express");
const connectDB = require("./src/config/db");
const cors = require("cors");
const AuthRoutes = require("./src/routes/Auth/auth");
const LoanRoutes = require("./src/routes/Auth/Loan");
const UserRoutes = require("./src/routes/userRoutes");
const BorrowerRoutes = require("./src/routes/Borrower/borrowerRoutes");
const LenderLoanRoutes = require("./src/routes/Lender/lenderLoanRoutes");
const HistoryRoutes = require("./src/routes/History/historyRoutes");
const AdminRoutes = require("./src/routes/Admin/adminRoutes");
const PlanPurchaseRoutes = require("./src/routes/Plans/planPurchaseRoutes");
const NotificationRoutes = require("./src/routes/Notifications/notificationRoutes");
const RatingRoutes = require("./src/routes/ratingRoutes");

const app = express();

// Import cron jobs
require("./src/cron/loanCron");

app.use(cors());

app.use(express.json());

app.use("/api/auth", AuthRoutes);
app.use("/api/loan", LoanRoutes);
app.use("/api/user", UserRoutes);
app.use("/api/borrower", BorrowerRoutes);
app.use("/api/lender/loans", LenderLoanRoutes);
app.use("/api/history", HistoryRoutes);
app.use("/api/admin", AdminRoutes);
app.use("/api/plans", PlanPurchaseRoutes);
app.use("/api/notifications", NotificationRoutes);
app.use("/api/ratings", RatingRoutes);

app.get("/", (req, res) => {
  res.send("Loan Management API is running..");
});

const port = process.env.PORT || 5001;

const startServer = async () => {
  await connectDB();
  app.listen(port, () => console.log(`Server running on port ${port}`));
};

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});

module.exports = app;
