const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./src/config/db");
const cors = require("cors");
const AuthRoutes = require("./src/routes/Auth/auth");
const LoanRoutes = require("./src/routes/Auth/Loan");
const UserRoutes = require("./src/routes/userRoutes")
const SubscriptionRoutes = require("./src/routes/subscriptionRoutes")

const app = express();

dotenv.config();
connectDB();

app.use(cors());

app.use(express.json());

app.use("/api/auth", AuthRoutes);
app.use("/api/loan", LoanRoutes);
app.use("/api/user", UserRoutes);
app.use("/api/subscription", SubscriptionRoutes);

app.get("/", (req, res) => {
  res.send("Loan Management API is running..");
});

const port = process.env.PORT || 5000;

app.listen(port, () => console.log(`Server running on port ${port}`));

module.exports = app;