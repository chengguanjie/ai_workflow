/**
 * Password Validator and Generator
 * 
 * Provides unified password validation and secure password generation
 * for all password-related scenarios in the application.
 */

export interface PasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecialChar: boolean;
  specialChars: string;
}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
}

/**
 * Default password requirements following security best practices
 */
export const DEFAULT_REQUIREMENTS: PasswordRequirements = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialChar: true,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

/**
 * Character sets for password generation
 */
const CHAR_SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  special: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

/**
 * Validates a password against the specified requirements
 * 
 * @param password - The password to validate
 * @param requirements - Optional custom requirements (defaults to DEFAULT_REQUIREMENTS)
 * @returns Validation result with errors and strength assessment
 */
export function validatePassword(
  password: string,
  requirements: PasswordRequirements = DEFAULT_REQUIREMENTS
): PasswordValidationResult {
  const errors: string[] = [];
  let strengthScore = 0;

  // Check minimum length
  if (password.length < requirements.minLength) {
    errors.push(`密码长度至少需要 ${requirements.minLength} 个字符`);
  } else {
    strengthScore += 1;
    // Bonus for longer passwords
    if (password.length >= 16) strengthScore += 1;
  }

  // Check uppercase requirement
  if (requirements.requireUppercase) {
    if (!/[A-Z]/.test(password)) {
      errors.push('密码需要包含至少一个大写字母');
    } else {
      strengthScore += 1;
    }
  }

  // Check lowercase requirement
  if (requirements.requireLowercase) {
    if (!/[a-z]/.test(password)) {
      errors.push('密码需要包含至少一个小写字母');
    } else {
      strengthScore += 1;
    }
  }

  // Check number requirement
  if (requirements.requireNumber) {
    if (!/[0-9]/.test(password)) {
      errors.push('密码需要包含至少一个数字');
    } else {
      strengthScore += 1;
    }
  }

  // Check special character requirement
  if (requirements.requireSpecialChar) {
    const specialRegex = new RegExp(`[${escapeRegExp(requirements.specialChars)}]`);
    if (!specialRegex.test(password)) {
      errors.push('密码需要包含至少一个特殊字符');
    } else {
      strengthScore += 1;
    }
  }

  // Determine strength based on score
  let strength: 'weak' | 'medium' | 'strong';
  if (strengthScore <= 2) {
    strength = 'weak';
  } else if (strengthScore <= 4) {
    strength = 'medium';
  } else {
    strength = 'strong';
  }

  return {
    isValid: errors.length === 0,
    errors,
    strength
  };
}

/**
 * Generates a cryptographically secure random password
 * 
 * @param length - The desired password length (minimum 12, default 16)
 * @returns A secure random password meeting all default requirements
 */
export function generateSecurePassword(length: number = 16): string {
  // Ensure minimum length
  const actualLength = Math.max(length, 12);
  
  // Ensure we have at least one character from each required set
  const requiredChars = [
    getRandomChar(CHAR_SETS.uppercase),
    getRandomChar(CHAR_SETS.lowercase),
    getRandomChar(CHAR_SETS.numbers),
    getRandomChar(CHAR_SETS.special)
  ];

  // Fill remaining length with random characters from all sets
  const allChars = CHAR_SETS.uppercase + CHAR_SETS.lowercase + CHAR_SETS.numbers + CHAR_SETS.special;
  const remainingLength = actualLength - requiredChars.length;
  
  const additionalChars: string[] = [];
  for (let i = 0; i < remainingLength; i++) {
    additionalChars.push(getRandomChar(allChars));
  }

  // Combine and shuffle all characters
  const allPasswordChars = [...requiredChars, ...additionalChars];
  return shuffleArray(allPasswordChars).join('');
}

/**
 * Gets a cryptographically secure random character from a string
 */
function getRandomChar(chars: string): string {
  const randomIndex = getSecureRandomInt(chars.length);
  return chars[randomIndex];
}

/**
 * Gets a cryptographically secure random integer in range [0, max)
 */
function getSecureRandomInt(max: number): number {
  // Use crypto.getRandomValues for secure randomness
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0] % max;
  }
  // Fallback for environments without crypto (should not happen in production)
  return Math.floor(Math.random() * max);
}

/**
 * Shuffles an array using Fisher-Yates algorithm with secure randomness
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = getSecureRandomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Escapes special regex characters in a string
 * Note: Hyphen (-) must be escaped when used in character class to avoid range interpretation
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}

/**
 * Gets password strength description in Chinese
 */
export function getStrengthDescription(strength: 'weak' | 'medium' | 'strong'): string {
  const descriptions = {
    weak: '弱',
    medium: '中等',
    strong: '强'
  };
  return descriptions[strength];
}

/**
 * Gets password requirements description for UI display
 */
export function getRequirementsDescription(requirements: PasswordRequirements = DEFAULT_REQUIREMENTS): string[] {
  const descriptions: string[] = [];
  
  descriptions.push(`至少 ${requirements.minLength} 个字符`);
  
  if (requirements.requireUppercase) {
    descriptions.push('包含大写字母 (A-Z)');
  }
  
  if (requirements.requireLowercase) {
    descriptions.push('包含小写字母 (a-z)');
  }
  
  if (requirements.requireNumber) {
    descriptions.push('包含数字 (0-9)');
  }
  
  if (requirements.requireSpecialChar) {
    descriptions.push('包含特殊字符');
  }
  
  return descriptions;
}
