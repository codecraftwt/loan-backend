const validateAadhaar = (aadhaarNumber) => {
  const aadhaarRegex = /^[0-9]{12}$/;
  return aadhaarRegex.test(aadhaarNumber);
};

const generateTransactionId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}${random}`.toUpperCase();
};

const getMockKycData = (aadhaarNumber) => {
  // Generate mock KYC data based on Aadhaar number
  // In production, this would come from UIDAI or a KYC provider

  const mockNames = [
    "Rajesh Kumar Sharma",
    "Priya Singh Patel",
    "Amit Kumar Verma",
    "Neha Gupta Sharma",
    "Vikram Singh Rathore",
  ];

  // Use Aadhaar number to deterministically generate consistent mock data
  const hash = parseInt(aadhaarNumber.slice(-4), 10);
  const nameIndex = hash % mockNames.length;

  const dob = new Date(1980 + (hash % 30), hash % 12, (hash % 28) + 1);
  const formattedDob = dob.toISOString().split("T")[0];

  return {
    name: mockNames[nameIndex],
    aadhaarNumber: maskAadhaar(aadhaarNumber),
    dob: formattedDob,
    gender: hash % 2 === 0 ? "Male" : "Female",
    mobileNumber: `98${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, "0")}`,
    address: {
      line1: `${100 + (hash % 900)}, Main Street`,
      line2: "Sector " + (hash % 50),
      city: ["Mumbai", "Delhi", "Bangalore", "Chennai", "Kolkata"][hash % 5],
      state: ["Maharashtra", "Delhi", "Karnataka", "Tamil Nadu", "West Bengal"][
        hash % 5
      ],
      pincode: `${100000 + (hash % 899999)}`,
    },
    verifiedAt: new Date().toISOString(),
    kycStatus: "COMPLETED",
  };
};

const maskAadhaar = (aadhaarNumber) => {
  if (!aadhaarNumber || aadhaarNumber.length !== 12) return aadhaarNumber;
  return `XXXX XXXX ${aadhaarNumber.slice(-4)}`;
};

module.exports = {
  validateAadhaar,
  generateTransactionId,
  getMockKycData,
  maskAadhaar,
};
