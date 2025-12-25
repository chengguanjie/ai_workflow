/**
 * Password Validator Property-Based Tests
 * 
 * Feature: enterprise-user-flow
 * Tests Properties 1 and 2 from the design document
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  validatePassword,
  generateSecurePassword,
  DEFAULT_REQUIREMENTS,
  getStrengthDescription,
  getRequirementsDescription
} from './password-validator';

describe('Password Validator', () => {
  /**
   * Feature: enterprise-user-flow, Property 1: Password Validation Completeness
   * 
   * For any password string, the Password_Validator SHALL correctly identify
   * whether it meets all requirements: minimum 12 characters, at least one
   * uppercase letter, at least one lowercase letter, at least one number,
   * and at least one special character.
   * 
   * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
   */
  describe('Property 1: Password Validation Completeness', () => {
    it('should correctly validate password requirements for any string', () => {
      fc.assert(
        fc.property(fc.string(), (password) => {
          const result = validatePassword(password);
          
          // Manually check each requirement
          const hasMinLength = password.length >= DEFAULT_REQUIREMENTS.minLength;
          const hasUppercase = /[A-Z]/.test(password);
          const hasLowercase = /[a-z]/.test(password);
          const hasNumber = /[0-9]/.test(password);
          const specialRegex = new RegExp(`[${escapeRegExp(DEFAULT_REQUIREMENTS.specialChars)}]`);
          const hasSpecial = specialRegex.test(password);
          
          const shouldBeValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;
          
          // The validation result should match our manual check
          return result.isValid === shouldBeValid;
        }),
        { numRuns: 100 }
      );
    });

    it('should report correct errors for missing requirements', () => {
      fc.assert(
        fc.property(fc.string(), (password) => {
          const result = validatePassword(password);
          
          // Check that errors are reported correctly
          const hasMinLength = password.length >= DEFAULT_REQUIREMENTS.minLength;
          const hasUppercase = /[A-Z]/.test(password);
          const hasLowercase = /[a-z]/.test(password);
          const hasNumber = /[0-9]/.test(password);
          const specialRegex = new RegExp(`[${escapeRegExp(DEFAULT_REQUIREMENTS.specialChars)}]`);
          const hasSpecial = specialRegex.test(password);
          
          // Count expected errors
          let expectedErrorCount = 0;
          if (!hasMinLength) expectedErrorCount++;
          if (!hasUppercase) expectedErrorCount++;
          if (!hasLowercase) expectedErrorCount++;
          if (!hasNumber) expectedErrorCount++;
          if (!hasSpecial) expectedErrorCount++;
          
          return result.errors.length === expectedErrorCount;
        }),
        { numRuns: 100 }
      );
    });

    it('should always return weak/medium/strong strength', () => {
      fc.assert(
        fc.property(fc.string(), (password) => {
          const result = validatePassword(password);
          return ['weak', 'medium', 'strong'].includes(result.strength);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: enterprise-user-flow, Property 2: Secure Password Generation
   * 
   * For any generated password from generateSecurePassword(), the password
   * SHALL pass validation by validatePassword() with the default requirements.
   * 
   * Validates: Requirements 1.2, 7.1
   */
  describe('Property 2: Secure Password Generation', () => {
    it('generated passwords should always pass validation', () => {
      fc.assert(
        fc.property(fc.integer({ min: 12, max: 64 }), (length) => {
          const password = generateSecurePassword(length);
          const result = validatePassword(password);
          return result.isValid === true;
        }),
        { numRuns: 100 }
      );
    });

    it('generated passwords should have correct length', () => {
      fc.assert(
        fc.property(fc.integer({ min: 12, max: 64 }), (length) => {
          const password = generateSecurePassword(length);
          return password.length === length;
        }),
        { numRuns: 100 }
      );
    });

    it('generated passwords should enforce minimum length of 12', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 11 }), (length) => {
          const password = generateSecurePassword(length);
          // Should be at least 12 even if requested length is less
          return password.length >= 12;
        }),
        { numRuns: 100 }
      );
    });

    it('generated passwords should contain all required character types', () => {
      fc.assert(
        fc.property(fc.integer({ min: 12, max: 32 }), (length) => {
          const password = generateSecurePassword(length);
          
          const hasUppercase = /[A-Z]/.test(password);
          const hasLowercase = /[a-z]/.test(password);
          const hasNumber = /[0-9]/.test(password);
          const hasSpecial = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password);
          
          return hasUppercase && hasLowercase && hasNumber && hasSpecial;
        }),
        { numRuns: 100 }
      );
    });

    it('generated passwords should be unique', () => {
      // Generate multiple passwords and check they are all different
      const passwords = new Set<string>();
      for (let i = 0; i < 100; i++) {
        passwords.add(generateSecurePassword(16));
      }
      // With 100 generated passwords, we should have at least 95 unique ones
      // (allowing for extremely rare collisions)
      expect(passwords.size).toBeGreaterThanOrEqual(95);
    });
  });

  // Unit tests for specific examples and edge cases
  describe('Unit Tests', () => {
    describe('validatePassword', () => {
      it('should accept a valid password', () => {
        const result = validatePassword('SecurePass123!');
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should reject password shorter than 12 characters', () => {
        const result = validatePassword('Short1!');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('密码长度至少需要 12 个字符');
      });

      it('should reject password without uppercase', () => {
        const result = validatePassword('lowercase123!@#');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('密码需要包含至少一个大写字母');
      });

      it('should reject password without lowercase', () => {
        const result = validatePassword('UPPERCASE123!@#');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('密码需要包含至少一个小写字母');
      });

      it('should reject password without number', () => {
        const result = validatePassword('NoNumbersHere!@#');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('密码需要包含至少一个数字');
      });

      it('should reject password without special character', () => {
        const result = validatePassword('NoSpecialChars12');
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('密码需要包含至少一个特殊字符');
      });

      it('should report multiple errors for multiple violations', () => {
        const result = validatePassword('short');
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(1);
      });

      it('should return strong strength for long valid passwords', () => {
        const result = validatePassword('VerySecurePassword123!@#');
        expect(result.strength).toBe('strong');
      });

      it('should handle empty string', () => {
        const result = validatePassword('');
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBe(5); // All requirements fail
      });
    });

    describe('generateSecurePassword', () => {
      it('should generate password with default length of 16', () => {
        const password = generateSecurePassword();
        expect(password.length).toBe(16);
      });

      it('should generate password with specified length', () => {
        const password = generateSecurePassword(20);
        expect(password.length).toBe(20);
      });

      it('should enforce minimum length of 12', () => {
        const password = generateSecurePassword(8);
        expect(password.length).toBe(12);
      });
    });

    describe('getStrengthDescription', () => {
      it('should return Chinese descriptions', () => {
        expect(getStrengthDescription('weak')).toBe('弱');
        expect(getStrengthDescription('medium')).toBe('中等');
        expect(getStrengthDescription('strong')).toBe('强');
      });
    });

    describe('getRequirementsDescription', () => {
      it('should return array of requirement descriptions', () => {
        const descriptions = getRequirementsDescription();
        expect(descriptions).toContain('至少 12 个字符');
        expect(descriptions).toContain('包含大写字母 (A-Z)');
        expect(descriptions).toContain('包含小写字母 (a-z)');
        expect(descriptions).toContain('包含数字 (0-9)');
        expect(descriptions).toContain('包含特殊字符');
      });
    });
  });
});

// Helper function to escape regex special characters
// Note: Hyphen (-) must be escaped when used in character class to avoid range interpretation
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}
