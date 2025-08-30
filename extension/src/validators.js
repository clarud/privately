/**
 * Validation Helpers for Privately Extension
 */

const ValidationHelpers = {
  /**
   * Luhn algorithm for credit card validation
   */
  luhnCheck: (cardNumber) => {
    const digits = UtilityHelpers.extractDigits(cardNumber);
    let sum = 0;
    let alternate = false;
    
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i]);
      if (alternate) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      alternate = !alternate;
    }
    
    return digits.length >= 13 && sum % 10 === 0;
  },

  /**
   * IBAN validation using mod-97 algorithm
   */
  ibanValidation: (iban) => {
    const cleaned = iban.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleaned)) return false;
    
    const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
    const numeric = rearranged.replace(/[A-Z]/g, char => (char.charCodeAt(0) - 55).toString());
    
    let remainder = 0;
    for (let i = 0; i < numeric.length; i += 7) {
      remainder = Number(String(remainder) + numeric.slice(i, i + 7)) % 97;
    }
    
    return remainder === 1;
  },

  /**
   * JWT format validation
   */
  isValidJWT: (token) => {
    const [header, payload] = token.split('.');
    return !!(header && payload && 
      ValidationHelpers.isValidBase64Url(header) && 
      ValidationHelpers.isValidBase64Url(payload));
  },

  /**
   * Base64URL validation helper
   */
  isValidBase64Url: (part) => {
    try {
      const padding = '='.repeat((4 - (part.length % 4)) % 4);
      const base64 = part.replace(/-/g, '+').replace(/_/g, '/') + padding;
      atob(base64);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Singapore NRIC/FIN validation
   */
  isValidNRIC: (id) => {
    const nric = id.toUpperCase();
    if (!/^[STFGM]\d{7}[A-Z]$/.test(nric)) return false;
    
    const prefix = nric[0];
    const digits = nric.slice(1, 8).split('').map(Number);
    const weights = [2, 7, 6, 5, 4, 3, 2];
    
    let sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
    if (prefix === 'T' || prefix === 'G') sum += 4;
    
    const checksumArrays = {
      'ST': 'JZIHGFEDCBA',
      'FGM': 'XWUTRQPNMLK'
    };
    
    const checksumArray = (prefix === 'S' || prefix === 'T') ? checksumArrays.ST : checksumArrays.FGM;
    const expectedChecksum = checksumArray[sum % 11];
    
    return expectedChecksum === nric[8];
  },

  /**
   * IP address validation
   */
  isValidIP: (ip) => {
    if (ip.includes('.')) {
      return ValidationHelpers.validateIPv4(ip);
    } else {
      return ValidationHelpers.validateIPv6(ip);
    }
  },

  /**
   * IPv4 validation and private range detection
   */
  validateIPv4: (ip) => {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    
    const numbers = parts.map(part => parseInt(part));
    if (numbers.some(num => isNaN(num) || num < 0 || num > 255)) return false;
    
    // Check for private IP ranges
    const [a, b, c] = numbers;
    const isPrivate = a === 10 || 
                     (a === 172 && b >= 16 && b <= 31) || 
                     (a === 192 && b === 168);
    
    window.__pg_last_ip_private = isPrivate;
    return true;
  },

  /**
   * IPv6 validation and private range detection
   */
  validateIPv6: (ip) => {
    const isValid = /^([0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}$/i.test(ip);
    if (isValid) {
      window.__pg_last_ip_private = /^fc|^fd/i.test(ip.replace(':', ''));
    }
    return isValid;
  },

  /**
   * Calculate Shannon entropy for randomness detection
   */
  shannonEntropy: (str) => {
    const frequencyMap = new Map();
    for (const char of str) {
      frequencyMap.set(char, (frequencyMap.get(char) || 0) + 1);
    }
    
    const length = str.length;
    let entropy = 0;
    
    for (const frequency of frequencyMap.values()) {
      const probability = frequency / length;
      entropy -= probability * Math.log2(probability);
    }
    
    return entropy;
  }
};
