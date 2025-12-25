/**
 * Organization Security Settings Types
 * 
 * Type definitions for enterprise security settings including password policies,
 * session management, and access controls.
 * 
 * @module types/organization
 */

/**
 * Password policy configuration for an organization
 */
export interface PasswordPolicy {
  /** Minimum password length */
  minLength: number
  /** Require at least one uppercase letter */
  requireUppercase: boolean
  /** Require at least one lowercase letter */
  requireLowercase: boolean
  /** Require at least one number */
  requireNumbers: boolean
  /** Require at least one special character */
  requireSpecialChars: boolean
  /** Maximum password age in days (0 = no expiration) */
  maxAge: number
}

/**
 * Organization security settings configuration
 */
export interface OrganizationSecuritySettings {
  /** Password policy configuration */
  passwordPolicy: PasswordPolicy
  /** Session timeout in minutes */
  sessionTimeout: number
  /** IP whitelist for access control (empty = allow all) */
  ipWhitelist: string[]
  /** Whether MFA is required for all users */
  mfaRequired: boolean
  /** Maximum login attempts before lockout */
  loginAttemptLimit: number
  /** Account lockout duration in minutes */
  lockoutDuration: number
}

/**
 * Default password policy settings
 */
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false,
  maxAge: 90,
}

/**
 * Default organization security settings
 */
export const DEFAULT_SECURITY_SETTINGS: OrganizationSecuritySettings = {
  passwordPolicy: DEFAULT_PASSWORD_POLICY,
  sessionTimeout: 480, // 8 hours
  ipWhitelist: [],
  mfaRequired: false,
  loginAttemptLimit: 5,
  lockoutDuration: 30,
}

/**
 * Type guard to check if an object is a valid PasswordPolicy
 */
export function isPasswordPolicy(obj: unknown): obj is PasswordPolicy {
  if (typeof obj !== 'object' || obj === null) return false
  const policy = obj as Record<string, unknown>
  return (
    typeof policy.minLength === 'number' &&
    typeof policy.requireUppercase === 'boolean' &&
    typeof policy.requireLowercase === 'boolean' &&
    typeof policy.requireNumbers === 'boolean' &&
    typeof policy.requireSpecialChars === 'boolean' &&
    typeof policy.maxAge === 'number'
  )
}

/**
 * Type guard to check if an object is a valid OrganizationSecuritySettings
 */
export function isOrganizationSecuritySettings(
  obj: unknown
): obj is OrganizationSecuritySettings {
  if (typeof obj !== 'object' || obj === null) return false
  const settings = obj as Record<string, unknown>
  return (
    isPasswordPolicy(settings.passwordPolicy) &&
    typeof settings.sessionTimeout === 'number' &&
    Array.isArray(settings.ipWhitelist) &&
    settings.ipWhitelist.every((ip) => typeof ip === 'string') &&
    typeof settings.mfaRequired === 'boolean' &&
    typeof settings.loginAttemptLimit === 'number' &&
    typeof settings.lockoutDuration === 'number'
  )
}

/**
 * Parse and validate security settings from JSON, returning defaults for invalid data
 */
export function parseSecuritySettings(
  json: unknown
): OrganizationSecuritySettings {
  if (isOrganizationSecuritySettings(json)) {
    return json
  }
  
  // If partial data exists, merge with defaults
  if (typeof json === 'object' && json !== null) {
    const partial = json as Partial<OrganizationSecuritySettings>
    return {
      passwordPolicy: isPasswordPolicy(partial.passwordPolicy)
        ? partial.passwordPolicy
        : DEFAULT_PASSWORD_POLICY,
      sessionTimeout:
        typeof partial.sessionTimeout === 'number'
          ? partial.sessionTimeout
          : DEFAULT_SECURITY_SETTINGS.sessionTimeout,
      ipWhitelist:
        Array.isArray(partial.ipWhitelist) &&
        partial.ipWhitelist.every((ip) => typeof ip === 'string')
          ? partial.ipWhitelist
          : DEFAULT_SECURITY_SETTINGS.ipWhitelist,
      mfaRequired:
        typeof partial.mfaRequired === 'boolean'
          ? partial.mfaRequired
          : DEFAULT_SECURITY_SETTINGS.mfaRequired,
      loginAttemptLimit:
        typeof partial.loginAttemptLimit === 'number'
          ? partial.loginAttemptLimit
          : DEFAULT_SECURITY_SETTINGS.loginAttemptLimit,
      lockoutDuration:
        typeof partial.lockoutDuration === 'number'
          ? partial.lockoutDuration
          : DEFAULT_SECURITY_SETTINGS.lockoutDuration,
    }
  }
  
  return DEFAULT_SECURITY_SETTINGS
}
