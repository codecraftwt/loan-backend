// Helper function to validate if the input is a valid email
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Accept Indian numbers only. Returns null if invalid, otherwise normalized forms.
function normalizeIndianMobile(input) {
  if (!input) return null;

  const digits = input.toString().replace(/\D/g, "");

  let nationalNumber;
  if (digits.length === 10) {
    nationalNumber = digits;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    nationalNumber = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    nationalNumber = digits.slice(2);
  } else {
    return null;
  }

  // Indian mobile numbers start with 6-9 and are 10 digits
  const mobileRegex = /^[6-9]\d{9}$/;
  if (!mobileRegex.test(nationalNumber)) {
    return null;
  }

  return {
    national: nationalNumber,
    e164: `+91${nationalNumber}`,
  };
}

module.exports = { validateEmail, normalizeIndianMobile };
