/**
 * Smart Categorization System for Privately Extension
 * Suggests possible categories instead of forcing a single classification
 */

const SmartCategorizer = {
  /**
   * Category similarity groups and rules
   */
  ambiguityRules: {
    // Patterns that could match multiple categories
    numbers: {
      pattern: /^\d+$/,
      possibleCategories: ['NRIC', 'POSTAL_SG', 'CARD'],
      confidence: 'low'
    },
    
    // Phone numbers vs other numeric patterns
    phoneOrNumber: {
      pattern: /^\d{8,15}$/,
      possibleCategories: ['SG_PHONE', 'CARD', 'NRIC'],
      confidence: 'medium'
    },
    
    // Email vs URL ambiguity
    emailOrUrl: {
      pattern: /@/,
      possibleCategories: ['EMAIL', 'URL'],
      confidence: 'high'
    },
    
    // Email that looks like a name (e.g., johndoe@gmail.com)
    emailOrName: {
      pattern: /^[a-zA-Z]+[a-zA-Z]*@[a-zA-Z]+\.[a-zA-Z]+$/,
      possibleCategories: ['EMAIL', 'NAME'],
      confidence: 'high'
    },
    
    // Long strings could be many things
    longStrings: {
      pattern: /^[A-Za-z0-9+/]{20,}$/,
      possibleCategories: ['JWT', 'SECRET', 'BASE64_LONG', 'PRIVATE_KEY'],
      confidence: 'low'
    },
    
    // Hex patterns
    hexPatterns: {
      pattern: /^[0-9a-fA-F]{16,}$/,
      possibleCategories: ['HEX_LONG', 'SECRET', 'AWS_KEY'],
      confidence: 'medium'
    },
    
    // Names vs addresses (for AI detection)
    nameOrAddress: {
      pattern: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/,
      possibleCategories: ['NAME', 'ADDRESS'],
      confidence: 'medium'
    }
  },

  /**
   * Analyze detection result and suggest possible categories
   */
  analyzeDetection: (text, initialCategory, confidence = 1.0) => {
    console.log('🤔 Analyzing detection ambiguity for:', text, 'Initial:', initialCategory);
    
    const result = {
      text: text,
      possibleCategories: [initialCategory],
      confidence: confidence,
      needsUserInput: false,
      reasoning: 'Direct match'
    };

    // Check for ambiguous patterns
    const ambiguities = SmartCategorizer.findAmbiguities(text);
    
    if (ambiguities.length > 0) {
      // Combine all possible categories from ambiguity rules
      const allPossibleCategories = new Set([initialCategory]);
      let minConfidence = confidence;
      
      ambiguities.forEach(ambiguity => {
        ambiguity.possibleCategories.forEach(cat => allPossibleCategories.add(cat));
        if (ambiguity.confidence === 'low') minConfidence = Math.min(minConfidence, 0.3);
        if (ambiguity.confidence === 'medium') minConfidence = Math.min(minConfidence, 0.6);
      });
      
      result.possibleCategories = Array.from(allPossibleCategories);
      result.confidence = minConfidence;
      result.needsUserInput = result.possibleCategories.length > 1 && minConfidence < 0.8;
      result.reasoning = `Multiple possible matches: ${ambiguities.map(a => a.rule).join(', ')}`;
    }

    // Apply additional context-based rules
    result.possibleCategories = SmartCategorizer.applyContextRules(text, result.possibleCategories);
    
    console.log('🎯 Categorization result:', result);
    return result;
  },

  /**
   * Find ambiguous patterns in text
   */
  findAmbiguities: (text) => {
    const ambiguities = [];
    
    Object.entries(SmartCategorizer.ambiguityRules).forEach(([ruleName, rule]) => {
      if (rule.pattern.test(text)) {
        ambiguities.push({
          rule: ruleName,
          pattern: rule.pattern,
          possibleCategories: rule.possibleCategories,
          confidence: rule.confidence
        });
      }
    });
    
    return ambiguities;
  },

  /**
   * Apply context-based rules to refine categories
   */
  applyContextRules: (text, categories) => {
    const refined = [...categories];
    
    // Length-based refinement
    if (text.length <= 4 && categories.includes('CARD')) {
      // Too short to be a credit card
      refined.splice(refined.indexOf('CARD'), 1);
    }
    
    if (text.length === 8 && categories.includes('SG_PHONE')) {
      // Could be Singapore phone without country code
      if (!refined.includes('SG_PHONE')) refined.push('SG_PHONE');
    }
    
    // Format-based refinement
    if (text.includes('@') && text.includes('.') && categories.includes('URL')) {
      // More likely to be email if it has @ and domain
      if (categories.includes('EMAIL')) {
        refined.splice(refined.indexOf('URL'), 1);
      }
    }
    
    // Singapore-specific patterns
    if (/^[STFGM]\d{7}[A-Z]$/.test(text)) {
      // Definitely NRIC format
      return ['NRIC'];
    }
    
    if (/^\d{6}$/.test(text)) {
      // Could be postal code, but also many other things
      if (!refined.includes('POSTAL_SG')) refined.push('POSTAL_SG');
    }
    
    return refined.filter((cat, index) => refined.indexOf(cat) === index); // Remove duplicates
  },

  /**
   * Create user-friendly category suggestions
   */
  createCategorySuggestions: (detectionResult) => {
    return detectionResult.possibleCategories.map(category => ({
      id: category,
      label: SmartCategorizer.getCategoryDisplayName(category),
      description: SmartCategorizer.getCategoryDescription(category),
      confidence: detectionResult.confidence,
      icon: SmartCategorizer.getCategoryIcon(category)
    }));
  },

  /**
   * Get user-friendly category names
   */
  getCategoryDisplayName: (category) => {
    const displayNames = {
      EMAIL: 'Email Address',
      SG_PHONE: 'Phone Number',
      URL: 'Website URL',
      IP: 'IP Address',
      NRIC: 'NRIC/FIN',
      POSTAL_SG: 'Postal Code',
      CARD: 'Credit Card',
      IBAN: 'Bank Account',
      JWT: 'Security Token',
      AWS_KEY: 'API Key',
      SECRET: 'Secret Key',
      PRIVATE_KEY: 'Private Key',
      NAME: 'Personal Name',
      ADDRESS: 'Address',
      UUID: 'Unique ID',
      BASE64_LONG: 'Encoded Data',
      HEX_LONG: 'Hex Code'
    };
    
    return displayNames[category] || category;
  },

  /**
   * Get category descriptions
   */
  getCategoryDescription: (category) => {
    const descriptions = {
      EMAIL: 'Personal or business email address',
      SG_PHONE: 'Singapore mobile or landline number',
      URL: 'Website or online resource link',
      IP: 'Network IP address',
      NRIC: 'Singapore identity card number',
      POSTAL_SG: 'Singapore postal/ZIP code',
      CARD: 'Credit or debit card number',
      IBAN: 'International bank account number',
      JWT: 'Authentication or session token',
      AWS_KEY: 'Cloud service access key',
      SECRET: 'API key or secret credential',
      PRIVATE_KEY: 'Cryptographic private key',
      NAME: 'Person\'s full name',
      ADDRESS: 'Physical or mailing address',
      UUID: 'System-generated unique identifier',
      BASE64_LONG: 'Base64 encoded sensitive data',
      HEX_LONG: 'Hexadecimal encoded data'
    };
    
    return descriptions[category] || 'Sensitive information';
  },

  /**
   * Get category icons
   */
  getCategoryIcon: (category) => {
    const icons = {
      EMAIL: '📧',
      SG_PHONE: '📱',
      URL: '🔗',
      IP: '🌐',
      NRIC: '🆔',
      POSTAL_SG: '📮',
      CARD: '💳',
      IBAN: '🏦',
      JWT: '🔑',
      AWS_KEY: '☁️',
      SECRET: '🔐',
      PRIVATE_KEY: '🔒',
      NAME: '👤',
      ADDRESS: '🏠',
      UUID: '🔖',
      BASE64_LONG: '📦',
      HEX_LONG: '🔢'
    };
    
    return icons[category] || '🔍';
  }
};
