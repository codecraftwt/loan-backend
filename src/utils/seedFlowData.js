const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const LoanApplication = require("../models/LoanApplication");
const Notification = require("../models/Notification");

async function seedFlowData() {
  try {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash("Password@123", salt);

    // ─── 1. Sample Lenders ───
    const sampleLenders = [
      {
        email: "hdfc.credila@loanhub.in",
        userName: "HDFC Credila Financial Corp",
        companyName: "HDFC Credila Financial Corporation Ltd",
        password: passwordHash,
        address: "HDFC House, HT Parekh Marg, Mumbai, Maharashtra 400020",
        aadharCardNo: "900100010001",
        mobileNo: "+919820011001",
        panCardNumber: "AAACH1001A",
        roleId: 1, // Lender
        isMobileVerified: true,
        lenderProfile: {
          minInterestRate: 9.25,
          maxInterestRate: 12.5,
          servicesOffered: [
            "Commercial Term Loan",
            "Working Capital Line",
            "Equipment & Machinery Finance",
            "Syndicated Facility",
          ],
          totalLoansFunded: 148,
          totalDisbursedAmount: 4800000000, // ₹480 Cr
          experienceYears: 12,
          approvalRate: 94,
          rating: 4.9,
          ratingCount: 42,
          minLoanAmount: 1000000, // ₹10 Lakhs
          maxLoanAmount: 250000000, // ₹25 Crores
          turnaroundTime: "24-48 Hours",
          bio: "Leading institutional NBFC specializing in secured enterprise debt and working capital facilities for expanding corporations.",
        },
      },
      {
        email: "tata.capital@loanhub.in",
        userName: "Tata Capital Commercial Services",
        companyName: "Tata Capital Financial Services Ltd",
        password: passwordHash,
        address: "Peninsula Business Park, Lower Parel, Mumbai, Maharashtra 400013",
        aadharCardNo: "900100010002",
        mobileNo: "+919820011002",
        panCardNumber: "AAACT1002A",
        roleId: 1, // Lender
        isMobileVerified: true,
        lenderProfile: {
          minInterestRate: 9.75,
          maxInterestRate: 13.5,
          servicesOffered: [
            "SME Business Loan",
            "Working Capital Line",
            "Invoice Discounting",
            "Commercial Term Loan",
          ],
          totalLoansFunded: 92,
          totalDisbursedAmount: 2600000000, // ₹260 Cr
          experienceYears: 10,
          approvalRate: 91,
          rating: 4.8,
          ratingCount: 36,
          minLoanAmount: 500000,
          maxLoanAmount: 150000000,
          turnaroundTime: "24-48 Hours",
          bio: "Empowering high-growth Indian SMEs and manufacturing enterprises with tailored collateral and cashflow-backed credit lines.",
        },
      },
      {
        email: "aditya.birla@loanhub.in",
        userName: "Aditya Birla Capital Corp",
        companyName: "Aditya Birla Finance Ltd",
        password: passwordHash,
        address: "Indiabulls Finance Centre, Tower 1, Mumbai, Maharashtra 400013",
        aadharCardNo: "900100010003",
        mobileNo: "+919820011003",
        panCardNumber: "AAACA1003A",
        roleId: 1, // Lender
        isMobileVerified: true,
        lenderProfile: {
          minInterestRate: 10.0,
          maxInterestRate: 14.0,
          servicesOffered: [
            "Working Capital Line",
            "Supply Chain Financing",
            "Equipment & Machinery Finance",
          ],
          totalLoansFunded: 64,
          totalDisbursedAmount: 1800000000,
          experienceYears: 8,
          approvalRate: 89,
          rating: 4.7,
          ratingCount: 28,
          minLoanAmount: 500000,
          maxLoanAmount: 100000000,
          turnaroundTime: "48 Hours",
          bio: "Flexible commercial credit lines and fast-turnaround capital disbursals for mid-market corporate clients.",
        },
      },
      {
        email: "kotak.credit@loanhub.in",
        userName: "Kotak Private Credit Fund",
        companyName: "Kotak Mahindra Prime Ltd",
        password: passwordHash,
        address: "27 BKC, Bandra Kurla Complex, Mumbai, Maharashtra 400051",
        aadharCardNo: "900100010004",
        mobileNo: "+919820011004",
        panCardNumber: "AAACK1004A",
        roleId: 1, // Lender
        isMobileVerified: true,
        lenderProfile: {
          minInterestRate: 8.85,
          maxInterestRate: 11.5,
          servicesOffered: [
            "Commercial Term Loan",
            "Syndicated Facility",
            "Bridge Loan",
          ],
          totalLoansFunded: 210,
          totalDisbursedAmount: 6500000000,
          experienceYears: 15,
          approvalRate: 96,
          rating: 4.9,
          ratingCount: 51,
          minLoanAmount: 2500000,
          maxLoanAmount: 500000000, // ₹50 Cr
          turnaroundTime: "24 Hours",
          bio: "Prime commercial debt capital and syndicated facilities for established corporate and infrastructure sponsors.",
        },
      },
      {
        email: "incred.finance@loanhub.in",
        userName: "InCred Commercial Capital",
        companyName: "InCred Financial Services Ltd",
        password: passwordHash,
        address: "Unit No 1203, The Capital, BKC, Mumbai 400051",
        aadharCardNo: "900100010005",
        mobileNo: "+919820011005",
        panCardNumber: "AAACI1005A",
        roleId: 1, // Lender
        isMobileVerified: true,
        lenderProfile: {
          minInterestRate: 10.5,
          maxInterestRate: 15.0,
          servicesOffered: [
            "SME Business Loan",
            "Equipment & Machinery Finance",
            "Invoice Discounting",
          ],
          totalLoansFunded: 78,
          totalDisbursedAmount: 1200000000,
          experienceYears: 6,
          approvalRate: 92,
          rating: 4.7,
          ratingCount: 24,
          minLoanAmount: 300000,
          maxLoanAmount: 75000000,
          turnaroundTime: "24-48 Hours",
          bio: "Data-driven SME lending engine offering flexible working capital and machinery term loans.",
        },
      },
    ];

    // ─── 2. Sample Borrowers ───
    const sampleBorrowers = [
      {
        email: "apex.health@company.in",
        userName: "Dr. Vikram Malhotra (Director)",
        companyName: "Apex Healthcare Facilities Pvt Ltd",
        password: passwordHash,
        address: "Plot 14, Sector 18, Electronic City, Bengaluru, Karnataka 560100",
        aadharCardNo: "800100010001",
        mobileNo: "+919845011001",
        panCardNumber: "ABCDE1001F",
        roleId: 2, // Borrower
        isMobileVerified: true,
        borrowerProfile: {
          businessName: "Apex Healthcare Facilities Pvt Ltd",
          businessType: "Private Limited Company",
          annualRevenue: 460000000, // ₹46 Cr
          monthlyIncome: 38000000,
          creditScore: 832,
          riskGrade: "AAA",
          gstNumber: "29ABCDE1001F1Z5",
          yearsInBusiness: 8,
          totalLoansTaken: 3,
          onTimeRepayments: 36,
          defaultsCount: 0,
          employmentType: "Corporate Entity / Director",
        },
      },
      {
        email: "zenith.logistics@company.in",
        userName: "Rajeshwar Shinde (MD)",
        companyName: "Zenith Logistics & Supply Chain Pvt Ltd",
        password: passwordHash,
        address: "Gateway Logistics Park, Navi Mumbai, Maharashtra 410206",
        aadharCardNo: "800100010002",
        mobileNo: "+919845011002",
        panCardNumber: "ABCDE1002F",
        roleId: 2, // Borrower
        isMobileVerified: true,
        borrowerProfile: {
          businessName: "Zenith Logistics & Supply Chain Pvt Ltd",
          businessType: "Private Limited Company",
          annualRevenue: 280000000, // ₹28 Cr
          monthlyIncome: 23000000,
          creditScore: 785,
          riskGrade: "AA",
          gstNumber: "27ABCDE1002F1Z8",
          yearsInBusiness: 5,
          totalLoansTaken: 2,
          onTimeRepayments: 24,
          defaultsCount: 0,
          employmentType: "Corporate Entity / MD",
        },
      },
      {
        email: "horizon.tech@company.in",
        userName: "Priya Sundaram (CFO)",
        companyName: "Horizon Precision Components LLP",
        password: passwordHash,
        address: "Ambattur Industrial Estate, Chennai, Tamil Nadu 600058",
        aadharCardNo: "800100010003",
        mobileNo: "+919845011003",
        panCardNumber: "ABCDE1003F",
        roleId: 2, // Borrower
        isMobileVerified: true,
        borrowerProfile: {
          businessName: "Horizon Precision Components LLP",
          businessType: "Limited Liability Partnership (LLP)",
          annualRevenue: 165000000, // ₹16.5 Cr
          monthlyIncome: 14000000,
          creditScore: 742,
          riskGrade: "A",
          gstNumber: "33ABCDE1003F1Z1",
          yearsInBusiness: 4,
          totalLoansTaken: 1,
          onTimeRepayments: 12,
          defaultsCount: 0,
          employmentType: "Partner / CFO",
        },
      },
    ];

    console.log("Seeding verified lenders...");
    for (const l of sampleLenders) {
      await User.findOneAndUpdate({ email: l.email }, { $set: l }, { upsert: true, new: true });
    }

    console.log("Seeding verified borrowers...");
    for (const b of sampleBorrowers) {
      await User.findOneAndUpdate({ email: b.email }, { $set: b }, { upsert: true, new: true });
    }

    console.log("✓ Sample Lenders and Borrowers successfully seeded!");
    return { success: true, message: "Sample flow data seeded successfully." };
  } catch (error) {
    console.error("Error seeding flow data:", error);
    throw error;
  }
}

module.exports = seedFlowData;
